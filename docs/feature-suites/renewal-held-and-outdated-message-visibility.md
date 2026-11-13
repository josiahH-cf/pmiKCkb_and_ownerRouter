<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S273 — Show a held or out-of-date message on the lease and update it once

> Status: AUTHORING READY, intake 151. Outreach integrity. Implementation and verification
> pending.

**Goal.**

On the lease and the desk, staff see at once when a scheduled message no longer matches
the lease or was held, see which fact differs, and repair it with one reviewed update of
the same communication.

**Current state / intended end state.**

Verified on the serving source:

- The lease's scheduled line comes from the sequence's due time, which exists only for an
  active, unsent, scheduled sequence (`lib/firestore/renewal-outreach-records.ts`, lines
  117 to 123; `lib/lease-renewal/outreach-evidence.ts`, lines 624 to 652). A sequence
  paused before any accepted send projects nothing, so the step and the desk row return
  to their default send action (`lib/lease-renewal/outreach-evidence.ts`, lines 374 to
  396). A tenant sequence paused after an accepted send does show its cause; an owner
  sequence has no equivalent.
- Nothing on the lease or the desk compares the scheduled message with the lease. The
  lease evidence carries no text, digest or revision, and the only server check is the
  worker's at the due time.
- "Scheduled for 2026-11-13 at 09:00 Central" is a client-only line set after the confirm
  (`components/lease-renewal/RenewalPreparedMessage.tsx`, lines 879 to 881). It is never
  stored and a reload removes it.
- The worker's hold raises no notification. No sequence code references notifications.
- In the November 12 rehearsal the lease showed new wording ("through 06/30/2027")
  directly above "Tenant message scheduled for 11/13/2026, 9:00 AM CST" for a message
  that still said 12/31/2027, and after the hold the lease showed no trace of it (audit
  finding A-02).

Intended end state: unsent authorized work is always shown on the step and the desk row
with its state; a difference between that message and the lease is shown on the next page
read, with both values; a held message stays visible until staff resolve it; one reviewed
action updates the same communication; and the sender is told when the worker holds a
message. S189 R-S189-11 already requires the pause reason and its recovery on the tenant
step.

**Actors and entry conditions.**

Renewal staff with edit capability read the lease and the desk. The responsible sender
with `sendEmail` performs the update. The communication worker raises the hold. Entry
requires a renewal sequence with an authorization and unsent work for the lease's current
cycle.

**What it is / how it functions.**

- **R-S273-1 — Project unsent authorized work.** The lease outreach evidence projects, for
  each audience and the current cycle, a sequence that holds an authorization and unsent
  work in one of three states: scheduled, held (paused, with its cause and time) or
  unconfirmed. A sequence paused before any accepted send no longer reads as nothing.
  Both audiences use the same projection.
- **R-S273-2 — Detect out of date on the next read.** On each lease and desk read, mark
  the unsent message out of date when either holds: the content basis stored with its
  authorization (S272 R-S272-1) differs from the lease's current content basis; or the
  lease's own message wording was saved after the authorization and its revision
  (`lib/lease-renewal/message-revision.ts`) differs from the authorized wording's
  revision. Wording edited on the communication itself is not a difference. A lease read
  that is not settled keeps the previous state (S274), so the cue does not flicker.
- **R-S273-3 — Say what is true and offer one repair.** The step (Guided Now card and the
  matching Full section) and the desk row show:
  - Still scheduled and out of date: "Scheduled offer is out of date. Term end:
    12/31/2027 in the scheduled message, 06/30/2027 on the lease." Primary action "Review
    the updated offer". Second action "Cancel the scheduled offer".
  - Held for changed facts: "Offer held on 11/12/2026, 12:21 PM CST because the lease
    changed." with the same differences and the same two actions.
  - Held for another cause: the existing cause label and that cause's existing recovery.
  - Scheduled and current: the existing line and the existing "Review the scheduled owner
    message" action stay as they are.
  - In every state: the owner step says "owner message" where the tenant step says
    "offer". An older authorization with no stored values shows the state without the
    values. The desk row shows one cue, "Scheduled message out of date" or "Message
    held", linking to the step (S246 R-S246-7 allows one actionable exception cue).
- **R-S273-4 — Update the same communication in one confirmation.** "Review the updated
  offer" opens the existing review dialog with the lease's current message, recipients
  and sender. The date and time are carried from the earlier authorization when still in
  the future; otherwise they start empty and Send now is offered. One confirmation saves
  the wording to the same sequence and authorizes that exact end state with the existing
  version checks (S192 R-S192-3). No second sequence is created and the earlier wording
  stays in the sequence history. If the authorization fails after the wording saved, the
  communication stays held with the new wording and the step offers the retry.
