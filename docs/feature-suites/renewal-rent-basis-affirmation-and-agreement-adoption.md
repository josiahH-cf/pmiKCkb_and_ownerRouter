<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S277 — Adopt, affirm and show the basis of the renewal rent

> Status: AUTHORING READY, intake 155. Renewal amounts. Implementation and verification
> pending.

**Goal.**

Staff can take a standing agreement's amount where the offer asks for it, affirm an
owner-approved amount that equals the recommendation with one deliberate click, and read
the basis of the renewal rent wherever it appears.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- The working renewal base is one stored field, `terms_rent`, with its origin, source
  label and recorder (`lib/lease-renewal/working-record.ts`, lines 207 to 247). It is
  shown as "Rent to recommend" while shared, "Offer amount" in the owner answer review,
  "Renewal base rent" on the Offer step, "Working renewal rent" in the RentVine panel and
  "Final working terms" in Finish up. After an owner answer or an adoption the
  recommendation becomes a second stored value, `recommended_rent`
  (`lib/lease-renewal/owner-answer-terms.ts`, lines 75 to 135).
- A standing agreement's amount is computed on every read
  (`lib/lease-renewal/standing-agreement.ts`, lines 171 to 262). It is stored when staff
  type it, when the monthly preparation reaches a covered lease with an empty field
  (`lib/lease-renewal/kickoff-preparation-service.ts`, lines 214 to 220), or through
  "Rebuild with the current rule" (`components/lease-renewal/RenewalPricingPolicy.tsx`,
  lines 467 to 519). The one-click "Use policy proposal" action that keeps the agreement
  as the basis exists (`components/lease-renewal/RenewalRecommendation.tsx`, lines 82 to 107) but is not rendered in the current layout.
- On a covered lease with an empty working base, "Set renewal base rent" targets the
  Pricing basis container (`lib/lease-renewal/guided-priority.ts`, lines 429 to 446).
  Focus goes to its first control, the "Owner decides each renewal" radio; the container
  holds no amount control (`components/lease-renewal/RenewalPricingPolicy.tsx`, lines 208
  to 330). S269 asks that link to lead to "the existing assisted or verified standing
  choice when that case governs".
- "Amount approved" starts empty by rule (`components/lease-renewal/RenewalOwnerAnswer.tsx`,
  lines 3 to 9 and 48 to 51). S262 R-S262-1 forbids a silent copy and allows that "an
  exact amount matching the recommendation can be explicitly affirmed". No control does
  so. The broader coverage choice, base rent and the renewal dates, is offered only once
  both working dates are saved (lines 54 to 61 and 117 to 148), and the Documents step
  later says the owner approved the base rent only
  (`lib/lease-documents/owner-approval-binding.ts`, lines 97 to 120).
- The monthly table prints both rent cells through a two-decimal number with no currency
  sign and shows no approved amount (`components/lease-renewal/RenewalWorkingBatch.tsx`,
  lines 676 to 681 and 865 to 874; `lib/lease-renewal/current-rent-display.ts`, lines 12
  to 14). The worklist table formats currency and states the approval in its Action cell
  (`components/lease-renewal/RenewalDeskTable.tsx`, lines 1808 to 1831 and 1965 to 1971).
- The owner sentence "Our reviewed rental analysis suggests $... per month" is a code
  constant matched to the approved template
  (`lib/lease-renewal/renewal-message-content.ts`, lines 23 to 38 and 563 to 583). It also
  appears for a suggestion nobody has saved.

In the November 12 rehearsal a covered lease showed the agreement's amount in three
places and "Renewal base rent: Not entered yet" on the Offer step; typing the amount made
its basis "Entered by staff"; and after the owner approved a different amount the desk
still showed the recommendation (audit findings A-05, A-06 and A-07).

Intended end state: the agreement amount is one reviewed action at the place the fix
lands; the approved amount can be affirmed as equal to the recommendation by a deliberate
click; the answer's coverage is stated before it is saved; and every display of the
renewal rent carries its basis, with the settled labels unchanged.

**Actors and entry conditions.**

Renewal staff with edit capability work a lease's current cycle. The owner or an
authorized representative supplies the answer. Entry for the agreement path requires a
verified standing agreement covering the lease; for the answer path an eligible reply or
a manual response.

