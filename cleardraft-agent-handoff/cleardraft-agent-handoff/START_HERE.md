# Start here: AI coding-agent handoff

This package specifies **ClearDraft**, a complete shipping-document verification hackathon project. It builds on the supplied use case and the two original ZIPs. It does not contain an implemented application or claimed benchmark results.

## What to give the coding agent

1. This entire extracted handoff folder.
2. `sdoc-hackathon-bundle(1).zip`, or the equivalent participant ZIP under another name.
3. `sdoc-hackathon-docker.zip` for isolated optional evaluation.
4. Optionally, the original use-case PDF as organizer context.
5. Optionally, a model-provider credential supplied through the agent's secure environment. Never paste a key into project files or the handoff prompt.

No additional organizer data is required. The source ZIPs are not duplicated inside this handoff archive.

Copy the content of `AGENT_PROMPT.md` into the coding agent. Attach the files above or place them in its accessible workspace. The prompt tells the agent to locate the inputs, implement the project, verify it, and produce the final submission package.

## Files

| File | Purpose |
| --- | --- |
| `IMPLEMENTATION_PLAN.md` | Main specification: product, architecture, schemas, readers, field rules, review, UI, API, evaluation, release |
| `AGENT_PROMPT.md` | Ready-to-use instruction for the implementing agent |
| `PROMPT_CONTRACTS.md` | Provider boundaries, model prompts, output validation, prompt versioning |
| `BUSINESS_AND_DEMO.md` | Business-value measurement, comparison protocol, demo, final submission story |
| `BACKLOG.json` | Dependency-ordered implementation work with linked acceptance tests |
| `ACCEPTANCE_TESTS.json` | Given/when/then behavior the agent must turn into executable tests |
| `SUBMISSION_SCHEMA.json` | Strict organizer-export schema; supplement with the expected email-ID manifest |
| `EXTRACTION_SCHEMA.json` | Model-facing seven-field extraction contract |
| `CLASSIFICATION_SCHEMA.json` | Model-facing email classification contract |
| `DATASET_AUDIT.json` | Verified archive facts and explicit limitations; never use as label lookup |
| `MANIFEST.json` | Package component sizes and checksums |

## Product emphasis

The required checker is the foundation. The distinguishing experiences are source-linked findings, a specific question for the unresolved field, detection of new errors in revised documents, and a challenge lab that actually mutates source documents. A measured reduction in review work is the intended business-value claim.

The plan deliberately avoids features that require unseen deadline, fee, staffing, or incident data. It keeps the evaluator answer key out of application inference. It requires honest reporting when dataset scoring conventions differ from what the source documents support.

## Completion expectations

Expect source code, a working local application, no-credential mode, optional live AI mode, genuine multi-format parsing/OCR, strict submission export, test results, actual measured evaluation reports, demo materials, and reproducible setup. A visually polished mockup alone is incomplete.

The plan contains planning defaults, illustrative payloads, and proposed targets. The agent must not report them as existing functionality or achieved results. It should record real limitations and the commands used to validate the final application.
