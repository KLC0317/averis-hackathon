import sqlite3
import json

conn = sqlite3.connect("var/cleardraft.db")
c = conn.cursor()

# Query case
c.execute("SELECT id, email_id, category, verification, processing, classification_json, result_json FROM cases WHERE id = 'aa28da13-ae2e-4a23-8a0d-4a2d12625966' OR email_id = 'email_047'")
row = c.fetchone()
if row:
    print("CASE ID:", row[0])
    print("EMAIL ID:", row[1])
    print("CATEGORY:", row[2])
    print("VERIFICATION:", row[3])
    print("PROCESSING:", row[4])
    print("CLASSIFICATION:", json.dumps(json.loads(row[5]) if row[5] else {}, indent=2))
    print("RESULT:", json.dumps(json.loads(row[6]) if row[6] else {}, indent=2))

# Query email
c.execute("SELECT id, email_id, raw_json FROM emails WHERE id = 'aa28da13-ae2e-4a23-8a0d-4a2d12625966' OR email_id = 'email_047'")
erow = c.fetchone()
if erow:
    em = json.loads(erow[2])
    print("EMAIL SUBJECT:", em.get("subject"))
    print("EMAIL FROM:", em.get("from"))
    print("EMAIL ATTACHMENTS:", em.get("attachments"))
    print("EMAIL BODY:", em.get("body"))

# Query documents
c.execute("SELECT id, email_id, filename, format, size, attachment_path FROM documents WHERE email_id = 'email_047'")
print("DOCUMENTS:", c.fetchall())

conn.close()
