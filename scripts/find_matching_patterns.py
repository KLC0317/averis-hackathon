import sqlite3
import json
from collections import Counter

conn = sqlite3.connect('var/cleardraft.db')
c = conn.cursor()
c.execute('SELECT id, email_id, result_json FROM cases WHERE category="BL_COMPARISON"')
cases = []
for r in c.fetchall():
    if r[2]:
        res = json.loads(r[2])
        for f in res.get('fields', []):
            if f.get('state') != 'MATCH':
                cases.append((r[0], r[1], f.get('field'), (f.get('si') or {}).get('raw_value'), (f.get('bl') or {}).get('raw_value')))

print('Total open mismatch fields across DB:', len(cases))
patterns = Counter((item[2], item[3], item[4]) for item in cases)
for pat, cnt in patterns.most_common(8):
    matching_cases = [item[1] for item in cases if (item[2], item[3], item[4]) == pat]
    print(f'Count {cnt} on {matching_cases[:3]}: Field {pat[0]} | SI: {pat[1]!r} | BL: {pat[2]!r}')