**What it is / how it functions.**

- **R-S277-1 — Adopt the agreement amount where the fix lands.** On a lease covered by a
  verified standing agreement whose current-cycle working base is empty, the Pricing
  basis owner in Ask the owner shows the agreement's result, for example "Example
  Standing Agreement gives $1,751.00 (3 percent on $1,700.00).", and one action, "Use
  $1,751.00 from the agreement". The action saves through the existing adoption writer,
  with the agreement name, policy id and version as the basis (S250 R-S250-7), after the
  existing current-read check. "Set renewal base rent" on the Offer step lands focus on
  that action, never on the first radio. A typed amount still wins (S250 R-S250-4). No
  second amount editor is added (S247 R-S247-14).
- **R-S277-2 — Show the basis wherever the renewal rent appears.** Each display of the
  working renewal base adds a short basis phrase from its stored origin: "from Example
  Standing Agreement", "suggested from the stored comparison", "entered by staff",
  "approved by the owner on 11/12/2026" or "adopted for the offer by staff". A typed
  amount on a covered lease reads "$1,760.00 entered by staff; the agreement gives
  $1,751.00." The settled labels stay: Rent to recommend, Amount approved, Offer amount,
  Renewal base rent, Working renewal rent, Final working terms and Current base rent.
- **R-S277-3 — Affirm an equal amount explicitly.** On the approving branch of the owner
  answer, beside "Amount approved", show "Same as recommended ($1,400.00)" when a
  current-cycle recommendation exists. One deliberate click fills the field with that
  amount. The field still starts empty and nothing is prefilled (S262 R-S262-1). The
  existing review shows the recommended and approved amounts.
- **R-S277-4 — State the coverage before the answer is saved.** With "Base rent only"
  the review says "This answer covers the base rent only. Documents will ask for the
  owner's approval of the renewal dates and charges." When both working dates are not
  yet saved, the form says "To record that the owner also approved the dates, enter the
  renewal dates first." with the exact link to the one Working renewal terms editor and a
  return that keeps what staff typed. Once the dates are saved the existing broader
  choice appears. S285 R-S285-4 decides which choice the form opens on; this requirement
  states the consequence of either. Coverage stays bound to evidence (S262 R-S262-3);
  the app never widens it past what staff review and save.
- **R-S277-5 — Show amounts as currency and show the approval on the monthly table.** In
  the monthly table the Current base rent and Rent to recommend cells print currency
  ("$1,400.00"). When an owner approval exists for the current cycle the Rent to
  recommend cell adds a second line, "Approved $1,425.00". When the base shown is a
  working correction it reads "Working $1,350.00", as the worklist table does. The
  column set is unchanged (S246 R-S246-7).
- **R-S277-6 — Show what the owner sentence rests on.** In the owner message review and
  in the Ask the owner facts, the recommendation line names its basis and who saved it:
  "Rent to recommend $1,500.00: suggested from the stored comparison (median of 5), saved
  by monthly preparation on 11/12/2026" or "entered by {staff name} on {date}". This
  suite changes no owner template wording; S285 owns the copy version that adds the
  term.

**In scope / out of scope.**

In scope: the agreement adoption action and its landing, basis phrases, the explicit
affirmation, the coverage statements, and the monthly table cells. Out of scope: the
Sheet and RentVine update values
([S278](renewal-source-updates-from-working-terms.md)), renaming any settled label, a
second amount editor, and the owner template wording. Three further A-06 proposals were
first set aside here because settled rules held them: selecting the approving owner from
the reply, a suggested end date, and one owner ask for rent and term. The owner's
November 12, 2026 direction carries all three. They are built by
[S285](renewal-owner-ask-rent-term-and-approver.md), and the rules that held them (S234
R-S234-1, S263 R-S263-2 and the owner copy) are amended in place.

**Open questions & assumptions.**

- Assumption: the adoption action reuses the hidden "Use policy proposal" writer rather
  than a new one, so the saved basis is identical to a prepared one.
- The agreement name, percentages and amounts above are synthetic rehearsal values.

**Cross-product impacts.**

