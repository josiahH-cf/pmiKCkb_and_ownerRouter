<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S248 — See and record what happened on a renewal

> Status: November 7 intake 121 revision AUTHORING READY. The original evidence rules shipped at `ef81b891`. This revision owns the shared stage, status header and recording or reconciliation of work.

**Goal.**

Staff can see what happened, who or what established it, and what they can do if the record
is incomplete or conflicting. They can record work the app cannot observe from the lease header.

**Current state / intended end state.**

Before the one-path delivery, `6491c06f` and the November 5, 2026 read-only production
observation established the following starting state.

- The lease status is decided by the staff record alone. A linked Gmail thread's waiting fact is
  compared with it and can only produce "Needs a check"; it never advances the lease
  (`lib/lease-renewal/lease-work-status.ts`).
- The in-app guide tells staff, after a message goes out, to choose the Owner outreach outcome by
  hand and then to set the work status by hand (`lib/help/content/guides/communications.ts`,
  `lib/help/content/guides/lease-renewals.ts`).
- The staff activity summary starts every lease at Owner outreach and waits for staff entries
  (`lib/lease-renewal/workspace-state.ts`).
- Observed: both leases staff worked through the owner message on November 4, one of which was
  sent from the app and answered by the owner, still read next step "Owner outreach" and "Waiting
  on: the PMI KC team" on the desk the next day. Three leases whose RentVine end date had already
  moved a year or half a year later still read In progress with an owner step as the next action.
- The app already records per-message delivery evidence and observed replies for linked renewal
  communications (S233, S191) and the change between a recorded cycle date and the current RentVine
  end date (`lib/lease-renewal/cycle-source-date.ts`).

In the November 7 guarded replay of `ef81b891`, Guided showed one stage above the path.
"Set status by hand" sat below the current action and sent keyboard focus to a separate
staff-status select. Visiting the tenant step kept the owner stage. An earlier guarded
run established the synthetic send, reply, bounce, correction and completion behavior.
The working batch retained its target and labeled a missing RentVine status. A fresh
read after the existing per-user refresh window cleared the warning. The revision
keeps the shared evidence projection and makes its current result and authorized
recording action available together by the lease identity.

**Actors and entry conditions.**

Renewal staff who send, schedule or record renewal work; the existing responsible-sender and role
rules decide who may send. Evidence comes only from the lease's own linked renewal communications
and its own source reads for the current cycle.

**What it is / how it functions.**

- **R-S248-1 — A confirmed send records the outreach.** When a staff member's Send for the lease's
  owner renewal message is accepted by Gmail, the same confirmed operation records Owner outreach
  for the current cycle, attributed to that message with its time and sender. The stage becomes
  "Waiting on owner response". The tenant offer behaves the same way for "Tenant offer delivered".
- **R-S248-2 — Scheduled is its own state.** A scheduled first message reads "Owner message
  scheduled for {date}" and does not count as outreach until it is accepted.
- **R-S248-3 — Unclear outcomes never advance.** A send whose outcome is not confirmed keeps the
  step open and makes "Check whether the message went out" the next step, using the existing
  reconcile action.
- **R-S248-4 — A reply changes the next step.** An observed reply on the lease's linked thread
  reads "Owner replied {date}" and makes "Record the owner's decision" the next step with the reply
  shown beside it. The Now card uses the existing bounded, authorized linked-thread read to show
  the exact observed message as plain text in client memory. Loading, missing, partial and failed
  reads are stated explicitly and a failed read can be retried in place. Try again retains
  keyboard focus while reading; success leads into the reply heading if focus is still on
  Try again. Staff who already moved to a decision keep that focus. No reply body is persisted
  or inferred from metadata. No outcome is chosen for staff (S234). A tenant reply behaves the same way.
- **R-S248-5 — A failed delivery changes the next step.** A bounce or failed delivery correlated to
  the message reads "Delivery failed" and makes "Check the address and send again" the next step.
- **R-S248-6 — A Gmail draft is not a send.** An unsent Gmail draft reads "Draft waiting in Gmail
  since {time}" and offers "I sent it from Gmail", which records the outreach as recorded by staff.
