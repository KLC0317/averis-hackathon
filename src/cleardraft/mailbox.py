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


def _env_any(*names: str) -> str | None:
    """First non-empty environment value among ``names``, matched case-insensitively.

    Windows environment lookups fold case but POSIX ones do not, so a variable
    written as ``app_pass`` locally would silently vanish once deployed to Linux.
    Resolving case-insensitively keeps one .env working in both places.
    """
    folded = {key.casefold(): value for key, value in os.environ.items()}
    for name in names:
        value = os.environ.get(name) or folded.get(name.casefold())
        if value and value.strip():
            return value.strip()
    return None


def resolve_mailbox_credentials(conn: dict[str, Any]) -> tuple[str, str | None]:
    """Return the (username, password) actually used to open this mailbox.

    The stored connection row carries a shipped placeholder address, so an
    operator-supplied address in the environment takes precedence over it. Both
    the status endpoint and the fetch path resolve through here, so what the UI
    reports as connected is by construction what the IMAP login will use.
    """
    provider = str(conn.get("provider") or "").upper()
    password = _env_any(
        f"MAILBOX_PASSWORD_{provider}",
        "LIVE_MAILBOX_PASSWORD",
        "app_pass",
        "APP_PASSWORD",
        "GMAIL_APP_PASSWORD",
    )
    username = _env_any(
        f"MAILBOX_EMAIL_{provider}",
        "LIVE_MAILBOX_EMAIL",
        "email",
        "MAILBOX_EMAIL",
        "GMAIL_EMAIL",
    ) or str(conn.get("username") or "")
    return username, password

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


def _parse_since_time(raw: str | datetime | None) -> datetime | None:
    """Parses various timestamp representations into a UTC datetime."""
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw.astimezone(timezone.utc) if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    raw_str = str(raw).strip()
    if not raw_str:
        return None
    if raw_str.lower() == "now":
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(raw_str)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    try:
        dt = email.utils.parsedate_to_datetime(raw_str)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    return None


