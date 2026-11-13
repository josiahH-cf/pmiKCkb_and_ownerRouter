<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S274 — Refuse or hold a message only for a real change, and name it

> Status: AUTHORING READY, intake 152. Outreach integrity. Implementation and verification
> pending.

**Goal.**

A reviewed message is refused at Send, or held at its due time, only when a fact it was
reviewed on really changed, and the screen then names that fact. A lease read that is
still in progress makes the app wait, not refuse.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- Lease reads are cached for 60 seconds. The first request after that returns the cached
  rows and starts a background read (`lib/lease-renewal/live-lease-cache.ts`, line 57 and
  lines 253 to 262). That read first rewrites every lease's notice marker to a pending
  value (`lib/firestore/renewal-notice-safety.ts`, lines 160 to 187). An observation made
  on the superseded generation is not ready and returns a "not ready" block (lines 405 to
  417 of the same file; `lib/lease-renewal/current-renewal-message.ts`, lines 578 to 584).
- The message target is resolved without joining that read
  (`lib/gmail-hub/sequence-dependencies.ts`, line 112;
  `lib/lease-renewal/admitted-notice-source.ts`, lines 225 to 267). Only the Gmail draft
  path joins it (`app/api/lease-renewal/message-preparation/route.ts`, lines 334 to 340).
  The block is part of the material source digest, so the digest changes although no fact
  did. It is a race on the request that straddles the read, not every request.
- A second transient exists: on a lease with a saved retirement record, a read that is
  not fresh projects retirement as unavailable and adds its own blocker
  (`lib/lease-renewal/current-renewal-message.ts`, lines 536 to 573).
- The lease preview retries through the first transient at 1.5, 3 and 5 seconds
  (`components/lease-renewal/RenewalPreparedMessage.tsx`, lines 256 to 267 and 687 to
  695). Confirm reads once, and its digest comparison precedes its blocker check, so
  staff read "The recipients or source facts changed after the preview"
  (`lib/gmail-hub/sequence-service.ts`, lines 476 to 481 and 533). The refusal body is
  the message alone, the dialog keeps "Send this message" enabled and offers no reload.
- The worker reads once at the due time and pauses the message as "The lease or recipient
  facts changed" (`lib/gmail-hub/sequence-service.ts`, lines 946 to 1016). A test pins
  the pause for a read still in flight (`tests/firestore/s248-scheduled-notice-identity.test.ts`,
  lines 475 to 501) and a code comment documents it
  (`lib/gmail-hub/renewal-material-source.ts`, lines 13 to 16).
- In the November 12 rehearsal one of four confirmations was refused this way with
  nothing edited (audit finding A-04).

S192 ARCH-S192-3 already states that "unrelated source fields or freshness alone do not
invalidate approved wording", and ARCH-S192-7 keeps pre-dispatch read failures eligible
for bounded technical recovery. The intended end state applies those two rules to a read
in progress: confirm settles the read before comparing; the worker waits without sending
and without pausing; and a settled difference is named.

**Actors and entry conditions.**

The responsible sender confirms a reviewed message from the lease or acts in
Communications. The communication worker dispatches due work. Entry requires a reviewed
target or an existing authorization.

**What it is / how it functions.**

- **R-S274-1 — Settle the lease read before comparing at confirm.** Authorize resolves
  its target on a settled read: it joins a lease read in flight, as the Gmail draft path
  does, instead of observing a superseded generation. The wait is bounded by the window
  the lease preview already uses, three re-reads over about ten seconds.
- **R-S274-2 — Treat the retirement status the same way.** A retirement status that is
  unavailable only because the read is not fresh is settled inside the same bound before
  the comparison.
- **R-S274-3 — Say "still reading", never "changed", when the read does not settle.**
  Past the bound, return a distinct retryable result: "The lease is being re-read.
  Nothing was sent. Try again in a moment." The review dialog keeps its content and its
  confirm button. The Communications composer shows the same line. Nothing is dispatched
  and nothing is paused.
- **R-S274-4 — Make the worker wait on an unsettled read.** At dispatch, a read in
  flight, a generation that is not ready or a retirement status unavailable from a
  non-fresh read is handled like the existing unreadable-source case: no claim, no send,
  no pause, and a re-check on the next run. The message shows "Due {time}; not yet sent"
  with its lag (S233 R-S233-5). The worker pauses with "The lease or recipient facts
  changed" only when a settled read differs. The notice's material identity is unchanged:
  an observed notice, a withdrawn or reviewed notice and a source generation conflict
  still pause. This deliberately replaces the pinned pause for a read in flight; the
  test and the code comment named above are rewritten with it.
