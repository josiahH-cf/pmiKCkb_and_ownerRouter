<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S285 — Ask the owner for rent and term once, suggest the end date and select the owner who replied

> Status: AUTHORING READY, intake 163. Renewal amounts. Owner-directed on November 12, 2026. Implementation and verification pending.

**Goal.**

One owner message asks for the rent and the renewal term, so one owner answer covers what
the documents need. Staff take a suggested end date with one deliberate choice, and the
owner who replied is already selected when they record the answer.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- The owner message states the current rent, the market range and the recommended rent
  (`lib/lease-renewal/renewal-message-content.ts`, the `SUPPLIED_RENEWAL_COPY` owner
  block, version v2.0). It never states the renewal dates. Its request paragraph asks
  about "this year's rent increase" only.
- The owner answer's coverage opens on "Base rent only". The broader choice, base rent
  and the renewal dates, appears only once both working dates are saved
  (`components/lease-renewal/RenewalOwnerAnswer.tsx`). With base rent only, Documents
  later says "The owner approved the base rent only. Record the owner's approval of the
  renewal dates and charges before packet execution."
  (`lib/lease-documents/owner-approval-binding.ts`). Staff discover the second approval
  four steps after the first.
- A term proposal exists with no caller: `proposeRenewalEnd` in
  `lib/lease-renewal/renewal-date-proposal.ts` returns the day before the same calendar
  day a stated number of months after the start, and asks staff to enter the end when
  that day does not repeat. No surface supplies a term, so staff type every end date.
- "Who approved" opens with nothing selected, including when the selected reply came
  from the only owner on the lease.
- Every send and dispatch check binds the approved copy's content hash and blocks a
  message whose copy is not published (`lib/gmail-hub/sequence-dependencies.ts`,
  `lib/firestore/renewal-message-publication.ts`). Replacing the one copy constant would
  therefore hold every owner review and pause every unsent authorized owner message at
  release until an approver published the new text. R-S285-6 prevents that.

Three rules produced that state and are retired by the owner's November 12, 2026
direction to carry every audit proposal: S263 R-S263-2 as first written (no term length
may be offered), S234 R-S234-1's last sentence (nothing is preselected from an incoming
message), and the September 10 owner copy that asks about rent alone. Each owning suite
is amended in place and names this suite.

Intended end state: the Working renewal terms editor offers a 12 month end date as a
deliberate choice; the owner message states the proposed term and asks for rent and term
together; the answer form opens on the coverage the message asked for; and the replying
owner is selected, with every one of those still reviewed and saved by staff.

**Actors and entry conditions.**

Renewal staff with edit capability work a fixed-term lease's current cycle. An existing
template approver publishes the new owner copy version. The owner or an authorized
representative supplies the answer. Month-to-month review, non-renewal and
housing-assistance renew-or-not messages keep their own facts and are outside this suite.

**What it is / how it functions.**

- **R-S285-1 — Suggest the renewal end from a stated term.** In the one Working renewal
  terms editor, when a renewal start is chosen or saved and the current-cycle end is
  empty, show beside manual entry the choice "Use a 12 month term (ends 12/31/2027)".
  When the current lease's verified start and end give a whole number of months other
  than 12, also show "Use the current lease's length, 6 months (ends 06/30/2027)". The
  end is the day before the same calendar day that many months after the start. Choosing
  an option fills the end field; the existing Save stores it with the basis "12 month
  term chosen by staff" or "current lease length chosen by staff". Loading the editor
  saves nothing. When the start's day does not repeat in the end month, such as a
  February 29 start, no option is shown and the existing line asks staff to enter the
  end. A changed start recomputes only an unsaved suggestion; a saved end stays and any
  inconsistency is shown for review (S263 R-S263-3). Month-to-month, non-renewal and
  inspection-only cases show no option.