Pricing basis and recommendation owners, the Guided priority projection, the owner
answer editor and its review, the Offer step, RentVine future rent and Finish up
previews, the monthly table, the owner message review, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                    | Classification                   | Use and limitation                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| S250 R-S250-4 and R-S250-7, S262 R-S262-1 and R-S262-3, S269 priority item 4, S247 R-S247-14, S246 R-S246-7              | Active contracts                 | Rule rent and its basis, explicit affirmation, evidence-bound coverage, one editor, fixed table columns. |
| Owner direction of November 12, 2026                                                                                     | Owner decision                   | The three A-06 proposals first set aside here are carried by S285; their rules are amended in place.     |
| `lib/lease-renewal/working-record.ts`, `lib/lease-renewal/standing-agreement.ts`, `lib/lease-renewal/guided-priority.ts` | Committed implementation (trace) | Present fields, computation and jump target. Re-verify lines before editing.                             |
| Staff workflow audit of November 12, 2026, findings A-05, A-06 and A-07                                                  | Intent evidence only             | Observed on synthetic leases. The trace corrected several claims; see the audit's correction section.    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S277-1** — One adoption writer saves an agreement amount with the agreement and
  policy version as its stored basis, from preparation and from the staff action alike.
  A test asserting an adoption control inside the Pricing basis owner for a covered lease
  with an empty base fails on the starting state.
- **ARCH-S277-2** — One basis projection turns a stored working-base entry (origin,
  source label, recorder, approval) into the phrase every surface shows. No surface
  composes its own.
- **ARCH-S277-3** — The owner answer editor's amount is set only by typing or by the
  explicit affirmation click. Its initial value stays empty.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S277-1** — On the covered rehearsal lease, "Set renewal base rent" lands on "Use
  $1,751.00 from the agreement". One click fills the offer, the basis reads the
  agreement's name on the step and the desk, and the message shows $1,751.00.
- **BEH-S277-2** — Typing $1,760 instead shows "$1,760.00 entered by staff; the agreement
  gives $1,751.00." on the step and in the review.
- **BEH-S277-3** — In the owner answer, "Same as recommended ($1,400.00)" fills the
  amount; the review shows both as equal; saving sets the approved base.
- **BEH-S277-4** — With dates unsaved, the review states base-rent-only coverage and the
  Documents consequence, and the form links to the dates and returns with typed values
  kept. With dates saved, choosing the broader coverage leaves no second approval request
  at Documents.
- **BEH-S277-5** — After an approval of $1,425 against a $1,400 recommendation, the
  monthly table row shows "$1,400.00" and "Approved $1,425.00", and every lease surface
  that shows the working base says it was approved by the owner and when.

**Human litmus outcome.**

### Know which rent this is and where it came from

