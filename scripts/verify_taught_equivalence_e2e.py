import requests
import json

BASE = "http://127.0.0.1:8000"

print("--- Step 1: Health check ---")
health = requests.get(f"{BASE}/api/v1/health")
print("Health:", health.json())
assert health.status_code == 200

print("\n--- Step 2: Find a case with a comparison discrepancy ---")
cases_res = requests.get(f"{BASE}/api/v1/cases?limit=200").json()
cases_list = cases_res if isinstance(cases_res, list) else cases_res.get("cases", [])
diff_cases = [c for c in cases_list if c.get("category") == "BL_COMPARISON" and (c.get("confirmed_differences", 0) > 0 or c.get("unresolved_fields", 0) > 0 or c.get("email_id") in ["email_145", "email_004", "email_013"])]
if not diff_cases:
    diff_cases = [c for c in cases_list if c.get("email_id") == "email_145"]
print(f"Found {len(diff_cases)} comparison cases with differences.")
assert len(diff_cases) > 0, "Expected comparison cases with differences"

target_case_id = diff_cases[0]["id"]
print(f"Inspecting Case ID {target_case_id} (Email: {diff_cases[0].get('email_id')})")
detail = requests.get(f"{BASE}/api/v1/cases/{target_case_id}").json()
fields = detail.get("result", {}).get("fields", [])
mismatch_field = next((f for f in fields if f.get("state") != "MATCH"), None)
assert mismatch_field is not None, "No mismatch field found in case"
f_name = mismatch_field["field"]
si_val = mismatch_field.get("si", {}).get("raw_value")
bl_val = mismatch_field.get("bl", {}).get("raw_value")
print(f"Target Discrepancy Field: '{f_name}'")
print(f"SI value: '{si_val}'")
print(f"BL value: '{bl_val}'")

print("\n--- Step 3: Teach equivalence with operator rationale ---")
test_rationale = f"Legal notation variation on {f_name}; verified matching counterparty per bill of lading manifest."
rev_res = requests.post(f"{BASE}/api/v1/cases/{target_case_id}/reviews", json={
    "action": "confirm_equivalence",
    "field": f_name,
    "side": "bl",
    "reason": test_rationale,
    "duration_seconds": 2.4,
    "expected_case_version": detail.get("version", 1)
})
print("Review submission status:", rev_res.status_code)
assert rev_res.status_code == 200
rev_data = rev_res.json()
print("Recorded Event ID:", rev_data.get("event_id"))
updated_case = rev_data.get("case", {})
updated_field = next(f for f in updated_case.get("result", {}).get("fields", []) if f["field"] == f_name)
print(f"Updated field state: {updated_field.get('state')} (reason: {updated_field.get('reason')})")
assert updated_field.get("state") == "MATCH"

print("\n--- Step 4: Verify precedent lookup on a matching future inquiry ---")
prec_res = requests.get(f"{BASE}/api/v1/cases/{target_case_id}/precedents")
print("Precedents endpoint status:", prec_res.status_code)
assert prec_res.status_code == 200
prec_data = prec_res.json()
print("Precedents returned:", json.dumps(prec_data, indent=2))

# Verify that find_field_precedent finds our newly taught rationale
import sys
sys.path.insert(0, "src")
from cleardraft.store import Store
store = Store("var/cleardraft.db")
found_prec = store.find_field_precedent(f_name, si_val, bl_val)
print("Store precedent query result:", found_prec)
assert found_prec is not None
assert test_rationale in found_prec["rationale"]
print("\n>>> ALL BACKEND PRECEDENT & TAUGHT EQUIVALENCE CHECKS PASSED! <<<")
