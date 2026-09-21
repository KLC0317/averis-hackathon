"""Reproducible, offline demonstration of the classification gateway catching
a genuine tier disagreement.

This runs the REAL pipeline (import_participant, run_import, classify_email,
gateway.py's routing functions) end to end. The only thing stood in for is
the network call to the model provider - replaced with a fixed, deterministic
stub so this script needs no API key and produces the same output every time.
That is the same technique used during development to verify the escalation
wiring before spending a real model call on it (see docs/reliability.md).

The email below is entirely synthetic (invented company/route/booking names),
not drawn from any participant bundle - the point is the *shape* of the
disagreement (an SI submission that also asks for the resulting draft BL,
worded ambiguously enough that a keyword scorer and a model reasonably read
it differently), not a specific dataset row.

Run: python scripts/demo_gateway_conflict.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from cleardraft.core import classify_email  # noqa: E402
from cleardraft.ingest import import_participant  # noqa: E402
from cleardraft.pipeline import run_import  # noqa: E402
from cleardraft.store import Store  # noqa: E402

SUBJECT = "Booking 5RCY-88213 - documents"
BODY = (
    "Hello team,\n\n"
    "Please find below the shipping instruction for the above booking.\n\n"
    "Shipper: Meridian Fibre Exports Ltd\n"
    "Consignee: Northport Paper Traders Pte Ltd\n"
    "Port of Loading: Laem Chabang, Thailand\n"
    "Port of Discharge: Felixstowe, United Kingdom\n"
    "Containers: 4 x 40'HC\n"
    "Gross weight: 78,400 KG\n\n"
    "Kindly revert with the draft bill of lading once it is available so we can check it.\n\n"
    "Regards,\nDocumentation Team"
)


class ConflictingStubProvider:
    """Stands in for a live model that reasonably reads this message the
    opposite way the local rules did - answering confidently, with a real,
    verifiable quote from the same body, and no self-reported hedging. This
    is what a plausible model answer looks like; the point of the demo is
    that plausible is not the same as certainly correct."""

    def classify_email(self, subject: str, body: str, **_: object) -> dict:
        return {
            "category": "SI_REQUEST",
            "request_subtype": "OTHER_REQUEST",
            "requires_review": False,
            "alternative_categories": [],
            "evidence": [{"source": "current_body", "quote": "Please find below the shipping instruction for the above booking."}],
            "reason": "The message's main content is a shipping instruction submission for this booking.",
        }

    def extract_fields(self, role: str, text: str) -> dict:  # pragma: no cover - not exercised
        raise RuntimeError("extraction not used in this demo")


def main() -> int:
    print("=" * 78)
    print("Step 1: what the deterministic rules alone conclude")
    print("=" * 78)
    local = classify_email(SUBJECT, BODY)
    print(f"  category:   {local['category']}")
    print(f"  confidence: {local['confidence']}")
    print(f"  escalate:   {local['escalate_to_ai']}  (below the {0.8} accept threshold)")
    print(f"  reason:     {local['reason']}")

    print()
    print("=" * 78)
    print("Step 2: run the real pipeline in live_ai mode, with a stub standing in")
    print("        for the model - it answers SI_REQUEST, disagreeing with the")
    print("        rules' BL_COMPARISON reading, with a real verifiable quote")
    print("=" * 78)

    with tempfile.TemporaryDirectory(prefix="cleardraft-gateway-demo-") as tmp:
        root = Path(tmp)
        (root / "inbox").mkdir()
        (root / "attachments").mkdir()
        (root / "inbox" / "demo_001.json").write_text(json.dumps({
            "email_id": "demo_001", "from": "docs@example.test", "subject": SUBJECT,
            "body": BODY, "attachments": [],
        }), encoding="utf-8")

        store = Store(str(root / "demo.db"))
        import_id = import_participant(str(root), store)
        with patch("cleardraft.providers.DeepSeekProvider.from_environment", return_value=ConflictingStubProvider()):
            run_id, results = run_import(store, import_id, "live_ai")

        case = store.list_cases(import_id)[0]
        classification = json.loads(case["classification_json"])
        gateway = classification["gateway"]

        print(f"  local reading:  {gateway['local_category']} (confidence {gateway['local_confidence']})")
        print(f"  model reading:  {gateway['model_category']} (confidence {gateway['model_confidence']})")
        print(f"  disposition:    {gateway['disposition']}")
        print(f"  reason:         {gateway['reason']}")

        assert gateway["disposition"] == "HUMAN_REVIEW", "expected a tier conflict to require a person"
        packet = gateway["arbitration"]

        print()
        print("=" * 78)
        print("Step 3: the arbitration packet a reviewer would actually see")
        print("=" * 78)
        print(f"  Question: {packet['question']}")
        print(f"  Why escalated: {packet['why_escalated']}")
        for option in packet["options"]:
            print(f"\n  -- {option['category']} (proposed by {option['proposed_by']}) --")
            print(f"     meaning:     {option['meaning']}")
            print(f"     consequence: {option['consequence']}")
            for ev in option["evidence"]:
                print(f"     evidence:    \"{ev['quote']}\" ({ev['source']})")

    print()
    print("=" * 78)
    print("What this demonstrates")
    print("=" * 78)
    print(
        "  Both readings are individually plausible - a design that trusts a model\n"
        "  unconditionally on disagreement (the common pattern) would have accepted\n"
        "  SI_REQUEST here with no further check. This gateway instead holds the\n"
        "  case for a person, with both readings' evidence and the consequence of\n"
        "  each choice shown side by side. See docs/reliability.md for a real\n"
        "  incident where trusting the model unconditionally on disagreement\n"
        "  silently corrupted 80 classifications during development."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