- **R-S248-7 — Source evidence closes loops.** A RentVine end date later than the recorded cycle
  date makes "Confirm this renewal is finished" the next step (S246 R-S246-5). A verified RentVine
  or Sheet update receipt marks its Finish up item done. Nothing completes a lease without a staff
  confirmation.
- **R-S248-8 — Work done outside the app still counts.** Staff can record any step by hand at any
  time through its existing record owner. The header's "Record work" opens that action.
  The selected event supplies context to the form. Its saved evidence advances the shared
  stage. A menu choice, an opened step and a Status log annotation alone have no authority to
  record a milestone. An agreeing hand record and derived evidence show as one fact.
- **R-S248-9 — Evidence fills gaps; disagreement is shown.** Evidence applies when staff have
  recorded nothing for that step. When staff recorded something different after the evidence time,
  the lease reads "Needs a check" with both facts and neither wins by itself.
- **R-S248-10 — Every derived fact is attributed and correctable.** A derived fact shows what it
  came from and when, in words distinct from "recorded by staff" and from provider-verified
  completion. "This was not the renewal outreach" removes the derived record with a reason and
  returns the step to open. It focuses the required reason when opened. "Keep it" returns to
  the correction action. Successful removal returns focus to the reopened Now heading when
  staff are still in the form; a refused attempt keeps its reason and usable focus.
- **R-S248-11 — The Sheet follows the same way.** A derived record prepares the same operating
  Sheet update proposal a staff record prepares today; applying it keeps its own exact confirmation.
- **R-S248-12 — No timers.** No reminder, deadline, follow-up message or schedule is derived from a
  stage. Elapsed time is shown as a fact ("since November 4") and nothing more.

- **R-S248-13 — See the stage and record work from the header.** Put the shared current
  stage and a secondary "Record work" control at the top left beside the lease identity
  in Guided and Full, above the path strip where shown. Show one authoritative stage using
  the existing staff vocabulary. Read-only staff can see the available stage and history
  and understand any unavailable action. "Record work" presents the applicable existing
  record or correction, including the actual event and evidence it requires. The Status log retains the separate staff annotation and notes.
  Keep "Add a note" available in the Now card. A discrepancy shows a short "Needs a check"
  cue and opens both attributed facts together. Preserve confirmation, cancel and
  keyboard focus. An eligible retire or restore entry routes to the existing
  S255 disposition action when available.
- **R-S248-14 — Show the result of the exact action.** During a save, retain the last
  confirmed stage with pending feedback. A confirmed readback shows the saved fact,
  provenance and updated stage and next step for the same cycle on lease, desk and
  Dashboard, and in the applicable My Work continuation. Return focus to the next
  relevant step if staff were following the current action, or to the saved record or
  status control if they remain there. A refused save, changed revision or unavailable
  read shows the exact reason, keeps usable input and leaves the last confirmed fact
  identifiable. For an ambiguous send or save, use its existing receipt or readback
  and reconciliation path before a new attempt. Preserve independent later work and
  avoid moving focus after the person has chosen another task.

**Journey coverage.**

