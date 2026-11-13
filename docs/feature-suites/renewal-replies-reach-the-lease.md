<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S275 — Bring an owner or tenant reply to the lease through visible controls

> Status: DELIVERED at ba9a64f6, intake 153. Chunk 1 run `a6f14bac-7edd-4db2-ab94-93f0875dc1ee`. The W12-04 stale-page duplicate proof follows S272 in chunk 2.

**Goal.**

When an owner or a tenant replies to a renewal message, the lease shows the reply beside
the decision within one worker run, or at once when staff ask, without any control that
staff cannot see.

**Current state / intended end state.**

S248 R-S248-4 already defines the result: an observed reply reads "Owner replied {date}"
and makes "Record the owner's decision" the next step, with the reply shown beside it. A
read-only trace of the serving source shows why staff do not get it for an ordinary owner
message:

- A sequence with one message and no follow-up becomes completed when Gmail accepts it
  (`lib/gmail-hub/sequence-store.ts`, lines 598 to 618). Owner messages are always single.
- The worker lists open sequences only and skips completed ones
  (`lib/gmail-hub/sequence-worker.ts`, lines 104 to 106 and 127 to 128).
- Gmail push is retired: the watch route answers 410
  (`app/api/gmail-hub/watch/route.ts`) and [S31](gmail-watch-inbound.md) records the
  subscription removed. The push route is the only caller that passes the sequence reply
  check (`app/api/gmail-hub/pubsub/route.ts`).
- The manual refresh and the worker's mailbox sync are built without that check
  (`lib/gmail-hub/dependencies.ts`, lines 97 to 101 and 191 to 205). History sync also
  visits only threads with messages added since the mailbox cursor
  (`lib/gmail-hub/service.ts`, lines 1531 to 1534), so it cannot recover a reply the
  cursor has passed.
- The lease reply card reads only the sequence's inbound list
  (`lib/gmail-hub/sequence-store.ts`, lines 779 to 809). Only sequence-level observation
  writes it (`lib/gmail-hub/sequence-service.ts`, lines 755 to 854), and its one control,
  "Refresh linked incoming", is not rendered for a completed communication
  (`components/gmail-hub/CommunicationComposer.tsx`, lines 659 and 1152 to 1180).
- "The app is watching: Replies and delivery reports on the owner message's Gmail thread."
  is constant text (`lib/lease-renewal/renewal-path.ts`, lines 235 to 238). The last
  check time exists on the sequence and is dropped by the lease read.
- The notification reads "Renewal communication needs review" with no lease, and the
  Linked conversations row changes the address without opening the communication
  (`lib/gmail-hub/notifications.ts`, lines 14 to 54;
  `components/gmail-hub/WorkflowCommunicationsHub.tsx`, lines 99 to 156).
- The rehearsal seed and journey N10-02 make the reply appear by posting the sequences
  refresh action directly (`scripts/lib/one-path-rehearsal/seeds.mjs`, lines 267 to 274;
  `tests/browser/one-path-november-10-core-journeys.mjs`, lines 581 to 587). The S271
  engineering Yes for the replied case therefore does not cover the staff path.

In the November 12 rehearsal a delivered owner reply never reached the lease through any
visible control (audit finding A-03). Whether production shows the same is not yet
confirmed; see the open item below.

Intended end state: a sent message stays under linked-thread observation until its answer
is known; a manual check reaches every watched message; the waiting step can check now
and says when it last checked; notifications and rows name the lease and open it; and
tests reach the reply the way staff do.

**Actors and entry conditions.**

Renewal staff with edit capability wait on an owner or tenant and may check for a reply.
The communication worker observes linked threads under the existing delegated read. Entry
requires a renewal sequence with a confirmed send for the lease's current cycle.

**What it is / how it functions.**

- **R-S275-1 — Keep watching a sent message until its answer is known.** A sequence whose
  initial send is confirmed stays under linked-thread observation while all hold: no
  answer from that audience is recorded on the lease for the cycle; the cycle is open
  (not completed, retired, a non-renewal or replaced by a new cycle); the current lease
  end date has not passed; and the sequence is not cancelled. Its state label and send
  limits are unchanged. The watch is an indexed marker so the worker's page includes
  watched sequences. Observation reads only the exact linked threads under the existing
  `gmail.mailbox.read` key and delegation, by polling, and stores message metadata only.
  Visits stay bounded as S233 R-S233-5 requires: the interval does not grow with terminal
  records, where terminal now means completed and not watched, or cancelled.
