# Demonstration path

Use a fresh local import and select a case after processing completes. The
shortest reproducible demonstration is:

1. Open a real clean or mismatched comparison and inspect the SI and BL source
   evidence for one field.
2. Open a case with an unresolved or missing value and answer only the targeted
   review task. Confirm that unaffected field findings remain unchanged.
3. Add a revised document pair and verify that all seven fields are rechecked;
   prior machine and assisted runs remain in history.
4. Run a challenge mutation such as `container-count-plus-one` and inspect the
   expected effect, changed source hash, fresh run, and evidence.
5. Export a machine-only submission and show its deterministic hash and strict
   schema validation.

Use supplied examples such as `email_001`, `email_004`, `email_501`,
`email_506`, and `email_516` only after the current pipeline confirms their
behavior. They are review starting points, never hardcoded labels.

## Classification gateway: a caught disagreement, reproducibly

`python scripts/demo_gateway_conflict.py` runs the real pipeline end to end
(`import_participant`, `run_import`, `classify_email`, the real routing
functions in `gateway.py`) against one synthetic email, with only the model
provider's network call replaced by a fixed stub so the output is
deterministic and needs no API key. The stub answers plausibly but disagrees
with the deterministic rules; the script prints the gateway's decision and
the full arbitration packet a reviewer would see, and asserts the case landed
in `HUMAN_REVIEW` rather than being silently resolved either way. See
`docs/reliability.md` for the real incident (80 classifications silently
corrupted by trusting a model's disagreement unconditionally) this behavior
is built to prevent.