| Journey and entry                                    | What staff must be able to decide and verify                                                                                                                                                          | Evidence and verification                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a lease from the desk, Dashboard or My Work     | Read the stage beside the lease identity and see whether staff, owner, tenant, the app or a missing fact needs attention. Open evidence or history when it matters.                                   | The current replay found the stage and a separate lower picker. Check the same header on Guided and Full, including read-only and unavailable evidence.                                                                                   |
| An owner was called or work happened outside the app | Open "Record work", choose the actual event, inspect the exact lease and cycle, then save or cancel. A note or stage inspection does not record that event.                                           | The replay verified the old status focus. Exercise existing staff forms and actual record readback on the candidate, with a denied and a stale-revision case.                                                                             |
| A draft is prepared, scheduled or accepted           | Distinguish unsent Gmail draft, scheduled time, accepted send, failed delivery and unknown result. Return from Communications or Gmail to the same lease and see the actual evidence and next action. | Prior J10–J11 stand-in evidence. Verify same-cycle exact acceptance and existing receipt recovery without real mail.                                                                                                                      |
| A linked reply arrives                               | Open the exact reply, distinguish unavailable and partial reads, then record the owner's or tenant's decision with the existing authority.                                                            | Prior J11. Test failed and retried linked read, a reply unrelated to the cycle, and no preselected decision.                                                                                                                              |
| Records disagree or a fact was linked incorrectly    | Open "Needs a check", compare the two dated sources, keep or correct the exact evidence with a reason. See the resulting current step and retained history.                                           | Prior J10–J11. Test agreement, conflict, cancel, success, refusal and concurrent change.                                                                                                                                                  |
| RentVine, the Sheet or a document changes            | See the source change or verified update for its own step. Confirm staff completion or record actual signature evidence through its existing control.                                                 | The replay saw the later-end-date confirmation and a working-batch source warning clear on a fresh read. Prior J12 observed explicit synthetic completion. A receipt, an uploaded file or a returned tab alone proves only its own event. |
| A read or save is interrupted                        | Distinguish a retryable read, a refused save and a pending or unknown effect. Reopen the same evidence with usable input and the correct recovery action.                                             | Exercise permission, source failure, delayed readback and ambiguous-response fixtures. S258 covers view and input continuity.                                                                                                             |

**In scope / out of scope.**

In scope: shared stage evidence, the header status and recording interaction, the outreach
record from confirmed Send, attribution, correction and Sheet proposal parity. Out of scope: reading any mailbox
content beyond the existing linked-thread observation, inferring an owner or tenant decision from a
message, automatic sends or follow-ups, new provider reads, and the existing approval evidence form.

**Open questions & assumptions.**

- D-OP-8 (owner decision, November 5, 2026): a confirmed send from the app records the outreach and moves the stage
  without a second staff entry.
- Assumption: only a communication linked to this lease, this audience and the current cycle counts.
  An unlinked or earlier-cycle message is ignored.
- Assumption: when the outreach record cannot be saved after a successful send, the send is neither
  repeated nor reported as failed; the next read rebuilds the record from the delivery evidence.

**Cross-product impacts.**

`lib/lease-renewal/renewal-stage.ts`, `lib/lease-renewal/renewal-stage-context.ts`,
`components/lease-renewal/RenewalWorkStatusControl.tsx`, `lib/lease-renewal/lease-work-status.ts`,
`lib/lease-renewal/follow-up-projection.ts`,
`lib/lease-renewal/workspace-state.ts`, `lib/lease-renewal/renewal-actions.ts`,
`lib/lease-renewal/desk-guidance.ts`, `lib/gmail-hub/sequence-service.ts`,
`lib/lease-renewal/workspace-sheet-sync.ts`, the staff activity history, the desk row, the Now card
(S247), the release reconciliation oracle that reads the staff-lane contract on desk rows, and the
help guides that today instruct the manual steps (S252).

**Authority and evidence map.**