- **R-S285-2 — State the term in the owner message and ask for both.** Under owner copy
  v2.1 the owner message that recommends a rent states the proposed term directly after
  the recommendation sentence, "The renewal term would run from 01/01/2027 through
  12/31/2027.", and its request paragraph asks for the rent and the term. A staff edit
  of the response request keeps the term sentence. An existing template approver
  publishes v2.1 through the existing template publication.
- **R-S285-6 — Change the wording only when an approver publishes it.** The app carries
  owner copy v2.0 and v2.1, and the copy in use is the newest version whose publication
  reads back approved. Until v2.1 is published, owner messages are composed, reviewed,
  scheduled and sent under v2.0 exactly as they are today: the release holds no review
  and pauses no message. Ask the owner shows an approver one line, "New owner wording
  that asks about the term is ready to publish.", beside the existing publish control.
  Before it publishes, the control states the consequence: "Publishing changes the owner
  message. 3 unsent owner messages were reviewed with the current wording and will be
  held for review." After publication those messages are held under the existing rule
  that changed wording needs a new review, with the cause named "The owner message
  wording was updated" (S274), and each is repaired by the one update of S273.
- **R-S285-3 — Require the renewal dates before the owner review.** While the copy in
  use states the term, the owner message's readiness list gains one line, "Renewal
  dates", read from the saved working start and end. When either is missing the line reads "Renewal dates: enter the start and end"
  and its fix opens the Working renewal terms editor in the same outcome, with the
  next-day start (S263 R-S263-1) and the end choices above. Review, Schedule and the
  Gmail draft are held as they are for a missing amount (S249 R-S249-10). The dates join
  the message's reviewed content basis, so a later date change is refused or shown as
  out of date by S272 and S273.
- **R-S285-4 — Open the answer on the coverage the message asked for.** In Record the
  owner's answer, when the cycle's latest confirmed owner message stated the renewal
  term and the saved working dates still equal the stated dates, the coverage choice
  opens on "Base rent and the renewal dates, 01/01/2027 to 12/31/2027". The form shows
  the line "The message asked about the rent and these dates." Staff can choose "Base
  rent only", and the existing review states the coverage before saving (S277 R-S277-4).
  When the dates changed after that message, or the message stated no term, the choice
  opens on "Base rent only" and the form says why: "The renewal dates changed after the
  owner message was sent." When the owner approves a different term, staff save the new
  working dates in the same outcome first; coverage binds to the current working terms
  revision as it does today (S234, S262 R-S262-3).
- **R-S285-5 — Select the owner who replied.** When the evidence is a reply selected
  from the lease's linked renewal thread, and the reply came from the address the owner
  message was sent to for exactly one owner on the current roster, "Who approved" opens
  with that owner selected and the line "Selected because this reply came from the
  address the owner message was sent to." Staff can change the selection before the
  review. Nothing is selected when two roster owners share that address, the sender
  matches no roster owner, the message is an automatic reply or a bounce, the evidence
  is another channel, or the roster is unreadable. The server computes the match when it
  lists the eligible replies and returns only the matching roster entry. The approval
  record stores the fields it stores today and no address.

**In scope / out of scope.**

In scope: the end-date choices, owner copy v2.1 and its publication, the "Renewal dates"
readiness line, the coverage default and the approver selection. Out of scope: charges in
the owner ask (S262 R-S262-3 and S264 keep their exact snapshot rule), the tenant copy,
the month-to-month and assisted variants, any parsing of an amount or a date out of a
reply, any provider write, and any change to how an approval binds to the working terms
revision.

**Open questions & assumptions.**

The owner directed that these proposals be carried. The specifics below are the author's
inference and can be changed before a launch without changing the structure:

- Assumption: the offered term is 12 months, with the current lease's length as a second
  choice. A different standard term is one constant.
- Assumption: the term sentence is "The renewal term would run from {start} through
  {end}." and the request paragraph becomes "Take a look below at similar units
  currently available in that price range and let us know how you want to proceed with
  this year's rent and whether the renewal term works for you." The owner or the client
  may supply other wording; the publication step approves the exact text.
