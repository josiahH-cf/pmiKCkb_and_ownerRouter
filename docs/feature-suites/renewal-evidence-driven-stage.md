<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S248 — Evidence the app already holds moves the lease forward

> Status: AUTHORING READY: intake 114; implementation merged in PR #187 at `20d55104`. November 6 UX qualification continues on `codex/renewal-one-path-ux`; release pending, human verdict NOT RUN. D-OP-8 remains settled: evidence fills unrecorded work and a disagreement reads "Needs a check". This specification grants no provider effect.

**Goal.**

When the app holds evidence that a renewal step happened, the lease moves to the next stage by
itself and says why, so staff record only what the app cannot see.

**Current state / intended end state.**

Verified at `6491c06f` and by the November 5, 2026 read-only production observation:

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

Intended: the single stage projection (S247) reads that evidence. A confirmed send records the
outreach; a reply or a bounce changes the next step; staff can always correct what the app derived.

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
  time, exactly as today; a hand record and derived evidence that agree show as one fact.
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

**In scope / out of scope.**

In scope: the evidence rules above inside the stage projection, the outreach record written by a
confirmed Send, attribution, correction and Sheet proposal parity. Out of scope: reading any mailbox
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

`lib/lease-renewal/lease-work-status.ts`, `lib/lease-renewal/follow-up-projection.ts`,
`lib/lease-renewal/workspace-state.ts`, `lib/lease-renewal/renewal-actions.ts`,
`lib/lease-renewal/desk-guidance.ts`, `lib/gmail-hub/sequence-service.ts`,
`lib/lease-renewal/workspace-sheet-sync.ts`, the staff activity history, the desk row, the Now card
(S247), the release reconciliation oracle that reads the staff-lane contract on desk rows, and the
help guides that today instruct the manual steps (S252).

**Authority and evidence map.**

| Input                                                                   | Classification       | Use and limitation                                                                                         |
| ----------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` permanent safety boundaries; `docs/facts.md` D-TIMING-UNSET | Authority            | No model-triggered or background send; no timer from unset policy; staff and provider facts stay distinct. |
| Committed code and tests at `6491c06f`                                  | Implementation truth | Staff-record precedence, thread comparison, delivery evidence and reply observation.                       |
| Read-only production observation, November 5, 2026                      | Bounded observation  | Sent and renewed leases still reading "Owner outreach"; counts and labels only.                            |
| November 4 staff walkthrough notes and November 5 owner direction       | Intent evidence      | Staff should not restate what the app already knows.                                                       |
| Gmail acceptance, reply and bounce records                              | Provider evidence    | Accepted means Gmail took the message; it never proves delivery to a person or reading.                    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S248-1** — The stage projection consumes the lease cycle's per-message evidence, observed
  replies and source date change as pure inputs. Fail-first: a fixture with an accepted owner
  message and no staff entry projects next step Owner outreach.
- **ARCH-S248-2** — The confirmed Send operation writes one outreach record bound to the message
  and operation identity, idempotently; a failed record write neither repeats nor fails the send,
  and the next read reconciles it. Fail-first: no record is written by a send.
- **ARCH-S248-3** — Derived records carry their origin and are removable through one correction
  action that keeps history. Fail-first: activity records have no origin other than staff.

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

**Human litmus outcome.**

### Send the owner message and move on

**If this was built correctly:** A staff member sends the owner message and goes back to the desk.
The lease already says it is waiting on the owner and since when. When the owner answers, the lease
says so and asks for the decision. Nobody had to pick a status from a list.

- Model verdict: RUN for stand-in and staff-recorded evidence (J10–J12). Real delivery and source changes are unverified. See the [review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and [individual litmus results](../evidence/renewal-one-path-litmus-2026-11-06.md).
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                  |
| ------------------------------------ | -------------------- | ---------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| R-S248-1 confirmed send records      | ARCH-S248-2          | BEH-S248-1       | Send the owner message and move on | Sequence service test: accepted send writes one bound outreach record.  |
| R-S248-2 scheduled state             | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on | Scheduled fixture reads scheduled and stays open.                       |
| R-S248-3 unclear never advances      | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on | Needs-verification attempt fixture keeps the step open with reconcile.  |
| R-S248-4 reply changes next step     | ARCH-S248-1          | BEH-S248-2       | Send the owner message and move on | Reply fixture: next step is the decision; outcome field unset.          |
| R-S248-5 failed delivery             | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on | Correlated bounce fixture reads delivery failed with resend step.       |
| R-S248-6 draft is not a send         | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on | Draft fixture never records outreach until staff confirm.               |
| R-S248-7 source evidence             | ARCH-S248-1          | BEH-S248-1       | Send the owner message and move on | Changed source date and verified receipt fixtures; no auto completion.  |
| R-S248-8 outside work counts         | ARCH-S248-3          | BEH-S248-4       | Send the owner message and move on | Hand record with matching evidence renders one fact.                    |
| R-S248-9 gaps and disagreement       | ARCH-S248-1          | BEH-S248-4       | Send the owner message and move on | Extend the S232 status tests: nothing recorded, agreeing, disagreeing.  |
| R-S248-10 attributed and correctable | ARCH-S248-3          | BEH-S248-5       | Send the owner message and move on | Correction removes the derived record, keeps history, reopens the step. |
| R-S248-11 Sheet parity               | ARCH-S248-2          | BEH-S248-1       | Send the owner message and move on | Derived record prepares the same Sheet proposal as a staff record.      |
| R-S248-12 no timers                  | ARCH-S248-1          | BEH-S248-3       | Send the owner message and move on | Static and behavior check: no schedule or reminder created by a stage.  |

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

**Forbidden actions / hard gates.**

No send, resend, follow-up or schedule without the existing staff confirmation. No decision
inferred from a message. No reading of mailbox content outside the existing linked-thread
observation. No change to `lib/integrations/action-gate.ts` or any Action Registry key.

**Dependencies / sequencing.**

Consumes S233 delivery evidence, S191 reply observation and S123 cycle date change. Feeds the S247
stage projection and the S246 desk row. Without S247 the same rules apply to the existing status
line and next action. Independently buildable.

**Standalone delivery contract.**

- **Deliverable now:** R-S248-1 to R-S248-12 with projection tests, sequence service tests,
  correction path, Sheet proposal parity and updated reconciliation oracle rules.
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

1. Re-verify current code and the evidence available for a sent lease.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the projection inputs, the bound outreach record, attribution and correction.
4. Falsify, run focused and canonical tests, update the oracle and help content, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S232 and
S233 history unchanged.
