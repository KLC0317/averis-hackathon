# Instruction to the implementing AI coding agent

Build the entire ClearDraft shipping-document verification hackathon project described in the attached handoff package. Deliver working, tested software and the submission materials. The implementation plan is the product and engineering specification; do not stop after planning or scaffolding.

## Inputs and reading order

Locate the attached participant ZIP and Docker/evaluator ZIP within the authorized workspace. Names may vary; identify their roles by structure. Read `START_HERE.md`, `IMPLEMENTATION_PLAN.md`, `PROMPT_CONTRACTS.md`, and `BUSINESS_AND_DEMO.md`. Load `BACKLOG.json`, `ACCEPTANCE_TESTS.json`, and the schema files. Use `DATASET_AUDIT.json` to verify the input version; recount files if hashes differ. Read any applicable repository instructions before edits.

Treat the provided files as the complete business input. Do not require the organizer to supply more data. Use routine engineering judgment for unspecified details and record decisions in `docs/decisions/`. Do not ask for approval for ordinary local implementation or testing already authorized by this task. Do not perform external deployment, purchases, or messaging without authorization. If a dependency, credential, or environment capability is unavailable, implement the supported local alternative and clearly record what remains unverified.

## Product outcome

Build a review workspace that classifies the mixed inbox, extracts seven shipment fields from SI and draft BL attachments, compares them against the SI, shows the exact evidence, and asks the user only for the unresolved decisions. Include source-linked review, revisions, failures/retries, local correction drafts, a real challenge lab, baseline evaluation, and business-metric instrumentation.

Optimize for reduced human review effort while preserving accuracy. Do not substitute a generic chatbot, static dashboard, or a model response printed as JSON for the specified product. Do not invent savings, scores, confidence guarantees, source passages, or completed actions.

## Non-negotiable correctness rules

1. SI is the reference. Required fields and categories are exactly those in the plan.
2. Extract each document independently. Never fill an absent value from the other document.
3. Missing, unreadable, unsupported, or ambiguous required information prevents automatic completion as a match.
4. Every resolved field has source evidence whose document, block, location, and value support are validated.
5. Keep confirmed mismatches and unresolved fields simultaneously. The simplified organizer export must not destroy richer case findings.
6. Model self-reported confidence is not a clearance rule.
7. A human correction creates an assisted result; the original machine result remains unchanged for evaluation.
8. A revised document creates a new pair/version and triggers all seven comparisons. Prior human decisions cannot silently apply to changed source bytes.
9. Keep category, processing state, verification result, and operational case state separate.
10. A completed comparison is not shipment release or final BL approval.

## Evaluator boundary

The Docker ZIP contains evaluator-only answers. Do not read `ground_truth.json`, use it in prompts or tests, inspect label-generation logic to reverse-engineer outputs, infer labels from email IDs, or train against the submission template. Keep the evaluator separate from the application filesystem and runtime. Use only the supplied aggregate scoring interface or isolated scoring process. Keep truth-reveal disabled. Do not modify the scorer.

Some documented reference conventions conflict with useful product behavior on absent attachments and recoverable scans. Apply the operational rules consistently and document the discrepancy; do not introduce an ID-based workaround or relabel an unverifiable case as verified.

## Implementation approach

Use the stack and contracts in the plan unless an actual environment constraint justifies a recorded alternative. Resolve and lock compatible versions. Start with a working TXT vertical slice, then implement genuine PDF/OCR, DOCX, and XLSX reading. Establish immutable source storage, typed evidence, durable jobs, and result versioning before building the review interface around them.

Implement a conservative local processing provider so startup and meaningful flows work without an API key. Implement a configurable live AI adapter if credentials are available. Clearly label recorded replay and never use it as fresh inference on changed inputs. Keep model calls bounded and track actual usage.

Build the eight specified user journeys with working loading, empty, partial, stale, invalid-input, and failure states. The source evidence must be navigable, text selectable, corrections auditable, and revisions visible. Local message drafts must remain editable and unsent.

The challenge lab must generate changed document bytes, preserve the base fixture, and invoke the same pipeline. It must compare expected and actual outcomes honestly. Reviewed originals and all their mutations must remain in the same evaluation split.

## Execution and validation

Work through `BACKLOG.json` in dependency order. Every P0 and P1 item is in scope for the full submission. P2 items are optional. Convert the acceptance scenarios into meaningful unit, integration, and browser tests. Keep a concise progress record with implemented paths, commands run, observed results, blockers, and next work.

Run the complete supplied participant dataset. Preserve machine-only results before review. Validate the export against the strict schema and exact ID manifest. Run organizer evaluation where the environment permits and save the actual response against the export hash. If scoring is unavailable, produce a valid export and reproducible evaluation instructions without claiming a score.

Run the baseline and proposed workflow on the same reviewed evaluation cases. Produce actual technical measurements and an instrumented human-review study. If no human participants perform the trial, mark human savings as unmeasured. Do not fabricate production incident or financial data.

Verify the UI at desktop and mobile widths, inspect evidence navigation, test restart and retry behavior, and rehearse the live demonstration. Prioritize fixing concrete correctness failures over adding optional features.

## Required final delivery

- Complete source repository with locked dependencies, migrations, configuration example, and local launch instructions.
- Docker Compose and native setup paths, with evaluator isolation and persistent application data.
- Working eight-flow interface, local processing mode, and live AI mode where configured.
- Strict `submission.json` containing every required original email ID.
- Full evidence/report export, measured evaluation report, challenge results, baseline comparison, and test report.
- `benchmark_notes.md`, `known_limitations.md`, dependency inventory, and decision log.
- Working-app screenshots, a four-minute demo script, and a short project overview explaining the business problem and observed value.
- A final checklist showing which release gates passed, exact commands, and any genuine remaining limitation.

Proceed with implementation now. Do not mark the project complete if a required differentiator is a stub, if displayed results are fabricated, if the app silently drops inputs, or if the original machine evaluation has been contaminated by reviewer corrections.
