<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S284 — Qualify the staff workflow audit batch through staff-visible controls

> Status: AUTHORING READY, intake 162. Cumulative verification. Revised on November 12,
> 2026 for the owner-directed additions: fourteen journeys across intakes 150 to 164.
> Implementation and verification pending.

**Goal.**

One exact build proves every outcome of intakes 150 to 161, 163 and 164 the way a staff
member would reach it, with each audit sequence first shown failing on the serving
baseline, and with engineering, production and human evidence kept separate.

**Current state / intended end state.**

The [staff workflow audit](../evidence/staff-workflow-audit-2026-11-12.md) walked the
serving source `7f4cf234` in the guarded rehearsal on synthetic leases. It is product
evidence, not a verdict on a later build. Its human verdict is NOT RUN. The specification
trace that followed corrected several of its claims; those corrections are recorded in
the audit's last section and in each suite.

The trace also found a gap in earlier qualification. Journey N10-02 and the rehearsal
seed make an owner reply appear by posting the sequences refresh action directly
(`tests/browser/one-path-november-10-core-journeys.mjs`, lines 581 to 587;
`scripts/lib/one-path-rehearsal/seeds.mjs`, lines 267 to 274). The S271 engineering Yes
for the replied case therefore did not exercise a path staff can reach. S260 and S271
keep their recorded verdicts and scopes.

Intended end state: a journey driver for this batch that uses visible controls, the
existing stand-in hooks for outside parties and the worker tick for time; a fail-first
record on the baseline; one cumulative matrix on one exact compiled build; preservation
replays; and a report that separates what a machine proved from what needs a production
read or a staff observer.

**Actors and entry conditions.**

An implementation runner drives guarded synthetic checks after an explicit launch. A
permitted staff observer may review a rehearsal. The project owner authorizes any
production read named below. Real case evidence stays private.

**What it is / how it functions.**

- **R-S284-1 — Pin the baseline and the falsifications.** Before code edits, record the
  serving and source identities, the fixture identity and the rehearsal harness commit.
  Reproduce each row of the fail-first table below on the baseline and record the
  observed result. A row that does not reproduce is recorded as such with what was seen;
  it is not rewritten to pass.
- **R-S284-2 — Act only the way staff can.** Every journey reaches its state through
  visible controls. Outside parties act through the existing stand-in hooks of
  `scripts/one-path-rehearsal-control.mjs` (a delivered reply, a bounce, a draft sent
  from Gmail). Time passes through its next-send hook and the worker tick helper
  (`scripts/lib/one-path-rehearsal/due-message-tick.mjs`). A driver never posts an app
  route to produce an outcome a staff control produces. A static check over this
  batch's drivers and the seed fails on a direct call of the sequences route's refresh,
  resume, send or schedule actions.
- **R-S284-3 — Run one matrix on one exact build.** Run W12-01 to W12-14 on one compiled
  build with synthetic mail, bound to the served source and build id. Record Yes, No or
  UNVERIFIED per journey with its acceptance checks. Raw evidence stays in the private
  run directory; the committed report holds identities, counts and verdicts only.
- **R-S284-4 — Replay what must still hold.** On the same build replay the ten S260
  journeys, S271's N10-01 to N10-05 and N10-07 to N10-10 with N10-02 on the staff path
  (S275 R-S275-8), and the scoped S252 budgets. A changed pin is listed with the suite
  that changed it.
- **R-S284-5 — Keep production and human evidence separate.** Two production reads would
  size the audit's findings and are not acceptance gates: a count of completed owner
  sequences with and without a recorded inbound reply (finding A-03) and a 30-day count
  of 409 responses on the sequences route (finding A-04). Each is read-only, counts
  only, and runs only under a launch that authorizes it. A staff read-through uses
  W12-01 to W12-04 as its script. With no observer the report says
  "Human verdict: NOT RUN — no human observer".
- **R-S284-6 — Qualify the full unattended handoff.** A named launch takes intakes 150 to
  164 as one cumulative run in the order below and, if delivery is authorized, follows
  the native release runbook. Engineering checks can finish without the production
  reads or a staff observer. The owner's November 12, 2026 direction left no owner
  decision open for this batch.