- **R-S274-5 — Name a real change at confirm.** When the settled target differs from the
  reviewed one, the refusal carries a typed reason and each changed input the review
  displayed: To and Cc, the sender signature, each content value and any new blocker
  text. The dialog reloads its preview in place, marks each changed value with its
  previous value ("Rent to recommend: was $1,400.00, now $1,425.00"), disables confirm
  while reloading and requires one more explicit confirmation of the reloaded review.
  Values come from the server's current read and only for inputs the actor already reads
  on the lease.
- **R-S274-6 — Name a real change at a hold.** When the worker pauses for a settled
  difference, it stores the changed inputs with the pause, using the values kept with the
  authorization (S272 R-S272-1) where they exist. Communications and the lease step
  (S273) show them.
- **R-S274-7 — Count the waits.** The worker's last-run counts (S233 R-S233-5) add a
  count of messages that waited on a lease read. Counts only; no record or address.

**In scope / out of scope.**

In scope: the read join and bound at confirm, the retryable result, the worker's wait,
the changed-input list at confirm and at a hold, the worker count, and the rewritten pin.
Out of scope: the notice admission marker and its version semantics, the 60-second cache
lifetime, approval invalidation that reads the full notice basis, the stale-wording and
duplicate rules ([S272](renewal-one-current-message-per-audience.md)) and lease-page
display ([S273](renewal-held-and-outdated-message-visibility.md)).

**Open questions & assumptions.**

- Assumption: waiting is fail-closed. The worker never sends on an unsettled read, so
  this change removes false holds without loosening the source check.
- Open, outside acceptance: how often production refuses this way. One read of request
  logs, counting 409 responses on the sequences route over 30 days, would size it. It is
  a guarded read to run only under a launch that authorizes it.

**Cross-product impacts.**

Sequence authorization and dispatch, the lease review dialog, the Communications
composer's error line, worker health on the Communications hub, the rewritten Firestore
test and comment, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                        | Classification                   | Use and limitation                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AGENTS.md, Permanent safety boundaries; S192 ARCH-S192-3 and ARCH-S192-7                                                     | Authority and active contract    | Exact source checks stay. Freshness alone does not invalidate approved wording.                        |
| S233 R-S233-3 to R-S233-5, S248 notice identity                                                                              | Active contracts                 | Distinct pause causes, visible lag, bounded visits, unchanged material notice identity.                |
| `lib/gmail-hub/sequence-service.ts`, `lib/gmail-hub/sequence-dependencies.ts`, `lib/lease-renewal/admitted-notice-source.ts` | Committed implementation (trace) | The race and both transients at head `878e00f9`. Re-verify lines before editing.                       |
| Staff workflow audit of November 12, 2026, finding A-04                                                                      | Intent evidence only             | One refusal in four confirmations on synthetic data. Its cause was traced after the audit was written. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S274-1** — One target resolution used by confirm joins an in-flight lease read
  within a stated bound and reports settled, or not settled, as a typed result. A test
  that commits an admission between the floor reads and the notice observation fails on
  the starting state with the "changed" refusal.
- **ARCH-S274-2** — Dispatch distinguishes not settled from changed before any claim.
  Not settled writes an observation with its reason and no pause.
- **ARCH-S274-3** — The refusal and the pause carry a typed list of changed inputs.
  Staff text for the dialog, the composer and the lease derives from that list.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S274-1** — Open a review, wait 90 seconds without editing and Send. It sends.
  Ten repetitions give ten sends and no refusal.
- **BEH-S274-2** — Open a review, change the rent to recommend in another tab and Send.
  It is refused once, the dialog names "Rent to recommend" with both values and shows the
  refreshed message, and a second Send sends that message.
- **BEH-S274-3** — Make a scheduled message due while a lease read is in flight. The tick
  sends none and holds none. The next tick, on the settled read with unchanged facts,
  sends one.
- **BEH-S274-4** — Make a scheduled message due after a real change. The tick holds it
  and the pause lists the changed input with both values.
- **BEH-S274-5** — Keep the read unsettled past the bound at confirm. The dialog shows
  the "still reading" line with its content and button intact, and nothing is sent.

**Human litmus outcome.**

### A Send is refused only when something changed

