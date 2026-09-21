# Business evidence, evaluation, and demonstration

## 1. Business proposition

ClearDraft aims to reduce the time shipping staff spend finding document requests, locating relevant source passages, and repeating checks when only one field is uncertain. Its differentiators are visible source evidence, targeted review, fresh checks of revisions, and demonstrable behavior under controlled changes.

The buyer hypothesis is a shipping operations lead responsible for throughput and document quality. The prototype's users are reviewers. A production buying decision would still require a real operational pilot, acceptable data handling, and integration assessment. This handoff requires none of those external inputs to build or evaluate the hackathon prototype.

## 2. What can be claimed

| Claim | Evidence needed | Status before implementation |
| --- | --- | --- |
| Handles supplied formats | Actual parser and browser tests on each format | Pending |
| Detects correct differences | Reviewed case set and organizer evaluation | Pending |
| Avoids false clearance on tested missing inputs | Exact tests plus counts of evaluated cases | Pending |
| Reduces reviewer work | Timed human tasks with comparable baseline cases | Pending |
| Costs a certain amount to process | Actual usage and dated configured rates | Pending |
| Prevents shipment delays or saves annual dollars | Real shipment outcomes, costs, volume, and attribution | Not supported by the supplied dataset |

Never replace pending evidence with a visually impressive number. An empty measurement panel should state the required next step.

## 3. Evaluation design

### 3.1 Technical comparison

Run baseline and proposed pipeline on the same reviewed case split. Keep model/provider and source content access comparable. Freeze each run before human intervention. Use the same actual source-reader outputs where the experiment is intended to measure comparison/workflow improvements rather than parser quality. Report any difference in prompts, OCR, call budget, or context.

Measure category accuracy/macro-F1; defect precision/recall; field exactness; automatic comparison coverage; false clearance; unresolved-case rates; source-evidence validity; processing latency; calls/tokens/cost; and challenge outcomes. Break down by document format and failure type where sample size permits. Avoid implying tiny per-format samples establish stable population estimates.

The organizer weighted score remains an important required evaluation, but it does not replace operational tests. Explain the attachment-free-request and recoverable-scan conventions in the report.

### 3.2 Human-effort trial

Suggested pilot: 3-5 volunteers, each completing 8-12 short case tasks with a balanced mix of clean, mismatched, uncertain, and missing-input cases. These are proposed sample sizes, not completed participants or results. If no volunteers are available, ship the instrumentation and study instructions, and state that the trial was not run.

Use matched case groups rather than having the same person immediately repeat a case after learning its answer. Counterbalance which interface appears first. Keep task instructions identical: identify the comparison outcome, verify needed evidence, and specify the next action. Explain the study purpose and collect only necessary pseudonymous session data.

Baseline interface: email plus SI/BL viewers and a simple AI result. Proposed interface: evidence-linked field comparison and targeted review. Do not intentionally cripple baseline readability. Run correctness checks on participants' final outcomes; faster wrong answers do not count as improvement.

Record task start/end, tab visibility, idle pauses, evidence views, review decisions, and final correctness. Permit correction of idle-time artifacts. Report the timing definition, median and range of active review time, participant/case counts, failure cases, and any cases excluded with reasons. Do not turn a developer clicking through familiar fixtures into an independent user study.

## 4. Metric definitions

Let C be independently reviewed comparison requests in the evaluation sample; A be cases completed automatically with evidence-supported seven-field results; M be automatically reported all-match cases; F be M cases found to contain a discrepancy or unresolved required input.

- Automatic completion coverage = |A| / |C|. Also show coverage restricted to cases with usable source documents, clearly labeled.
- Observed false-clearance proportion = |F| / |M|, with the absolute numerator and denominator. If M is zero, display not applicable; never display a perfect safety rate.
- Review rate = cases requiring a human decision / |C|. Report missing-source cases separately from ambiguous-reading cases.
- Human minutes per correctly completed case = measured active reviewer minutes divided by correctly completed tasks, with time spent on failed tasks also reported.
- Time reduction = 1 minus proposed median task time divided by baseline median, only for a defensible matched comparison. Show raw times and sample sizes beside the percentage.
- Operating estimate per case = recorded compute/provider usage divided by processed cases, including retries. Unknown rate data produces unknown monetary cost.

Keep classified-only emails out of comparison-completion coverage. Keep challenge variants out of original-shipment sample sizes. Keep replay out of live latency/usage measurements. Keep human-assisted accuracy separate from the original machine-only score.

## 5. Financial framing

Observed minutes saved can be converted to reclaimed review capacity. Actual annual volume and labor-cost inputs would be needed for extrapolation. Label any calculator as hypothetical, show its assumptions, and do not claim the full value of freed staff time is an expense reduction.

Do not calculate money saved from invented carrier fees, cargo values, or delay probabilities. The hackathon's credible business claim can be measured capacity recovery and quality evidence. That is enough to explain why an operations team would evaluate the product further.

## 6. Four-minute demo runbook

| Time | Demonstration | Evidence and narration |
| --- | --- | --- |
| 0:00-0:25 | Open processed inbox | State the mixed-inbox problem and show all categories plus explicit unresolved cases. Display actual run mode. |
| 0:25-1:05 | Open a genuine mismatch | Use a confirmed supplied case such as email_004. Click a field and show both exact passages. Explain why this reduces searching. |
| 1:05-1:45 | Resolve one uncertain reading | Use an actual uncertain result or a clearly labeled controlled fixture. Confirm one reading; show unaffected checks preserved and an assisted run recorded. |
| 1:45-2:25 | Upload a test revision | Fix the two original name issues but deliberately change container count in the synthetic revision. Show resolved and newly introduced issues. |
| 2:25-3:10 | Let the judge choose a mutation | Rename files, change a count, or remove a value. Show real source changes and the real pipeline's outcome. Safe abstention is not mislabeled successful extraction. |
| 3:10-3:40 | Show evaluation | Actual organizer score, source-reviewed quality, challenge failures as well as passes, and human effort only if measured. |
| 3:40-4:00 | Show reproducibility and value | Demonstrate export and explain the observed capacity benefit or pending pilot. State the main limitation candidly. |

This timing is a planned script. Adjust to the event's actual presentation limit.

## 7. Demo resilience

Prepare a real completed run with immutable provenance so the UI remains explorable if the network is down. Label it recorded replay. Do not pretend a recorded response is the result of a new challenge. Keep local parsing/comparison available for text mutations. If a live OCR/model path fails during the demo, show the recovery behavior and limitation; do not swap in an unrelated prerecorded answer.

Keep synthetic revisions and challenges in a separate workspace. Reset only that demo workspace using a clearly labeled action. Do not overwrite the original dataset or the frozen evaluation run.

Rehearse from a clean startup, with credentials absent, with an invalid source, and after restarting the worker. Verify that all highlighted evidence and export links open correctly on the presentation machine.

## 8. Submission materials

Produce a short project overview containing: operational problem; who uses the product; implemented capabilities; why targeted review and evidence reduce work; architecture; actual evaluation method/results; limitations; setup; and demo instructions.

If slides are required, a six-slide outline is sufficient: problem and user; product decision; evidence/targeted review; revision/live challenge; measured quality and business value; deployment and next validation step. Only include screenshots and figures produced from the implemented application and actual runs. Do not include fictitious customer logos, testimonials, scores, or savings.

The strongest statement at presentation time is specific and supported: describe the measured cases, the observed correctness, and the actual reviewer work removed. Avoid generic promises about revolutionizing logistics or eliminating all document errors.
