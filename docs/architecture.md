# Architecture notes

ClearDraft has three runtime processes: a Next.js web client, a FastAPI API,
and a persisted worker. The API and worker share SQLite and an immutable local
storage root. Jobs are claimed atomically with bounded retries and lease
expiry, so a page refresh or worker restart does not erase source evidence.

The pipeline stages are:

1. Import and hash immutable email and attachment bytes.
2. Classify each email into one of the five organizer categories through the
   classification gateway (below) - a deterministic scorer, an optional
   model second opinion, and a human arbitration queue as the terminal tier.
3. Detect document roles from content and evidence, with filename suffixes only
   as weak hints.
4. Read TXT, native/scanned PDF, DOCX, and XLSX sources into evidence blocks.
5. Extract SI and BL independently, normalize the seven required fields, and
   compare them with exact field-specific rules.
6. Aggregate machine results into processing, verification, and operational
   states without collapsing missing values into zeros or mismatches.
7. Expose review tasks, revisions, drafts, challenge runs, reports, and strict
   machine-only or assisted exports.

The evaluator is outside this graph. Only aggregate scoring responses may be
stored against an export hash. `ground_truth.json` and generator internals are
never inputs to classification, extraction, prompts, or challenge fixtures.

## The classification gateway

`src/cleardraft/gateway.py` owns the routing decision for every email's
category. It is a separate module from the classifier so the policy - which
tier's answer gets trusted, and when a case escalates further - is auditable
in one place instead of scattered through pipeline conditionals.

**Three tiers, three dispositions.** Every email is read first by
`classify_email()` (`core.py`), a deterministic keyword/regex scorer with no
model call. `route_local()` either **accepts** that reading (confidence at or
above `GatewayPolicy.local_accept`, currently 0.8) or **escalates** it to the
model tier. If a provider is configured, `route_model()` compares the model's
answer against the local one:

- **Agreement** between the two independent methods is accepted outright -
  agreement by different routes is stronger evidence than either alone.
- **The model overriding a local reading that had no real signal** (below
  `conflict_floor`) is accepted - the model saw strictly more context and the
  local reading was never a competing opinion to begin with.
- **Disagreement where both methods had real signal** is not decided
  automatically by either tier. It becomes a **human arbitration** case
  (`Disposition.HUMAN_REVIEW`) instead - the third disposition is the point:
  most confidence-threshold designs stop at "escalate to a bigger model and
  trust it," which cannot distinguish the model correctly overriding a wrong
  local guess from the model incorrectly overriding a right one.
- A **provider outage** while resolving an escalation also goes to a person
  (`route_escalation_unavailable()`) rather than falling back to the
  local reading that was already below the accept threshold - closing on that
  answer would be exactly the silent guess this gateway exists to prevent.

**Model confidence is derived, not self-reported.** The classification
response schema (`CLASSIFICATION_SCHEMA.json`) has no confidence field and is
`additionalProperties: false`, so `score_model_response()` derives one from
signals the schema already carries: whether the model set `requires_review`
(self-hedging), how many `alternative_categories` it kept open, and -
load-bearing - whether its cited evidence quote can be verified against the
literal source text. Provider-side coercion
(`providers.py::_coerce_classification_evidence`) already drops any quote it
cannot locate in the subject/body and re-derives `source` from where the
quote is actually found rather than trusting the model's label for it; an
empty evidence list after that means nothing the model claimed was
verifiable, and confidence is capped accordingly.

**A human-review case arrives as a decision, not a flag.** `gateway.py`
builds an `ArbitrationPacket`: the question in the operator's language (e.g.
*"Is this a Shipping Instruction being submitted, or a request to check a
draft Bill of Lading against one?"*), each candidate category with the
evidence the tier that proposed it actually relied on, and - the part meant
to prevent the exact failure mode named in the use case brief ("a document
request that is overlooked never reaches the checking step") - **the stated
consequence of choosing each option**, e.g. *"No document comparison runs, so
a draft BL discrepancy on this shipment would not be caught here."*
`POST /cases/{id}/arbitration` (`api.py`) validates the chosen category was
actually one the packet offered, then calls the same `verify_case()` the
automated pipeline uses - so the reviewer's decision causes the real
downstream comparison rather than only relabelling the case.

See `docs/reliability.md` for the measured evidence behind this design: a
real regression this gateway is built to catch, caught and fixed during
development.

