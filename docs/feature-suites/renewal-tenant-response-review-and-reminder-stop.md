<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S276 — Save a tenant response deliberately, stop its reminders and open follow-ups filled in

> Status: AUTHORING READY, intake 154. Replies and responses. Revised on November 12,
> 2026 to carry the filled-in follow-up form by owner direction. Implementation and
> verification pending.

**Goal.**

Staff record the tenant's response with one visible Save that shows what it answers, no
reminder goes to a tenant whose response is already recorded, and the follow-up form
opens with a usable message and timing that staff review instead of typing.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- The tenant response is a select that saves on change, with no summary and no Save
  (`components/lease-renewal/RenewalManualWorkspace.tsx`, lines 1127 to 1429; the change
  handler is at lines 1288 to 1292). The owner response on the same form family has an
  explicit review (S262).
- The save records the outcome, the staff actor, the time, the terms revisions and an
  optional free-text source. It records no summary of the offer shown to staff.
- A recorded decline reaches the send path only as a target blocker
  (`lib/lease-renewal/notice-safety.ts`, lines 136 to 146). The next due reminder is then
  paused as "The lease or recipient facts changed". A recorded acceptance or change
  request is in no send basis, so authorized reminders keep going.
- An observed reply or bounce on the linked thread already pauses unsent reminders
  (`lib/gmail-hub/sequence-store.ts`, lines 718 to 739; S189 R-S189-11).
- In the tenant offer review, ticking "Authorize follow-ups after the tenant offer" opens
  "Follow-up message and timing" with every field blank: subject, message, "Every how
  many days", local send time, end date and total limit
  (`components/lease-renewal/RenewalPreparedMessage.tsx`). The time zone alone starts on
  Central. The renewal notice rules hold a follow-up interval, 10 days until an Admin
  saves another value (`lib/lease-renewal/notice-rules.ts`), that the form does not read.
  No follow-up wording is published.

In the November 12 rehearsal "Accepted" saved the moment it was chosen, and the follow-up
form started blank on every lease (audit findings A-16 and A-17).

The blank form followed S189 R-S189-9 as first written, which forbade any starting
cadence. The owner's November 12, 2026 direction retires that part of the rule: the form
may open with starting values. S189 is amended in place and names this suite.

Intended end state: the response is saved by one visible Save after staff see which offer
it answers and what happens next; saving any response pauses that offer's unsent
reminders at once, under a cause that says so; a due reminder is held even if that pause
could not be written; and the follow-up form opens complete and editable, with nothing
authorized until staff confirm the existing review.

**Actors and entry conditions.**

Renewal staff with edit capability record a tenant response on the Offer the tenant step
or its Full section, from a call, a message or any other source. The communication
worker dispatches reminders. Entry requires the lease's current cycle; a sent offer is
not required.

**What it is / how it functions.**

- **R-S276-1 — Save with one visible action.** Choosing a tenant response no longer
  saves. The form shows a short summary and a Save button: the chosen response; the offer
  it answers (working base rent, start and end dates and the selected charges total from
  the current offer snapshot, or "No offer has been sent from the app yet"); and what
  follows ("Reminders for this offer stop. Next: send the renewal information form.").
  Cancel or leaving the form saves nothing and keeps the earlier response. The existing
  optional source note stays optional (S156 R-S156-3); no attestation or checkbox is
  added (S156 R-S156-7). Guided and Full use the same single form.
- **R-S276-2 — Stop reminders when a response is recorded.** Saving accepted, a change
  request or a decline pauses the unsent follow-ups of that lease's tenant sequence for
  the cycle, with a new cause, "The tenant's response was recorded by staff", and the
  actor. The pause is written with the response or immediately after it.
- **R-S276-3 — Hold a due reminder even if the pause was not written.** Dispatch reads
  the recorded tenant response as part of its checks. A reminder that becomes due after
  a response is recorded is paused with the same cause and never sent. If the pause
  write failed at save time, the step says "Reminders are still scheduled. Stop them."
  with a retry, and the response stays saved.
- **R-S276-4 — Label a decline as a response.** A recorded decline pauses reminders under
  the cause above, at save time, not as changed lease facts at the next due time. The
  decline's existing effect on the renewal path is unchanged.
