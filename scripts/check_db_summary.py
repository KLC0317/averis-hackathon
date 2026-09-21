import sqlite3
import json

conn = sqlite3.connect("var/cleardraft.db")
c = conn.cursor()
c.execute("SELECT category, verification, processing, count(*) FROM cases GROUP BY category, verification, processing")
print("CASES SUMMARY:")
for r in c.fetchall():
    print(r)

c.execute("SELECT id, email_id, category, verification, processing FROM cases WHERE verification = 'MATCH' LIMIT 5")
print("\nMATCH CASES:")
for r in c.fetchall():
    print(r)

conn.close()
