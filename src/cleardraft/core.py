"""Deterministic, conservative shipping document verification primitives."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, asdict
from decimal import Decimal, InvalidOperation
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

CATEGORIES = ("BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM")
FIELDS = (
    "shipper", "consignee", "notify_party", "port_of_loading",
    "port_of_discharge", "container_count", "gross_weight_kg",
)
REVIEW_REASONS = ("wrong_doc_type", "missing_attachment", "unreadable", "missing_value")
PARTY_FIELDS = ("shipper", "consignee", "notify_party")


class DocumentRole(str, Enum):
    SI = "SI"
    DRAFT_BL = "DRAFT_BL"
    OTHER = "OTHER"
    UNKNOWN = "UNKNOWN"


class ValueStatus(str, Enum):
    PRESENT = "PRESENT"
    MISSING = "MISSING"
    AMBIGUOUS = "AMBIGUOUS"
    UNREADABLE = "UNREADABLE"
    NOT_EXTRACTED = "NOT_EXTRACTED"


class FieldState(str, Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    UNRESOLVED = "UNRESOLVED"


@dataclass(frozen=True)
class Evidence:
    block_id: str
    quote: str
    locator: dict[str, Any] = field(default_factory=dict)


@dataclass
class FieldObservation:
    field: str
    value_status: ValueStatus
    raw_value: str | None = None
    canonical_value: str | None = None
    unit_hint: str | None = None
    evidence: list[Evidence] = field(default_factory=list)
    candidates: list[str] = field(default_factory=list)
    reason: str = ""
    normalization: list[str] = field(default_factory=list)
    role: str | None = None

    def to_dict(self) -> dict[str, Any]:
        obj = asdict(self)
        obj["value_status"] = self.value_status.value
        obj["evidence"] = [asdict(x) for x in self.evidence]
        return obj


@dataclass
class FieldResult:
    field: str
    state: FieldState
    si: FieldObservation
    bl: FieldObservation
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"field": self.field, "state": self.state.value, "si": self.si.to_dict(),
                "bl": self.bl.to_dict(), "reason": self.reason}


@dataclass
class VerificationResult:
    category: str
    verification: str
    processing: str = "SUCCEEDED"
    fields: list[FieldResult] = field(default_factory=list)
    confirmed_mismatch_fields: list[str] = field(default_factory=list)
    unresolved_fields: list[str] = field(default_factory=list)
    review_reason: str | None = None
    issues: list[str] = field(default_factory=list)

    def to_submission(self) -> dict[str, Any]:
        # NOT_APPLICABLE covers both a non-comparison category and a comparison
        # request that submitted no documents to compare: in neither case is
        # there a discrepancy to report or a reviewer decision to make.
        if self.category != "BL_COMPARISON" or self.verification == "NOT_APPLICABLE":
            return {"category": self.category, "status": "OK", "review_reason": None,
                    "has_defect": False, "defect_fields": []}
        if self.verification == "MATCH" and not self.unresolved_fields and not self.confirmed_mismatch_fields:
            return {"category": self.category, "status": "OK", "review_reason": None,
                    "has_defect": False, "defect_fields": []}
        if self.verification == "MISMATCH" and not self.unresolved_fields:
            return {"category": self.category, "status": "MISMATCH", "review_reason": None,
                    "has_defect": True, "defect_fields": sorted(self.confirmed_mismatch_fields)}
        reason = self.review_reason or ("missing_value" if self.unresolved_fields else "unreadable")
        return {"category": self.category, "status": "NEEDS_REVIEW", "review_reason": reason,
                "has_defect": False, "defect_fields": []}


def _clean(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", s).strip()


def _canonicalize_layout_separators(value: str) -> str:
    """Collapse table/paragraph separators before semantic comparison."""
    value = re.sub(r"[|;]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _strip_template_marker(value: str) -> str:
    """Remove a document-template marker when it precedes a pipe value.

    Word/PDF renderers sometimes expose a translated label qualifier as
    ``(???) | Value`` or ``(收货人) | Value``. A marker by itself is treated
    as missing; parenthesized business values without the pipe are preserved.
    """
    value = _clean(value)
    value = re.sub(r"^\([^)]*\)\s*\|\s*", "", value)
    if re.fullmatch(r"\(\?[^)]*\)", value):
        return ""
    return value


def _is_organization_name_prefix(a: str, b: str) -> bool:
    """Whether one party reading is the other with a postal address appended,
    verbatim, with no separator remaining to strip it at normalization time.

    Requires the shorter reading to end on a whole word of the longer one, and
    the appended remainder to contain a digit. A real postal address in this
    domain reliably carries a street number or postal code; a distinct legal
    entity qualifier appended to the same base name - "(Middle East) FZE",
    "(Asia) Pte Ltd" - does not, and must remain a mismatch: it names a
    different party, not the same one with more detail.
    """
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) < 6 or not longer.startswith(shorter):
        return False
    boundary = longer[len(shorter):len(shorter) + 1]
    if boundary not in ("", " "):
        return False
    remainder = longer[len(shorter):]
    return bool(re.search(r"\d", remainder))


def _looks_like_scalar_measurement(value: str) -> bool:
    """Return whether an adjacent table line can safely be a weight value."""
    return bool(re.fullmatch(
        r"[+-]?[\d,]+(?:\.\d+)?(?:\s*(?:kg|kgs|tonnes?|t|lbs?|pounds?))?",
        _clean(value), re.I,
    ))


def normalize_text(value: str | None) -> tuple[str | None, list[str]]:
    if value is None:
        return None, []
    original = value
    value = _clean(value)
    value = _strip_template_marker(value)
    if not value or value.upper() in {"N/A", "NA", "NIL", "NONE", "TBA", "TBD", "???", "-", "_"}:
        return None, ["empty_or_unknown"]
    folded = value.casefold()
    # Table readers use pipe/semicolon separators while paragraph readers use
    # line breaks for the same organization/address block. Treat those as
    # layout separators so equivalent source formatting compares equally.
    value = _canonicalize_layout_separators(folded)
    value = re.sub(r"[\s,;:]+$", "", value)
    # Conservative legal suffix normalization only for punctuation variants.
    value = re.sub(r"\b(co\.?|ltd\.?)\b", lambda m: m.group(1).replace(".", ""), value)
    steps = []
    if value != original:
        steps.append("unicode_whitespace_casefold")
    if value != folded:
        steps.append("layout_separator_normalization")
    return value, steps


def normalize_field(field_name: str, raw: str | None, unit_hint: str | None = None) -> tuple[str | None, list[str]]:
    if raw is None:
        return None, []
    raw = _clean(raw)
    if field_name == "container_count":
        # Prefer an explicit count before a container size (e.g. 6 x 40'HC).
        m = re.search(r"(?:^|\b)(\d+)\s*(?:x|×)\s*\d", raw, re.I)
        if m:
            return str(int(m.group(1))), ["container_quantity_from_size"]
        m = re.search(r"\b(\d+)\b", raw.replace(",", ""))
        return (str(int(m.group(1))), ["integer_container_count"]) if m else (None, ["invalid_container_count"])
    if field_name == "gross_weight_kg":
        number = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", raw)
        if not number:
            return None, ["invalid_weight"]
        token = number.group(0).replace(",", "")
        try:
            value = Decimal(token)
        except InvalidOperation:
            return None, ["invalid_weight"]
        unit = (unit_hint or raw).casefold()
        if re.search(r"(?:\btonnes?\b|\bmetric\s*tons?\b|\bt\b)", unit):
            value *= Decimal(1000)
            return format(value, "f"), ["metric_tonnes_to_kg"]
        if re.search(r"\b(lb|lbs|pounds?)\b", unit):
            return None, ["non_metric_weight"]
        return format(value, "f"), ["decimal_kg"]
    if field_name.startswith("port_"):
        value, steps = normalize_text(raw)
        if value:
            value = re.sub(r"\b(port|terminal)\b", "", value).strip()
            steps.append("port_label_removed")
        return value, steps
    if field_name in PARTY_FIELDS:
        # One document commonly states the organization name alone; the other
        # appends its full postal address in the same field, separated by a
        # layout marker. That address is not the shipment detail being
        # compared here, so extract just the organization identity before
        # normalize_text folds the separator into a space and the address
        # words become indistinguishable from the name.
        separator = re.search(r"[|;]", raw)
        if separator:
            value, steps = normalize_text(raw[:separator.start()])
            if value:
                steps.append("party_address_suffix_removed")
            return value, steps
        return normalize_text(raw)
    return normalize_text(raw)


# Classification signal vocabulary.
#
# Each entry is a domain *concept* written as a word-boundary pattern - trade,
# billing and unsolicited-mail terminology a practitioner would name without
# reference to any particular mailbox - rather than a phrase lifted from one
# corpus's templates. A lexical classifier needs a lexicon; what matters is that
# these describe the domain, so a sender with a different house style still
# scores, and no company name, booking reference or template wording appears.
# The subject usually states the request, but the use case names "misleading
# email subjects" as an expected condition, so the subject leads without being
# able to overrule a strong signal in the body on its own.
_SUBJECT_WEIGHT = 1.5
_SCORE_SATURATION = 5.0  # one decisive subject signal is already conclusive

# Below this, the deterministic signals did not separate the categories well
# enough to act on alone and the message is escalated for a second opinion.
CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8

_CATEGORY_SIGNALS: dict[str, tuple[tuple[str, float], ...]] = {
    "SPAM": (
        (r"\bunsubscribe\b", 3.0),
        (r"\bopt[-\s]?out\b", 2.0),
        (r"\b(?:bitcoin|crypto\w*|forex)\b[^.\n]{0,40}\b(?:invest\w*|returns?|profits?|opportunit\w+)\b", 3.5),
        (r"\bguaranteed\b[^.\n]{0,30}\b(?:returns?|profits?|income)\b", 3.5),
        (r"\b(?:lottery|jackpot|sweepstakes?|prize)\b", 2.5),
        (r"\b(?:you(?:'ve|\s+have)\s+won|winner)\b", 2.5),
        (r"\bclaim\s+(?:now|your)\b", 2.0),
        (r"\b(?:limited[-\s]time|act\s+now|exclusive\s+offer|special\s+promotion)\b", 2.5),
        (r"\b\d{1,3}\s*%\s*off\b", 2.5),
        (r"\bverify\s+(?:your\s+)?account\b", 2.5),
        (r"\bavoid\s+(?:suspension|deactivation|closure)\b", 2.5),
        (r"\bclick\s+here\b", 1.5),
        (r"\bgift\s+cards?\b", 2.0),
    ),
    "INVOICE_QUERY": (
        (r"\binvoices?\b|\binvoicing\b", 3.0),
        (r"\b(?:credit|debit)\s+notes?\b", 2.5),
        (r"\bbilling\b", 2.0),
        (r"\b(?:local|freight|handling|terminal|documentation)\s+charges?\b", 3.0),
        (r"\b(?:detention|demurrage)\b", 2.5),
        (r"\bd\s*&\s*d\b", 2.0),
        (r"\btelex\s+release\b", 1.5),
        (r"\bfreight\b", 1.0),
        (r"\b(?:payment|remittance|outstanding|overdue|settlement)\b", 1.5),
    ),
    "SI_REQUEST": (
        (r"\bshipping\s+instructions?\b", 3.5),
        (r"\bsi\b", 2.0),
        (r"\b(?:request|submit|send|provide|need(?:ed)?|share)\b[^.\n]{0,30}\bsi\b", 2.0),
        (r"\bsi\b[^.\n]{0,30}\b(?:request(?:ed)?|required|needed|submission)\b", 1.5),
    ),
    "BL_COMPARISON": (
        # A bill of lading on its own is only weak evidence: it is named across
        # the whole trade. The decisive signals pair the document with a
        # verification action, or name a *draft* awaiting checking.
        (r"\bbills?\s+of\s+lading\b", 2.0),
        (r"\bb/l\b|\bbls?\b", 1.0),
        (r"\bdrafts?\b", 1.5),
        (r"\bdrafts?\b[^.\n]{0,15}\b(?:b/?ls?|bills?\s+of\s+lading)\b"
         r"|\b(?:b/?ls?|bills?\s+of\s+lading)\b[^.\n]{0,15}\bdrafts?\b", 3.5),
        (r"\b(?:compare|comparison|cross[-\s]?check|reconcile)\b", 3.0),
        (r"\b(?:check|verify|confirm|review)\b[^.\n]{0,40}\b(?:b/?ls?|bills?\s+of\s+lading|drafts?|docs?|documents?|details?)\b", 3.0),
        (r"\b(?:amend(?:ment)?|correction|revise|revision)\b[^.\n]{0,30}\b(?:b/?ls?|bills?\s+of\s+lading|drafts?)\b", 2.5),
    ),
    "GENERAL": (
        (r"\b(?:update|summary|report|notification|notice)\b", 1.5),
        (r"\breminder\b", 2.0),
        (r"\b(?:planning|schedule|forecast|timeline)\b", 1.5),
        (r"\b(?:meeting|call|discussion)\b", 1.5),
        (r"\bfy[ia]\b", 1.5),
    ),
}

# Whether a comparison request already carries its documents or is asking for
# them to be sent. Both are ordinary business phrasings, not corpus wording.
_SUBMISSION_LANGUAGE = r"\b(?:attach\w*|enclos\w*|herewith|please\s+find|pfa)\b"
_DELIVERY_REQUEST_LANGUAGE = r"\b(?:request|send|provide|share|issue|release|forward|furnish|revert\s+with)\b"

# A generic mail-gateway security notice ("this email originated outside your
# organisation... exercise caution with any links or attachments"), matched by
# its opening line and consumed through the following non-blank lines. This is
# boilerplate about the medium, not the sender's request, and it happens to
# contain the word "attachments" - exactly the vocabulary _SUBMISSION_LANGUAGE
# looks for - which otherwise reads a banner as the sender describing an
# attachment that was never sent.
_EXTERNAL_SENDER_BANNER = re.compile(
    r"^[ \t]*warning:\s*this (?:e-?mail|message) originated outside[^\n]*"
    r"(?:\n(?!\s*\n)[^\n]*)*",
    re.I | re.M,
)


def classify_email(subject: str, body: str) -> dict[str, Any]:
    """Score every category from domain signals and report the winner's confidence.

    Each concept counts once per category, at the strongest position it appears
    in, so a term repeated through a long body cannot outweigh the subject line.
    Confidence combines how much evidence the winner gathered with how far clear
    of the runner-up it finished; below ``CLASSIFICATION_CONFIDENCE_THRESHOLD``
    the message is marked for escalation rather than decided on weak signals.
    """
    subject = subject or ""
    body = body or ""
    # Do not let quoted history dominate the current request. Preserve the
    # caller's original body elsewhere for evidence, but classify the newest
    # visible section first.
    current_body = re.split(r"\n\s*(?:[-_]{3,}\s*)?(?:original message|forwarded message|from:).*\n", body, maxsplit=1, flags=re.I)[0]
    current_body = "\n".join(line for line in current_body.splitlines() if not line.lstrip().startswith(">"))
    # A mail-gateway security banner is boilerplate injected by the mail
    # system, not part of the sender's request. Its own vocabulary ("exercise
    # caution with ... any links or attachments") otherwise reads as the
    # sender talking about attachments, which is exactly backwards for a
    # message that has none. Per PROMPT_CONTRACTS.md, a banner "does not by
    # itself determine the category" - remove it before any signal is scored.
    current_body = _EXTERNAL_SENDER_BANNER.sub(" ", current_body)
    text = f"{subject}\n{current_body}"

    evidence: list[dict[str, str]] = []
    scores: dict[str, float] = {}
    for category, patterns in _CATEGORY_SIGNALS.items():
        score = 0.0
        for pattern, weight in patterns:
            for source, source_text, multiplier in (("subject", subject, _SUBJECT_WEIGHT),
                                                    ("current_body", current_body, 1.0)):
                match = re.search(pattern, source_text, re.I)
                if not match:
                    continue
                score += weight * multiplier
                if len(evidence) < 6:
                    start, end = match.span()
                    quote = source_text[max(0, start - 40):end + 60].strip()
                    if quote:
                        evidence.append({"source": source, "quote": quote})
                break
        scores[category] = score

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    top_category, top_score = ranked[0]
    runner_up_score = ranked[1][1]
    if top_score <= 0:
        # No signal fired at all. GENERAL remains the provisional answer because
        # nothing asked for an action, but there is no evidence to stand on.
        category, confidence = "GENERAL", 0.0
        reason = "no recognised request signal"
    else:
        category = top_category
        # Margin is the share of the decision the winner actually holds, not an
        # absolute point gap. A fixed gap reads a 6-to-3 contest as total
        # certainty; as a share it is 0.5, which is what a two-to-one split
        # deserves. Being scale-free also keeps the number meaningful as
        # signal weights change.
        confidence = round(min(1.0, top_score / _SCORE_SATURATION)
                           * ((top_score - runner_up_score) / top_score), 3)
        reason = f"{category} scored {top_score:.1f} against {runner_up_score:.1f} for the next category"

    escalate = confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD
    if category == "BL_COMPARISON":
        if re.search(_SUBMISSION_LANGUAGE, text, re.I):
            subtype = "COMPARE_ATTACHED"
        elif re.search(_DELIVERY_REQUEST_LANGUAGE, text, re.I):
            subtype = "REQUEST_DRAFT_FOR_CHECKING"
        else:
            # Assume the documents are in hand, so a genuinely absent
            # attachment is still surfaced rather than quietly excused.
            subtype = "COMPARE_ATTACHED"
    elif category == "GENERAL":
        subtype = "UNCLEAR"
    else:
        subtype = "OTHER_REQUEST"

    if not evidence and subject.strip():
        evidence.append({"source": "subject", "quote": subject.strip()})
    alternatives = [name for name, score in ranked[1:] if score > 0] if escalate else []
    return {"category": category, "request_subtype": subtype, "requires_review": escalate,
            "alternative_categories": alternatives, "evidence": evidence,
            "reason": reason, "confidence": confidence, "escalate_to_ai": escalate}


LABELS: dict[str, tuple[str, ...]] = {
    "shipper": ("shipper", "shipper/exporter", "shipper / exporter", "exporter", "consignor"),
    "consignee": ("consignee", "consignee (non-negotiable)", "to the order of", "receiver", "importer"),
    "notify_party": ("notify party", "notify party/intermediate consignee", "notify", "also notify"),
    "port_of_loading": ("port of loading", "port of loading (pol)", "load port", "pol"),
    "port_of_discharge": ("port of discharge", "discharge port", "pod"),
    "container_count": ("container count", "containers", "container qty", "number of containers", "no. of containers or packages", "total containers", "total no. of containers", "total no of containers"),
    "gross_weight_kg": ("gross weight", "gross wt", "gross wt (kgs)", "weight (kg)", "gross weight (kg)"),
}

_LABEL_PATTERNS: tuple[tuple[str, str], ...] = (
    ("shipper", r"shipper(?:\s*\([^)]*\))?\s*(?:/\s*exporter)?|exporter|consignor"),
    ("consignee", r"consignee(?:\s*\([^)]*\))?|to\s+the\s+order\s+of|receiver|importer"),
    ("notify_party", r"notify\s*party(?:\s*/\s*intermediate\s*consignee)?|also\s*notify|notify"),
    ("port_of_loading", r"port\s+of\s+loading(?:\s*\([^)]*\))?|load\s+port(?:\s*\([^)]*\))?|pol"),
    ("port_of_discharge", r"port\s+of\s+discharge(?:\s*\([^)]*\))?|discharge\s+port(?:\s*\([^)]*\))?|pod"),
    ("container_count", r"container\s+count|container\s+qty|number\s+of\s+containers|no\.?\s*of\s*containers(?:\s*or\s*packages)?|total\s+(?:no\.?\s+of\s+)?containers|containers"),
    ("gross_weight_kg", r"(?:total\s+)?gross\s*(?:weight|wt)(?:\s*[?\u6bdb\u91cd]*\s*\([^)]*\))?|weight\s*\(\s*kg\s*\)"),
)


def _find_labeled_lines(text: str) -> dict[str, list[tuple[str, int, str]]]:
    lines = text.splitlines()
    found: dict[str, list[tuple[str, int, str]]] = {f: [] for f in FIELDS}
    starts: list[tuple[int, str, str]] = []
    for i, line in enumerate(lines):
        stripped = _clean(line)
        for canonical, label_re in _LABEL_PATTERNS:
            m = re.match(rf"^\s*(?:{label_re})\s*(?::|=|\-|\||\t)\s*(.*)$", stripped, re.I)
            if not m and re.match(rf"^\s*(?:{label_re})\s*$", stripped, re.I):
                starts.append((i, canonical, ""))
                break
            if not m:
                m = re.match(rf"^\s*(?:{label_re})\s+(.*)$", stripped, re.I)
            if m:
                value = _strip_template_marker(m.group(1))
                starts.append((i, canonical, value))
                break
    for idx, (line_no, fld, value) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        extras = [x.strip() for x in lines[line_no + 1:end] if _clean(x)]
        if extras and not value and fld in {"shipper", "consignee", "notify_party"}:
            value = " ".join(extras)
        elif extras and not value:
            # A PDF table may have a standalone "GROSS WEIGHT" header whose
            # next line is a container number. Only take the adjacent line
            # when it looks like a scalar measurement; a later TOTAL label is
            # handled as its own observation.
            if fld == "gross_weight_kg":
                first = extras[0]
                if _looks_like_scalar_measurement(first):
                    value = first
            else:
                value = extras[0]
        elif extras and fld in {"shipper", "consignee", "notify_party"}:
            # retain address context in the evidence quote, while canonicalizing
            # the explicit first line as the named entity.
            pass
        quote_lines = [_clean(lines[line_no])] + extras
        if value or fld in {"shipper", "consignee", "notify_party"}:
            found[fld].append((value, line_no + 1, "\n".join(quote_lines)))
    return found


def extract_fields(text: str, role: DocumentRole | str, *, blocks: Sequence[Mapping[str, Any]] | None = None) -> dict[str, FieldObservation]:
    """Extract seven fields independently from one document's text.

    ``blocks`` may contain reader evidence blocks; otherwise line evidence is
    generated locally. Values without a source quote remain unresolved.
    """
    role_value = role.value if isinstance(role, DocumentRole) else str(role)
    found = _find_labeled_lines(text or "")
    source_blocks = list(blocks or [])
    def evidence(raw: str, line_no: int, quote: str) -> Evidence:
        for block in source_blocks:
            block_text = str(block.get("text", block.get("quote", "")))
            if raw and raw.casefold() in block_text.casefold():
                return Evidence(str(block.get("block_id", block.get("id", f"line-{line_no}"))), block_text,
                                dict(block.get("locator", {"kind": "text_lines", "start_line": line_no})))
        return Evidence(f"line-{line_no}", quote, {"kind": "text_lines", "start_line": line_no})
    output: dict[str, FieldObservation] = {}
    for fld in FIELDS:
        entries = found[fld]
        if not entries:
            output[fld] = FieldObservation(fld, ValueStatus.MISSING, reason="label not found", role=role_value)
            continue
        unique = {(normalize_field(fld, e[0])[0], e[0]) for e in entries}
        if len(unique) > 1:
            cands = [e[0] for e in entries if e[0]]
            evs = [evidence(e[0], e[1], e[2]) for e in entries]
            output[fld] = FieldObservation(fld, ValueStatus.AMBIGUOUS, candidates=cands, evidence=evs,
                                            reason="multiple conflicting labeled values", role=role_value)
            continue
        raw, line_no, quote = entries[0]
        canonical, steps = normalize_field(fld, raw)
        if canonical is None:
            output[fld] = FieldObservation(fld, ValueStatus.MISSING, raw_value=None,
                                            evidence=[evidence(raw, line_no, quote)],
                                            normalization=steps, reason="empty or unsupported value", role=role_value)
        else:
            output[fld] = FieldObservation(fld, ValueStatus.PRESENT, raw_value=raw,
                                            canonical_value=canonical,
                                            evidence=[evidence(raw, line_no, quote)],
                                            normalization=steps, role=role_value)
    # A same-document reference is safe only when the referenced party was
    # independently found and unambiguous in this document.
    notify = output.get("notify_party")
    consignee = output.get("consignee")
    if notify and consignee and notify.value_status == ValueStatus.PRESENT and consignee.value_status == ValueStatus.PRESENT and re.search(r"\bsame\s+as\s+(the\s+)?consignee\b", notify.raw_value or "", re.I):
        notify.canonical_value = consignee.canonical_value
        notify.normalization.append("same_as_document_consignee")
        notify.evidence.extend(consignee.evidence)
        notify.reason = "resolved from same-document consignee"
    return output


def compare_documents(si: Mapping[str, FieldObservation], bl: Mapping[str, FieldObservation], *, category: str = "BL_COMPARISON", processing: str = "SUCCEEDED", issues: list[str] | None = None) -> VerificationResult:
    results: list[FieldResult] = []
    mismatches: list[str] = []
    unresolved: list[str] = []
    for fld in FIELDS:
        a, b = si.get(fld), bl.get(fld)
        if a is None:
            a = FieldObservation(fld, ValueStatus.MISSING, reason="SI observation absent")
        if b is None:
            b = FieldObservation(fld, ValueStatus.MISSING, reason="BL observation absent")
        if a.value_status != ValueStatus.PRESENT or b.value_status != ValueStatus.PRESENT or not a.canonical_value or not b.canonical_value:
            state = FieldState.UNRESOLVED
            unresolved.append(fld)
            reason = f"SI={a.value_status.value}; BL={b.value_status.value}"
        elif a.canonical_value == b.canonical_value:
            state, reason = FieldState.MATCH, "normalized values equal"
        elif fld in PARTY_FIELDS and _is_organization_name_prefix(a.canonical_value, b.canonical_value):
            # No layout separator was present to remove an address suffix
            # (normalize_field's guard above only fires on one), so the two
            # readings still differ verbatim - but one is a whole-word prefix
            # of the other, which is what "the same organization, one side
            # also gives its address" looks like with no punctuation to key
            # on. Treated as a match rather than a defect.
            state, reason = FieldState.MATCH, "one side states the organization name; the other appends its address with no separator to normalize"
        else:
            state, reason = FieldState.MISMATCH, "normalized values differ"
            mismatches.append(fld)
        results.append(FieldResult(fld, state, a, b, reason))
    if processing != "SUCCEEDED" or unresolved:
        verification = "NEEDS_REVIEW"
        review_reason = "missing_value" if unresolved else "unreadable"
    elif mismatches:
        verification, review_reason = "MISMATCH", None
    else:
        verification, review_reason = "MATCH", None
    return VerificationResult(category=category, verification=verification, processing=processing,
                              fields=results, confirmed_mismatch_fields=mismatches,
                              unresolved_fields=unresolved, review_reason=review_reason, issues=issues or [])


def identify_document_role(text: str, filename: str = "") -> DocumentRole:
    """Content-first role identification; filename is only a weak tie breaker."""
    lower = (text or "").casefold()
    # Binary SI templates in the supplied inbox often use the heading
    # "BL INSTRUCTION" or "BILL OF LADING INSTRUCTION". Inspect only the
    # opening non-empty lines so a footer such as "not a shipping instruction"
    # cannot relabel an invoice or certificate.
    opening = [_clean(line).casefold() for line in (text or "").splitlines() if _clean(line)][:8]
    def heading(*names: str) -> bool:
        return any(line == name or line.startswith(f"{name} |") or line.startswith(f"{name}:") or line.startswith(f"{name} (") for line in opening for name in names)
    has_si_heading = heading("shipping instruction", "bl instruction", "bill of lading instruction")
    has_bl_heading = heading("bill of lading", "draft bill of lading", "draft bl", "draft b/l")
    if has_si_heading:
        return DocumentRole.SI
    if has_bl_heading:
        return DocumentRole.DRAFT_BL
    si = sum(1 for term in ("shipping instruction", "shipper", "si number", "instruction") if term in lower)
    bl = sum(1 for term in ("bill of lading", "draft b/l", "draft bl", "consignee", "notify party") if term in lower)
    other = any(term in lower for term in ("commercial invoice", "invoice number", "packing list", "certificate of origin"))
    if other and bl < 2:
        return DocumentRole.OTHER
    if si > bl and si >= 1:
        return DocumentRole.SI
    if bl >= si and bl >= 2:
        return DocumentRole.DRAFT_BL
    # Content is inconclusive; honor a suffix only as a weak hint.
    name = filename.casefold()
    stem = Path(filename).stem.casefold()
    if "_si" in name or stem == "si" or stem.endswith("_si"):
        return DocumentRole.SI
    if "_bl" in name or stem == "bl" or stem.endswith("_bl"):
        return DocumentRole.DRAFT_BL
    return DocumentRole.UNKNOWN


def aggregate_submission(results: Mapping[str, VerificationResult], email_ids: Iterable[str] | None = None) -> dict[str, dict[str, Any]]:
    ids = sorted(email_ids if email_ids is not None else results.keys())
    missing = [x for x in ids if x not in results]
    if missing:
        raise ValueError(f"results missing email IDs: {', '.join(missing[:5])}")
    return {eid: results[eid].to_submission() for eid in ids}
