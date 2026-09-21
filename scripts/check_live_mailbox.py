"""Diagnostic for the live Gmail mailbox setup. Never prints credential values -
only booleans, lengths, and counts - so it's safe to paste its output anywhere.

Usage: python scripts/check_live_mailbox.py [--retrieve]
  --retrieve  Actually call /mailbox/conn_gmail/retrieve in live mode (uses one
              IMAP round trip against the real inbox; safe, read-only EXAMINE).
              Without this flag, only status is checked - nothing is fetched.
"""
import sys
import urllib.request
import json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:8000"


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.loads(r.read().decode())


def post(path, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(BASE + path, data=data, method="POST",
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def check(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}" + (f" - {detail}" if detail else ""))
    return ok


def main():
    do_retrieve = "--retrieve" in sys.argv
    all_ok = True

    # 1. API server reachable at all. Any HTTP response (even a 404 for a
    # route that doesn't exist) proves the server is up; only a connection
    # failure means it isn't running.
    try:
        get("/")
    except urllib.error.HTTPError:
        pass
    except Exception as exc:
        check("API server reachable on :8000", False, f"{type(exc).__name__}: {exc}")
        print("\nStart the backend first, then re-run this script.")
        return 1
    check("API server reachable on :8000", True)

    # 2. Mailbox status.
    try:
        status = get("/mailbox/conn_gmail/status")
    except Exception as exc:
        check("GET /mailbox/conn_gmail/status", False, f"{type(exc).__name__}: {exc}")
        return 1
    check("GET /mailbox/conn_gmail/status", True)

    has_address = bool(status.get("has_address"))
    has_credentials = bool(status.get("has_credentials"))
    mode = status.get("mode")
    configured_username = status.get("configured_username")

    all_ok &= check(
        "Mailbox address resolved (contains @, not the shipped placeholder)",
        has_address,
        "check .env: 'email' must be a full address like you@gmail.com" if not has_address else "",
    )
    all_ok &= check(
        "App password resolved",
        has_credentials,
        "check .env: 'app_pass' is not set or empty" if not has_credentials else "",
    )
    all_ok &= check(
        f"Effective mode is live_imap (got: {mode})",
        mode == "live_imap",
    )
    if configured_username:
        print(f"       (connection row still stores the placeholder '{configured_username}' - "
              f"expected, since the .env value overrides it at read time)")
    if status.get("configured_since"):
        print(f"       [CUTOFF ACTIVE] Only retrieving emails received later than: {status.get('configured_since')}")

    if "--sync-latest" in sys.argv:
        print("\nFast-forwarding mailbox cursor to latest message in inbox...")
        try:
            sync_res = post("/mailbox/conn_gmail/sync-latest")
            print(f"       Cursor set to latest UID {sync_res.get('latest_uid')} (previous was {sync_res.get('previous_last_uid')})")
            print("       Historic emails will now be skipped; only emails arriving after this point will be retrieved.")
        except Exception as exc:
            print(f"       Sync failed: {exc}")
        return 0

    if not all_ok:
        print("\nFix the items above before retrieving - a retrieve will fall back")
        print("to demo fixtures (or fail, in --live mode) until status is all green.")
        if not do_retrieve:
            return 1

    if not do_retrieve:
        print("\nStatus looks good. Re-run with --retrieve to actually pull from the inbox.")
        return 0 if all_ok else 1

    # 3. Real retrieve attempt in strict live mode - raises rather than
    # silently substituting demo fixtures, so a failure here is informative.
    print("\nAttempting a live retrieve (mode=live, read-only IMAP EXAMINE)...")
    payload = {"mode": "live"}
    # Check for custom --since
    for arg in sys.argv:
        if arg.startswith("--since="):
            payload["since_time"] = arg.split("=", 1)[1]
    try:
        result = post("/mailbox/conn_gmail/retrieve", payload)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        check("POST /mailbox/conn_gmail/retrieve (mode=live)", False, f"HTTP {exc.code}: {body[:300]}")
        return 1
    except Exception as exc:
        check("POST /mailbox/conn_gmail/retrieve (mode=live)", False, f"{type(exc).__name__}: {exc}")
        return 1

    check("POST /mailbox/conn_gmail/retrieve (mode=live)", True)
    check("Server confirms this was a live IMAP fetch", bool(result.get("is_live_server")))
    if result.get("since_time"):
        print(f"       cutoff applied: emails strictly >= {result.get('since_time')}")
    print(f"       run_mode: {result.get('run_mode')}")
    print(f"       new_count: {result.get('new_count')}")
    print(f"       message: {result.get('message', '')}")
    for c in result.get("cases", []):
        print(f"       case {c['id'][:8]}...  {c['category']:<16}  {c['verification']:<12}  {c['subject'][:60]}")

    if result.get("new_count", 0) == 0:
        print("\nNo new messages above the UID cursor. If you just sent test emails,")
        print("either they haven't arrived yet, or the cursor already advanced past")
        print("them in an earlier run - call POST /mailbox/conn_gmail/reset first.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
