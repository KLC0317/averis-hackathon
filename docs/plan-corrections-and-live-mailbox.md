# Implementation plan: correction-guided classification + live mailbox demo

Two independent features. Feature A changes how classification improves over
time; Feature B adds a live email source for demonstration. They share no code
and can be built in either order.

---

# Feature A: Correction-guided classification

## Naming: this is not reinforcement learning

Worth being precise before anything is built, because the wrong name will end
up in a pitch and be wrong in front of someone who knows the difference.

Injecting examples into a prompt does **not** train the model. Weights never
change, and every API call is stateless - the examples only affect the single
request they are sent in. What this feature actually is:

> **Correction-guided few-shot prompting**: operator corrections are captured,
> curated into a versioned example set, and supplied as in-context examples on
> later classification calls.

That is still a genuinely strong capability. Describing it as "the AI learns"
or "RL" is inaccurate and invites a question you cannot answer well.

## The decision this overrides

`IMPLEMENTATION_PLAN.md` §19 currently states:

> Global rule learning from one correction | **Disabled**; changes require
> explicit reviewed policy and regression tests

This feature is allowed to change that default, but §19 also says: *"If a
default must change, write an architecture decision record explaining why,
what behavior changes, and which tests cover it."* So **ADR-006 in
`docs/decisions.md` is a deliverable of this work, not optional paperwork.**
The design below is shaped to satisfy that line's actual requirement -
"explicit reviewed policy and regression tests" - rather than to route around
it.

## The signal problem (read before designing anything)

The hard question is not *how* to inject examples. It is **what counts as a
correct case worth learning from.**

- **Do not learn from tier agreement.** "Local rules and the model agreed,
  therefore correct" is a self-reinforcing loop. `docs/reliability.md` records
  an incident where the model was confidently and consistently wrong across 80
  cases; agreement would have amplified that error, not caught it.
- **Do not learn from ground truth.** It is isolated from the application by
  ADR-002 and must stay that way.
- **Learn only from a human typing a reason.** A person looked at the case,
  disagreed, and explained why. That is the only trustworthy signal available,
  and it is the one the user asked for.

Current state: the database has **zero** `resolve_classification` events. There
is nothing to learn from yet, which is fine - Phase 1 builds the capture
mechanism, and the demo value is in the mechanism working, not in the volume.

## Data model

Reuse what exists where possible.

**Capture — reuse `review_events`.** It already has `action`, `old_value`,
`new_value`, and critically a free-text `reason` column, plus `case_id`,
`expected_version` and atomic write support via
`store.apply_review_transaction`. A correction is:

```
action     = "classification_correction"
old_value  = previously assigned category
new_value  = category the operator says is right
reason     = the operator's typed explanation  ← the "why"
```

**New table — `prompt_example_sets`** (immutable once active):

| column | purpose |
|---|---|
| `id` | uuid |
| `version` | human-readable, e.g. `examples-v3` |
| `status` | `draft` / `active` / `retired` |
| `examples_json` | frozen array of `{category, subject, body_excerpt, rationale}` |
| `source_event_ids_json` | which `review_events` were promoted into it |
| `created_at`, `created_by`, `notes` | provenance |

**New table — `correction_candidates`** *(optional; can be a view over
`review_events` instead)*. Only add it if you need per-candidate
promote/reject state that `review_events` cannot express.

## Flow 1 — Capture

1. Operator is on a case (typically one the gateway flagged, or one they think
   was misrouted).
2. UI offers: **"This category is wrong"** → category picker + **required**
   free-text *"Why is this the right category?"*. Reject empty rationales -
   an unexplained correction is not usable as an example.
3. `POST /cases/{id}/corrections` with `{category, rationale, expected_case_version}`.
4. Backend: validate the category, write the `review_event`, then **re-run
   `verify_case()` under the corrected category** so the decision takes effect
   rather than only being logged. This is exactly what
   `POST /cases/{id}/arbitration` already does - reuse that code path rather
   than writing a second one.

At this point the correction has fixed *this* case. Nothing has been injected
into any prompt yet. That separation is deliberate.

## Flow 2 — Promotion (the part that satisfies the ADR)

Corrections do **not** flow into prompts automatically. They accumulate as
candidates, and a human promotes them in a reviewed batch.

