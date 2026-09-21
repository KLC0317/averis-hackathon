"""Run orchestration for the local rules provider."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .core import (
    FIELDS, DocumentRole, Evidence, FieldObservation, ValueStatus, VerificationResult, classify_email,
    compare_documents, extract_fields, identify_document_role, normalize_field,
)
from .gateway import (
    Disposition, GatewayPolicy, route_escalation_unavailable, route_local, route_model,
)
from .readers import read_document
from .store import Store


def _obs_from_dict(obj: dict[str, Any]) -> FieldObservation:
    # Used by persisted results and intentionally tolerant of future fields.
    from .core import Evidence, ValueStatus
    return FieldObservation(field=obj["field"], value_status=ValueStatus(obj["value_status"]),
        raw_value=obj.get("raw_value"), canonical_value=obj.get("canonical_value"), unit_hint=obj.get("unit_hint"),
        evidence=[Evidence(**e) for e in obj.get("evidence", [])], candidates=obj.get("candidates", []),
        reason=obj.get("reason", ""), normalization=obj.get("normalization", []), role=obj.get("role"))


def _doc_text(doc: dict[str, Any]) -> str:
    read = doc.get("read_json")
    if read:
        try:
            return "\n".join(x.get("text", "") for x in json.loads(read).get("blocks", []))
        except Exception:
            pass
    return read_document(doc["bytes"], doc["filename"]).text


def _result_json(result: VerificationResult) -> dict[str, Any]:
    d = {
        "category": result.category, "verification": result.verification, "processing": result.processing,
        "confirmed_mismatch_fields": result.confirmed_mismatch_fields,
        "unresolved_fields": result.unresolved_fields, "review_reason": result.review_reason,
        "issues": result.issues, "fields": [x.to_dict() for x in result.fields],
    }
    return d


def _pair_documents(docs: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[str]]:
    issues: list[str] = []
    identified: list[tuple[dict[str, Any], DocumentRole]] = []
    for doc in docs:
        text = _doc_text(doc)
        role = identify_document_role(text, doc["filename"])
        identified.append((doc, role))
    sis = [d for d, r in identified if r == DocumentRole.SI]
    bls = [d for d, r in identified if r == DocumentRole.DRAFT_BL]
    def _hint(fn: str, role_suffix: str) -> bool:
        lower = fn.casefold()
        stem = Path(fn).stem.casefold()
        return f"_{role_suffix}" in lower or stem == role_suffix or stem.endswith(f"_{role_suffix}")

    if not sis:
        # A filename hint can select a document only when content was inconclusive.
        sis = [d for d, r in identified if r == DocumentRole.UNKNOWN and _hint(d["filename"], "si")]
    if not bls:
        bls = [d for d, r in identified if r == DocumentRole.UNKNOWN and _hint(d["filename"], "bl")]
    # An attachment that positively identifies as another document type is a
    # wrong-document case. Do not let a `_BL` filename override its content.
    if not bls and any(r == DocumentRole.OTHER for _, r in identified):
        issues.append("wrong document type detected")
    # Never silently choose among multiple plausible versions.  A reviewer must
    # explicitly pair the intended revisions before comparison can proceed.
    if len(sis) > 1:
        issues.append("multiple plausible SI document versions; explicit pair selection required")
        sis = []
    if len(bls) > 1:
        issues.append("multiple plausible draft BL document versions; explicit pair selection required")
        bls = []
    if not sis: issues.append("missing SI document")
    if not bls: issues.append("missing draft BL document")
    return (sis[0] if sis else None), (bls[0] if bls else None), issues


def _merge_ai_observations(local: dict[str, FieldObservation], payload: dict[str, Any], role: DocumentRole,
                           text: str) -> tuple[dict[str, FieldObservation], list[str]]:
    """Merge only AI readings whose cited line evidence exists in the source."""
    merged = dict(local)
    issues: list[str] = []
    lines = text.splitlines()
    for field, current in local.items():
        if current.value_status == ValueStatus.PRESENT:
            continue
        raw = payload.get("fields", {}).get(field, {})
        try:
            status = ValueStatus(raw.get("value_status", "UNREADABLE"))
        except ValueError:
            issues.append(f"{role.value}:{field}:invalid AI value status")
            continue
        evidence: list[Evidence] = []
        valid = True
        for item in raw.get("evidence", []):
            block_id, quote = str(item.get("block_id", "")), str(item.get("quote", ""))
            if not block_id.startswith("line-") or not quote:
                valid = False; break
            try:
                line_no = int(block_id.split("-", 1)[1]); source_line = lines[line_no - 1]
            except (ValueError, IndexError):
                valid = False; break
            if " ".join(quote.split()) not in " ".join(source_line.split()):
                valid = False; break
            evidence.append(Evidence(block_id, quote, {"kind": "text_lines", "start_line": line_no, "end_line": line_no}))
        if not valid:
            issues.append(f"{role.value}:{field}:AI evidence rejected")
            continue
        if status == ValueStatus.PRESENT and raw.get("raw_value") and evidence:
            canonical, steps = normalize_field(field, raw.get("raw_value"), raw.get("unit_hint"))
            if canonical is not None:
                merged[field] = FieldObservation(field, status, raw_value=raw.get("raw_value"), canonical_value=canonical,
                    unit_hint=raw.get("unit_hint"), evidence=evidence, normalization=steps,
                    reason=raw.get("reason", ""), role=role.value)
            else:
                issues.append(f"{role.value}:{field}:AI value could not be normalized")
        elif status == ValueStatus.AMBIGUOUS and raw.get("candidates") and evidence:
            candidates = [str(c.get("raw_value", "")) for c in raw.get("candidates", []) if c.get("raw_value")]
            merged[field] = FieldObservation(field, status, candidates=candidates, evidence=evidence,
                reason=raw.get("reason", "ambiguous AI candidates"), role=role.value)
        elif status in {ValueStatus.MISSING, ValueStatus.UNREADABLE}:
            merged[field] = FieldObservation(field, status, evidence=evidence, reason=raw.get("reason", ""), role=role.value)
    return merged, issues


def verify_case(docs: list[dict[str, Any]], email: dict[str, Any], category: str,
                request_subtype: str | None = None, provider: Any = None) -> VerificationResult:
    """Run the comparison stage for one case under a given category.

    Shared by the automated pipeline and by arbitration resolution, so that a
    category a person confirms produces exactly the comparison the automated
    path would have produced for that category - the reviewer's decision takes
    effect rather than merely being recorded.
    """
    # A request asking the recipient to *send* a draft BL carries no documents by
    # design: nothing was submitted, so there is nothing to compare and no absent
    # attachment to chase. This applies only when the message itself declared no
    # attachments; one that declared attachments but delivered none is a real gap
    # and still falls through to the missing-document path.
    nothing_submitted = (not docs and not email.get("attachments")
                         and request_subtype == "REQUEST_DRAFT_FOR_CHECKING")
    if category != "BL_COMPARISON" or nothing_submitted:
        return VerificationResult(category, "NOT_APPLICABLE")

    si_doc, bl_doc, issues = _pair_documents(docs)
    if si_doc is None or bl_doc is None:
        missing_side = "SI" if si_doc is None else "DRAFT_BL"
        obs = {f: FieldObservation(f, ValueStatus.MISSING, reason=f"missing {missing_side} document", role=missing_side) for f in FIELDS}
        result = compare_documents(obs, obs, issues=issues)
        result.review_reason = "wrong_doc_type" if any("wrong document type" in x for x in issues) else "missing_attachment"
        return result

    si_read = read_document(si_doc["bytes"], si_doc["filename"])
    bl_read = read_document(bl_doc["bytes"], bl_doc["filename"])
    if si_read.error or bl_read.error or not si_read.blocks or not bl_read.blocks:
        processing = "FAILED" if (si_read.error or bl_read.error) else "SUCCEEDED"
        reader_issues = [x for x in (si_read.error, bl_read.error) if x] + si_read.warnings + bl_read.warnings
        if not si_read.blocks and "missing SI readable content" not in reader_issues:
            reader_issues.append("missing SI readable content")
        if not bl_read.blocks and "missing draft BL readable content" not in reader_issues:
            reader_issues.append("missing draft BL readable content")
        result = compare_documents({}, {}, processing=processing, issues=issues + reader_issues)
        result.review_reason = "unreadable"
        return result

    si = extract_fields(si_read.text, DocumentRole.SI)
    bl = extract_fields(bl_read.text, DocumentRole.DRAFT_BL)
    run_issues = issues + si_read.warnings + bl_read.warnings
    if provider is not None:
        if any(x.value_status != ValueStatus.PRESENT for x in si.values()):
            try:
                si_ai = provider.extract_fields(DocumentRole.SI.value, si_read.text)
                si, extra = _merge_ai_observations(si, si_ai, DocumentRole.SI, si_read.text)
                run_issues.extend(extra)
            except Exception as exc:
                run_issues.append(f"live AI SI recovery unavailable: {type(exc).__name__}")
        if any(x.value_status != ValueStatus.PRESENT for x in bl.values()):
            try:
                bl_ai = provider.extract_fields(DocumentRole.DRAFT_BL.value, bl_read.text)
                bl, extra = _merge_ai_observations(bl, bl_ai, DocumentRole.DRAFT_BL, bl_read.text)
                run_issues.extend(extra)
            except Exception as exc:
                run_issues.append(f"live AI BL recovery unavailable: {type(exc).__name__}")
    return compare_documents(si, bl, issues=run_issues)


def run_import(store: Store, import_id: str, mode: str = "local_rules",
               policy: GatewayPolicy | None = None) -> tuple[str, dict[str, VerificationResult]]:
    if mode not in {"local_rules", "live_ai", "replay"}:
        raise ValueError("mode must be local_rules, live_ai, or replay")
    if mode == "replay":
        # A replay needs a recorded result plus an input/model/policy hash
        # contract. Until that store is implemented, never masquerade as a
        # local run: changed inputs must not receive a stale cached answer.
        raise ValueError("replay requires a hash-checked recorded run; no replay fixture is configured")
    policy = policy or GatewayPolicy()
    if mode == "live_ai":
        # Provider adapter is optional; local fallback is never silently called
        # when a key is absent. The CLI checks credentials first.
        from .providers import DeepSeekProvider
        provider = DeepSeekProvider.from_environment()  # validates configuration
    else:
        provider = None
    emails = store.list_emails(import_id)
    docs_all = store.list_documents(import_id)
    input_hash = hashlib.sha256("".join(x["content_hash"] for x in emails).encode()).hexdigest()
    run_id = store.create_run(import_id, mode, input_hash, policy_version="local-rules-v1")
    cases = {x["email_id"]: x for x in store.list_cases(import_id)}
    results: dict[str, VerificationResult] = {}
    aggregate: dict[str, Any] = {}
    for email_row in emails:
        email = email_row["raw"]
        subject, body = email.get("subject", ""), email.get("body", "")
        # Every message is read by the deterministic rules first; the gateway
        # decides whether that reading stands, needs a model second opinion, or
        # needs a person. Routing policy lives in gateway.py, not here.
        classification = classify_email(subject, body)
        classification["source"] = "local_rules"
        classification_issues: list[str] = []
        decision = route_local(classification, policy)
        if decision.disposition is Disposition.ESCALATED:
            if provider is None:
                # local_rules mode: the second opinion this case was escalated
                # for does not exist, so it belongs to a person.
                decision = route_escalation_unavailable(classification, "no model configured for this run", policy)
            else:
                hint = {"top_category": classification["category"], "confidence": classification["confidence"],
                        "alternative_categories": classification.get("alternative_categories", [])}
                try:
                    resolved = provider.classify_email(
                        subject, body, attachment_count=len(email.get("attachments", [])), local_hint=hint,
                    )
                except Exception as exc:
                    retryable = getattr(exc, "retryable", False)
                    classification_issues.append(
                        f"live AI classification unavailable ({type(exc).__name__}, retryable={retryable}): {exc}"
                    )
                    decision = route_escalation_unavailable(
                        classification, f"{type(exc).__name__}, retryable={retryable}", policy,
                    )
                else:
                    decision = route_model(classification, resolved, policy)
                    if decision.category == resolved["category"]:
                        resolved.update({"source": "live_ai",
                                         "local_category": classification["category"],
                                         "local_confidence": classification["confidence"]})
                        classification = resolved
        classification["gateway"] = decision.to_dict()
        category = classification["category"]
        docs = [d for d in docs_all if d.get("email_id") == email["email_id"]]
        result = verify_case(docs, email, category, classification.get("request_subtype"), provider)
        result.issues.extend(classification_issues)
        results[email["email_id"]] = result
        case = cases[email["email_id"]]
        store.save_case_result(run_id, case["id"], category, classification, _result_json(result), result.verification)
        aggregate[email["email_id"]] = result.to_submission()
    store.complete_run(run_id, aggregate)
    return run_id, results
