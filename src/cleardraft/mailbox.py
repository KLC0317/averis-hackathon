"""Live Mailbox integration for ClearDraft.

Implements read-only IMAP ingestion (Gmail, Outlook, Generic IMAP) using
Python's standard library imaplib and email modules. Follows ADR-001 local-first
principles and provides deterministic fallback replay for zero-risk demos.
"""

from __future__ import annotations

import email
from email import policy
import hashlib
import imaplib
import json
import os
import re
import ssl
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterator

from .ingest import import_participant
from .pipeline import run_import
from .readers import read_document
from .store import Store, utc_now

# Default prefilled connection presets
DEFAULT_PRESETS = [
    {
        "id": "conn_gmail",
        "label": "Demo Gmail (Docs Intake)",
        "provider": "gmail",
        "host": "imap.gmail.com",
        "port": 993,
        "username": "cleardraft.intake@gmail.com",
        "folder": "INBOX",
        "status": "ready",
    },
    {
        "id": "conn_outlook",
        "label": "Office 365 Shipping Mailbox",
        "provider": "outlook",
        "host": "outlook.office365.com",
        "port": 993,
        "username": "shipping.verification@company.com",
        "folder": "INBOX",
        "status": "ready",
    },
    {
        "id": "conn_generic",
        "label": "Averis Enterprise IMAP",
        "provider": "imap",
        "host": "mail.averis-trade.internal",
        "port": 993,
        "username": "doc-ops@averis-trade.internal",
        "folder": "INBOX",
        "status": "ready",
    }
]


class MailboxSource:
    """ParticipantSource compatible wrapper for mailbox retrieved batches."""

    def __init__(self, messages: list[dict[str, Any]], attachments: dict[str, bytes]):
        self._messages = messages
        self._attachments = attachments
        self.zip_path = None
        self.root = None

    def __enter__(self) -> "MailboxSource":
        return self

    def __exit__(self, *exc: Any) -> None:
        pass

    def emails(self) -> Iterator[dict[str, Any]]:
        for msg in self._messages:
            yield msg

    def read(self, relative: str) -> bytes:
        rel = relative.replace("\\", "/").lstrip("/")
        if rel in self._attachments:
            return self._attachments[rel]
        # Try finding by basename if path mismatch
        base = Path(rel).name
        for k, v in self._attachments.items():
            if Path(k).name == base:
                return v
        raise FileNotFoundError(relative)


def _clean_body_text(raw_text: str) -> str:
    """Strip extraneous headers and normalizes whitespace."""
    text = re.sub(r"\r\n", "\n", raw_text)
    return text.strip()


def parse_mime_message(raw_bytes: bytes, uid: int | str) -> tuple[dict[str, Any], dict[str, bytes]]:
    """Parse raw RFC822 bytes into an email JSON record and attachment binaries."""
    msg = email.message_from_bytes(raw_bytes, policy=policy.default)
    
    email_id = f"email_live_{uid}"
    subject = str(msg.get("subject", "No Subject"))
    sender = str(msg.get("from", "unknown@counterparty.com"))
    date_header = str(msg.get("date", utc_now()))
    message_id = str(msg.get("message-id", f"<{uuid.uuid4().hex}@mailbox>"))

    body_parts: list[str] = []
    attachments: dict[str, bytes] = {}
    attachment_names: list[str] = []

    for part in msg.walk():
        content_type = part.get_content_type()
        content_disposition = str(part.get_content_disposition() or "")
        filename = part.get_filename()

        if filename or "attachment" in content_disposition:
            safe_name = re.sub(r"[^\w\-.]", "_", filename or f"doc_{len(attachments)+1}.dat")
            rel_path = f"attachments/{safe_name}"
            payload = part.get_payload(decode=True)
            if payload:
                attachments[rel_path] = payload
                attachment_names.append(rel_path)
        elif content_type == "text/plain":
            payload = part.get_payload(decode=True)
            if payload:
                try:
                    body_parts.append(payload.decode("utf-8", errors="replace"))
                except Exception:
                    body_parts.append(payload.decode("latin-1", errors="replace"))
        elif content_type == "text/html" and not body_parts:
            # Fallback to HTML if no plain text
            payload = part.get_payload(decode=True)
            if payload:
                # Basic text strip
                html_text = re.sub(r"<[^>]+>", " ", payload.decode("utf-8", errors="replace"))
                body_parts.append(_clean_body_text(html_text))

    full_body = "\n\n".join(body_parts) if body_parts else "(No message body text)"

    email_obj = {
        "email_id": email_id,
        "from": sender,
        "subject": subject,
        "body": _clean_body_text(full_body),
        "received_at": date_header,
        "message_id": message_id,
        "attachments": attachment_names,
    }

    return email_obj, attachments


