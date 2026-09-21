"""Tiered decision gateway for email classification.

A classification passes through ordered tiers - deterministic local rules, then
an optional model, then a person. The gateway owns the decision to stop at a
tier or pass the case on, so routing policy lives in one auditable place
instead of spreading through the pipeline as ad-hoc conditionals. Every
decision produces a record naming which tier answered, how confident each tier
was, and why the gateway stopped where it did.

Two properties drive the design:

* A case is never closed on an answer that no tier was confident in. If the
  model is unavailable, hedges, or contradicts a local reading that had real
  evidence behind it, the case goes to a person rather than silently taking
  the most recent guess.
* Agreement between independent methods is evidence in its own right. Rules
  and a model reaching the same category by different routes is a stronger
  signal than either reaching it alone, and disagreement between two methods
  that both had signal is a genuine conflict no automatic tier can settle.

The model response schema carries no confidence field, so the model tier's
confidence is derived from the signals the contract does carry: whether the
model flagged itself for review, how many alternative categories it kept open,
and whether any quote it cited could be verified against the source text.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class Tier(str, Enum):
    LOCAL_RULES = "local_rules"
    LIVE_AI = "live_ai"
    HUMAN = "human"


class Disposition(str, Enum):
    ACCEPTED = "ACCEPTED"  # this tier's answer stands
    ESCALATED = "ESCALATED"  # hand the case to the next tier
    HUMAN_REVIEW = "HUMAN_REVIEW"  # terminal: a person decides


@dataclass(frozen=True)
class GatewayPolicy:
    """Routing thresholds, versioned so a stored decision stays interpretable
    after the policy is retuned."""

    version: str = "classification-gateway-v1"
    # A local reading at or above this is trusted without spending a model call.
    # Measured on the reference inbox: at 0.5 nineteen misreadings were accepted
    # without a second opinion, at 0.8 one was. The extra escalations are the
    # price of that, and they are cheap relative to a wrong routing decision.
    local_accept: float = 0.8
    # A model answer below this is never accepted on its own.
    model_accept: float = 0.6
    # Below this, a local reading is too weak to count as a dissenting opinion,
    # so a model that disagrees with it is not treated as a conflict.
    conflict_floor: float = 0.25
    # Ceilings and penalties applied when deriving a model answer's confidence.
    model_hedge_ceiling: float = 0.45
    model_alternative_penalty: float = 0.15
    model_unverified_ceiling: float = 0.35


# What each category means in the operator's own terms, and what choosing it
# causes downstream. Only comparison requests continue to the checking step, so
# the cost of a routing mistake is not symmetric and the reviewer is told so.
CATEGORY_MEANING: dict[str, str] = {
    "BL_COMPARISON": "a request to check a draft Bill of Lading against the Shipping Instruction",
    "SI_REQUEST": "a Shipping Instruction being submitted, or asked for",
    "INVOICE_QUERY": "a question about an invoice, billing, or a shipment charge",
    "GENERAL": "an operational or informational message with no document request",
    "SPAM": "unsolicited mail unrelated to a shipment",
}

CATEGORY_CONSEQUENCE: dict[str, str] = {
    "BL_COMPARISON": "The SI and draft BL are paired and compared across all seven required fields, "
                     "and any discrepancy is raised for review.",
    "SI_REQUEST": "Filed as a shipping-instruction request. No document comparison runs, so a draft "
                  "BL discrepancy on this shipment would not be caught here.",
    "INVOICE_QUERY": "Filed as a billing query. No document comparison runs.",
    "GENERAL": "Filed as an operational message. No document comparison runs.",
    "SPAM": "Filed as spam and taken out of the working queue entirely.",
}


@dataclass
class ArbitrationOption:
    """One candidate answer put in front of the reviewer, with the evidence the
    tier that proposed it actually relied on."""

    category: str
    proposed_by: str
    confidence: float | None
    meaning: str
    consequence: str
    evidence: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "category": self.category, "proposed_by": self.proposed_by, "confidence": self.confidence,
            "meaning": self.meaning, "consequence": self.consequence, "evidence": self.evidence,
        }


@dataclass
class ArbitrationPacket:
    """Everything a person needs to settle one routing question in a single
    view: what is being asked, what each tier concluded and on what evidence,
    what follows from each answer, and why it reached them at all."""

    question: str
    why_escalated: str
    options: list[ArbitrationOption]
    policy_version: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "why_escalated": self.why_escalated,
            "policy_version": self.policy_version,
            "options": [option.to_dict() for option in self.options],
        }


@dataclass
class GatewayDecision:
    tier: Tier
    disposition: Disposition
    category: str
    reason: str
    policy_version: str
    local_category: str | None = None
    local_confidence: float | None = None
    model_category: str | None = None
    model_confidence: float | None = None
    arbitration: ArbitrationPacket | None = None

    @property
    def needs_human(self) -> bool:
        return self.disposition is Disposition.HUMAN_REVIEW

    def to_dict(self) -> dict[str, Any]:
        return {
            "tier": self.tier.value,
            "disposition": self.disposition.value,
            "category": self.category,
            "reason": self.reason,
            "policy_version": self.policy_version,
            "needs_human": self.needs_human,
            "local_category": self.local_category,
            "local_confidence": self.local_confidence,
            "model_category": self.model_category,
            "model_confidence": self.model_confidence,
            "arbitration": self.arbitration.to_dict() if self.arbitration else None,
        }


def _option(category: str, proposed_by: str, confidence: float | None,
            classification: dict[str, Any] | None) -> ArbitrationOption:
    evidence = [e for e in (classification or {}).get("evidence", []) if isinstance(e, dict)][:3]
    return ArbitrationOption(
        category=category,
        proposed_by=proposed_by,
        confidence=confidence,
        meaning=CATEGORY_MEANING.get(category, category),
        consequence=CATEGORY_CONSEQUENCE.get(category, "Filed under this category."),
        evidence=evidence,
    )


def build_arbitration(local: dict[str, Any], model: dict[str, Any] | None,
                      local_confidence: float, model_confidence: float | None,
                      why: str, policy: GatewayPolicy) -> ArbitrationPacket:
    """Turn a routing conflict into a question a person can answer directly."""
    local_category = local["category"]
    options = [_option(local_category, "deterministic rules", local_confidence, local)]
    if model is not None and model["category"] != local_category:
        options.append(_option(model["category"], "language model", model_confidence, model))
    elif model is not None:
        options[0] = _option(local_category, "deterministic rules and language model agree",
                             local_confidence, model)

    if len(options) > 1:
        question = (f"Is this {CATEGORY_MEANING.get(options[0].category, options[0].category)}, "
                    f"or {CATEGORY_MEANING.get(options[1].category, options[1].category)}?")
    else:
        question = f"Confirm this is {CATEGORY_MEANING.get(options[0].category, options[0].category)}."
    return ArbitrationPacket(question=question, why_escalated=why, options=options,
                             policy_version=policy.version)


def score_model_response(classification: dict[str, Any], policy: GatewayPolicy) -> float:
    """Derive a confidence for a model answer from contract-carried signals.

    Evidence has already been through provider-side coercion, which drops any
    quote that could not be located in the source, so an empty evidence list
    means nothing the model claimed was verifiable.
    """
    confidence = 1.0
    if classification.get("requires_review"):
        confidence = min(confidence, policy.model_hedge_ceiling)
    alternatives = classification.get("alternative_categories") or []
    confidence -= policy.model_alternative_penalty * len(alternatives)
    if not classification.get("evidence"):
        confidence = min(confidence, policy.model_unverified_ceiling)
    return max(0.0, round(confidence, 3))


def route_local(classification: dict[str, Any], policy: GatewayPolicy) -> GatewayDecision:
    """First gate: accept a confident deterministic reading, or escalate."""
    category = classification["category"]
    confidence = float(classification.get("confidence") or 0.0)
    accepted = confidence >= policy.local_accept
    return GatewayDecision(
        tier=Tier.LOCAL_RULES,
        disposition=Disposition.ACCEPTED if accepted else Disposition.ESCALATED,
        category=category,
        reason=(
            f"deterministic rules scored {confidence:.2f}, "
            f"{'at or above' if accepted else 'below'} the {policy.local_accept:.2f} accept threshold"
        ),
        policy_version=policy.version,
        local_category=category,
        local_confidence=confidence,
    )


def route_model(local: dict[str, Any], model: dict[str, Any], policy: GatewayPolicy) -> GatewayDecision:
    """Second gate: weigh the model answer against the local reading.

    The model tier is provisional on conflict - it saw strictly more context -
    but the case is still handed to a person, because nothing available here
    can distinguish the model correcting the rules from the model breaking a
    reading the rules had right.
    """
    local_category = local["category"]
    local_confidence = float(local.get("confidence") or 0.0)
    model_category = model["category"]
    model_confidence = score_model_response(model, policy)

    def decision(disposition: Disposition, tier: Tier, category: str, reason: str) -> GatewayDecision:
        return GatewayDecision(
            tier=tier, disposition=disposition, category=category, reason=reason,
            policy_version=policy.version, local_category=local_category,
            local_confidence=local_confidence, model_category=model_category,
            model_confidence=model_confidence,
            arbitration=(build_arbitration(local, model, local_confidence, model_confidence, reason, policy)
                         if disposition is Disposition.HUMAN_REVIEW else None),
        )

    if model_confidence < policy.model_accept:
        return decision(
            Disposition.HUMAN_REVIEW, Tier.HUMAN, model_category,
            f"model answered {model_category} at {model_confidence:.2f}, below the "
            f"{policy.model_accept:.2f} accept threshold",
        )
    if model_category == local_category:
        return decision(
            Disposition.ACCEPTED, Tier.LIVE_AI, model_category,
            f"model and deterministic rules independently agree on {model_category}",
        )
    if local_confidence < policy.conflict_floor:
        return decision(
            Disposition.ACCEPTED, Tier.LIVE_AI, model_category,
            f"model answered {model_category} at {model_confidence:.2f}; the local reading "
            f"({local_category} at {local_confidence:.2f}) carried too little signal to dissent",
        )
    return decision(
        Disposition.HUMAN_REVIEW, Tier.HUMAN, model_category,
        f"tier conflict: rules read {local_category} at {local_confidence:.2f}, model read "
        f"{model_category} at {model_confidence:.2f}; both had signal, so a person decides",
    )


def route_escalation_unavailable(local: dict[str, Any], detail: str, policy: GatewayPolicy) -> GatewayDecision:
    """The case needed a second opinion that could not be obtained.

    The local reading was already below the accept threshold, which is why it
    was escalated, so closing on it now would be the silent guess the gateway
    exists to prevent.
    """
    category = local["category"]
    confidence = float(local.get("confidence") or 0.0)
    reason = f"escalation unavailable ({detail}); local reading {category} at {confidence:.2f} is below threshold"
    alternatives = [c for c in (local.get("alternative_categories") or []) if c != category]
    packet = build_arbitration(local, None, confidence, None, reason, policy)
    # With no second opinion available, the categories the local scorer kept
    # open are the only other candidates a reviewer has to weigh.
    for alternative in alternatives[:1]:
        packet.options.append(_option(alternative, "deterministic rules (runner-up)", None, None))
        packet.question = (f"Is this {CATEGORY_MEANING.get(category, category)}, "
                           f"or {CATEGORY_MEANING.get(alternative, alternative)}?")
    return GatewayDecision(
        tier=Tier.HUMAN,
        disposition=Disposition.HUMAN_REVIEW,
        category=category,
        reason=reason,
        policy_version=policy.version,
        local_category=category,
        local_confidence=confidence,
        arbitration=packet,
    )
