import requests
import json

BASE = "http://127.0.0.1:8000"

# 1. Fetch email_031 and email_291
cases = requests.get(f"{BASE}/api/v1/cases?limit=500").json()
case_031 = next(c for c in cases if c.get("email_id") == "email_031")
case_291 = next(c for c in cases if c.get("email_id") == "email_291")

print(f"Case 031 ID: {case_031['id']}")
print(f"Case 291 ID: {case_291['id']}")

# Verify case_291 initially has no precedent on container_count
prec_before = requests.get(f"{BASE}/api/v1/cases/{case_291['id']}/precedents").json()
print("Precedents on Case 291 before teaching on 031:", prec_before)

# 2. Operator reviews email_031 and teaches equivalence on container_count
rationale = "Master booking packaging split across multiple boxes; verified equivalent consignment."
rev_res = requests.post(f"{BASE}/api/v1/cases/{case_031['id']}/reviews", json={
    "action": "confirm_equivalence",
    "field": "container_count",
    "side": "bl",
    "reason": rationale,
    "duration_seconds": 3.1,
    "expected_case_version": case_031.get("version", 1)
})
print("Taught equivalence on Case 031. Status:", rev_res.status_code)
assert rev_res.status_code == 200

# 3. Now fetch Case 291 via /api/v1/cases/{id} - it should contain the precedent review aid!
detail_291 = requests.get(f"{BASE}/api/v1/cases/{case_291['id']}").json()
precedents_291 = detail_291.get("precedents", {})
print("\nPrecedents returned in Case 291 payload:")
print(json.dumps(precedents_291, indent=2))

assert "container_count" in precedents_291, "Precedent not found for container_count!"
prec = precedents_291["container_count"]
assert prec["confidence"] == "HIGH"
assert rationale in prec["rationale"]
print("\n>>> SUCCESS: Learned rationale from Case 031 immediately surfaced on Case 291! <<<")