- Assumption: once v2.1 is in use, an owner message that recommends a rent is held
  until both dates are saved. The alternative, sending without a term when dates are
  missing, would bring back the second approval.
- Assumption: messages reviewed under v2.0 are held for review when an approver
  publishes v2.1, as the existing changed-wording rule requires, and the approver is
  told the count first. The alternative, letting them send as reviewed, would change
  the dispatch rule.
- The addresses, names, amounts and dates above are synthetic rehearsal values.

**Cross-product impacts.**

The Working renewal terms editor and its date proposal, the owner copy and its
publication record, owner message readiness and the reviewed content basis, the owner
answer editor and its review, the Documents owner-approval notice, the RentVine and Sheet
date previews that read the working terms
([S278](renewal-source-updates-from-working-terms.md)), Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                                                                                           | Classification                   | Use and limitation                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Owner direction of November 12, 2026, to carry every audit proposal and retire the rules that held them                                                                                         | Owner decision                   | Authority for the end-date choice, the combined ask, the coverage default and the approver selection. The specifics are assumptions. |
| S263 R-S263-2, S234 R-S234-1, S262 R-S262-3 and S249 R-S249-10, as amended on November 12, 2026                                                                                                 | Active contracts                 | The amended rules this suite implements. Evidence-bound coverage and exact review are unchanged.                                     |
| `lib/lease-renewal/renewal-date-proposal.ts`, `lib/lease-renewal/renewal-message-content.ts`, `lib/firestore/renewal-message-publication.ts`, `components/lease-renewal/RenewalOwnerAnswer.tsx` | Committed implementation (trace) | The unused term proposal, the owner copy and its publication, and the answer editor. Re-verify before editing.                       |
| Staff workflow audit of November 12, 2026, finding A-06                                                                                                                                         | Intent evidence only             | Observed on synthetic leases in the guarded rehearsal.                                                                               |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S285-1** — The existing `proposeRenewalEnd` is the one end-date calculation. The
  editor calls it with the months staff chose and never with a value staff did not
  choose. A test that renders the editor with a saved start and an empty end and expects
  the 12 month choice fails on the starting state.
- **ARCH-S285-2** — The owner copy is a versioned set with one publication record per
  version. One resolver returns the newest published version to every composer,
  readiness check, content basis and dispatch check. Composition writes the term
  sentence from the saved working dates only under a version that states it, and the
  dates are then part of the digest the review authorizes. A dispatch test with v2.1
  present and unpublished proves that an owner message authorized under v2.0 still
  sends.
- **ARCH-S285-3** — The coverage default and the approver selection are projections
  computed on read from the confirmed owner message, the working terms revision, the
  roster and the selected reply. Neither is stored until staff save the answer through
  the existing transaction.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S285-1** — With a start of 01/01/2027 saved and no end, the editor offers "Use a
  12 month term (ends 12/31/2027)". One click fills the end and Save stores it. Opening
  and closing the editor without a choice stores nothing.
- **BEH-S285-2** — The owner review shows the recommended rent and "The renewal term
  would run from 01/01/2027 through 12/31/2027." With no dates saved, the readiness list
  shows "Renewal dates: enter the start and end" and the review is held.
- **BEH-S285-3** — After the owner replies to that message, Record the owner's answer
  opens with the replying owner selected and the coverage on "Base rent and the renewal
  dates, 01/01/2027 to 12/31/2027". Staff affirm the amount, review and save. Documents
  asks for no second approval of the dates.
- **BEH-S285-4** — When the owner approves a 6 month term instead, staff change the
  working end in the same outcome, the coverage names the new dates, and the tenant
  offer, the RentVine preview and the packet facts read them.
- **BEH-S285-5** — After the release and before publication, an owner message scheduled
  earlier sends at its time with its reviewed wording and a new owner review works as it
  did. When an approver publishes, the count stated beforehand equals the messages then
  held, and each is repaired in one update.