### Verification journey matrix

| Journey                                | Staff scenario and proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owners                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| W12-01 Only the current offer goes out | Schedule a tenant offer, change the working end date, tick, then try every release action. Update it from the lease and send once. Repeat for an owner message and for a seeded duplicate.                                                                                                                                                                                                                                                                                                             | S272 AC-S272-1 to AC-S272-6  |
| W12-02 See the held message            | Before any tick, read the out-of-date state with both values on the lease and the desk. After a tick, read the hold, the notification and the earlier attempt. Update in one confirmation.                                                                                                                                                                                                                                                                                                             | S273 AC-S273-1 to AC-S273-6  |
| W12-03 Send through a lease re-read    | Wait 90 seconds in an open review and Send, ten times. Change a recipient, the rent and a date between review and Send. Make a message due during a read in flight and after a real change.                                                                                                                                                                                                                                                                                                            | S274 AC-S274-1 to AC-S274-6  |
| W12-04 The reply reaches the decision  | Send an owner message, deliver a reply with the stand-in, tick, and read the desk and the lease. Repeat with the lease's own check and with a failing mailbox read. Follow the notification.                                                                                                                                                                                                                                                                                                           | S275 AC-S275-1 to AC-S275-6  |
| W12-05 Record the tenant's answer      | Choose a response without saving, then save. With follow-ups authorized, confirm the next tick sends none. Fail the pause write and make a reminder due. Tick the follow-up option and read the filled form, then confirm an edited interval.                                                                                                                                                                                                                                                          | S276 AC-S276-1 to AC-S276-7  |
| W12-06 Know which rent this is         | On the covered lease follow "Set renewal base rent" and adopt the agreement amount. Affirm an equal owner amount. Record answers before and after the dates exist. Read the monthly table.                                                                                                                                                                                                                                                                                                             | S277 AC-S277-1 to AC-S277-6  |
| W12-07 Finish the source updates       | Compare the pending Market value with the reviewed recommendation. Open each form from its preview. With the deterministic Sheets adapter, review five cells together and confirm once, change one value after the preview, and inject one conflict mid-run.                                                                                                                                                                                                                                           | S278 AC-S278-1 to AC-S278-6  |
| W12-08 One status for everyone         | After a confirmed send read the step, the card and the desk row. Create a real disagreement. Read the same lease as an Editor and as an Approver. Record a tenant acceptance and read the stage.                                                                                                                                                                                                                                                                                                       | S279 AC-S279-1 to AC-S279-6  |
| W12-09 What needs me                   | Read the Dashboard after a reply, a hold and an unconfirmed send on your own leases. Create a Sheet rent and date difference on three leases and read four screens, then make RentVine unreadable on one. Age the renewal read. Read the notification menu as an Editor and as an Admin.                                                                                                                                                                                                               | S280 AC-S280-1 to AC-S280-7  |
| W12-10 See what I need, where I landed | Open Ask the owner at 1440 by 900 and 1280 by 800. Edit Rent to recommend in place. Open the named groups. Open each review mode. Follow every fix link and return. Advance a lease and read the address. Enter the dates on the Offer step. Open and close the composer. Repeat the desk and one five-tenant lease at 360, 390 and 430 px.                                                                                                                                                            | S281 AC-S281-1 to AC-S281-10 |
| W12-11 Clear an off-cycle hold         | Open the off-cycle lease, read the readiness row and the button, record "Include" with a reason, then change the source end date and correct it to a month end.                                                                                                                                                                                                                                                                                                                                        | S282 AC-S282-1 to AC-S282-5  |
| W12-12 Plain, accurate screens         | Read each listed date rendering. Filter the month to four of nine leases, read the Prepare button and line, run it and reach the allowance. Read the three pages for internal text as an Editor. Read the notice basis line as an Editor and change it as an Admin. Read Connections and the bulk actions. Read the steps of a standing-agreement lease and a default in Documents. Double-click Start run on a Space that still runs.                                                                 | S283 AC-S283-1 to AC-S283-8  |
| W12-13 Ask once, record once           | With the new owner wording unpublished, schedule an owner message and confirm it sends as reviewed. Publish the wording as an approver and read the stated count and the held message. Choose the 12 month end date. Read the owner review with the term, then remove a date and read the hold. Deliver the sole owner's reply with the stand-in and record the answer with the owner selected and the broader coverage. Read Documents. Repeat with two owners on one address and with changed dates. | S285 AC-S285-1 to AC-S285-5  |
| W12-14 One place to work a renewal     | Open each renewal Space and its card. Request a run start for each renewal process. Open a seeded earlier run and read My Work. Start a run on another Space.                                                                                                                                                                                                                                                                                                                                          | S286 AC-S286-1 to AC-S286-6  |