def fetch_from_imap(
    host: str,
    port: int,
    username: str,
    password: str,
    folder: str = "INBOX",
    last_uid: int = 0,
    max_count: int = 20,
    since_time: str | datetime | None = None,
) -> tuple[list[dict[str, Any]], dict[str, bytes], int]:
    """Connects to real IMAP server in read-only EXAMINE mode and fetches new messages.

    If ``since_time`` is provided (or set in environment), only messages received strictly
    at or after this cutoff timestamp are returned.
    """
    since_dt = _parse_since_time(since_time)
    context = ssl.create_default_context()
    mail = imaplib.IMAP4_SSL(host, port, ssl_context=context)
    try:
        mail.login(username, password)
        # Read-only EXAMINE to strictly protect mailbox integrity
        mail.select(folder, readonly=True)

        # Build IMAP search criteria with optional date cutoff
        if since_dt:
            imap_date = since_dt.strftime("%d-%b-%Y")
            if last_uid > 0:
                search_query = f'(SINCE "{imap_date}" UID {last_uid + 1}:*)'
            else:
                search_query = f'(SINCE "{imap_date}")'
        else:
            search_query = f"UID {last_uid + 1}:*"

        res, data = mail.uid("SEARCH", None, search_query)
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

                    # Precise timestamp filtering down to second
                    if since_dt:
                        date_str = email_obj.get("received_at")
                        msg_dt = None
                        if date_str:
                            try:
                                msg_dt = email.utils.parsedate_to_datetime(date_str)
                                if msg_dt.tzinfo:
                                    msg_dt = msg_dt.astimezone(timezone.utc)
                                else:
                                    msg_dt = msg_dt.replace(tzinfo=timezone.utc)
                            except Exception:
                                pass
                        if msg_dt and msg_dt < since_dt:
                            # Skip emails received before cutoff
                            continue

                    emails.append(email_obj)
                    all_attachments.update(atts)
                    break

        return emails, all_attachments, highest_uid
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def sync_mailbox_cursor_to_latest(
    store: Store,
    connection_id: str,
    password: str | None = None,
) -> dict[str, Any]:
    """Fast-forwards cursor to the highest existing mailbox UID to ignore historic mail."""
    conn = store.get_mailbox_connection(connection_id)
    if not conn:
        raise ValueError(f"Mailbox connection '{connection_id}' not found")
    resolved_username, resolved_password = resolve_mailbox_credentials(conn)
    env_password = password or resolved_password
    if not env_password:
        raise RuntimeError("Mailbox password not found")

    context = ssl.create_default_context()
    mail = imaplib.IMAP4_SSL(conn["host"], int(conn["port"]), ssl_context=context)
    try:
        mail.login(resolved_username, env_password)
        mail.select(conn.get("folder", "INBOX"), readonly=True)
        res, data = mail.uid("SEARCH", None, "ALL")
        uids = [int(u) for u in data[0].split()] if res == "OK" and data and data[0] else []
        latest_uid = max(uids) if uids else 0
        previous_uid = int(conn.get("last_uid") or 0)
        store.update_mailbox_cursor(connection_id, latest_uid, status="ready", last_polled_at=utc_now())
        return {
            "connection_id": connection_id,
            "previous_last_uid": previous_uid,
            "latest_uid": latest_uid,
            "synced_at": utc_now(),
        }
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def retrieve_mailbox_and_run(
    store: Store,
    connection_id: str,
    password: str | None = None,
    mode: str = "auto",
    since_time: str | datetime | None = None,
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

    # Determine effective cutoff timestamp (explicit argument, or .env setting)
    configured_since = since_time or _env_any("MAILBOX_SINCE", "LIVE_MAILBOX_SINCE", "EMAIL_SINCE")

    # An explicitly supplied password wins; otherwise resolve from environment.
    resolved_username, resolved_password = resolve_mailbox_credentials(conn)
    env_password = password or resolved_password

    # "live" is an assertion that what follows is real mail. Falling back to the
    # demo fixture here would present fabricated messages as retrieved ones, so
    # missing credentials fail loudly instead.
    if mode == "live":
        if not env_password:
            raise RuntimeError(
                "live retrieval requires a mailbox password; set app_pass (or "
                "LIVE_MAILBOX_PASSWORD) in the environment"
            )
        if not resolved_username or "@" not in resolved_username:
            raise RuntimeError(
                "live retrieval requires a mailbox address; set email (or "
                "LIVE_MAILBOX_EMAIL) in the environment"
            )

    is_live = False
    if env_password and mode != "demo":
        try:
            messages, attachments, new_uid = fetch_from_imap(
                host=conn["host"],
                port=int(conn["port"]),
                username=resolved_username,
                password=env_password,
                folder=conn.get("folder", "INBOX"),
                last_uid=last_uid,
                max_count=10,
                since_time=configured_since,
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
        # No new messages above high-water mark or cutoff
        store.update_mailbox_cursor(connection_id, new_uid if new_uid > last_uid else last_uid, status="idle", last_polled_at=utc_now())
        cutoff_msg = f" (filtered by cutoff: {configured_since})" if configured_since else ""
        return {
            "connection_id": connection_id,
            "new_count": 0,
            "message": f"Mailbox is up to date · No new messages found{cutoff_msg}.",
            "since_time": str(configured_since) if configured_since else None,
            "import_id": None,
            "run_id": None,
            "case_ids": [],
            "cases": [],
            "is_live_server": is_live,
        }

    # Step 2: Import messages using ParticipantSource contract
    source = MailboxSource(messages, attachments)
    import_id = import_participant(source, store, source_type="mailbox")

    # Step 3: Run pipeline. Every message is still read by the deterministic
    # local rules first (gateway.py); a DeepSeek key only makes the second
    # opinion *available* for whatever the local gateway itself is unsure
    # about, exactly as CLI/API runs already work. Absent a key, mail escalated
    # by the gateway routes straight to a human instead of the model - never a
    # silent downgrade to a lower-confidence answer.
    ai_configured = bool(os.environ.get("DEEPSEEK_KEY") or os.environ.get("DEEPSEEK_API_KEY"))
    run_mode = "live_ai" if ai_configured else "local_rules"
    run_id, _ = run_import(store, import_id, mode=run_mode)

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
        "run_mode": run_mode,
        "high_water_mark": new_uid,
        "retrieved_at": now_str,
        "since_time": str(configured_since) if configured_since else None,
    }
