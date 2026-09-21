"""An escalation must arrive as a decision a person can actually make."""

from cleardraft.gateway import (
    CATEGORY_CONSEQUENCE, GatewayPolicy, route_escalation_unavailable, route_model,
)

POLICY = GatewayPolicy()


def local(category, confidence, evidence=True, alternatives=None):
    return {
        "category": category, "confidence": confidence,
        "alternative_categories": alternatives or [],
        "evidence": [{"source": "subject", "quote": f"local quote for {category}"}] if evidence else [],
    }


def model(category, *, requires_review=False, alternatives=None):
    return {
        "category": category, "requires_review": requires_review,
        "alternative_categories": alternatives or [],
        "evidence": [{"source": "current_body", "quote": f"model quote for {category}"}],
    }


def test_conflict_packet_names_both_candidates_with_their_own_evidence():
    decision = route_model(local("SI_REQUEST", 0.45), model("BL_COMPARISON"), POLICY)
    packet = decision.arbitration
    assert packet is not None
    categories = [option.category for option in packet.options]
    assert categories == ["SI_REQUEST", "BL_COMPARISON"]
    # each option carries the evidence the tier that proposed it relied on
    assert "local quote" in packet.options[0].evidence[0]["quote"]
    assert "model quote" in packet.options[1].evidence[0]["quote"]
    assert packet.options[0].proposed_by == "deterministic rules"
    assert packet.options[1].proposed_by == "language model"


def test_packet_states_the_consequence_of_each_choice():
    decision = route_model(local("GENERAL", 0.4), model("BL_COMPARISON"), POLICY)
    packet = decision.arbitration
    consequences = {option.category: option.consequence for option in packet.options}
    assert consequences["BL_COMPARISON"] == CATEGORY_CONSEQUENCE["BL_COMPARISON"]
    # the reviewer is told what filing it away would cost them
    assert "No document comparison runs" in consequences["GENERAL"]


def test_packet_asks_an_answerable_question():
    decision = route_model(local("SI_REQUEST", 0.45), model("BL_COMPARISON"), POLICY)
    question = decision.arbitration.question
    assert question.endswith("?")
    assert "Shipping Instruction" in question and "Bill of Lading" in question


def test_packet_explains_why_it_reached_a_person():
    decision = route_model(local("SI_REQUEST", 0.45), model("BL_COMPARISON"), POLICY)
    assert "conflict" in decision.arbitration.why_escalated


def test_unavailable_escalation_offers_the_runner_up_as_the_alternative():
    decision = route_escalation_unavailable(
        local("GENERAL", 0.2, alternatives=["BL_COMPARISON"]), "provider down", POLICY,
    )
    packet = decision.arbitration
    assert [option.category for option in packet.options] == ["GENERAL", "BL_COMPARISON"]
    assert "provider down" in packet.why_escalated


def test_accepted_decisions_carry_no_packet():
    decision = route_model(local("SPAM", 0.4), model("SPAM"), POLICY)
    assert decision.arbitration is None


def test_packet_survives_serialisation_for_storage_and_transport():
    payload = route_model(local("SI_REQUEST", 0.45), model("BL_COMPARISON"), POLICY).to_dict()
    packet = payload["arbitration"]
    assert packet["policy_version"] == POLICY.version
    assert len(packet["options"]) == 2
    assert set(packet["options"][0]) == {"category", "proposed_by", "confidence", "meaning",
                                         "consequence", "evidence"}
