import sqlite3
import json

conn = sqlite3.connect("var/cleardraft.db")
c = conn.cursor()
c.execute("SELECT id, email_id, category, processing, verification, result_json FROM cases WHERE email_id = 'email_003'")
row = c.fetchone()
print("CASE:", row[0], row[1], row[2], row[3], row[4])
res = json.loads(row[5])
print("RESULT_JSON:", res)

# Check inbox API representation
import urllib.request
with urllib.request.urlopen("http://localhost:8000/api/cases") as resp:
    cases = json.loads(resp.read())
    c3 = next((x for x in cases if x.get("id") == row[0] or x.get("emailId") == "email_003"), None)
    print("INBOX API CASE:", json.dumps(c3, indent=2))

conn.close()
