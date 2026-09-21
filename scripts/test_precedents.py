import sys
sys.path.insert(0, "src")
from cleardraft.store import Store
from cleardraft.api import create_app
from fastapi.testclient import TestClient

store = Store("var/cleardraft.db")
app = create_app("var/cleardraft.db")
client = TestClient(app)

# 1. Check if any cases exist
with store.connect() as db:
    row = db.execute("SELECT id, email_id FROM cases WHERE category='BL_COMPARISON' LIMIT 1").fetchone()
if not row:
    print("No comparison cases in DB")
    sys.exit(0)
test_case = {"id": row["id"], "email_id": row["email_id"]}
print(f"Testing on case ID {test_case['id']} (Email: {test_case['email_id']})")

# 2. Simulate teaching an equivalence on shipper_name
# Let's see what the case's current shipper_name values are
case_payload = client.get(f"/api/v1/cases/{test_case['id']}").json()
print("Case category:", case_payload.get("category"))
result = case_payload.get("result", {})
fields = result.get("fields", [])
print("Fields in result:", [f.get("field") for f in fields])
shipper_field = next((f for f in fields if f.get("field") == "shipper"), None)
print("Shipper field found:", bool(shipper_field))

if shipper_field:
    si_val = (shipper_field.get("si") or {}).get("raw_value") or "NAGAPPA EXPORTS NEW NO : 23, L-BLOCK, 21ST STREET, ANNA NAGAR EAST, CHENNAI"
    bl_val = (shipper_field.get("bl") or {}).get("raw_value") or "NAGAPPA EXPORTS"
    
    # Teach equivalence
    print(f"Teaching equivalence: '{si_val}' <=> '{bl_val}'")
    rev_res = client.post(f"/api/v1/cases/{test_case['id']}/reviews", json={
        "action": "confirm_equivalence",
        "field": "shipper",
        "side": "bl",
        "reason": "Address suffix appended to name on SI side; verified same corporate entity.",
        "caseVersion": case_payload.get("version", 1)
    })
    print("Review response:", rev_res.status_code, "Event ID:", rev_res.json().get("event_id"))

    # Now check precedents on this case or another case
    prec = store.find_field_precedent("shipper", si_val, bl_val)
    print("Found precedent:", prec)
    assert prec is not None
    assert "Address suffix" in prec["rationale"]
    print("SUCCESS: Precedent lookup works perfectly!")