- **R-S273-5 — Keep earlier attempts reachable.** The step's existing Verification
  disclosure ("Verify owner terms and outreach", "Verify offer facts and delivery", S270)
  lists earlier attempts for the cycle, read only: cancelled, held and then updated, and
  unconfirmed and then resolved, each with its date and time, state and cause.
- **R-S273-6 — Tell the sender when the worker holds a message.** When dispatch pauses a
  message, raise one in-app notification for the responsible sender in the existing
  renewal communications family: title "Renewal message held", text "The tenant offer for
  101 Sample Pl was held because the lease changed.", link to that lease step. It is
  deduplicated per sequence and pause, shown only with current workflow access, and
  carries no message body and no recipient address. Any emailed transactional notice
  stays metadata only.
- **R-S273-7 — Show the stored schedule.** After a Schedule confirmation the step shows
  the stored time from the sequence, "Scheduled for 11/13/2026, 9:00 AM CST", and still
  shows it after a reload. The client-only line is removed.

**In scope / out of scope.**

In scope: the evidence projection, the comparison, step and desk wording, the one-step
update, the earlier-attempts list and the hold notification. Out of scope: the server
refusals and Communications controls ([S272](renewal-one-current-message-per-audience.md)),
read settling and the changed-input list at confirm
([S274](renewal-send-refusal-only-for-real-changes.md)), new disclosures, and any
automatic cancel or automatic resend.

**Open questions & assumptions.**

- Assumption: the update keeps the earlier scheduled time by default because staff chose
  it; staff can change it in the same review.
- The synthetic address, dates and amounts above are examples from the rehearsal data.

**Cross-product impacts.**

Outreach evidence and stage projection, the Guided and Full lease step, the monthly table
row, the review dialog entry, the notification feed and menu, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                       | Classification                   | Use and limitation                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| S189 R-S189-11, S192 R-S192-3, S247 R-S247-5, S246 R-S246-7, S270 disclosure map                                            | Active contracts                 | Pause reason and recovery on the step, one Update action, one desk cue, fixed disclosure names.      |
| `lib/lease-renewal/outreach-evidence.ts`, `lib/firestore/renewal-outreach-records.ts`, `lib/lease-renewal/renewal-stage.ts` | Committed implementation (trace) | Present projection and step states. Re-verify lines before editing.                                  |
| `docs/integration-architecture.md`                                                                                          | Authority                        | Internal transactional notices stay metadata only.                                                   |
| Staff workflow audit of November 12, 2026, finding A-02                                                                     | Intent evidence only             | Observed new wording above an old schedule and a silent hold. Synthetic data; no staff was observed. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S273-1** — One outreach evidence projection feeds the lease step and the desk
  row, including held and unconfirmed work. A projection test for a sequence paused before
  any send fails on the starting state, which returns nothing.
- **ARCH-S273-2** — The out-of-date comparison is a pure function over the stored content
  basis, the authorized wording revision and the lease's current values. It runs on read
  and never writes.
- **ARCH-S273-3** — The update saves wording and authorizes through the existing sequence
  save and authorize operations on the same sequence id, with their version checks and
  audit records. No new store.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S273-1** — Schedule a tenant offer and change nothing: the lease, the desk and
  Communications show the same wording and the same date and time.
- **BEH-S273-2** — Change the working end date after scheduling: on the next page read
  the step and the desk row show the out-of-date state with both values, before any
  worker tick.
- **BEH-S273-3** — After a worker tick the step reads held with the cause and time, the
  sender has one notification naming the lease, and the earlier attempt is listed in
  Verification.
- **BEH-S273-4** — "Review the updated offer" and one confirmation leave one sequence,
  scheduled for the original time with the new wording. One tick at that time sends one
  message with the new end date.
- **BEH-S273-5** — The same four behaviors hold for an owner message.

**Human litmus outcome.**

### See that a scheduled message is out of date

