<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S282 — Record the review of an off-cycle lease end date

> Status: DELIVERED at ba9a64f6, intake 160. Chunk 1 run `a6f14bac-7edd-4db2-ab94-93f0875dc1ee`.

**Goal.**

A lease whose end date is not a month end can be reviewed once, with the reason recorded,
so staff can work it or hold it deliberately instead of meeting a block that nothing in
the app clears.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- A lease whose end date falls in a renewal window but is not a month end gets the
  disposition "review" with the reason off-cycle date
  (`lib/lease-renewal/cohort.ts`, lines 332 to 340). The desk words it "Off-cycle end
  date. Check it against an authoritative source."
  (`lib/lease-renewal/desk-guidance.ts`, lines 155 to 163 and 287 to 293).
- That disposition becomes the stage's blocker, pointed at the rent and charges region
  (`lib/lease-renewal/renewal-stage.ts`, lines 1194 to 1204). On the Now card the blocker
  replaces the step's primary action and its label is the button text, so "Review and
  send" is not offered there (`components/lease-renewal/RenewalGuidedView.tsx`, lines 1349
  to 1379).
- The readiness list holds only its fixed send keys and never reads the blocker
  (`lib/lease-renewal/renewal-preparation.ts`, lines 616 to 622), so all five rows read
  Ready while the action is blocked.
- The button lands on the working current rent field, which has nothing to do with the
  end date (`components/lease-renewal/RenewalWorkspace.tsx`, lines 1410 to 1431;
  `components/lease-renewal/RenewalCurrentRent.tsx`, lines 381 to 386).
- No control clears the block. The operating contract's own record says the reviewer's
  disposition for an off-cycle lease is not yet persisted
  (`lib/lease-renewal/business-contract.ts`, lines 15 to 21). Its stated rule is to
  review off-cycle end dates and record why each atypical lease is included, excluded or
  held for review.

In the November 12 rehearsal the off-cycle lease showed five Ready rows, a button
labelled with the problem and a landing on an unrelated field (audit finding A-09).

Intended end state: the review is one small form on Check the numbers; its recorded
decision governs the block for that exact end date; the readiness list and the button
name the fix; and a changed end date asks again.

**Actors and entry conditions.**

Renewal staff with the existing edit capability and the lease's workflow access record
the review. Read-only roles see it. Entry requires a lease whose current disposition is
review for an off-cycle end date.

**What it is / how it functions.**

- **R-S282-1 — Record the review once per end date.** On Check the numbers, Work shows
  "This lease ends 01/14/2027, which is not a month end." with the source of that date
  and one form: a decision, "Include in this renewal month" or "Keep on hold", a
  required short reason, and Save. The record is app-owned and bound to the lease, the
  cycle and the exact end date value reviewed, with the actor and time. It writes
  nothing to RentVine or the Sheet. Excluding a lease from renewal work stays with the
  existing retire control (S255), which the form links to.
- **R-S282-2 — Let the decision govern the block.** "Include" clears the off-cycle block
  for that exact end date: the Now card's primary returns to the step's own action, the
  lease is placed with the renewal month its end date falls in, and it becomes an
  eligible target of that month's deliberate preparation (S249 R-S249-3). "Keep on hold"
  keeps the block and shows the reason, who set it and when.
- **R-S282-3 — Ask again when the date changes.** When the source end date changes, the
  earlier decision becomes history and the block returns for the new value. Correcting
  the lease end through the existing lease fact correction to a month end also removes
  the block, with no decision needed.
- **R-S282-4 — Tell the truth in the readiness list and on the button.** While the block
  stands, the owner and tenant send readiness lists include "Lease end date: needs
  review (off-cycle)" as not ready. The blocker button reads "Review the lease end date"
  and lands on the form's first control with its label visible (S281 R-S281-5).
- **R-S282-5 — Show the decision on the desk.** The desk row's reason reads "Off-cycle
  end date: included by {staff name} on {date}" or "on hold". Existing filters and
  counts keep their definitions; a held lease stays counted under its existing reason.

**In scope / out of scope.**

In scope: the review record, its effect on the block and on placement, the readiness
row, the button label and landing, and the desk reason. Out of scope: other review
reasons (a missing end date keeps its own path), the renewal windows, the month-end
rule itself, retirement (S255) and any provider write.

**Open questions & assumptions.**

- Assumption: a reason is required because the documented rule says to record why. It is
  one short line, not an attestation.
- Assumption: staff with the ordinary edit capability may record the review, as for
  other lease work records. No new role or approval is added.
- Open, not blocking: whether the renewal lead wants a fixed set of reasons. Free text
  is the default.

**Cross-product impacts.**

The cohort disposition's consumers (desk guidance, stage blocker, batch placement), the
Check the numbers Work area, the send readiness lists, the Guided priority projection,
the desk row and assistant month answer, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                     | Classification                   | Use and limitation                                                                              |
| --------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| The operating contract in `lib/lease-renewal/business-contract.ts` (off-cycle row)                        | Documented business rule         | Off-cycle leases are reviewed and the reason recorded. The record does not yet exist.           |
| S246 R-S246-10 and R-S246-12, S249 R-S249-3, S255, S263, S269                                             | Active contracts                 | Batch membership and reasons, preparation targets, retirement, lease end correction, fix links. |
| `lib/lease-renewal/cohort.ts`, `lib/lease-renewal/renewal-stage.ts`, `lib/lease-renewal/desk-guidance.ts` | Committed implementation (trace) | Present disposition, blocker and wording. Re-verify lines before editing.                       |
| Staff workflow audit of November 12, 2026, finding A-09 (off-cycle case)                                  | Intent evidence only             | Observed on one synthetic lease. The absence of any clearing control was found by the trace.    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S282-1** — One app-owned review record per lease, cycle and end date value is
  read by the cohort's consumers. A test that records "Include" and expects no blocker
  fails on the starting state, which has no such record.