| Input                                                                   | Classification                           | Use and limitation                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md` permanent safety boundaries; `docs/facts.md` D-TIMING-UNSET | Authority                                | No model-triggered or background send; no timer from unset policy; staff and provider facts stay distinct.         |
| Committed code and tests at `6491c06f`                                  | Implementation truth                     | Staff-record precedence, thread comparison, delivery evidence and reply observation.                               |
| Read-only production observation, November 5, 2026                      | Bounded observation                      | Sent and renewed leases still reading "Owner outreach"; counts and labels only.                                    |
| November 4 staff walkthrough notes and November 5 owner direction       | Intent evidence                          | Staff should not restate what the app already knows.                                                               |
| Gmail acceptance, reply and bounce records                              | Provider evidence                        | Accepted means Gmail took the message; it never proves delivery to a person or reading.                            |
| November 7 guarded replay and accepted Q1                               | Browser observation and confirmed intent | The stage remains visible during inspection. Bring the record action to the header and base it on actual evidence. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S248-1** — The stage projection consumes the lease cycle's per-message evidence, observed
  replies and source date change as pure inputs. Fail-first: a fixture with an accepted owner
  message and no staff entry projects next step Owner outreach.
- **ARCH-S248-2** — The confirmed Send operation writes one outreach record bound to the message
  and operation identity, idempotently; a failed record write neither repeats nor fails the send,
  and the next read reconciles it. Fail-first: no record is written by a send.
- **ARCH-S248-3** — Derived records carry their origin and are removable through one correction
  action that keeps history. Fail-first: activity records have no origin other than staff.

- **ARCH-S248-4** — The header uses the same cycle-scoped projection and existing
  evidence handlers. Changing a menu choice cannot write a milestone. Mutation feedback
  is driven by the owning result, not by a local stage selection.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S248-1** — After a confirmed Send the desk row and the lease page read "Waiting on owner
  response" with the sent time, with no further staff action.
- **BEH-S248-2** — An observed reply makes "Record the owner's decision" the next step and shows
  the reply; no outcome is preselected.
- **BEH-S248-3** — An unconfirmed send, a bounce and a scheduled message each show their own state
  and never advance the stage.
- **BEH-S248-4** — A staff record that disagrees with later-than-evidence facts reads "Needs a
  check" with both facts; a matching record shows one fact.
- **BEH-S248-5** — "This was not the renewal outreach" returns the step to open and keeps the
  history entry.

- **BEH-S248-6** — In Guided and Full, staff can see the stage, find the actual record
  or correction, and distinguish saved, waiting, failed and unknown results. A denied
  action has an honest state and retains applicable readable history.

**Human litmus outcome.**

### Send the owner message and move on

**If this was built correctly:** A staff member sends the owner message and goes back to the desk.
The lease already says it is waiting on the owner and since when. When the owner answers, the lease
says so and asks for the decision. Nobody had to pick a status from a list.

### See and record the status from the header

**If this was built correctly:** A staff member sees where the renewal stands and can
record an owner call, resolve conflicting evidence or add a note without hunting below
the current task. They know whether the update saved and can recognize the same next
step back on the desk.

- Model verdict: November 7 header revision NOT RUN. J10–J12 cover the prior stand-in
  and staff-recorded evidence. See the [review](../evidence/renewal-one-path-ux-review-2026-11-06.md)
  and [litmus](../evidence/renewal-one-path-litmus-2026-11-06.md).
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                              | Deterministic evidence / falsification                                                                          |
| ------------------------------------ | -------------------- | ---------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| R-S248-1 confirmed send records      | ARCH-S248-2          | BEH-S248-1       | Send the owner message and move on        | Sequence service test: accepted send writes one bound outreach record.                                          |
| R-S248-2 scheduled state             | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on        | Scheduled fixture reads scheduled and stays open.                                                               |
| R-S248-3 unclear never advances      | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on        | Needs-verification attempt fixture keeps the step open with reconcile.                                          |
| R-S248-4 reply changes next step     | ARCH-S248-1          | BEH-S248-2       | Send the owner message and move on        | Reply fixture: next step is the decision; outcome field unset.                                                  |
| R-S248-5 failed delivery             | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on        | Correlated bounce fixture reads delivery failed with resend step.                                               |
| R-S248-6 draft is not a send         | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on        | Draft fixture never records outreach until staff confirm.                                                       |
| R-S248-7 source evidence             | ARCH-S248-1          | BEH-S248-1       | Send the owner message and move on        | Changed source date and verified receipt fixtures; no auto completion.                                          |
| R-S248-8 outside work counts         | ARCH-S248-3          | BEH-S248-4       | Send the owner message and move on        | An opened menu leaves stage unchanged. Saved hand evidence advances it, and agreeing evidence renders one fact. |
| R-S248-9 gaps and disagreement       | ARCH-S248-1          | BEH-S248-4       | Send the owner message and move on        | Extend the S232 status tests: nothing recorded, agreeing, disagreeing.                                          |
| R-S248-10 attributed and correctable | ARCH-S248-3          | BEH-S248-5       | Send the owner message and move on        | Correction removes the derived record, keeps history, reopens the step.                                         |
| R-S248-11 Sheet parity               | ARCH-S248-2          | BEH-S248-1       | Send the owner message and move on        | Derived record prepares the same Sheet proposal as a staff record.                                              |
| R-S248-12 no timers                  | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on        | Static and behavior check: no schedule or reminder created by a stage.                                          |
| R-S248-13 header and actual work     | ARCH-S248-4          | BEH-S248-6       | See and record the status from the header | AC-S248-6. Test reading, opening, recording, annotating, cancelling and role refusal.                           |
| R-S248-14 result and recovery        | ARCH-S248-4          | BEH-S248-6       | See and record the status from the header | AC-S248-7. Check confirmed readback, stale, unavailable and ambiguous outcomes.                                 |

**Preservation set.**

The S189–S192 send, schedule, resume and reconcile contract with its exact review hashes, claims
and receipts; S191 reply pause; S233 evidence meanings; S234 approval evidence with nothing
preselected; S156 advisory guidance; the distinct meanings of staff-recorded, app-derived and
provider-verified facts; Status log entries; and the existing manual recording controls.

**Adversarial acceptance checks.**

- **AC-S248-1** — An accepted owner message with no staff entry yields "Waiting on owner response"
  on desk and lease; an unconfirmed, scheduled or bounced message does not (ARCH-S248-1,
  BEH-S248-1, BEH-S248-3).
- **AC-S248-2** — Replaying the same Send operation writes no second outreach record and sends no
  second message; a failed record write is rebuilt on the next read (ARCH-S248-2).
- **AC-S248-3** — No derived fact reads "recorded by staff" or "verified", and a reply never sets an
  owner or tenant outcome (ARCH-S248-3, BEH-S248-2).
- **AC-S248-4** — A message linked to another lease, audience or cycle changes nothing on this
  lease (R-S248-1 assumption).
- **AC-S248-5** — No send, schedule, reminder or provider write is created by any rule in this
  suite (R-S248-12).

- **AC-S248-6** — At the existing desktop and phone bounds, check the header in Guided
  and Full for an Editor and an eligible reader. Open the exact event using the keyboard.
  Test cancel, note-only, real staff evidence, agreeing and disagreeing records. Confirm
  the saved status, attribution and lease, desk and assistant parity.
- **AC-S248-7** — Delay or refuse the record read or save, conflict the version, and
  lose one permitted operation's result in the synthetic adapter. Verify prior state,
  typed inputs, exact retry or reconciliation and one readback. Check focus with and
  without intervening staff navigation. A real recorded result advances only its cycle.

**Forbidden actions / hard gates.**

No send, resend, follow-up or schedule without the existing staff confirmation. No decision
inferred from a message. No reading of mailbox content outside the existing linked-thread
observation. No change to `lib/integrations/action-gate.ts` or any Action Registry key.

**Dependencies / sequencing.**

Consumes S233 delivery evidence, S191 reply observation, S123 cycle dates and existing
staff record owners. Supplies one stage and next step to S246 and S247 and a shared
recording entry to both existing view modes. The work can use the delivered Guided
and Full views before the S258 transition. S255 owns any retirement effect.

**Standalone delivery contract.**

- **Deliverable now:** R-S248-1 to R-S248-14 with projection and sequence tests, header
  recording, correction and recovery, Sheet proposal parity and updated reconciliation rules.
- **Consumes, but does not assume:** S247 (absent: existing status line), a linked thread (absent:
  staff record only).
- **Externally blocked effect:** none.
- **Produces for downstream suites:** stage inputs for S246, S247 and S249, and the evidence rows
  S252 walks.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and the evidence available for the synthetic message states.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Bind header recording and feedback to the existing evidence handlers. Verify the
   shared projection, outreach identity, attribution and correction.
4. Falsify, run focused and canonical tests, update the oracle and help content, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S232 and
S233 history unchanged.