**If this was built correctly:** A staff member who reviews a message and clicks Send a
minute later sees it go. When a rent, date or recipient really changed in between, the
dialog says which one, shows the new message and asks them to confirm it. A scheduled
message is never marked "facts changed" when nothing did.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| R-S274-1 settle before comparing              | ARCH-S274-1          | BEH-S274-1       | A Send is refused only when something changed | AC-S274-1. Injected admission race and ten timed confirmations.             |
| R-S274-2 retirement status                    | ARCH-S274-1          | BEH-S274-1       | A Send is refused only when something changed | AC-S274-1. Lease with a saved retirement record on a non-fresh read.        |
| R-S274-3 still reading result                 | ARCH-S274-1          | BEH-S274-5       | A Send is refused only when something changed | AC-S274-2. Typed retryable result and intact dialog.                        |
| R-S274-4 worker waits                         | ARCH-S274-2          | BEH-S274-3       | A Send is refused only when something changed | AC-S274-3. Rewritten in-flight test; other notice identity tests.           |
| R-S274-5 named change at confirm              | ARCH-S274-3          | BEH-S274-2       | A Send is refused only when something changed | AC-S274-4. One change per input kind, reloaded preview, second Send.        |
| R-S274-6 named change at a hold               | ARCH-S274-3          | BEH-S274-4       | A Send is refused only when something changed | AC-S274-5. Pause record with inputs and values.                             |
| R-S274-7 wait count                           | ARCH-S274-2          | BEH-S274-3       | A Send is refused only when something changed | AC-S274-3. Last-run counts include the wait and no record or address.       |
| Safety boundary across the requirements above | ARCH-S274-1          | BEH-S274-1       | A Send is refused only when something changed | AC-S274-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/firestore/s248-scheduled-notice-identity.test.ts`: the five tests other than the
  in-flight pause stay green unchanged.
- `tests/unit/s248-renewal-material-source.test.ts`: the notice identity read by the
  material source digest.
- `tests/unit/s249-now-card-message.test.tsx`: "BEH-S249-1: a review read while the lease
  read is being replaced is read again and then shown".
- `tests/unit/s187-s192-communication-sequence.test.ts`: "holds a changed authoritative
  target but recovers a pre-claim source outage under unchanged approval".
- `tests/firestore/s188-s191-communication-sequences.test.ts`: one provider attempt under
  concurrent workers.

**Adversarial acceptance checks.**

- **AC-S274-1** — Falsify ARCH-S274-1 and BEH-S274-1. Inject an admission that commits
  after the floor reads and before the notice observation, then confirm: the message is
  authorized. Repeat on a lease with a saved retirement record. In the rehearsal, wait 90
  seconds in an open review and Send, ten times: ten sends, zero refusals.
- **AC-S274-2** — Falsify BEH-S274-5. Hold the read open past the bound. The result is
  the typed retryable one, the dialog keeps its content and button, the mailbox is
  unchanged and no pause exists.
- **AC-S274-3** — Falsify ARCH-S274-2 and BEH-S274-3 with the rewritten test: a due
  message checked during an admitted read is neither sent nor paused, sends on the next
  settled check when facts are unchanged, and pauses when they differ. An observed
  notice, a withdrawn notice and a generation conflict still pause. The last-run counts
  show the wait.
- **AC-S274-4** — Falsify ARCH-S274-3 and BEH-S274-2. Change, one at a time, a recipient,
  the signature, the rent to recommend, a working date and an applicable charge between
  review and confirm. Each refusal names that input with both values, the preview reloads
  in place and a second confirmation sends the reloaded message exactly once.
- **AC-S274-5** — Falsify BEH-S274-4. A settled difference at the due time pauses the
  message with the changed inputs stored; Communications and the lease show them.
- **AC-S274-6** — Safety. No path sends on an unsettled or unreadable read. An unreadable
  source is never treated as unchanged. The notice marker, its admission and its version
  are byte-identical before and after.

**Forbidden actions / hard gates.**

Never send on an unsettled read. No change to notice admission, the marker's version
semantics or approval invalidation. No customer send as test proof. No protected path
edit. No lengthening of a wait beyond the stated bound without a new decision.

**Dependencies / sequencing.**

Standalone. S272 and S273 consume the settled read and the changed-input list. S284
qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The read join and bound, the retryable result, the worker's wait,
  the named changes, the count, the rewritten pin and comment, tests and Help rows,
  reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S272's stored values. Without them a hold lists the
  changed input labels without the earlier values.
- **Externally blocked effect:** None. The production refusal count is separate evidence.
- **Produces for downstream suites:** A typed settled or not-settled target and a typed
  changed-input list.

**Verification and delivery contract.**

1. Before editing, reproduce the refusal with the injected race and record the
   preservation baseline separately. An unrelated failing test is not fail-first evidence.
2. Run focused unit and Firestore checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the race, both transients and the pinned test on the current source.
2. Materialize the failing checks and the preservation baseline.
3. Join the read at confirm, then the worker's wait, then the changed-input list.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the settled read, the worker's wait and the named changes are
represented by verified code, tests and current facts.
