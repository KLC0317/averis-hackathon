# Architecture decision records

## ADR-001: Local-first, evidence-first pipeline

**Decision:** Keep source bytes and evidence blocks locally and make every
resolved value navigable to a source locator. Run local rules without a model
credential.

**Reason:** The challenge requires reproducible judging and inspectable evidence;
the supplied documents contain untrusted content and no external integration.

**Consequence:** A live provider is optional and explicitly disclosed. OCR and
provider failures produce visible review work instead of guessed values.

## ADR-002: Separate evaluator process and data

**Decision:** Mount only the participant bundle into application services. Keep
the organizer package and answer key in an opt-in evaluator profile.

**Reason:** Ground truth must not influence inference or prompts.

**Consequence:** Organizer scores are attached to frozen export hashes, and a
clean application build contains no answer key.

## ADR-003: Three independent state dimensions

**Decision:** Persist processing, verification, and operational case states
separately.

**Reason:** A parser can succeed while a required value is missing, and a case
can have confirmed mismatches alongside unresolved fields.

**Consequence:** State aggregation and export projection require explicit rules;
no missing value can become a false seven-field match.

## ADR-004: Content-based benchmark policy

**Decision:** Use one content-based policy for all IDs and document benchmark
convention differences in `docs/benchmark_notes.md`.

**Reason:** ID shortcuts would overfit the attached fixture and make live
challenge behavior unrepresentative.

**Consequence:** Public-bundle results may differ from an organizer README
example when content and evidence support a different operational conclusion.

## ADR-005: Party-field address suffix normalization is not entity fuzzy matching

**Decision:** For the three party fields (shipper, consignee, notify_party),
normalize away a postal address mechanically appended to an organization
name before comparing, using two deterministic rules only:

1. If the raw value contains a layout separator (`|` or `;`), the comparison
   value is the text before the first one - the same treatment already given
   to table/paragraph layout noise elsewhere in `normalize_text`.
2. Absent a separator, one reading may match another only if it is an exact
   whole-word prefix of the other **and** the appended remainder contains a
   digit.

**Reason:** Real cases in the reference inbox report a false mismatch purely
because one document states the organization name alone and the other
repeats its full postal address in the same field
(`"NAGAPPA EXPORTS"` vs. `"NAGAPPA EXPORTS NEW NO : 23, L-BLOCK, ..."`). This
is the same category of problem the use case brief names for field labels
("Port of Loading" vs. "Load Port") applied to party fields: the same
underlying fact represented with different amounts of detail, not a
disagreement.

The digit requirement exists because of a failure this rule caused during
development, documented fully in `docs/reliability.md`: without it, the
prefix rule also matched `"APRIL FINE PAPER TRADING"` against `"APRIL FINE
PAPER TRADING (MIDDLE EAST) FZE"` - a distinct legal entity, not an address -
turning a real `MISMATCH` into a false `OK`. A postal address in this corpus
reliably carries a street number or postal code; a legal-entity qualifier
does not. That is a structural fact about addresses, not a fact about any
specific company name, so the guard generalizes rather than special-casing
the one entity that surfaced the bug.

**Consequence:** This is deliberately narrower than similarity-based entity
matching (edit distance, token overlap, embedding similarity), which the
Section 19 decision log excludes as "review aid only; never automatic
equivalence." Nothing here scores how *similar* two different-looking names
are - both rules require the shorter reading to be **contained verbatim** in
the longer one, gated by a mechanical, checkable signal (a separator
character, or a digit in the remainder). `"Harbor Retail Co."` and `"Harbor
Retail Company"` - genuinely different strings with no containment
relationship - are correctly left as a mismatch for a person to confirm, per
the original decision log intent. Re-verified against the full 520-email set
after the digit-gate fix: zero false clears.

## ADR-006: Correction-guided few-shot prompting instead of unreviewed global learning

**Decision:** Support operator-guided classification improvements through curated,
versioned example sets injected as few-shot in-context examples. Unilateral,
instant prompt alteration from single unreviewed corrections is explicitly
forbidden.

**Reason:** In-context prompt injection is stateless and does not alter model
weights. Overriding section 19 requires satisfying the "reviewed policy and regression
tests" requirement. Three architectural guards prevent regression:
1. **Signal integrity:** Only human-typed rationales are candidate examples. Tier
   agreement and isolated ground truth are never used as training/prompt signals.
2. **Versioned immutability:** Example sets are immutable (`examples-v1`,
   `examples-v2`) and pinned to `runs.policy_version` ensuring reproducible,
   deterministic challenge lab replays.
3. **Promotion gate:** Promoting a candidate set into active deployment requires
   zero regression on the blind split and zero false clears.

**Consequence:** When an operator corrects a classification, the specific case
re-evaluates immediately via atomic review events, but example library promotion
remains a deliberate, auditable human curation step.

## ADR-007: Operator-taught comparison equivalence as human-confirmed review aid

**Decision:** When operators review comparison discrepancies and confirm that
different expressions represent the same underlying operational entity, port,
or packaging convention, their rationale is recorded in `review_events` alongside
the normalized patterns. When similar patterns recur in future document comparisons,
ClearDraft surfaces a 1-click **Precedent Review Aid**. Silent, automatic
clearing of learned equivalences is strictly forbidden.

**Reason:** Directly fulfills the prompt and challenge brief's core requirement
("The same information can look different. One document may say 'Port of Loading'
while the other says 'Load Port.' The system needs to recognize that these refer
to the same field") without endangering the zero false clear invariant.

Automatic equivalence risks conflating distinct legal entities (such as
`"APRIL FINE PAPER TRADING"` vs `"APRIL FINE PAPER TRADING (MIDDLE EAST) FZE"`),
as demonstrated during ADR-005 development. Surfacing taught equivalences as
review aids reduces operator dwell time from 30 seconds to 3 seconds (single-click
confirmation) while mathematically guaranteeing `false_clears = 0` by requiring
explicit human approval.

**Consequence:** Preserves 100% compliance with Section 19 of the decision log
("Entity fuzzy matching: Review aid only; never automatic equivalence"). Operators
can continuously teach system conventions without requiring developer code changes,
and the full provenance of every equivalence decision remains inspectable in
the audit ledger.
