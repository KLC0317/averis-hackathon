"""Optional AI provider adapters.

DeepSeek exposes an OpenAI-compatible endpoint.  The provider is opt-in and all
responses remain candidates until the local evidence and comparison validators
accept them. Secrets are read from the environment and are never included in
errors or provenance payloads.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from .core import FIELDS


class ProviderError(RuntimeError):
    """A live_ai call failed. ``retryable`` tells the caller whether the same
    request might succeed on its own later (an outage, a rate limit) versus
    whether repeating it as-is would just fail again (bad credentials, a
    response that violates the schema after the one repair attempt)."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass
class DeepSeekProvider:
    api_key: str
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"
    timeout: int = 60

    @classmethod
    def from_environment(cls) -> "DeepSeekProvider":
        key = os.getenv("DEEPSEEK_KEY") or os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise RuntimeError("live_ai requires DEEPSEEK_KEY or DEEPSEEK_API_KEY")
        return cls(key, os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), os.getenv("DEEPSEEK_MODEL", "deepseek-chat"))

    def chat_json(self, system: str, user: str) -> dict[str, Any]:
        body = json.dumps({"model": self.model, "temperature": 0, "response_format": {"type": "json_object"},
                           "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
        # One bounded retry, and only for failures that are plausibly transient
        # (rate limit, server error, timeout/connection drop). A bad request or
        # bad credentials will not succeed on a second try, so it fails fast
        # instead of spending a call it cannot recover from.
        max_attempts = 2
        payload: dict[str, Any] | None = None
        for attempt in range(1, max_attempts + 1):
            req = urllib.request.Request(self.base_url.rstrip("/") + "/chat/completions", data=body,
                                         headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                retryable = exc.code == 429 or exc.code >= 500
                if not retryable or attempt == max_attempts:
                    raise ProviderError(f"live_ai provider returned HTTP {exc.code}", retryable=retryable) from None
                time.sleep(1.5 * attempt)
            except (urllib.error.URLError, TimeoutError):
                if attempt == max_attempts:
                    raise ProviderError("live_ai provider unavailable", retryable=True) from None
                time.sleep(1.5 * attempt)
        try:
            content = payload["choices"][0]["message"]["content"]
            value = json.loads(content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
            # Not retryable here: at temperature 0 an identical resend tends to
            # reproduce the same malformed output. The caller's repair prompt
            # (a *different* request) is the intended recovery path, not a resend.
            raise ProviderError("live_ai provider returned invalid structured output", retryable=False) from None
        if not isinstance(value, dict):
            raise ProviderError("live_ai provider returned a non-object", retryable=False)
        return value

    @staticmethod
    def _coerce_classification_evidence(value: dict[str, Any], subject: str, body: str) -> dict[str, Any]:
        """Normalize provider evidence shortcuts and re-derive ``source`` from
        where a quote actually appears, rather than trusting the model's own
        label for it.

        Accepts a bare string in place of the array, and a dict whose "source"
        is missing or not one of the three allowed values, as long as its quote
        is independently verifiable in the subject or body. A quote that cannot
        be located in either is dropped rather than kept with an unchecked
        source - the same "no evidence without a verified locator" rule
        ``_merge_ai_observations`` applies to field extraction.
        """
        evidence = value.get("evidence")
        if isinstance(evidence, str):
            evidence = [evidence]
        if not isinstance(evidence, list):
            return value
        subject_compact, body_compact = " ".join(subject.split()), " ".join(body.split())
        normalized: list[dict[str, str]] = []
        for item in evidence:
            if isinstance(item, dict):
                quote = item.get("quote")
            elif isinstance(item, str):
                quote = item
            else:
                continue
            if not isinstance(quote, str) or not quote.strip():
                continue
            quote = quote.strip()
            compact = " ".join(quote.split())
            if quote in subject or (compact and compact in subject_compact):
                normalized.append({"source": "subject", "quote": quote})
            elif quote in body or (compact and compact in body_compact):
                normalized.append({"source": "current_body", "quote": quote})
            # else: source cannot be verified against either field - drop it.
        value["evidence"] = normalized
        return value

    @staticmethod
    def _coerce_extraction(value: dict[str, Any], role: str, text: str) -> dict[str, Any]:
        """Repair common provider shorthand while deriving evidence only from source lines."""
        fields = value.get("fields") if isinstance(value, dict) else None
        if not isinstance(fields, dict) and isinstance(value, dict):
            # DeepSeek sometimes flattens the seven fields at the top level
            # despite the requested wrapper. Treat those values as candidates
            # and still derive all evidence from the supplied source text.
            flattened = {field: value[field] for field in FIELDS if field in value}
            fields = flattened if flattened else None
        if not isinstance(fields, dict):
            return value
        lines = text.splitlines()

        def evidence_for(raw_value: str | None, items: Any) -> list[dict[str, str]]:
            out: list[dict[str, str]] = []
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict) and item.get("block_id") and item.get("quote"):
                        out.append({"block_id": str(item["block_id"]), "quote": str(item["quote"])})
                    elif isinstance(item, str) and item.strip():
                        quote = item.strip()
                        for index, line in enumerate(lines, start=1):
                            if " ".join(quote.split()) in " ".join(line.split()):
                                out.append({"block_id": f"line-{index}", "quote": line}); break
            if not out and raw_value:
                token = " ".join(str(raw_value).split()).casefold()
                for index, line in enumerate(lines, start=1):
                    if token and token in " ".join(line.split()).casefold():
                        out.append({"block_id": f"line-{index}", "quote": line}); break
            return out

        normalized_fields: dict[str, dict[str, Any]] = {}
        for field in FIELDS:
            item = fields.get(field, {})
            if isinstance(item, str):
                item = {"value_status": "PRESENT", "raw_value": item}
            if not isinstance(item, dict):
                item = {}
            raw_value = item.get("raw_value", item.get("value"))
            status = str(item.get("value_status", "PRESENT" if raw_value else "MISSING")).upper()
            if status in {"FOUND", "RESOLVED", "OK"}: status = "PRESENT"
            if status not in {"PRESENT", "MISSING", "AMBIGUOUS", "UNREADABLE"}: status = "UNREADABLE"
            ev = evidence_for(raw_value, item.get("evidence"))
            candidates = item.get("candidates", [])
            if isinstance(candidates, list):
                candidates = [
                    ({"raw_value": str(c), "unit_hint": None, "evidence": evidence_for(str(c), None)} if isinstance(c, str) else c)
                    for c in candidates
                ]
            else:
                candidates = []
            normalized_fields[field] = {
                "value_status": status,
                "raw_value": raw_value if status == "PRESENT" else None,
                "unit_hint": item.get("unit_hint"),
                "reference_field": item.get("reference_field"),
                "evidence": ev,
                "candidates": candidates if status == "AMBIGUOUS" else [],
                "reason": str(item.get("reason", "provider extraction")),
            }
        return {"document_role": role, "fields": normalized_fields, "warnings": value.get("warnings", []) if isinstance(value.get("warnings", []), list) else []}

    def classify_email(self, subject: str, body: str, *, attachment_count: int | None = None,
                       local_hint: dict[str, Any] | None = None) -> dict[str, Any]:
        from .contracts import validate_classification
        system = (
            "Classify the current sender's request into exactly one category: "
            "BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL, or SPAM.\n"
            "BL_COMPARISON: the sender is asking, in this message, to check or compare a "
            "Shipping Instruction (SI) against a draft Bill of Lading (BL), or is asking for "
            "a draft BL to be produced or sent so it can be checked - even when no attachment "
            "is present yet. This does not include a message whose own main content is an SI "
            "submission that merely asks for the resulting draft BL afterward; see SI_REQUEST.\n"
            "SI_REQUEST: the message's main content is itself a Shipping Instruction being "
            "submitted or provided (it states shipment particulars such as shipper, "
            "consignee, port of loading/discharge, goods, as an SI). This stays SI_REQUEST "
            "even when the message also asks the recipient to revert with, issue, or send "
            "the resulting draft BL afterward once it exists - asking for the next downstream "
            "document is a routine closing line on an SI submission, not a request to compare "
            "or check a BL that already exists. Classify BL_COMPARISON instead only when the "
            "message is not itself delivering an SI and is instead about checking, comparing, "
            "or verifying a draft BL against one.\n"
            "INVOICE_QUERY: the message concerns an invoice, billing, or a shipment-related "
            "charge (freight, detention, demurrage, local or handling charges), not SI/BL "
            "document content.\n"
            "GENERAL: an operational or informational message that is not currently asking "
            "for a document comparison or a new SI. A message that only mentions a bill of "
            "lading, draft BL, shipping instruction, or booking as background or status "
            "information - without asking, in this message, to compare, check, verify, "
            "prepare, or send one - is GENERAL even though BL/SI vocabulary appears. A "
            "broadcast status update, a reminder with no specific shipment request attached, "
            "or an FYI is GENERAL, not SI_REQUEST or BL_COMPARISON.\n"
            "SPAM: unsolicited, phishing, or promotional content unrelated to a genuine "
            "shipment.\n"
            "Read only the current message's intent: a subject line, signature, "
            "external-sender banner, or an older quoted message does not by itself decide "
            "the category, and a subject can be misleading relative to the body. Do not "
            "assume an attachment exists merely because the text says 'attached' or "
            "'enclosed'; when attachment_count is supplied in the input, treat it as the "
            "actual count, not the wording of the message.\n"
            "The input may include preliminary_heuristic_hint: the output of a fast "
            "deterministic pre-classifier that found this message ambiguous. Treat it only "
            "as a hint, never as evidence for your decision - decide from the subject and "
            "body, and disregard the hint where the text points elsewhere.\n"
            "Example: an internal broadcast such as 'Reminder: outstanding shipping "
            "instructions due this week' with no specific shipment reference is GENERAL, "
            "not SI_REQUEST - a broadcast reminder is not a request tied to one booking. "
            "Example: a message with zero attachments asking to receive the draft BL for "
            "checking is BL_COMPARISON with request_subtype REQUEST_DRAFT_FOR_CHECKING.\n"
            "Return ONLY a JSON object with exactly these six keys: category, request_subtype, "
            "requires_review, alternative_categories, evidence, reason. request_subtype must be "
            "COMPARE_ATTACHED, REQUEST_DRAFT_FOR_CHECKING, OTHER_REQUEST, or UNCLEAR. "
            "evidence must be a JSON array (never a bare string) of one or more objects, each "
            "exactly {\"source\": \"subject\" | \"current_body\" | \"full_body\", \"quote\": "
            "\"<verbatim substring copied from that field>\"} - no other value for source is "
            "valid. If the evidence reasonably supports more than one category, set "
            "requires_review to true and list the others in alternative_categories; otherwise "
            "leave alternative_categories empty."
        )
        payload: dict[str, Any] = {"subject": subject, "body": body}
        if attachment_count is not None:
            payload["attachment_count"] = attachment_count
        if local_hint is not None:
            payload["preliminary_heuristic_hint"] = local_hint
        value = self.chat_json(system, json.dumps(payload))
        value = self._coerce_classification_evidence(value, subject, body)
        try:
            return validate_classification(value)
        except ValueError as first_error:
            # One bounded schema repair follows the contract in the handoff;
            # invalid provider output is never silently accepted.
            try:
                repair = self.chat_json(
                    "Return ONLY valid JSON matching the six-key classification schema. evidence must be a JSON "
                    "array (never a string) of objects shaped exactly {\"source\": \"subject\"|\"current_body\"|"
                    "\"full_body\", \"quote\": \"...\"} - source has no other valid value. Do not return markdown "
                    f"or strings outside the object. The previous response failed validation: {first_error}",
                    json.dumps(value),
                )
                repair = self._coerce_classification_evidence(repair, subject, body)
                return validate_classification(repair)
            except ValueError as second_error:
                # Two structurally invalid responses in a row: this is a
                # contract mismatch, not a network blip. Resending the same
                # request is unlikely to help, so the caller should fall back
                # rather than spend a third call.
                raise ProviderError(
                    f"live_ai classification output invalid after repair: {second_error}", retryable=False,
                ) from None

    def extract_fields(self, role: str, text: str) -> dict[str, Any]:
        from .contracts import validate_extraction
        system = (
            "Extract the seven required fields independently from this one document. Return ONLY JSON matching "
            "the exact EXTRACTION_SCHEMA shape. Never infer a value from another document. The source is line numbered; "
            "evidence.block_id must use line-N and evidence.quote must be copied exactly from the cited line(s). "
            "Use MISSING for blank/N/A/TBA/underscore values and AMBIGUOUS for conflicting candidates."
        )
        numbered = "\n".join(f"line-{i}: {line}" for i, line in enumerate(text.splitlines(), start=1))
        value = self.chat_json(system, json.dumps({"document_role": role, "source": numbered}))
        value = self._coerce_extraction(value, role, text)
        try:
            return validate_extraction(value)
        except ValueError as first_error:
            repair = self.chat_json(
                "Return ONLY valid JSON matching EXTRACTION_SCHEMA. Preserve the seven field keys exactly. "
                "Evidence must be an array of objects shaped {block_id, quote}; candidates must use "
                "{raw_value, unit_hint, evidence}. Do not add keys or markdown. "
                f"The previous response failed validation: {first_error}", json.dumps(value),
            )
            return validate_extraction(self._coerce_extraction(repair, role, text))
