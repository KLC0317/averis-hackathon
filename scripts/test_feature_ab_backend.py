import sys
sys.path.insert(0, "src")
from cleardraft.store import Store
from cleardraft.api import create_app
from fastapi.testclient import TestClient

app = create_app('var/cleardraft.db')
client = TestClient(app)

res = client.get('/api/v1/mailbox/connections')
print('Mailbox conns:', res.status_code, len(res.json()))
print('Preset 0:', res.json()[0]['label'] if res.json() else 'None')

res2 = client.get('/api/v1/corrections/candidates')
print('Candidates:', res2.status_code, len(res2.json()))

res3 = client.get('/api/v1/prompt-example-sets')
print('Prompt sets:', res3.status_code, len(res3.json()))

# Test mailbox retrieval (demo fallback)
res4 = client.post('/api/v1/mailbox/conn_gmail/retrieve', json={'mode': 'demo'})
ret_data = res4.json()
case_id = ret_data['case_ids'][0]
case_info = app.state if hasattr(app, 'state') else None
with Store('var/cleardraft.db').connect() as db:
    c_row = db.execute("SELECT id, version, category FROM cases WHERE id=?", (case_id,)).fetchone()
    print('Initial Case in DB:', dict(c_row) if c_row else 'None')
curr_version = c_row['version'] if c_row else 0

# 1. Try empty rationale -> should 400
bad_res = client.post(f'/api/v1/cases/{case_id}/corrections', json={
    'category': 'SI_REQUEST',
    'rationale': '',
    'expected_case_version': curr_version
})
print('Empty rationale rejected (expect 400):', bad_res.status_code)

# 2. Valid correction with human rationale
corr_res = client.post(f'/api/v1/cases/{case_id}/corrections', json={
    'category': 'SI_REQUEST',
    'rationale': 'Shipper is providing full container loading instructions rather than requesting a draft verification.',
    'expected_case_version': curr_version
})
print('Correction applied (expect 200):', corr_res.status_code, corr_res.json().get('category'))

# 3. Check candidates
res_cand = client.get('/api/v1/corrections/candidates')
print('Candidate count (expect 1):', len(res_cand.json()), 'rationale:', res_cand.json()[0]['rationale'][:40] if res_cand.json() else '')

# 4. Promote candidate to prompt-example-sets
ex_set_res = client.post('/api/v1/prompt-example-sets', json={
    'version': 'examples-v1',
    'examples': [{
        'subject': res_cand.json()[0]['subject'],
        'category': res_cand.json()[0]['new_category'],
        'rationale': res_cand.json()[0]['rationale'],
        'body_excerpt': res_cand.json()[0]['body_excerpt']
    }],
    'source_event_ids': [res_cand.json()[0]['id']],
    'notes': 'Promoted operator rationale for SI request vs BL comparison',
    'created_by': 'jordan.diaz'
})
print('Promoted set created (expect 200):', ex_set_res.status_code, ex_set_res.json().get('version'))