1. `GET /corrections/candidates` — unpromoted corrections with their rationales.
2. A person reviews the batch and selects which generalise. A correction that
   is genuinely one-off ("this specific sender always mislabels") should be
   rejected, not promoted.
3. `POST /prompt-example-sets` (or CLI `python -m cleardraft promote-corrections
   --version examples-v3`) freezes the selected corrections into a **new
   immutable set**.
4. The new set starts as `draft`. It becomes `active` only after passing the
   gate below.

**Promotion gate — mandatory, this is the "regression tests" clause:**

```
python scripts/check_accuracy.py --submission <run-with-candidate-set>
python scripts/check_accuracy.py --submission <run-without>
```

Promote only if, on the **blind** split:
- exact match does not regress, **and**
- `false_clears` stays at **0**.

If dev improves and blind does not, the examples are overfitting - reject the
batch. This is the same discipline that caught both incidents in
`docs/reliability.md`, applied to a new failure mode.

## Flow 3 — Injection

- `providers.py::classify_email` gains an optional `learned_examples` argument.
- Examples render into the system prompt as a clearly delimited block:
  *"Operator-confirmed classifications from this deployment, with the reason
  each was corrected. Treat these as precedent, not as rules that override the
  message in front of you."*
- **Cap the block** (suggest 8-12 examples, and a hard token ceiling). Prompt
  bloat costs money on every call and can degrade accuracy. When the set
  exceeds the cap, select by relevance (simple keyword overlap with the
  subject is sufficient; do not reach for embeddings first).
- `pipeline.run_import` loads the active set once per run and passes it down.

## Determinism — the constraint that must not break

Today a run is reproducible: same inputs, same outputs. Naive "learn as you
go" destroys that, and with it the challenge lab (fixed fixture → fixed
expected result), replay integrity, and reproducible submissions.

Preserve it with three rules:

1. **Example sets are immutable.** New corrections produce a *new version*,
   never mutate an active set.
2. **Runs pin their set.** `runs.policy_version` already exists - record
   `local-rules-v1+examples-v3`. A run is then fully reproducible from its
   recorded inputs.
3. **Challenge lab and replay pin explicitly** to a fixed set (or to none), so
   mutation fixtures stay stable as the example library grows.

## Risks to keep visible

| risk | mitigation |
|---|---|
| Self-reinforcing bias | human-typed rationale is the only accepted signal |
| Overfitting to this corpus | blind-split gate before promotion |
| Token cost / prompt bloat | hard cap on example count and tokens |
| Non-reproducible runs | immutable versioned sets pinned into `policy_version` |
| Silent behaviour drift | every run records its set; diffing two runs shows which set changed |

## Phasing

| phase | deliverable | independently useful? |
|---|---|---|
| A1 | Capture endpoint + UI (correction + rationale), re-runs the case | Yes - fixes cases today |
| A2 | Candidate list endpoint + review UI | Yes - visible audit of corrections |
| A3 | Promotion into versioned immutable sets + CLI | Yes - curated library |
| A4 | Injection into `classify_email` + `policy_version` pinning | Completes the loop |
| A5 | Blind-split gate wired into the promotion command | Enforces the ADR |
| A6 | ADR-006 written; §19 footnote updated | Required to close |

**For a hackathon demo**, A1 + A4 with 2-3 corrections made live is enough to
show the whole mechanism. A2/A3/A5 are what make it defensible rather than a
party trick - do them if time allows, and say plainly which parts are built.

---

# Feature B: Live mailbox demo

## Scope statement (put this in the UI, not just here)

This is a **demonstration capability**. The 520-email bundle remains the
measured, scored path - every accuracy number comes from it, and a live
mailbox has no ground truth, so nothing demonstrated here is verifiable.
Frame it as *"the pipeline is source-agnostic"*, not as the main spine.

## Architecture fit

`ingest.py` already has the right seam: `ParticipantSource` exposes an
`emails()` iterator and `open_source()` builds one. A mailbox source
implements the same contract.

```
MailboxSource.emails() -> {email_id, from, subject, body, attachments}
```

`import_participant()` then works unchanged, and you inherit manifest hashing
and `get_or_create_import` dedup for free: re-retrieving the same messages
produces the same manifest and will not create a duplicate import.