- **R-S275-2 — Make a manual check reach every watched message.** The manual Gmail check
  and the worker's mailbox sync pass the sequence reply check, and they observe each
  watched or open sequence of that mailbox directly, independent of the mailbox history
  cursor. One sequence whose thread read is incomplete is marked "not checked this run"
  (S233 R-S233-4) and does not fail the others.
- **R-S275-3 — Check from the waiting step.** While a step waits on the owner or the
  tenant, the Now card keeps naming what is watched (S247 R-S247-5) and adds "Last checked
  for a reply: 11/12/2026, 12:20 PM CST" from the sequence's observation, or "Not checked
  yet". "Check for a reply now" observes that lease's watched sequences once through the
  existing sequences refresh action and re-reads the step. A failed read shows "Reply
  check failed at 11/12/2026, 12:21 PM CST. Try again." and the step keeps waiting.
- **R-S275-4 — Let the reply lead the step.** The S248 R-S248-4 result applies to a
  completed single message: "Owner replied 11/12/2026", "Record the owner's decision"
  with the reply text read live, and the reply as an evidence choice. Nothing is
  preselected (S234 R-S234-1) and no reply body is stored. A tenant reply behaves the
  same way.
- **R-S275-5 — Show one Gmail check in Communications.** The Communications page shows one
  "Check Gmail now" on load, on the Incoming and Scheduled tabs. It runs R-S275-2 for the
  viewer's mailbox and then reloads the lists. The controls that reload stored data only
  no longer read as Gmail refreshes; a label changes only together with its pinned test
  and Help row. Connection details stay in the "Gmail connection and refresh" disclosure.
- **R-S275-6 — Name the lease.** For a renewal reply the in-app notification reads "Owner
  replied" or "Tenant replied", names the lease label the sequence stores ("101 Sample
  Pl") and opens that lease's waiting step. The Linked conversations row shows the same
  label and opens the communication on click without a page reload. The label is shown
  only with current workflow access. No reply body and no sender address appear. Any
  emailed transactional notice stays metadata only.
- **R-S275-7 — Bring existing sent messages into the watch.** On release, a sequence
  already sent whose lease has no recorded answer for an open cycle is watched by the
  same rule. A reply that arrived earlier is recorded with its actual received time.
  There is no migration write beyond the normal observation.
- **R-S275-8 — Reach the reply the staff way in tests.** The seed and the journey drivers
  deliver the reply through the mail stand-in and reach the lease state through the
  worker tick or the visible check. Direct posts of the sequences refresh action are
  removed from the seed and from journey N10-02.

**In scope / out of scope.**

In scope: the watch marker and its end conditions, refresh wiring, the lease check and
last-checked time, the Communications check, naming in notifications and rows, the
catch-up and the test path. Out of scope: re-enabling Gmail push or a watch, any new
Gmail scope, storing reply bodies, choosing an outcome for staff, and model use.

**Open questions & assumptions.**

- Assumption: the October 20 authority for linked renewal replies covers polling the
  exact linked thread of a sent message until its answer is recorded. No record says
  observation must stop when the send completes.
- Open, outside acceptance: one guarded read-only count in production of completed owner
  sequences with and without a recorded inbound reply would confirm audit finding A-03
  there. It reads counts only and runs only under a launch that authorizes it.
- The rehearsal has no scheduled worker; its tick helper stands in for the minute worker.

**Cross-product impacts.**