def generate_demo_inbound_batch(connection_id: str, cursor_uid: int) -> tuple[list[dict[str, Any]], dict[str, bytes], int]:
    """Generates realistic live demo email messages with discrepancies when offline or in demo mode."""
    new_uid = cursor_uid + 1

    demo_scenarios = [
        {
            "subject": "REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT - LIVE INGESTION",
            "sender": "docs.asia@vitalsolutions.sg",
            "body": (
                "Dear Customer Service,\n\n"
                "Please find attached our Shipping Instruction (SI) and Draft Bill of Lading "
                "for booking SIN87558867.\n\n"
                "Please check the draft BL against the SI particulars and confirm.\n\n"
                "Note: Consignee name must strictly match our master trade credit line.\n\n"
                "Best regards,\nVital Solutions Documentation Team"
            ),
            "si_text": (
                "SHIPPING INSTRUCTION (SI)\n"
                "====================================================\n"
                "Shipper: APRIL FAR EAST (M) SDN BHD\n"
                "Consignee: VITAL SOLUTIONS PTE. LTD.\n"
                "Notify Party: SAME AS CONSIGNEE\n"
                "Port of Loading: PORT KLANG (MYPKG)\n"
                "Port of Discharge: MERSIN, TURKEY (TRMER)\n"
                "Container Count: 6 x 20'GP\n"
                "Gross Weight: 135,126.00 KGS\n"
                "Vessel / Voyage: MMSS 2507 V.257087E\n"
                "Commodity: COATED IVORY BOARD\n"
            ),
            "bl_text": (
                "DRAFT BILL OF LADING\n"
                "====================================================\n"
                "Shipper: APRIL FAR EAST (M) SDN BHD\n"
                "Consignee: VITAL SOLUTIONS INTERNATIONAL LTD.\n"  # Discrepancy
                "Notify Party: SAME AS CONSIGNEE\n"
                "Port of Loading: PORT KLANG (MYPKG)\n"
                "Port of Discharge: MERSIN, TURKEY (TRMER)\n"
                "Total Containers: 6 x 20'GP\n"
                "Gross Weight: 135,126.00 KGS\n"
                "Vessel: MMSS 2507 V.257087E\n"
                "Freight: PREPAID\n"
            ),
        },
        {
            "subject": "_Reminder_Paper - Submit SI & AED_10-01-2026",
            "sender": "operations.hub@apriliasia.com",
            "body": (
                "Good day,\n\n"
                "This is an automated operational notice regarding booking 5FRR-36541.\n"
                "Kindly review billing allocation and submit AED clearance.\n\n"
                "No BL comparison required at this stage.\n"
                "Regards,\nOperations Automated Gateway"
            ),
            "si_text": None,
            "bl_text": None,
        }
    ]

    scenario_idx = (cursor_uid % len(demo_scenarios))
    sc = demo_scenarios[scenario_idx]

    email_id = f"email_live_{new_uid:03d}"
    attachments_dict: dict[str, bytes] = {}
    attachment_paths: list[str] = []

    if sc["si_text"]:
        si_name = f"attachments/{email_id}_SI.txt"
        attachments_dict[si_name] = sc["si_text"].encode("utf-8")
        attachment_paths.append(si_name)

    if sc["bl_text"]:
        bl_name = f"attachments/{email_id}_Draft_BL.txt"
        attachments_dict[bl_name] = sc["bl_text"].encode("utf-8")
        attachment_paths.append(bl_name)

    email_record = {
        "email_id": email_id,
        "from": sc["sender"],
        "subject": sc["subject"],
        "body": sc["body"],
        "received_at": utc_now(),
        "message_id": f"<{email_id}-{int(time.time())}@cleardraft-live.local>",
        "attachments": attachment_paths,
    }

    return [email_record], attachments_dict, new_uid