**If this was built correctly:** A staff member who edits a lease after scheduling its
offer sees, on the same screen, that the scheduled offer is out of date and which value
differs. One review updates it. If the app held a message while they were away, they are
told, and the lease still shows it.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome     | Behavior outcome       | Human litmus                                | Deterministic evidence / falsification                                      |
| --------------------------------------------- | ------------------------ | ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| R-S273-1 project unsent work                  | ARCH-S273-1              | BEH-S273-3             | See that a scheduled message is out of date | AC-S273-1. Projection for scheduled, held and unconfirmed states.           |
| R-S273-2 detect out of date on read           | ARCH-S273-2              | BEH-S273-2             | See that a scheduled message is out of date | AC-S273-2. Fact and wording differences with no worker run.                 |
| R-S273-3 state, values and actions            | ARCH-S273-1, ARCH-S273-2 | BEH-S273-2, BEH-S273-3 | See that a scheduled message is out of date | AC-S273-2 and AC-S273-3. Rendered step and desk cue.                        |
| R-S273-4 one update                           | ARCH-S273-3              | BEH-S273-4             | See that a scheduled message is out of date | AC-S273-4. One sequence, one send, failure after save.                      |
| R-S273-5 earlier attempts                     | ARCH-S273-1              | BEH-S273-3             | See that a scheduled message is out of date | AC-S273-3. Read-only list with zero effects.                                |
| R-S273-6 hold notification                    | ARCH-S273-1              | BEH-S273-3             | See that a scheduled message is out of date | AC-S273-5. One notification, access and content limits.                     |
| R-S273-7 stored schedule                      | ARCH-S273-1              | BEH-S273-1             | See that a scheduled message is out of date | AC-S273-1. Same time after reload.                                          |
| Safety boundary across the requirements above | ARCH-S273-1              | BEH-S273-1             | See that a scheduled message is out of date | AC-S273-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/unit/s248-outreach-evidence.test.ts`: "an unconfirmed, a scheduled or a bounced
  message never counts as outreach (BEH-S248-3)".
- `tests/unit/s248-stage-review-fixes.test.ts`: the scheduled step keeps "Review the
  scheduled owner message" and offers nothing to send again or record.
- `tests/unit/s247-renewal-path.test.ts` (R-S247-5) and the S270 disclosure name tests in
  `tests/unit/s270-guided-disclosures.test.tsx`.
- `tests/unit/gmail-workflow-notifications.test.ts`: existing notifications keep their
  content limits.

**Adversarial acceptance checks.**

- **AC-S273-1** — Falsify ARCH-S273-1 and BEH-S273-1. Project a scheduled, a held
  (paused before any send) and an unconfirmed sequence for each audience. The step and
  desk row show each state. Reload after scheduling: the stored time is unchanged and in
  the settled date and time format.
- **AC-S273-2** — Falsify ARCH-S273-2 and BEH-S273-2. Change each content basis value,
  then the lease wording alone, after scheduling. Within one page read the step and the
  desk row show the out-of-date state with the values. Edit the wording on the
  communication instead: no out-of-date state. An unsettled read keeps the prior state.
- **AC-S273-3** — Falsify BEH-S273-3. Run one worker tick after the change. The step
  reads held with cause and time, Verification lists the earlier attempt, and opening it
  causes zero saves, claims or dispatches.
- **AC-S273-4** — Falsify ARCH-S273-3 and BEH-S273-4. Run the update with the carried
  time, with a past time and with a failure injected after the wording save. Exactly one
  sequence exists; the mailbox holds exactly one message with the new value; the failure
  leaves the communication held with the retry.
- **AC-S273-5** — Falsify R-S273-6. A hold produces exactly one notification for the
  responsible sender, none for a user without workflow access, no body or address in its
  payload, and a link that opens the lease step.
- **AC-S273-6** — Safety. No step in this suite sends, cancels or resumes without the
  staff confirmation it shows. BEH-S273-5 repeats AC-S273-1 to AC-S273-4 for the owner.

**Forbidden actions / hard gates.**

No automatic cancel, resume or resend. No reply body, message body or recipient address
in a notification. No new named disclosure (S270). No customer send as test proof. No
protected path edit.

**Dependencies / sequencing.**

Consumes S272's stored content basis and typed reasons; with S272 absent the state shows
without values and the update uses the existing save and authorize. S274 supplies the
settled read. S280 lists the same held and out-of-date items on the Dashboard. S284
qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The projection, comparison, wording, update, earlier attempts and
  notification, with tests and Help rows, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S272 values (absent values read as "changed since it
  was reviewed") and S274's settled read (unsettled keeps the prior state).
- **Externally blocked effect:** None.
- **Produces for downstream suites:** Held and out-of-date items for S280 and journey
  states for S284.

**Verification and delivery contract.**

1. Before editing, record the source identity and prove BEH-S273-2 to BEH-S273-4 fail on
   the starting state in the guarded rehearsal. Keep the preservation baseline separate.
2. Run focused unit, Firestore and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the cited projection and the rehearsal reproduction.
2. Materialize the failing checks and the preservation baseline.
3. Build the projection and comparison, then the wording and update, then the
   notification.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the projection, comparison, update and notification are represented by
verified code, tests and current facts.