**Human litmus outcome.**

### Ask once, record once

**If this was built correctly:** Staff pick the suggested end date with one click, the
owner reads the rent and the term in one message, and when the owner says yes staff
record it once, with the owner already selected, and Documents does not ask again about
the dates.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome       | Human litmus          | Deterministic evidence / falsification                                     |
| --------------------------------------------- | -------------------- | ---------------------- | --------------------- | -------------------------------------------------------------------------- |
| R-S285-1 suggested end date                   | ARCH-S285-1          | BEH-S285-1             | Ask once, record once | AC-S285-1. Calendar boundaries, both choices, nothing saved on load.       |
| R-S285-2 term in the owner message            | ARCH-S285-2          | BEH-S285-2             | Ask once, record once | AC-S285-2. Copy version, publication gate and the composed sentence.       |
| R-S285-3 dates before the owner review        | ARCH-S285-2          | BEH-S285-2             | Ask once, record once | AC-S285-2. Readiness line, hold, fix landing and content basis.            |
| R-S285-4 coverage the message asked for       | ARCH-S285-3          | BEH-S285-3, BEH-S285-4 | Ask once, record once | AC-S285-3. Default in each case and the Documents result.                  |
| R-S285-5 the owner who replied                | ARCH-S285-3          | BEH-S285-3             | Ask once, record once | AC-S285-4. One positive and five negative cases, no address stored.        |
| R-S285-6 wording changes only on publication  | ARCH-S285-2          | BEH-S285-5             | Ask once, record once | AC-S285-2. Nothing held by the release; stated count equals messages held. |
| Safety boundary across the requirements above | ARCH-S285-3          | BEH-S285-1             | Ask once, record once | AC-S285-5. No save, send or provider write outside the staff action shown. |

**Preservation set.**

- `tests/unit/s263-renewal-date-proposal.test.ts` and
  `tests/unit/s263-working-date-suggestion.test.tsx`: the next-day start, date-only
  arithmetic and a saved date winning over a suggestion. The cases that assert no end is
  ever offered are rewritten on purpose for R-S285-1.
- `tests/unit/s262-owner-answer-editor.test.tsx`: "Amount approved" starts empty and the
  order of Outcome, amount and evidence. Its "Base rent only is the default" case is
  rewritten on purpose for R-S285-4.
- `tests/unit/s262-owner-approval-scope.test.ts`: coverage equals the evidence staff
  saved (AC-S262-3).
- `tests/unit/s234-owner-approval-form.test.tsx` and
  `tests/unit/s234-approval-coverage.test.tsx`: the approving party, channel and time are
  required, and coverage binds to the working terms revision. Any case that asserts an
  empty approver for a linked reply from the sole owner is rewritten on purpose for
  R-S285-5.
- `tests/unit/s249-one-message-record.test.ts`: the recommendation sentence and every
  v2.0 assertion, which stay true while v2.0 is the copy in use. A v2.1 case is added.
- `tests/firestore/s188-s191-communication-sequences.test.ts`: an owner message
  authorized before this suite ships still dispatches as reviewed.
- The month-to-month, non-renewal and assisted owner messages and their tests.

**Adversarial acceptance checks.**

- **AC-S285-1** — Falsify ARCH-S285-1 and BEH-S285-1. Starts of 01/01, 12/01, 01/31 and
  03/01 give ends of 12/31, 11/30, 01/30 and the last day of February, with a leap year
  in the set. A February 29 start offers no choice and shows the enter-the-end line. A 6
  month current lease adds the second choice and a 12 month one does not. Mount and
  unmount the editor: zero saves. Change the start after choosing and before saving: the
  suggestion follows. Change it after saving: the saved end stays and the inconsistency
  is shown.