def fetch_from_imap(
    host: str,
    port: int,
    username: str,
    password: str,
    folder: str = "INBOX",
    last_uid: int = 0,
    max_count: int = 20
) -> tuple[list[dict[str, Any]], dict[str, bytes], int]:
    """Connects to real IMAP server in read-only EXAMINE mode and fetches new messages."""
    context = ssl.create_default_context()
    mail = imaplib.IMAP4_SSL(host, port, ssl_context=context)
    try:
        mail.login(username, password)
        # Read-only EXAMINE to strictly protect mailbox integrity
        mail.examine(folder)

        # Search for messages
        res, data = mail.uid("SEARCH", None, f"UID {last_uid + 1}:*")
        if res != "OK" or not data or not data[0]:
            return [], {}, last_uid

        uids = [int(u) for u in data[0].split() if int(u) > last_uid]
        if not uids:
            return [], {}, last_uid

        uids.sort()
        selected_uids = uids[:max_count]

        emails: list[dict[str, Any]] = []
        all_attachments: dict[str, bytes] = {}
        highest_uid = last_uid

        for u in selected_uids:
            highest_uid = max(highest_uid, u)
            res, fetch_data = mail.uid("FETCH", str(u), "(RFC822)")
            if res != "OK" or not fetch_data:
                continue

            for part in fetch_data:
                if isinstance(part, tuple) and len(part) >= 2:
                    raw_bytes = part[1]
                    email_obj, atts = parse_mime_message(raw_bytes, u)
                    emails.append(email_obj)
                    all_attachments.update(atts)
                    break

        return emails, all_attachments, highest_uid
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def retrieve_mailbox_and_run(
    store: Store,
    connection_id: str,
    password: str | None = None,
    mode: str = "auto"
) -> dict[str, Any]:
    """Orchestrates retrieve -> import -> run pipeline.

    Mode:
    - 'live': requires live IMAP credentials
    - 'demo' or 'auto': uses live IMAP if configured, or gracefully falls back to demo batch.
    """
    conn = store.get_mailbox_connection(connection_id)
    if not conn:
        raise ValueError(f"Mailbox connection '{connection_id}' not found")

    last_uid = int(conn.get("last_uid") or 0)
    messages: list[dict[str, Any]] = []
    attachments: dict[str, bytes] = {}
    new_uid = last_uid

    # Check environment variable for password if not provided in call
    env_password = (
        password
        or os.environ.get(f"MAILBOX_PASSWORD_{conn.get('provider', '').upper()}")
        or os.environ.get("LIVE_MAILBOX_PASSWORD")
    )

    is_live = False
    if env_password and mode != "demo":
        try:
            messages, attachments, new_uid = fetch_from_imap(
                host=conn["host"],
                port=int(conn["port"]),
                username=conn["username"],
                password=env_password,
                folder=conn.get("folder", "INBOX"),
                last_uid=last_uid,
                max_count=10,
            )
            is_live = True
        except Exception as exc:
            if mode == "live":
                raise RuntimeError(f"IMAP connection failed: {exc}") from exc
            # Auto fallback to demo fixture if live fails
            messages, attachments, new_uid = generate_demo_inbound_batch(connection_id, last_uid)
    else:
        # Graceful deterministic demo fixture
        messages, attachments, new_uid = generate_demo_inbound_batch(connection_id, last_uid)

    if not messages:
        # No new messages above high-water mark
        store.update_mailbox_cursor(connection_id, last_uid, status="idle", last_polled_at=utc_now())
        return {
            "connection_id": connection_id,
            "new_count": 0,
            "message": "Mailbox is up to date · No new messages found.",
            "import_id": None,
            "run_id": None,
            "case_ids": [],
            "cases": []
        }

    # Step 2: Import messages using ParticipantSource contract
    source = MailboxSource(messages, attachments)
    import_id = import_participant(source, store, source_type="mailbox")

    # Step 3: Run pipeline
    run_id, _ = run_import(store, import_id, mode="local_rules")

    # Step 4: Advance cursor
    now_str = utc_now()
    store.update_mailbox_cursor(connection_id, new_uid, status="connected", last_polled_at=now_str)

    # Collect created cases
    with store.connect() as db:
        cases_rows = db.execute(
            "SELECT c.*, e.raw_json FROM cases c JOIN emails e ON c.id=e.id WHERE c.import_id=?",
            (import_id,)
        ).fetchall()

    cases_list = []
    case_ids = []
    for r in cases_rows:
        case_ids.append(r["id"])
        email_data = json.loads(r["raw_json"]) if r["raw_json"] else {}
        cases_list.append({
            "id": r["id"],
            "email_id": r["email_id"],
            "subject": email_data.get("subject", ""),
            "sender": email_data.get("from", ""),
            "category": r["category"],
            "verification": r["verification"],
            "updated_at": r["updated_at"],
        })

    return {
        "connection_id": connection_id,
        "import_id": import_id,
        "run_id": run_id,
        "new_count": len(messages),
        "case_ids": case_ids,
        "cases": cases_list,
        "is_live_server": is_live,
        "high_water_mark": new_uid,
        "retrieved_at": now_str,
    }
