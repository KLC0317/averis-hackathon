import sqlite3

conn = sqlite3.connect("var/cleardraft.db")
c = conn.cursor()
c.execute("SELECT id, filename, format, size, attachment_path FROM documents WHERE email_id = 'email_003'")
print("DOCUMENTS FOR email_003:", c.fetchall())

# Let's also check all emails in the database
c.execute("SELECT id, email_id, category, verification, processing, json_extract(result_json, '$.fields') FROM cases")
import json
for r in c.fetchall():
    f_val = r[5]
    f_len = len(json.loads(f_val)) if f_val else 0
    print(f"{r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | fields count: {f_len}")

conn.close()
