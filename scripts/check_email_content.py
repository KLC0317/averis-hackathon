import sqlite3
import json

conn = sqlite3.connect("var/cleardraft.db")
c = conn.cursor()
c.execute("SELECT raw_json FROM emails WHERE id = 'ae2a9f7d-e2df-4bc8-ad9b-c0a1e72609b7' OR id LIKE '%email_003%'")
row = c.fetchone()
if not row:
    c.execute("SELECT raw_json FROM emails LIMIT 10")
    for r in c.fetchall():
        d = json.loads(r[0])
        if d.get("id") == "email_003" or "email_003" in str(d):
            print("FOUND EMAIL:", json.dumps(d, indent=2))
            break
else:
    print("EMAIL_003:", json.dumps(json.loads(row[0]), indent=2))

conn.close()