- **ARCH-S282-2** — The record is saved through the existing workspace save path with
  its role check, version check and audit entry. It creates no provider operation.
- **ARCH-S282-3** — The readiness list reads the same blocker the Now card reads, so the
  two cannot disagree.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S282-1** — On the off-cycle rehearsal lease the readiness list shows the end
  date row as not ready and the button reads "Review the lease end date" and lands on
  the form.
- **BEH-S282-2** — Saving "Include" with a reason restores the step's own primary, moves
  the lease into its month's batch and shows the decision on the desk row.
- **BEH-S282-3** — Saving "Keep on hold" keeps the block with the reason, actor and time.
- **BEH-S282-4** — Changing the source end date to another off-cycle date brings the
  block back with the earlier decision in history; correcting it to a month end removes
  the block.
- **BEH-S282-5** — A read-only role sees the decision and cannot save one.

**Human litmus outcome.**

### Clear an off-cycle hold on purpose

**If this was built correctly:** A staff member who opens a lease that ends mid-month is
told exactly that, decides to include it or hold it, writes why in a few words, and
either carries on with the renewal or leaves a hold the next person can read.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome     | Behavior outcome       | Human litmus                       | Deterministic evidence / falsification                                      |
| --------------------------------------------- | ------------------------ | ---------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| R-S282-1 record the review                    | ARCH-S282-1, ARCH-S282-2 | BEH-S282-2, BEH-S282-5 | Clear an off-cycle hold on purpose | AC-S282-1. Stored record, required reason, role refusal.                    |
| R-S282-2 decision governs the block           | ARCH-S282-1              | BEH-S282-2, BEH-S282-3 | Clear an off-cycle hold on purpose | AC-S282-2. Blocker, placement and preparation target.                       |
| R-S282-3 changed date asks again              | ARCH-S282-1              | BEH-S282-4             | Clear an off-cycle hold on purpose | AC-S282-3. New value, history, month-end correction.                        |
| R-S282-4 readiness and button                 | ARCH-S282-3              | BEH-S282-1             | Clear an off-cycle hold on purpose | AC-S282-4. Row state, label and landing.                                    |
| R-S282-5 decision on the desk                 | ARCH-S282-1              | BEH-S282-2             | Clear an off-cycle hold on purpose | AC-S282-2. Row reason text and unchanged counts for a hold.                 |
| Safety boundary across the requirements above | ARCH-S282-1              | BEH-S282-1             | Clear an off-cycle hold on purpose | AC-S282-5. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- The cohort tests for month-to-month, skip, no end date and out-of-window dispositions.
- `tests/unit/s269-guided-priority.test.ts`: the priority order when several needs
  compete, with the end date review placed where the lease end fix is today.
- S246's count reconciliation: group counts sum to the total and no lease is in two
  groups.
- S263: the verified lease end correction and its return to the offer.

**Adversarial acceptance checks.**

- **AC-S282-1** — Falsify ARCH-S282-1 and ARCH-S282-2. Save without a reason: refused in
  place with the typed decision kept. Save with one: the record holds lease, cycle, end
  date value, decision, reason, actor and time, and the audit entry exists. A read-only
  role and a stale version are refused with zero writes.
- **AC-S282-2** — Falsify BEH-S282-2 and BEH-S282-3. After "Include" the Now card's
  primary is the step's own action, the row is in its month's batch, the desk reason
  names the decision and the month's Prepare run treats the lease as a target. After
  "Keep on hold" the block, the counts and the reason are as specified.
- **AC-S282-3** — Falsify BEH-S282-4. Change the source end date to another off-cycle
  value: the block returns and the earlier decision is listed as history. Correct it to
  a month end: no block and no form. Restore the original value: the original decision
  applies again only if its recorded value matches exactly.
- **AC-S282-4** — Falsify ARCH-S282-3 and BEH-S282-1. With the block standing, the owner
  and tenant readiness lists show the end date row as not ready, the button reads
  "Review the lease end date", and it lands on the form's first control with its label
  fully visible. With the block cleared, the row is absent or ready and the list and the
  Now card agree.
- **AC-S282-5** — Safety. Recording a review makes zero provider calls, sends nothing
  and changes no lease source value.

**Forbidden actions / hard gates.**

No provider write. No automatic inclusion. No change to the month-end rule or the
renewal windows. No new role or approval step. No protected path edit.

**Dependencies / sequencing.**

Standalone on the cohort and stage as delivered. S281's landing rule applies to the fix
link. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The review record, its effect on the block, placement and
  preparation targets, the readiness row, the button and the desk reason, with tests and
  Help rows, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S281's landing rule. Without it the existing jump
  lands on the form's first control.
- **Externally blocked effect:** None.
- **Produces for downstream suites:** An off-cycle journey state for S284.

**Verification and delivery contract.**

1. Before editing, prove BEH-S282-1 and BEH-S282-2 fail on the starting state with the
   off-cycle rehearsal lease and record the preservation baseline separately.
2. Run focused unit, Firestore and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the disposition, the blocker and the absence of a clearing control.
2. Materialize the failing checks and the preservation baseline.
3. Build the record and its consumers, then the form, the readiness row and the desk
   reason.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the review record and its consumers are represented by verified code,
tests and current facts.