- **R-S276-5 — Do not resume by clearing.** Changing the response back to its unset
  state leaves reminders paused. Staff resume in Communications under the existing review
  (S233 R-S233-3 and R-S233-7; S272).
- **R-S276-6 — Keep observed replies separate.** A verified tenant reply still pauses
  reminders on its own (S189 R-S189-11). Recording a response marks no message as read,
  records no provider fact and sends nothing.
- **R-S276-7 — Open the follow-up form filled in.** The option "Authorize follow-ups
  after the tenant offer" still starts unticked. When staff tick it, "Follow-up message
  and timing" opens with: the subject of the offer being reviewed; the published
  follow-up message filled from the same reviewed facts as the offer; "Every how many
  days" from the renewal notice rules' follow-up interval (10 unless an Admin saved
  another value); local send time 9:00 AM; Central time; and a total limit of 3 messages,
  the offer plus two follow-ups. The end date stays blank. One line under the legend
  says "Filled in to start: every 10 days at 9:00 AM Central, 3 messages in total, and
  the standard follow-up message. Change anything before you review." Every field stays
  editable and every existing validation, preview and refusal of S189 R-S189-9 applies
  to the values staff confirm. Unticking and ticking again restores what staff last
  typed in this review, not the starting values.
- **R-S276-8 — Publish the follow-up message with the tenant copy.** The tenant copy
  gains one follow-up body: "We are following up on your lease renewal offer for
  {property address}. Your lease ends on {lease end date}." then the offer's existing
  terms sentence with the reviewed rent and dates, then "Please let us know whether you
  plan to stay or leave, and we'll get the documents out if you plan to stay." It uses
  the existing first-name greeting and sender signature rules. The copy version moves
  through the existing template publication by an existing template approver. Until the
  new version reads back approved, the form opens with the timing filled in and the
  message blank, and says "The standard follow-up message is not published yet. Write
  the follow-up, or ask a template approver to publish it."

**In scope / out of scope.**

In scope: the response form's Save and summary, the reminder pause and its cause, the
dispatch check and the retry, the follow-up form's starting values and the published
follow-up message. Out of scope: the owner response (S262), follow-ups for an owner
message, any enrollment staff did not tick and confirm, and any change to how a
confirmed schedule is dispatched (S190, S192).

**Open questions & assumptions.**

- Assumption, taken as the safe default: any recorded tenant response ends reminders for
  that offer. No record settles this for a staff-recorded response; S189 R-S189-11
  settles it for an observed reply. The default sends less, never more, and Resume
  reverses it. The renewal lead can confirm it at staff review.
- The next-step sentence in the summary uses the step the path projects, not fixed text.
- The owner directed on November 12, 2026 that the follow-up form open filled in. The
  starting values are the author's inference and can be changed before a launch: the
  notice rules' interval (10 days today), 9:00 AM Central, 3 messages in total, and the
  follow-up wording in R-S276-8. The owner or the client may supply other wording; the
  publication step approves the exact text.
- Assumption: the interval is read from the renewal notice rules whether or not an Admin
  has confirmed them, because here it is an editable starting value that staff review,
  never a schedule on its own. The other notice-rule values stay unused by this form.

**Cross-product impacts.**

The tenant response form in Guided and Full, the workspace save route, the sequence
pause causes and labels, dispatch checks, the Communications detail, the tenant offer
review's follow-up form, the tenant copy and its publication record, Help and the
control map.

**Authority and evidence map.**

| Input                                                                                                                                                                                   | Classification                   | Use and limitation                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| AGENTS.md, Permanent safety boundaries                                                                                                                                                  | Authority                        | Ordinary staff edits use one visible Save. No new send authority.                                              |
| Owner direction of November 12, 2026, to carry every audit proposal and retire the rules that held them                                                                                 | Owner decision                   | Authority for the follow-up form's starting values. The values and the wording are assumptions.                |
| S156 R-S156-3 and R-S156-7, S189 R-S189-9 as amended and R-S189-11, S264 offer snapshot, S262                                                                                           | Active contracts                 | No mandatory narrative, reviewed recurrence inputs, reply pause, the offer a response answers.                 |
| `components/lease-renewal/RenewalManualWorkspace.tsx`, `lib/lease-renewal/notice-safety.ts`, `components/lease-renewal/RenewalPreparedMessage.tsx`, `lib/lease-renewal/notice-rules.ts` | Committed implementation (trace) | Save on change, the decline path, the blank follow-up form and the stored interval. Re-verify before editing.  |
| Staff workflow audit of November 12, 2026, findings A-16 and A-17                                                                                                                       | Intent evidence only             | Observed save on selection and the blank form. The trace corrected what is recorded and when a decline pauses. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S276-1** — The tenant response is committed only by an explicit save call. A
  component test that changes the select and asserts no request fails on the starting
  state.
