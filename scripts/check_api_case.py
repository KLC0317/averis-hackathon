import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:8000/api/cases/ae2a9f7d-e2df-4bc8-ad9b-c0a1e72609b7") as resp:
        data = json.loads(resp.read())
        print("KEYS:", list(data.keys()))
        print("FIELDS IN DATA:", len(data.get("fields", [])))
        print("FIELDS:", json.dumps(data.get("fields", []), indent=2))
        print("CASE STATUS/STATE:", data.get("state"), data.get("status"), data.get("verification_status"))
        print("FINDINGS:", json.dumps(data.get("findings", []), indent=2))
except Exception as e:
    print("ERROR:", e)
