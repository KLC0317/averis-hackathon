"""Routing policy tests: every path a case can take through the gateway."""

from cleardraft.gateway import (
    Disposition, GatewayPolicy, Tier, route_escalation_unavailable, route_local, route_model,
    score_model_response,
)

POLICY = GatewayPolicy()


def local(category: str, confidence: float) -> dict:
    return {"category": category, "confidence": confidence}


def model(category: str, *, requires_review: bool = False, alternatives=None, evidence=True) -> dict:
    return {
        "category": category,
        "requires_review": requires_review,
        "alternative_categories": alternatives or [],
        "evidence": [{"source": "subject", "quote": "q"}] if evidence else [],
    }


def test_confident_local_reading_is_accepted_without_a_model_call():
    decision = route_local(local("SPAM", 0.9), POLICY)
    assert decision.disposition is Disposition.ACCEPTED
    assert decision.tier is Tier.LOCAL_RULES
    assert decision.needs_human is False


def test_weak_local_reading_is_escalated():
    decision = route_local(local("GENERAL", 0.1), POLICY)
    assert decision.disposition is Disposition.ESCALATED


def test_agreement_between_tiers_is_accepted():
    decision = route_model(local("SI_REQUEST", 0.4), model("SI_REQUEST"), POLICY)
    assert decision.disposition is Disposition.ACCEPTED
    assert decision.tier is Tier.LIVE_AI
    assert "agree" in decision.reason


def test_conflict_with_a_material_local_reading_goes_to_a_person():
    # The regression this policy exists to catch: the model confidently
    # overturning a local reading that had real evidence behind it.
    decision = route_model(local("SI_REQUEST", 0.45), model("BL_COMPARISON"), POLICY)
    assert decision.disposition is Disposition.HUMAN_REVIEW
    assert decision.needs_human is True
    assert decision.local_category == "SI_REQUEST" and decision.model_category == "BL_COMPARISON"


def test_model_overrides_a_local_reading_that_had_no_signal():
    decision = route_model(local("GENERAL", 0.0), model("INVOICE_QUERY"), POLICY)
    assert decision.disposition is Disposition.ACCEPTED
    assert decision.category == "INVOICE_QUERY"


def test_hedging_model_goes_to_a_person_even_when_it_agrees():
    decision = route_model(local("SPAM", 0.3), model("SPAM", requires_review=True), POLICY)
    assert decision.disposition is Disposition.HUMAN_REVIEW


def test_model_answer_without_verifiable_evidence_is_not_accepted():
    decision = route_model(local("GENERAL", 0.1), model("BL_COMPARISON", evidence=False), POLICY)
    assert decision.disposition is Disposition.HUMAN_REVIEW


def test_unavailable_escalation_goes_to_a_person_not_the_weak_local_guess():
    decision = route_escalation_unavailable(local("GENERAL", 0.1), "ProviderError", POLICY)
    assert decision.disposition is Disposition.HUMAN_REVIEW
    assert decision.category == "GENERAL"  # provisional answer is still recorded
    assert "unavailable" in decision.reason


def test_model_confidence_degrades_with_hedging_and_alternatives():
    assert score_model_response(model("SPAM"), POLICY) == 1.0
    assert score_model_response(model("SPAM", alternatives=["GENERAL"]), POLICY) < 1.0
    assert score_model_response(model("SPAM", requires_review=True), POLICY) <= POLICY.model_hedge_ceiling
    assert score_model_response(model("SPAM", evidence=False), POLICY) <= POLICY.model_unverified_ceiling


def test_decision_record_is_serialisable_and_carries_the_policy_version():
    payload = route_model(local("SI_REQUEST", 0.45), model("BL_COMPARISON"), POLICY).to_dict()
    assert payload["policy_version"] == POLICY.version
    assert payload["needs_human"] is True
    assert payload["local_confidence"] == 0.45 and payload["model_confidence"] == 1.0
