import sqlite3

conn = sqlite3.connect("var/cleardraft.db")
c = conn.cursor()
c.execute("PRAGMA table_info(cases)")
cols = [r[1] for r in c.fetchall()]
print("COLS:", cols)
c.execute(f"SELECT {', '.join(cols[:8])} FROM cases WHERE id LIKE '%ae2a%'")
print("FOUND:", c.fetchall())
conn.close()