Sequence store and worker paging, the Gmail hub refresh factory, the lease Now card, the
Communications hub and Incoming tab, the notification feed, the rehearsal seed and the
November 10 journey driver, worker health counts, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                        | Classification                   | Use and limitation                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AGENTS.md, Permanent safety boundaries (October 20) and the open key `gmail.mailbox.read`                    | Authority                        | Linked renewal replies may be read. No general mailbox management, no model-driven effect.                    |
| S248 R-S248-4, S233 R-S233-4 and R-S233-5, S191, S234 R-S234-1, S247 R-S247-5, [S31](gmail-watch-inbound.md) | Active contracts                 | The reply result, bounded visits, no stored body, nothing preselected, what is watched, push stays retired.   |
| `lib/gmail-hub/sequence-store.ts`, `lib/gmail-hub/sequence-worker.ts`, `lib/gmail-hub/dependencies.ts`       | Committed implementation (trace) | Why a completed message is never observed. Re-verify lines before editing.                                    |
| Staff workflow audit of November 12, 2026, finding A-03                                                      | Intent evidence only             | Observed on synthetic data in a rehearsal with no scheduled worker. Production behavior is not yet confirmed. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S275-1** — A watched marker with stated end conditions makes a completed
  sequence visible to the worker's bounded page. With 4,000 terminal fixture records, a
  watched sequence is observed within the declared bound (S233 AC-S233-5 stays green).
- **ARCH-S275-2** — One refresh factory passes the sequence reply check to the manual
  refresh, the worker's mailbox sync and the push route, and observes watched sequences
  per mailbox with per-sequence failure isolation.
- **ARCH-S275-3** — The lease evidence read carries the observation's last check time and
  state. No reply body, subject or sender address is persisted by this suite.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S275-1** — Send an owner message from the lease, deliver a reply with the
  stand-in, run one worker tick and open the desk. The row reads "Record the owner's
  decision" with "Owner replied {date}"; the lease shows the reply text and the reply as
  an evidence choice. On the starting state the row keeps waiting.
- **BEH-S275-2** — With no worker run, "Check for a reply now" on the lease produces the
  same state. With the mailbox read failing, the step shows the failure line and keeps
  waiting.
- **BEH-S275-3** — The notification names the lease and opens its Ask the owner step.
  The Linked conversations row opens the communication on click.
- **BEH-S275-4** — After the answer is recorded, the cycle closes or the sequence is
  cancelled, the worker no longer visits that sequence.
- **BEH-S275-5** — A tenant reply to a completed tenant message behaves as BEH-S275-1.

**Human litmus outcome.**

### The owner's reply shows up on the lease

**If this was built correctly:** A staff member who is waiting on an owner opens the
desk the next morning and sees "Owner replied" on that lease. Opening it shows the
owner's words beside the decision. If they do not want to wait, one visible button on the
lease checks now and says when it last checked.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome     | Behavior outcome       | Human litmus                            | Deterministic evidence / falsification                                      |
| --------------------------------------------- | ------------------------ | ---------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| R-S275-1 watch until answered                 | ARCH-S275-1              | BEH-S275-1, BEH-S275-4 | The owner's reply shows up on the lease | AC-S275-1 and AC-S275-4. Tick result, end conditions, bounded visits.       |
| R-S275-2 manual check reaches all             | ARCH-S275-2              | BEH-S275-2             | The owner's reply shows up on the lease | AC-S275-2. Cursor-passed reply recovered; one failing thread isolated.      |
| R-S275-3 check from the step                  | ARCH-S275-3              | BEH-S275-2             | The owner's reply shows up on the lease | AC-S275-2. Last-checked time, check, failure line.                          |
| R-S275-4 reply leads the step                 | ARCH-S275-1, ARCH-S275-3 | BEH-S275-1, BEH-S275-5 | The owner's reply shows up on the lease | AC-S275-1. Rendered step with nothing preselected.                          |
| R-S275-5 one Gmail check                      | ARCH-S275-2              | BEH-S275-2             | The owner's reply shows up on the lease | AC-S275-3. One control visible on load brings in a delivered reply.         |
| R-S275-6 name the lease                       | ARCH-S275-3              | BEH-S275-3             | The owner's reply shows up on the lease | AC-S275-3. Notification payload, link target, access limit.                 |
| R-S275-7 existing sent messages               | ARCH-S275-1              | BEH-S275-1             | The owner's reply shows up on the lease | AC-S275-4. Pre-existing completed sequence observed once in the watch.      |
| R-S275-8 staff path in tests                  | ARCH-S275-2              | BEH-S275-1             | The owner's reply shows up on the lease | AC-S275-5. No direct refresh post in the seed or the journeys.              |
| Safety boundary across the requirements above | ARCH-S275-1              | BEH-S275-1             | The owner's reply shows up on the lease | AC-S275-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/firestore/s188-s191-communication-sequences.test.ts`: "S233 R-S233-5 pages only
  open sequences so terminal records never use the worker's budget" (terminal redefined
  as above; the 4,000-record bound stays).