- **ARCH-S276-2** — A recorded tenant response is an input to dispatch for the lease's
  tenant sequence in that cycle, checked before any claim, with its own pause cause in
  the cause list and label map.
- **ARCH-S276-3** — The follow-up form's starting values come from one projection of the
  notice rules' interval, the fixed time and limit, and the published follow-up copy.
  They are form state only. The authorization still stores exactly what staff confirmed,
  and no schedule exists before that confirmation. A test that ticks the option and
  expects filled fields fails on the starting state.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S276-1** — Choose "Accepted": nothing is saved until Save. The summary names the
  offer amounts and dates and says reminders stop. Cancel leaves the earlier response.
- **BEH-S276-2** — With follow-ups authorized, save "Accepted". The next worker tick
  sends none and the communication reads "Paused: The tenant's response was recorded by
  staff."
- **BEH-S276-3** — Save a decline: the same pause and label at save time, with the
  decline's path effect unchanged.
- **BEH-S276-4** — Fail the pause write at save: the response is saved, the step offers
  "Stop them", and a reminder made due is held, not sent.
- **BEH-S276-5** — Clear the response: reminders stay paused until staff resume them.
- **BEH-S276-6** — In the tenant offer review, tick the follow-up option: the subject,
  the message, 10 days, 9:00 AM, Central and a limit of 3 are filled in, with the line
  that says so. Change the interval to 7 and confirm: the authorization holds 7. Open
  the review and leave without ticking: no follow-up is authorized.

**Human litmus outcome.**

### Record the tenant's answer and stop the reminders

**If this was built correctly:** A staff member who hears "yes" on a call picks Accepted,
sees which offer that answers and that reminders will stop, and saves. The tenant gets no
"please respond" message after that. A staff member who wants follow-ups ticks one box,
reads a message and a schedule that are already filled in, changes what they want and
confirms.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome | Human litmus                                      | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| R-S276-1 one visible Save                     | ARCH-S276-1          | BEH-S276-1       | Record the tenant's answer and stop the reminders | AC-S276-1. No request on change; summary content; Cancel.                   |
| R-S276-2 stop reminders on a response         | ARCH-S276-2          | BEH-S276-2       | Record the tenant's answer and stop the reminders | AC-S276-2. Tick sends none; cause and actor on the pause.                   |
| R-S276-3 hold a due reminder regardless       | ARCH-S276-2          | BEH-S276-4       | Record the tenant's answer and stop the reminders | AC-S276-3. Injected pause failure and a due reminder.                       |
| R-S276-4 decline labelled as a response       | ARCH-S276-2          | BEH-S276-3       | Record the tenant's answer and stop the reminders | AC-S276-2. Label at save time, not "facts changed".                         |
| R-S276-5 clearing does not resume             | ARCH-S276-2          | BEH-S276-5       | Record the tenant's answer and stop the reminders | AC-S276-4. Cleared response leaves the pause.                               |
| R-S276-6 observed replies stay separate       | ARCH-S276-2          | BEH-S276-2       | Record the tenant's answer and stop the reminders | AC-S276-4. Reply pause test unchanged; zero provider effects.               |
| R-S276-7 follow-up form opens filled in       | ARCH-S276-3          | BEH-S276-6       | Record the tenant's answer and stop the reminders | AC-S276-6. Starting values, edits kept, nothing authorized unticked.        |
| R-S276-8 published follow-up message          | ARCH-S276-3          | BEH-S276-6       | Record the tenant's answer and stop the reminders | AC-S276-7. Publication gate, composed text and the unpublished state.       |
| Safety boundary across the requirements above | ARCH-S276-1          | BEH-S276-1       | Record the tenant's answer and stop the reminders | AC-S276-5. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/firestore/s188-s191-communication-sequences.test.ts`: the pause serialized before
  claim stays out of execution and a pause after claim is preserved.