**If this was built correctly:** On a lease with a standing agreement, the button that
says the rent is missing takes staff to one click that uses the agreement's amount. When
the owner approves the recommended rent, staff confirm that with one click instead of
retyping it. Wherever a renewal rent appears, a few words say whether it is suggested,
entered, from an agreement or approved.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome       | Human litmus                                   | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| R-S277-1 adopt the agreement amount           | ARCH-S277-1          | BEH-S277-1             | Know which rent this is and where it came from | AC-S277-1. Landing, one click, stored basis and readback.                   |
| R-S277-2 basis wherever the rent appears      | ARCH-S277-2          | BEH-S277-2, BEH-S277-5 | Know which rent this is and where it came from | AC-S277-2. One phrase per origin on every listed surface.                   |
| R-S277-3 explicit affirmation                 | ARCH-S277-3          | BEH-S277-3             | Know which rent this is and where it came from | AC-S277-3. Empty start, click fills, review equal.                          |
| R-S277-4 coverage stated before saving        | ARCH-S277-3          | BEH-S277-4             | Know which rent this is and where it came from | AC-S277-4. Both coverage paths and the Documents result.                    |
| R-S277-5 monthly table amounts                | ARCH-S277-2          | BEH-S277-5             | Know which rent this is and where it came from | AC-S277-5. Currency, approved line, working label, same columns.            |
| R-S277-6 what the owner sentence rests on     | ARCH-S277-2          | BEH-S277-1             | Know which rent this is and where it came from | AC-S277-2. Basis and recorder in the review and the facts.                  |
| Safety boundary across the requirements above | ARCH-S277-1          | BEH-S277-1             | Know which rent this is and where it came from | AC-S277-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/unit/s262-owner-answer-editor.test.tsx`: "Amount approved" starts empty, and
  the order of Outcome, amount and evidence. Which coverage the form opens on is S285's
  to change, not this suite's.
- `tests/unit/s262-owner-approval-scope.test.ts`: amount-only coverage (AC-S262-3).
- `tests/unit/s269-guided-priority.test.ts`: on an ordinary lease "Set renewal base rent"
  goes to the Rent to recommend owner.
- `tests/unit/s194-pricing-controls.test.tsx`: "Pricing basis" and "Owner decides each
  renewal", with nothing preselected (S250 R-S250-3).
- `tests/unit/s249-finish-up-previews.test.tsx` ("Final working terms" wording) and
  `tests/unit/s249-one-message-record.test.ts` (the owner sentence).
- `tests/unit/s261-verified-base-rent.test.ts` and
  `tests/unit/renewal-desk-component.test.tsx`: the worklist columns and base rent.

**Adversarial acceptance checks.**

- **AC-S277-1** — Falsify ARCH-S277-1 and BEH-S277-1. On a covered lease with an empty
  base, follow "Set renewal base rent": focus is on the adoption action. Adopt, then read
  back the stored origin, source label and policy version, the offer amount and the desk
  row. On an ordinary lease the link still goes to Rent to recommend. A stale read
  refuses the adoption with the existing recovery.
- **AC-S277-2** — Falsify ARCH-S277-2, BEH-S277-2 and R-S277-6. For each origin (prepared
  from a comparison, adopted from an agreement, typed, approved, adopted for the offer),
  every listed surface shows the same phrase. A typed amount on a covered lease names the
  agreement amount too. The owner review names the basis and who saved it.
- **AC-S277-3** — Falsify ARCH-S277-3 and BEH-S277-3. The field is empty on open with a
  recommendation present. The affirmation click fills it; without a recommendation the
  control is absent. A decline or counterproposal shows neither the field nor the
  control.
- **AC-S277-4** — Falsify BEH-S277-4. Record an answer before dates exist: the review
  states the coverage and the Documents consequence, and Documents then asks for the
  further approval. Record it after dates exist with the broader choice: Documents asks
  for no second approval of the dates. In both, coverage equals the evidence staff chose.
- **AC-S277-5** — Falsify BEH-S277-5. The monthly table cells print currency, the
  approved line appears only for a current-cycle approval, a working correction is
  labelled, and the header row is unchanged.
- **AC-S277-6** — Safety. No amount is written without a staff action. This suite
  changes no owner template text. No provider write occurs.

**Forbidden actions / hard gates.**

No silent copy of a recommendation, payment total or parsed reply amount. The approver
selection, the end-date choice and the owner copy version belong to S285 and are not
built here. No provider write, send or protected path edit.

**Dependencies / sequencing.**

Standalone on S250, S262 and S269 as delivered. S278 uses the same recommendation value
for the Sheet. S281 places the facts line this suite labels. S285 builds on this suite's
answer editor. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The adoption action and landing, the basis projection, the
  affirmation, the coverage statements and the table cells, with tests and Help rows,
  reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** A verified standing agreement. Without one the
  adoption action is absent and the ordinary path is unchanged.
- **Externally blocked effect:** None. The one owner ask for rent and term is carried by
  S285; AC-S277-4 proves the coverage statement for either choice.
- **Produces for downstream suites:** One basis phrase per stored origin.

**Verification and delivery contract.**

1. Before editing, prove BEH-S277-1, BEH-S277-3 and BEH-S277-5 fail on the starting
   state and record the preservation baseline separately.
2. Run focused unit and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the fields, the hidden adoption action and the jump target.
2. Materialize the failing checks and the preservation baseline.
3. Build the basis projection, then the adoption action, the affirmation and the
   coverage statements, then the table cells.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the adoption action, the basis phrases and the affirmation are
represented by verified code, tests and current facts.