### Fail-first cases on the serving baseline

These are the audit's observed sequences. Each must be reproduced on `7f4cf234` before
edits and must fail there for the stated reason.

| Journey | Starting sequence                                                                                                            | Baseline result to record                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| W12-01  | Schedule a tenant offer, change the end date, tick, send a new offer from the lease, click "Resume reviewed sequence", tick. | The stand-in mailbox holds two tenant messages with different end dates on one thread.                             |
| W12-02  | After the end date change and before any tick, read the lease. After the tick, read the lease and the notifications.         | New wording above the old schedule; after the hold, no trace and no notification.                                  |
| W12-03  | Inject an admission that commits between the floor reads and the notice observation, then confirm.                           | The "recipients or source facts changed" refusal with nothing edited.                                              |
| W12-04  | Send an owner message, deliver a reply, tick, open the desk and the lease, use every visible refresh.                        | The lease keeps waiting; no visible control shows the reply.                                                       |
| W12-05  | Choose "Accepted" with follow-ups authorized, then tick at the next due time.                                                | Saved on selection; the reminder is sent.                                                                          |
| W12-06  | Open the covered lease's Offer step and follow "Set renewal base rent".                                                      | Focus on "Owner decides each renewal"; no control adopts the agreement amount.                                     |
| W12-07  | Save a recommendation that differs from the provider point estimate and read the pending Market value.                       | The pending value is the point estimate.                                                                           |
| W12-08  | Read one lease as two staff members with different mailbox links.                                                            | Different waiting status for the same lease.                                                                       |
| W12-09  | Create rent differences on three leases and read the Dashboard.                                                              | One unnamed "Current rent" row.                                                                                    |
| W12-10  | Open the Communications composer from a lease, wait two seconds and close it.                                                | One new draft communication.                                                                                       |
| W12-11  | Open the off-cycle lease and look for a control that clears the block.                                                       | None exists; five readiness rows read Ready.                                                                       |
| W12-12  | Filter December to four of nine leases and click Prepare.                                                                    | All nine leases are prepared and the button names no count.                                                        |
| W12-13  | Save a renewal start with no end, read the owner review, deliver the sole owner's reply and open the answer.                 | No end date is offered, the message states no term, the coverage opens on base rent only and no owner is selected. |
| W12-14  | Open the Owner Renewal Outreach Space and click Start run. Read the renewal Space cards.                                     | "Could not start a run." and a card that reads "Needs a process".                                                  |

### Execution order after launch

1. Verify the approved credentials and fresh main, transfer the fifteen suite files, the
   earlier suites amended on November 12 and the November 12 index section into an
   isolated checkout and run the native document and formatting checks. Record R-S284-1
   before editing code.
2. Build S274 first, because S272 and S273 compare on its settled read. Then S272, S273,
   S275 and S276 on the same sequence engine.
3. Build S277 before S278 and S285, S285 before S281, S279 before S280, and S281 before
   S282. S283 and S286 are independent. In the rehearsal W12-13 first proves that nothing
   is held while the new owner wording is unpublished, and an approver then publishes it
   through the existing control. An approver publishes the follow-up copy before W12-05
   checks the filled-in form.
4. Run the full matrix and the preservation replays on one exact compiled build. For a
   launch that includes delivery, follow the native runbook: exact-main CI, the complete
   queue, a fresh locked GO, one watcher and one application build, a zero-traffic
   candidate, receipt-bound promotion, observation and independent readback.