- **AC-S285-2** — Falsify ARCH-S285-2, BEH-S285-2 and BEH-S285-5. With copy v2.1
  unpublished: an owner message is composed, reviewed, scheduled and dispatched under
  v2.0 with no hold and no pause, no "Renewal dates" line appears, an approver sees the
  ready-to-publish line and an Editor sees no publish control. The publish control
  states the count of unsent authorized owner messages, and that count equals the
  messages held after publishing, each with the named cause and one update to repair
  it. After publication the composed message holds the term sentence once, after the
  recommendation, in the HTML and the plain text. With a date missing, Review, Schedule
  and the Gmail draft are held and the fix lands in the editor. Change a date after the
  review: the authorization's content basis no longer matches. A custom response
  request keeps the term sentence. A month-to-month or assisted owner message is
  unchanged under either version.
- **AC-S285-3** — Falsify BEH-S285-3 and BEH-S285-4. Message with a term, dates
  unchanged: the form opens on the broader coverage and Documents shows no dates notice
  after saving. Dates changed after the message: it opens on "Base rent only" with the
  reason. A message sent before this suite, with no term: "Base rent only". A different
  approved term: the working dates are saved first and the coverage names them. In every
  case the saved coverage equals what staff chose in the review.
- **AC-S285-4** — Falsify ARCH-S285-3 for the approver. One roster owner and a reply
  from the address the message went to: selected, with the reason line. Two owners
  sharing the address, a sender on no roster, an automatic reply, a bounce, another
  channel and an unreadable roster: nothing selected. Staff change the selection and the
  record stores their choice. The stored record holds no address field.
- **AC-S285-5** — Safety. No end date, coverage or approver is stored without a staff
  save. No amount or date is read out of a reply. No message is sent, and no RentVine,
  Sheet or Dotloop write occurs, during any check above.

**Forbidden actions / hard gates.**

No end date saved without the staff choice and Save. No term other than the one staff
chose or typed. No coverage wider than the evidence staff reviewed. No approver stored
from a suggestion staff did not review. No amount, date or decision parsed from a reply.
No owner copy in use before its publication reads back approved. No review held and no
authorized message paused by the release itself. No provider write, send or protected
path edit.

**Dependencies / sequencing.**

Build after [S277](renewal-rent-basis-affirmation-and-agreement-adoption.md), which adds
the affirmation and the coverage statement to the same answer editor. The content basis
check uses [S272](renewal-one-current-message-per-audience.md) when it is present. S281
reveals the same Working renewal terms editor in place on the Offer step. S284 qualifies
the batch.

**Standalone delivery contract.**

- **Deliverable now:** The end-date choices, copy v2.1 with its publication control and
  the transition that holds nothing, the readiness line, the coverage default and the
  approver selection, with tests, Help rows and control map rows, reaching
  `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S272's content basis. Without it the dates still
  enter the existing material source check for the message.
- **Externally blocked effect:** The publication of copy v2.1 in production is a staff
  action by an existing template approver, at a time they choose. Until then production
  keeps asking about rent alone under v2.0, and nothing is held. No other input is
  missing.
- **Produces for downstream suites:** A stated term in the owner message and a coverage
  that Documents reads without a second owner contact.

**Verification and delivery contract.**

1. Before editing, prove BEH-S285-1, BEH-S285-2 and BEH-S285-3 fail on the starting
   state for the expected reason, and record the preservation baseline separately.
2. Run focused unit and rendered checks for every ARCH, BEH and AC row, with synthetic
   leases, the mail stand-in and no provider effect.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates. The
   release publishes no copy: publishing v2.1 is a separate staff action.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the date proposal, the owner copy, the publication and the answer editor.
2. Materialize the failing checks and the preservation baseline, including the pinned
   cases this suite rewrites on purpose.
3. Build the end-date choices, then copy v2.1 and the readiness line, then the coverage
   default and the approver selection.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the end-date choices, the combined owner ask and the answer defaults
are represented by verified code, tests and current facts.