- `tests/unit/s187-s192-communication-sequence.test.ts`: a Resume reviewed before a reply
  arrived is refused with no send.
- The S264 offer decision tests: an acceptance names the exact offer it answers.
- The owner response editor tests in `tests/unit/s262-owner-answer-editor.test.tsx` stay
  unchanged.
- `tests/unit/s189-s192-schedule-calendar.test.ts`: interval, time zone, daylight saving
  and stopping-bound validation apply to the confirmed values exactly as before. Any
  case that asserts the follow-up fields start empty after the option is ticked is
  rewritten on purpose for R-S276-7.

**Adversarial acceptance checks.**

- **AC-S276-1** — Falsify ARCH-S276-1 and BEH-S276-1 in Guided and Full. Change the
  select and leave: no save request. Save: one request, with the summary content matching
  the current offer snapshot. No required note, checkbox or attestation exists.
- **AC-S276-2** — Falsify ARCH-S276-2, BEH-S276-2 and BEH-S276-3. For accepted, a change
  request and a decline with authorized follow-ups, the next tick sends zero and the
  sequence is paused with the new cause and the saving actor.
- **AC-S276-3** — Falsify BEH-S276-4. Inject a pause-write failure, make a reminder due
  and race the worker against the save: zero provider attempts after the response's save
  time. An occurrence claimed before the save is reported truthfully as sent.
- **AC-S276-4** — Falsify BEH-S276-5 and R-S276-6. Clear the response: still paused. A
  verified tenant reply with no recorded response still pauses under its own cause.
  Recording a response makes zero Gmail calls.
- **AC-S276-5** — Safety. Saving a response sends nothing, cancels nothing and changes no
  lease source. Resume remains an explicit staff action.
- **AC-S276-6** — Falsify ARCH-S276-3 and BEH-S276-6. The option is unticked on open and
  the authorization of a plain Send holds no follow-up. Tick it: the six starting values
  and the source line are present. With an Admin-saved interval of 14 the field reads 14. Edit each field, untick, tick again: the edits are kept. Clear the limit and the
  end date: the existing refusal names the missing stopping bound. The confirmed
  authorization equals the reviewed values field for field.
- **AC-S276-7** — Falsify R-S276-8. With the follow-up copy unpublished, the message
  field is blank, the line names the unpublished copy and the timing is still filled in.
  After publication the message holds the address, the lease end and the reviewed rent
  and dates once each, with the greeting and signature rules applied, and no unresolved
  token. Change the reviewed rent before confirming: the follow-up message follows it.

**Forbidden actions / hard gates.**

No automatic resume. No send triggered by a recorded response. No mandatory narrative,
attestation or approval checkbox. No follow-up enrollment that staff did not tick and
confirm, and no schedule created from the starting values alone. No follow-up copy in
use before its publication reads back approved. No protected path edit. No customer
send as test proof.

**Dependencies / sequencing.**

Standalone on the current response form and sequence engine. S272's rules govern Resume
after the pause, and its content basis covers the follow-up message. S275 supplies
observed replies. S285 moves the owner copy version through the same publication; when
both ship together they share one version. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The Save and summary, the pause and cause, the dispatch check and
  retry, the follow-up form's starting values and the follow-up copy, with tests and
  Help rows, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** The S264 offer snapshot. With none, the summary says
  no offer has been sent from the app.
- **Externally blocked effect:** The publication of the follow-up copy in production is
  a staff action by an existing template approver after release. Until then the form
  opens with the timing filled in and the message blank. The renewal lead's confirmation
  of the reminder default is a staff review item, not a gate.
- **Produces for downstream suites:** A recorded response that every send check reads.

**Verification and delivery contract.**

1. Before editing, prove BEH-S276-1, BEH-S276-2 and BEH-S276-6 fail on the starting
   state and record the preservation baseline separately.
2. Run focused unit, Firestore and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the response form, the decline path and the follow-up form on the current
   source.
2. Materialize the failing checks and the preservation baseline.
3. Build the Save and summary, then the pause and the dispatch check, then the follow-up
   form's starting values and the follow-up copy.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the Save, the pause, the dispatch check and the filled-in follow-up
form are represented by verified code, tests and current facts.
