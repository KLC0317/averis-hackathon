# Reliability evidence

This records two measured failures found and fixed during development, and
what they show about the classification gateway (`docs/architecture.md`).
Numbers here are from a one-time, read-only, local comparison against the
organizer's private `ground_truth.json` for development measurement only -
never copied into the application, never used to tune rules against specific
answers, and not the organizer's own scoring. See `docs/known_limitations.md`
for that distinction.

## Incident 1: a prompt change silently corrupted 80 classifications

While tightening the live-AI classification prompt with an explicit rule for
one failure pattern, a second, unrelated regression was introduced: the model
began reading routine Shipping Instruction submissions that closed with
"please revert with draft BL once available" as `BL_COMPARISON` requests
instead of `SI_REQUEST` - the closing request for the next document in the
workflow was mistaken for the document being submitted this message.

At the time, an escalation's model answer was trusted whenever it disagreed
with a low-confidence local reading, with no check on which method was
actually right:

| | before this prompt change | after (regression) |
|---|---|---|
| escalated cases | 138 | 138 |
| correct | 127 | 47 |
| local-only would have scored | 109/138 | 109/138 |

The regression was **worse than doing nothing** - the local classifier's own
low-confidence guess (109/138 correct) beat the model's answer (47/138) on
the exact cases the model was supposed to improve. It was caught only because
a held-out measurement existed to catch it; nothing internal to the pipeline
would have surfaced it, because the schema does not carry a model-confidence
field and the model was answering the prompt as asked, with no signal marking
its answer as wrong.

**Fix**: added an explicit priority rule to the prompt (an SI submission
stays `SI_REQUEST` even when it also asks for the resulting draft BL), which
resolved the regression (138/138 correct after the fix). But the deeper
problem - a single model disagreement being trusted unconditionally with no
independent check - was still present. The gateway's third disposition
(`HUMAN_REVIEW` on tier conflict) is the structural fix: under the current
policy, a disagreement between two methods that both carried real signal is
never resolved automatically by either one.

## Incident 2: a normalization fix introduced a false clear

Separately, four real party-name comparisons were failing because one
document stated an organization name alone and the other appended its postal
address in the same field (`"NAGAPPA EXPORTS"` vs. `"NAGAPPA EXPORTS NEW NO :
23, L-BLOCK, ..."`). A word-boundary prefix rule was added: if one reading is
a whole-word prefix of the other, treat them as the same organization.

Verifying it against the full 520-email set (not just the 4 known cases)
surfaced a fifth case the same rule silently broke: `"APRIL FINE PAPER
TRADING"` vs. `"APRIL FINE PAPER TRADING (MIDDLE EAST) FZE"` - a genuinely
different legal entity (a distinct Middle East branch), not an address
suffix. The prefix rule could not tell the two shapes apart and turned a real
`MISMATCH` into a false `OK` - the one failure mode this project treats as
worse than any other, since it is silent by construction: nothing downstream
flags a false clear as needing attention.

**Fix**: the rule was tightened to require the appended remainder to contain
a digit. Every real postal address in this corpus carries a street number or
postal code; a legal-entity qualifier like "(Middle East) FZE" does not. That
distinguishing signal is structural (about what an address looks like, not
about any specific company name), so it generalizes rather than special-casing
the one entity found. Re-verified: all 4 original cases fixed, the new false
clear reverted to `MISMATCH`, zero false clears across the full set.

## What this is evidence of

Not that the system is error-free - both incidents above are proof it is
not, and `docs/known_limitations.md` lists what is still open. It is evidence
that:

- False clears are checked after every change to comparison logic, not just
  at the end of a work session - incident 2 was caught this way.
- A held-out measurement exists and is used before calling a change safe, so
  a regression that looks fine on the cases it was designed for and breaks
  something else does not ship unnoticed - incident 1 was caught this way.
- The one property maintained across every change described in this repo's
  history is: **zero false clears** on the full 520-email set. That is the
  metric this project treats as non-negotiable, ahead of raw accuracy.