**In scope / out of scope.**

In scope: the driver, the static staff-path check, the fail-first record, the matrix,
the replays and the report. Out of scope: any production write, any customer send, any
billed lookup, and changing an earlier report.

**Open questions & assumptions.**

- The rehearsal has no scheduled worker; the tick helper stands in for it. Sheet writes
  stay off in the rehearsal, so W12-07's writes are proven with the deterministic Sheets
  adapter in backend tests.
- The owner's November 12, 2026 direction settled the four questions this batch first
  left open and carried the ten proposals it first set aside. The suites mark the
  inferred specifics as assumptions. Changing one changes that suite's journey, not the
  method here.
- Defaults taken in this batch and marked as assumptions in their suites: the worker
  waits on a lease read in flight (S274); any recorded tenant response stops reminders
  (S276); "waiting on you" follows your own sends (S280); the first-screen budgets on a
  phone (S281).

**Cross-product impacts.**

A new journey driver and verdict module beside the existing rehearsal drivers, the
rehearsal seed, the November 10 core journeys, the static check, a report under
`docs/evidence/`, Help captures, assurance landmarks when a default view changes, and
the release queue when delivery is authorized.

**Authority and evidence map.**

| Input                                                                                 | Classification             | Use and limitation                                                                               |
| ------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| AGENTS.md, Guarded release assurance                                                  | Authority                  | Audits and litmus runs use the guarded rehearsal, synthetic fixtures and the mail stand-in only. |
| S260 and S271 qualifications and their evidence                                       | Active contracts           | Preservation journeys and the native verdict and report shape. Their verdicts are not rewritten. |
| `scripts/run-renewal-one-path-rehearsal.sh`, `scripts/one-path-rehearsal-control.mjs` | Committed harness          | The guarded serve, the stand-in hooks and the driver entry.                                      |
| Staff workflow audit of November 12, 2026 and its correction section                  | Intent evidence only       | The observed sequences to reproduce. No staff member was observed.                               |
| Production request logs and sequence receipts                                         | External, owner-authorized | Sizing only. Never a gate, never copied into Git.                                                |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S284-1** — One driver and one verdict module own the W12 matrix, bind every row
  to the served source and build id, and refuse to score a partial run as complete.
- **ARCH-S284-2** — A static check owns the staff-path rule. It fails on the starting
  state because the seed and N10-02 post the refresh action directly.
- **ARCH-S284-3** — The report is generated from the verdict module's output and holds
  identities, counts and verdicts with no lease value, address or message text.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S284-1** — On the baseline the fail-first table reproduces and is recorded
  before any edit.
- **BEH-S284-2** — On the cumulative build W12-01 to W12-14 read Yes with zero refused
  connections other than the harness's known ones and zero unresolved effects.
- **BEH-S284-3** — The S260 and S271 replays read Yes on the same build, with N10-02 on
  the staff path.
- **BEH-S284-4** — The report states the human verdict and each production read as run
  or not run, never as inferred.

**Human litmus outcome.**

### The whole batch works the way staff work

