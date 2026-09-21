"""Runtime checks for provider-facing schemas without exposing answer keys."""

from __future__ import annotations

from typing import Any

from .core import CATEGORIES, FIELDS


def validate_classification(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict): raise ValueError("classification must be an object")
    required = {"category", "request_subtype", "requires_review", "alternative_categories", "evidence", "reason"}
    if set(value) != required: raise ValueError("classification schema mismatch")
    if value["category"] not in CATEGORIES or not isinstance(value["requires_review"], bool): raise ValueError("invalid classification")
    if not isinstance(value["alternative_categories"], list) or any(x not in CATEGORIES for x in value["alternative_categories"]): raise ValueError("invalid alternatives")
    if not isinstance(value["reason"], str) or not value["reason"]: raise ValueError("classification reason required")
    if not isinstance(value["evidence"], list):
        raise ValueError("classification evidence must be an array")
    for evidence in value["evidence"]:
        if not isinstance(evidence, dict) or evidence.get("source") not in {"subject", "current_body", "full_body"} or not evidence.get("quote"):
            raise ValueError("invalid classification evidence")
    return value


def validate_extraction(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"document_role", "fields", "warnings"}: raise ValueError("extraction schema mismatch")
    if value["document_role"] not in {"SI", "DRAFT_BL"} or not isinstance(value["fields"], dict): raise ValueError("invalid document role")
    if set(value["fields"]) != set(FIELDS): raise ValueError("all seven fields are required")
    for field_name, obs in value["fields"].items():
        if not isinstance(obs, dict): raise ValueError(f"{field_name}: observation must be object")
        for key in ("value_status", "raw_value", "unit_hint", "reference_field", "evidence", "candidates", "reason"):
            if key not in obs: raise ValueError(f"{field_name}: missing {key}")
        if obs["value_status"] not in {"PRESENT", "MISSING", "AMBIGUOUS", "UNREADABLE"}: raise ValueError(f"{field_name}: invalid value status")
        if obs["value_status"] == "PRESENT" and (not obs["raw_value"] or not obs["evidence"] or obs["candidates"]): raise ValueError(f"{field_name}: unsupported present observation")
        if obs["value_status"] in {"MISSING", "UNREADABLE"} and (obs["raw_value"] is not None or obs["candidates"]): raise ValueError(f"{field_name}: missing/unreadable cannot have value")
        if obs["value_status"] == "AMBIGUOUS" and not obs["candidates"]: raise ValueError(f"{field_name}: ambiguous requires candidates")
    return value