**One retrieve = one import = one run.** Do not attempt incremental append
into an existing import - that would require changing the immutable-snapshot
model, the run model, and the funnel counts. The snapshot-per-retrieve model
needs no core changes.

## Fetching only new mail

New table `mailbox_connections`:

| column | purpose |
|---|---|
| `id`, `label`, `provider` | `gmail` / `outlook` / `imap` |
| `host`, `port`, `username`, `folder` | connection target (**no password**) |
| `last_uid` | high-water mark - IMAP UIDs are monotonic per mailbox |
| `last_polled_at`, `status` | operational state |

Retrieve = fetch UIDs greater than `last_uid`, **capped** (suggest 20 per
click), import, run, advance the cursor. Add a second safety net: skip any
message whose `Message-ID` already exists in `emails`, so a UID reset or
folder change cannot cause duplicates.

## One adapter, several logos

The user asked for Gmail, Outlook and others. **Do not build three
integrations.** All of them speak IMAP:

| preset | host | auth for demo |
|---|---|---|
| Gmail | `imap.gmail.com:993` | app password |
| Outlook / O365 | `outlook.office365.com:993` | app password |
| Generic IMAP | user-supplied | password |

The UI shows three source cards; underneath it is one `ImapProvider` with
prefilled host/port. OAuth is explicitly out of scope for the demo - say so in
the UI rather than implying full Gmail API integration.

Attachments: walk the MIME parts, persist via the existing
`store.add_document`. The current readers already handle PDF, DOCX, XLSX and
TXT, so no reader work is needed.

## Security — this changes because you are hosting

1. **Read-only.** Use IMAP `EXAMINE`, never `SELECT` with writes, never
   `STORE` or `DELETE`. State this in the UI so nobody fears the demo is
   mutating a real mailbox.
2. **Dedicated throwaway demo mailbox.** Never a personal account. Assume any
   credential deployed to a hosted box is compromised.
3. **Credentials from environment only.** Never stored in the database, never
   returned by any endpoint, never logged.
4. **Rate-limit `retrieve`** so a judge clicking repeatedly cannot hammer the
   provider or your API bill.
5. **Correct the local-first copy.** `README.md` and the Imports page render
   *"No data leaves your machine."* With a hosted mailbox and `live_ai`, real
   email content leaves twice. Update to something honest:
   *"Source bytes stay in your deployment; live AI mode sends document text to
   the configured provider."* Leaving the current copy in place while shipping
   this is a contradiction someone will find.

## API surface

| endpoint | purpose |
|---|---|
| `GET /mailbox/connections` | configured sources, never secrets |
| `GET /mailbox/{id}/status` | `last_uid`, `last_polled_at`, reachability |
| `POST /mailbox/{id}/retrieve` | fetch → import → run; returns `{import_id, run_id, new_count, case_ids}` |

## UI

New route `/live`:

- **Source cards** — Gmail / Outlook / IMAP, each with connection status and
  last-retrieved time.
- **Retrieve latest** button → progress state → result summary
  (*"Imported 3 new messages · 2 comparisons · 1 arbitration"*).
- **Results table** of just the newly-imported cases, each row linking
  straight into its case page.
- **Persistent banner** when a live source is active: read-only, and whether
  content is being sent to an AI provider.

## Demo choreography

1. Open `/live` showing the steady state.
2. From a phone, send an email to the demo mailbox with an SI and a draft BL
   attached (one containing a deliberate discrepancy).
3. Click **Retrieve** — the message appears, classified and compared.
4. Click into the case — show the seven-field comparison with evidence, and
   the arbitration packet if the gateway fires.

**Fallbacks, because live demos fail:** pre-seed the mailbox so content is
deterministic; record a video of the full flow; consider an `--offline` replay
mode that serves a previously captured fetch.

## Explicit non-goals

- No background/automatic polling (unpredictable timing during a demo).
- No changes to the scored pipeline path.
- No claim of real-time sync - it is a manual pull.

---

# Suggested order

Feature B is lower risk and higher demo impact per hour; Feature A is the
stronger technical story but needs the ADR and the promotion gate to be
defensible. If both are wanted and time is short: **B fully, then A1 + A4**,
and state clearly in the writeup which parts of A's curation loop are built
versus designed.
