"""Participant bundle validation and import orchestration."""

from __future__ import annotations

import hashlib
import io
import json
import os
import zipfile
import re
import stat
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterator

from .readers import read_document
from .store import Store

MAX_ENTRIES = 10_000
MAX_TOTAL_BYTES = 100 * 1024 * 1024
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024


@dataclass
class ParticipantSource:
    root: Path | None = None
    zip_path: Path | None = None
    _zip: zipfile.ZipFile | None = None
    _prefix: str = ""

    def __enter__(self) -> "ParticipantSource":
        if self.zip_path:
            self._zip = zipfile.ZipFile(self.zip_path)
            names = [n for n in self._zip.namelist() if not n.endswith("/")]
            self._prefix = detect_prefix(names)
        else:
            if not self.root or not (self.root / "inbox").is_dir() or not (self.root / "attachments").is_dir():
                raise ValueError("participant directory must contain inbox/ and attachments/")
            if (self.root / "ground_truth.json").exists() or (self.root / "data_v2" / "ground_truth.json").exists():
                raise ValueError("evaluator answer key is not a valid participant source")
        return self

    def __exit__(self, *exc: Any) -> None:
        if self._zip: self._zip.close()

    @property
    def names(self) -> list[str]:
        if self._zip:
            return [n[len(self._prefix):].lstrip("/") for n in self._zip.namelist()
                    if not n.endswith("/") and n.startswith(self._prefix)]
        return [str(p.relative_to(self.root)).replace(os.sep, "/") for p in self.root.rglob("*") if p.is_file()]

    def read(self, relative: str) -> bytes:
        relative = safe_relative(relative)
        if self._zip:
            full = f"{self._prefix}{relative}" if self._prefix else relative
            try: return self._zip.read(full)
            except KeyError: raise FileNotFoundError(relative)
        p = (self.root / relative).resolve()
        p.relative_to(self.root.resolve())
        return p.read_bytes()

    def emails(self) -> Iterator[dict[str, Any]]:
        for name in sorted(self.names):
            if name.startswith("inbox/") and name.endswith(".json"):
                obj = json.loads(self.read(name).decode("utf-8"))
                validate_email(obj)
                yield obj


def safe_relative(path: str) -> str:
    p = PurePosixPath(str(path).replace("\\", "/"))
    if p.is_absolute() or re.match(r"^[A-Za-z]:", str(p)) or ".." in p.parts:
        raise ValueError(f"unsafe participant path: {path}")
    clean = str(p)
    if not clean or clean.startswith("/"):
        raise ValueError("empty or absolute participant path")
    return clean


def detect_prefix(names: list[str]) -> str:
    clean = [n.replace("\\", "/").lstrip("/") for n in names]
    roots = {n.split("/", 1)[0] for n in clean if "/" in n}
    for root in ("", *sorted(roots)):
        pre = f"{root}/" if root else ""
        if any(n == f"{pre}inbox" or n.startswith(f"{pre}inbox/") for n in clean) and any(n.startswith(f"{pre}attachments/") for n in clean):
            return pre
    raise ValueError("archive does not contain participant inbox/ and attachments/")


def validate_archive(path: str | Path) -> None:
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_ENTRIES: raise ValueError("archive has too many entries")
        total = 0
        for info in infos:
            name = info.filename.replace("\\", "/")
            if PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise ValueError(f"unsafe archive path: {name}")
            mode = (info.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(mode):
                raise ValueError(f"symbolic links are not allowed: {name}")
            if info.is_dir(): continue
            total += info.file_size
            if info.file_size > MAX_ATTACHMENT_BYTES and "/attachments/" in f"/{name}":
                raise ValueError(f"attachment too large: {name}")
        if total > MAX_TOTAL_BYTES: raise ValueError("archive exceeds uncompressed import limit")


def open_source(source: str | Path) -> ParticipantSource:
    path = Path(source)
    if path.is_file() and path.suffix.casefold() == ".zip":
        validate_archive(path)
        return ParticipantSource(zip_path=path)
    return ParticipantSource(root=path)


def import_participant(source: str | Path, store: Store) -> str:
    """Import a directory or ZIP and persist immutable raw email/doc bytes."""
    src = open_source(source)
    with src:
        emails = list(src.emails())
        if not emails: raise ValueError("participant source contains no emails")
        ids = [e["email_id"] for e in emails]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate email_id values in participant source")
        records: list[tuple[dict[str, Any], str, bytes]] = []
        docs: list[tuple[str, str, str, bytes]] = []
        issues: list[str] = []
        for email in emails:
            raw = json.dumps(email, ensure_ascii=False, sort_keys=True).encode()
            records.append((email, hashlib.sha256(raw).hexdigest(), raw))
            for att in email.get("attachments") or []:
                try:
                    rel = safe_relative(att)
                    if not rel.startswith("attachments/"):
                        issues.append(f"{email['email_id']}: attachment outside attachments/: {rel}")
                        continue
                    data = src.read(rel)
                    if len(data) > MAX_ATTACHMENT_BYTES: raise ValueError("attachment exceeds 20 MiB")
                    docs.append((email["email_id"], rel, Path(rel).name, data))
                except Exception as exc:
                    issues.append(f"{email['email_id']}: attachment unavailable {att}: {type(exc).__name__}")
        manifest = hashlib.sha256()
        for _, ch, _ in records: manifest.update(ch.encode())
        for eid, rel, _, data in docs:
            manifest.update(eid.encode()); manifest.update(rel.encode()); manifest.update(hashlib.sha256(data).digest())
        import_id, created = store.get_or_create_import("zip" if src.zip_path else "directory", manifest.hexdigest(), issues=issues)
        if not created:
            return import_id
        for email, content_hash, _ in records: store.add_email(import_id, email, content_hash)
        for eid, rel, filename, data in docs:
            read = read_document(data, filename)
            store.add_document(import_id, eid, rel, filename, read.sha256, read.detected_format, data, read.to_dict())
        store.update_import_counts(import_id, len(records), len(docs), issues)
        return import_id


def validate_email(email: dict[str, Any]) -> None:
    if not isinstance(email, dict) or not isinstance(email.get("email_id"), str) or not email["email_id"].strip():
        raise ValueError("email record requires email_id")
    if not isinstance(email.get("attachments", []), list): raise ValueError("attachments must be an array")
    for key in ("from", "subject", "body"):
        if key in email and not isinstance(email[key], str): raise ValueError(f"{key} must be a string")