**If this was built correctly:** Someone who was not in the room can read one report
and see, for each of the fourteen staff scenarios, that it failed before the change and
passes now, using only the buttons staff have, and can see plainly what still needs a
person or a production read.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome     | Behavior outcome       | Human litmus                             | Deterministic evidence / falsification                                      |
| --------------------------------------------- | ------------------------ | ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| R-S284-1 baseline and falsifications          | ARCH-S284-1              | BEH-S284-1             | The whole batch works the way staff work | AC-S284-1. Recorded baseline identities and fourteen results.               |
| R-S284-2 staff path only                      | ARCH-S284-2              | BEH-S284-2             | The whole batch works the way staff work | AC-S284-2. Static check fails before and passes after.                      |
| R-S284-3 one matrix on one build              | ARCH-S284-1, ARCH-S284-3 | BEH-S284-2             | The whole batch works the way staff work | AC-S284-3. Verdict bound to source and build; partial refused.              |
| R-S284-4 preservation replays                 | ARCH-S284-1              | BEH-S284-3             | The whole batch works the way staff work | AC-S284-4. S260, S271 and S252 results on the same build.                   |
| R-S284-5 separate production and human        | ARCH-S284-3              | BEH-S284-4             | The whole batch works the way staff work | AC-S284-5. Report fields for each read and the human verdict.               |
| R-S284-6 full unattended handoff              | ARCH-S284-1              | BEH-S284-2, BEH-S284-3 | The whole batch works the way staff work | AC-S284-3 and AC-S284-4. Ordered run to the cumulative build.               |
| Safety boundary across the requirements above | ARCH-S284-1              | BEH-S284-1             | The whole batch works the way staff work | AC-S284-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/browser/one-path-november-9-qualification-driver.mjs` and
  `tests/browser/one-path-november-10-qualification-driver.mjs` with their verdict
  modules.
- The mailbox-disabled rehearsal cases and the network guard's refused-connection count.
- `npm run verify:help-rendered` and the Help control and coverage checks.
- Earlier reports under `docs/evidence/` stay byte-identical.

**Adversarial acceptance checks.**

- **AC-S284-1** — Falsify BEH-S284-1. The baseline record names the served source, the
  fixture and the harness commit and holds one observed result per fail-first row. A row
  that passed on the baseline is flagged, not dropped.
- **AC-S284-2** — Falsify ARCH-S284-2. The static check fails on the starting drivers
  and seed, and passes only when no driver in the batch posts an app route for a
  staff-reachable outcome. Adding such a call to any W12 journey fails it again.
- **AC-S284-3** — Falsify ARCH-S284-1 and BEH-S284-2. A run with `--only` on a subset is
  scored incomplete. A run on a build whose id differs from the served source is
  refused. The complete run records fourteen verdicts with their acceptance check ids.
- **AC-S284-4** — Falsify BEH-S284-3. The S260 and S271 replays run on the same build
  id. Each changed pin is listed with its suite. No earlier report file changes.
- **AC-S284-5** — Falsify ARCH-S284-3 and BEH-S284-4. The report contains no lease value,
  address, recipient or message text, and its production and human fields read run or
  not run with the authorizing reference when run.
- **AC-S284-6** — Safety. The whole run makes no connection outside the guard's
  allowance, no customer send, no billed lookup and no production write.

**Forbidden actions / hard gates.**

No customer effect, provider business write, production test record, signature or billed
lookup as proof. No production read without the owner's launch naming it. No rewriting
of S254, S259, S260 or S271 evidence. No verdict inferred for a journey that did not
run. No staff acceptance recorded without an actual staff session.

**Dependencies / sequencing.**

Consumes S272 to S283, S285 and S286. Prepare its baseline first and run its matrix last.

**Standalone delivery contract.**

- **Deliverable now:** The driver, the verdict module, the static check, the baseline
  record and the report template, reaching `ALL_GATES_GREEN` for the suites that are
  built, with the others recorded as not run.
- **Consumes, but does not assume:** Each suite's acceptance checks. A suite not built
  reads UNVERIFIED, never Yes.
- **Externally blocked effect:** The two production counts and the staff read-through.
  Their fields stay `BLOCKED` or NOT RUN without failing engineering qualification.
- **Produces for downstream suites:** A staff-path rule and a matrix shape later batches
  can reuse.

**Verification and delivery contract.**

1. Before any code edit, record the baseline and the fail-first table. A failure
   unrelated to a row's stated reason is not valid fail-first evidence.
2. Run each suite's focused checks, then the matrix and the replays on one exact
   compiled build. Keep preservation as its own gate.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`
   and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.
   Separate engineering, production and human verdicts.

**Ordered prompt sequence.**

1. Re-verify the serving and source identities and the harness.
2. Record the baseline, the fail-first table and the preservation baseline.
3. Build the driver, the static check and the verdict module alongside the suites.
4. Run the matrix and replays on the cumulative build, write the report and update
   current docs.

**Deletion/merge recommendation.**

Keep active until the matrix, the static check and the report are represented by
verified code, tests and current facts.