- `tests/unit/s187-s192-communication-sequence.test.ts`: the worker holds legacy and
  retired-lane authorizations before any mailbox construction.
- `tests/unit/gmail-hub-pubsub.test.ts`: the idempotent manual refresh and cleared
  retired watch state.
- `tests/unit/s252-owner-decision-from-reply.test.tsx`: the reply choice names the staff
  mailbox it arrived in, never its sender.
- `tests/unit/s247-renewal-path.test.ts`: a waiting step says who, since when, the last
  contact and what is watched.
- `tests/unit/gmail-workflow-notifications.test.ts`: deduplication and self-scoped mark
  as read. Its content pin is updated to allow exactly the lease label.

**Adversarial acceptance checks.**

- **AC-S275-1** — Falsify ARCH-S275-1 and BEH-S275-1 in the guarded rehearsal with the
  mail stand-in, using only visible controls, the stand-in reply hook and the worker
  tick. The desk row, the lease reply text and the evidence choice appear. The decision
  is unselected on arrival. When staff choose an eligible owner reply, S285 R-S285-5
  selects the uniquely matched owner and shows the reason. The amount stays blank until
  staff enter it. Repeat the reply and decision checks for a tenant.
- **AC-S275-2** — Falsify ARCH-S275-2 and BEH-S275-2. With no tick, the lease check
  produces the same state. Advance the mailbox cursor past the reply first: the check
  still finds it. Fail one of two thread reads: the other sequence is observed, the
  failing one reads "not checked this run", and the step shows the failure line.
- **AC-S275-3** — Falsify BEH-S275-3. The notification text contains the lease label and
  no body or address, opens the Ask the owner step, and is absent for a user without
  workflow access. The row opens the communication without a reload. One "Check Gmail
  now" is visible on load.
- **AC-S275-4** — Falsify BEH-S275-4 and R-S275-7. Record the answer, close the cycle,
  pass the lease end date and cancel, each in turn: the worker stops visiting. A sequence
  completed before the change with an earlier reply is observed once and shows the
  reply's actual received time. With 4,000 terminal records the declared bound holds.
- **AC-S275-5** — Falsify R-S275-8. A search of the seed and the journey drivers finds no
  direct post of the sequences refresh action, and the November 10 N10-02 journey passes
  on the staff path.
- **AC-S275-6** — Safety. No Gmail watch or push call is made, no scope is added, no
  reply body is persisted, and no decision is recorded without the staff save.

**Forbidden actions / hard gates.**

No Gmail watch, push subscription or new scope. No reply body, subject or sender address
stored or placed in a notification. No automatic owner or tenant outcome. No general
mailbox reading beyond linked renewal threads. No protected path edit. No production
write as proof.

**Dependencies / sequencing.**

Standalone on the current sequence engine. S276 and S280 consume the watched state. S284
replays the November 10 journeys on the staff path.

**Standalone delivery contract.**

- **Deliverable now:** The watch, refresh wiring, lease check, Communications check,
  naming, catch-up and the staff-path tests, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S273's notification family conventions.
- **Externally blocked effect:** None for engineering. The production count of affected
  messages is separate evidence under an authorizing launch.
- **Produces for downstream suites:** A reply state every staff member with access sees
  on the lease, for S279 and S280.

**Verification and delivery contract.**

1. Before editing, reproduce BEH-S275-1 failing in the guarded rehearsal through visible
   controls and record the preservation baseline separately.
2. Run focused unit, Firestore and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the cited chain and the rehearsal reproduction.
2. Materialize the failing checks and the preservation baseline.
3. Add the watch and refresh wiring, then the lease and Communications checks, then the
   naming and the test path.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the watch, the visible checks and the staff-path tests are represented
by verified code, tests and current facts.
