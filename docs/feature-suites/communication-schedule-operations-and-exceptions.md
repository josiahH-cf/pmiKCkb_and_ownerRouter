<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S192 — Schedule operations, calendar behavior and recovery

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

Staff can pause, change, resume, cancel and transfer scheduled work in one simple interface, with understandable timezone, missed-run, failure and recovery behavior.

**Current state / intended end state.**

The starting hub has draft/reply confirmation and linked contact states but no durable configurable schedule operations. Existing notification/follow-up tools expose internal due work only. The desired schedule control plane operates S189 authorizations and S190 occurrences directly, preserving history and eliminating additional approval queues.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Ordinary authorized staff with linked workflow access can operate schedules. Responsibility transfer follows S188; a new sender authorizes future sends under their identity. Infrastructure recovery uses the approved record, not a new human consent loop for every server restart.

**What it is / how it functions.**

Show next send, timezone, recurrence, optional bounds, sender, responsible person, last successful send and current pause/error cause. Staff can pause/cancel promptly, revise draft/settings and click Update schedule once, or explicitly resume after reviewing a reply. Calendar recurrence uses selected local date/time and every X calendar days; make DST resolution visible and schedule each intended occurrence at most once. After downtime, never replay a backlog of reminders.

This is intake 064 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Operational controls, active edit/version semantics, timezone/DST projection, optional limits, missed-run and sender/permission exceptions are in scope. New cadence values, generic cron administration, hidden retries, provider deletion/unsend and editing immutable historical receipts are outside scope.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- S186 hub operational controls and shared `communication-state.ts` projections.
- S189 schedule/calendar/authorization, S190 occurrence receipts/recovery and S191 pause/observation state.
- Existing operational attention/notification owners, workflow-linked work lists and S188 staff transfer.

Starting owners are discovery anchors, not a frozen implementation allowlist. Retain one canonical contract across all actual consumers.

**Authority and evidence map.**

| Input                                                                                     | Classification                    | Use and limitation                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest October 9 owner direction and accepted clarification recommendations               | Confirmed desired behavior        | Establish the named workflow-linked communication redesign, one end-state Send/Schedule action, staff ownership, configurable recurrence, reply pause and retirement. They supersede former draft-only requirements for this future scope; they execute nothing during authoring. |
| `AGENTS.md`, S183/S184 and the selected program in the suite index                        | Authority and governance contract | Follow the selected execution scope and surviving access, identity, protected-path and delivery controls. Reconcile old blanket send restrictions explicitly during the authorized implementation rather than silently opening a key.                                             |
| Inspected WSL source/tests and current `docs/facts.md`                                    | Starting implementation evidence  | Establish existing primitives and their limitations. Current behavior does not replace the owner's new outcome.                                                                                                                                                                   |
| Supplied `feature-specs-to-scope/feature-spec-bundle/` meeting notes, PDF and screenshots | Intake evidence                   | Supply reported staff journeys and defects; they do not prove provider delivery or settle an unchosen runtime schedule.                                                                                                                                                           |
| Managed mailbox permissions, real recipient mapping and provider observations             | Runtime external input            | Absence blocks only the affected provider operation; no guessed recipient, substituted account or synthetic customer record.                                                                                                                                                      |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S192-1** — One operational projection joins authorization, occurrence, sender/responsibility and observation state without treating attempts as successes.
- **ARCH-S192-2** — Pause/cancel is durable and prevents subsequent claims; history and any in-flight attempt remain immutable and independently recoverable.
- **ARCH-S192-3** — Editing sender/recipients/content/attachments/timing creates an editable revision and pauses the active future work; one explicit Update schedule authorizes the new exact end state with version checks. An observed authoritative source change contradicting the approved target or financial/legal terms also pauses only the affected sequence; unrelated source fields or freshness alone do not invalidate approved wording.
- **ARCH-S192-4** — Resume/Update/Complete binds the reviewed pause/evidence/version; a new inbound message racing that decision cannot be silently cleared.
- **ARCH-S192-5** — Recurrence preserves the chosen local wall-clock time every X calendar days in the selected named timezone; resolve a generated nonexistent DST time forward to the first valid local time and a repeated time to one occurrence, visibly. First-entry ambiguous/nonexistent time must display its resolved instant before approval. End date is inclusive in that timezone; total send limit includes the initial confirmed send.
- **ARCH-S192-6** — On resumed service, coalesce missed repeat slots into at most one currently eligible occurrence and do not dispatch after selected end bounds. After a successful delayed send, calculate the next local date as that send's local calendar date plus the selected X days, at the originally approved local wall-clock time and timezone (with ARCH-S192-5 DST resolution). Delay does not change the chosen hour. An unresolved send outcome cannot advance recurrence.
- **ARCH-S192-7** — Pre-dispatch connectivity/observation failures remain eligible for bounded technical recovery; unresolved possible sends require S190 reconciliation and sender/authority changes require S188's explicit transition.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S192-1** — Staff can tell the next send/timezone, approved wording, repeat/end/count settings, current sender/responsible person and why paused/blocked/unknown work is waiting.
- **BEH-S192-2** — Staff pause or cancel without another approver. If dispatch already started, the app says so and prevents later occurrences without promising recall.
- **BEH-S192-3** — Staff freely edit and save; the interface clearly shows that sending is paused until Update schedule. If a material authoritative fact contradicts the approved target or terms, staff see the actual difference before updating. The one action updates it without an approval queue or per-occurrence confirmation.
- **BEH-S192-4** — Staff inspect the reply, choose the appropriate next step and see the resulting next send or completed state. Reading or dismissing a reply notification does not resume automatically.
- **BEH-S192-5** — Staff see unambiguous next dates through DST/month/year changes. No repeated-hour double send occurs; work stops when its selected end/count bound is reached and no optional bound is silently added.
- **BEH-S192-6** — Staff see a delayed-send indication and the revised next send. Five missed reminders do not produce five messages, and a past end date leaves ended work rather than a catch-up send.
- **BEH-S192-7** — A transient outage can recover without a new approval of unchanged work. Unknown delivery and missing sender are clearly different and never trigger automatic duplicate or fallback-account sends.

**Human litmus outcome.**

### Manage the schedule without managing a queue of approvals

**If this was built correctly:** A staff member sees when a message will go, pauses it, edits the wording and date, then uses Update schedule once. A reply pauses the sequence for review. An outage produces an understandable delayed send instead of a burst of missed reminders.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                         | Architecture outcome | Behavior outcome | Human litmus                                              | Deterministic evidence / falsification                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S192-1** — Expose complete actionable schedule state.                                           | `ARCH-S192-1`        | `BEH-S192-1`     | Manage the schedule without managing a queue of approvals | `AC-S192-1`: Browser state matrix and source projection parity cover scheduled, paused, sending, sent, complete, cancelled, missing sender and unknown outcome without contradictory badges.                                                                                                             |
| **R-S192-2** — Support direct pause and cancellation with an honest boundary.                       | `ARCH-S192-2`        | `BEH-S192-2`     | Manage the schedule without managing a queue of approvals | `AC-S192-2`: Concurrent pause/cancel/claim emulator cases plus browser readback prove acknowledged pre-claim prevention and truthful in-flight result; cancellation never erases prior receipts.                                                                                                         |
| **R-S192-3** — Make active edits or contradictory material source facts one Update schedule action. | `ARCH-S192-3`        | `BEH-S192-3`     | Manage the schedule without managing a queue of approvals | `AC-S192-3`: Change each material field and an authoritative rent/recipient/legal resource fact before due time; no conflicting old or unapproved new message dispatches. An unrelated field change does not pause it. One Update resumes the new version and a stale competing tab receives a conflict. |
| **R-S192-4** — Require explicit resolution of human-reply pauses.                                   | `ARCH-S192-4`        | `BEH-S192-4`     | Manage the schedule without managing a queue of approvals | `AC-S192-4`: Reply-after-review/before-resume race refuses stale resolution; explicit valid Resume/Update/Complete works once, while read/dismiss/model actions do not change eligibility.                                                                                                               |
| **R-S192-5** — Apply explicit local-calendar and optional-bound semantics.                          | `ARCH-S192-5`        | `BEH-S192-5`     | Manage the schedule without managing a queue of approvals | `AC-S192-5`: Calendar fixtures span spring/fall DST, leap day, month/year boundary, inclusive end day and count-one/limit exhaustion; compare displayed time, approved instant and worker due calculation.                                                                                               |
| **R-S192-6** — Recover delay without a burst of stale follow-ups.                                   | `ARCH-S192-6`        | `BEH-S192-6`     | Manage the schedule without managing a queue of approvals | `AC-S192-6`: Fixed-clock outage scenarios miss several slots with/without reply, end date and count bound; assert at most one eligible send, no expired send and correct next local recurrence.                                                                                                          |
| **R-S192-7** — Recover technical failures automatically only when safe.                             | `ARCH-S192-7`        | `BEH-S192-7`     | Manage the schedule without managing a queue of approvals | `AC-S192-7`: Provider-before-call failure, timeout-after-call, disconnected sender and restored connectivity fixtures produce distinct operations; unchanged safe recovery proceeds while ambiguity/substitution stays refused.                                                                          |

**Preservation set.**

Immutable prior approvals/attempts/receipts, exact rich approved content, body-minimized operational logs, current team access and managed sender, original workflow evidence and current cancel-first interaction semantics where an actual destructive action remains. Technical recovery never reuses a consumed send claim.

**Adversarial acceptance checks.**

- **AC-S192-1** — Falsify `ARCH-S192-1` and `BEH-S192-1`: Browser state matrix and source projection parity cover scheduled, paused, sending, sent, complete, cancelled, missing sender and unknown outcome without contradictory badges.
- **AC-S192-2** — Falsify `ARCH-S192-2` and `BEH-S192-2`: Concurrent pause/cancel/claim emulator cases plus browser readback prove acknowledged pre-claim prevention and truthful in-flight result; cancellation never erases prior receipts.
- **AC-S192-3** — Falsify `ARCH-S192-3` and `BEH-S192-3`: Change each material field and an authoritative rent/recipient/legal resource fact before due time; no conflicting old or unapproved new message dispatches. An unrelated field change does not pause it. One Update resumes the new version and a stale competing tab receives a conflict.
- **AC-S192-4** — Falsify `ARCH-S192-4` and `BEH-S192-4`: Reply-after-review/before-resume race refuses stale resolution; explicit valid Resume/Update/Complete works once, while read/dismiss/model actions do not change eligibility.
- **AC-S192-5** — Falsify `ARCH-S192-5` and `BEH-S192-5`: Calendar fixtures span spring/fall DST, leap day, month/year boundary, inclusive end day and count-one/limit exhaustion; compare displayed time, approved instant and worker due calculation.
- **AC-S192-6** — Falsify `ARCH-S192-6` and `BEH-S192-6`: Fixed-clock outages miss several slots with/without reply, end date and count bound; assert at most one eligible send and no expired send. A selected 09:00 send delivered late at 11:00 schedules its next repeat X local calendar days after the actual send date at 09:00, not 11:00; unresolved delivery cannot advance.
- **AC-S192-7** — Falsify `ARCH-S192-7` and `BEH-S192-7`: Provider-before-call failure, timeout-after-call, disconnected sender and restored connectivity fixtures produce distinct operations; unchanged safe recovery proceeds while ambiguity/substitution stays refused.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

**Dependencies / sequencing.**

Consumes S188 responsibility, S189 schedule approval, S190 attempts and S191 inbound causes. S186/S187 host controls. S183/S184 establish direct staff operations; program sequencing must not ship schedules with no operable pause or recovery.

**Standalone delivery contract.**

- **Deliverable now:** Complete operational controls/projections and deterministic calendar, concurrency, active-edit, missed-run and safe-recovery behavior with compiled-browser journeys.
- **Consumes, but does not assume:** Versioned schedule/attempt/observation records. Missing adjacent capability is explicitly unavailable; no fake schedule success or claimed provider rollback.
- **Externally blocked effect:** An actual recovery send depends on the exact live managed provider capability/connection. Control, calendar and recovery distinction acceptance use deterministic records/adapters independently.
- **Produces for downstream suites:** One staff-operable schedule lifecycle and exception contract for S193 integrated validation and maintenance/renewal consumers.

**Verification and delivery contract.**

1. Re-read current source and service identity; record the starting preservation results. Materialize the specific missing architecture and behavior scenarios below before the first implementation edit. Already-correct behavior receives preservation evidence rather than a manufactured failure.
2. Exercise every requirement with meaningful focused unit/backend checks and compiled-browser journeys where the output is visible. Use deterministic external adapters for send, reply, failure and concurrency scenarios; no live customer effect is created merely as a test.
3. Keep preservation results separate. Run `bash scripts/verify.sh` for an authorized ship candidate; inspect the diff and audit secrets, personal data, mailbox/Space boundaries, exact effect scope, runtime configuration and documentation.
4. Record model evidence and the actual human verdict. Report `ALL_GATES_GREEN` only for the proved implementation scope; keep a named live provider configuration/permission dependency explicitly `BLOCKED` if unavailable. `BUDGET_EXHAUSTED` applies only under an explicit budget. Deliver only under the program's separate execution instruction and release contract.

**Ordered prompt sequence.**

1. Revalidate the inspected starting owners and current live read-only evidence.
2. Bind the requirement rows to falsifying scenarios, a separate preservation baseline and the human litmus.
3. Implement the complete bounded contract and its unset, conflict, failure and recovery behavior.
4. Run focused and canonical checks; reconcile affected current documentation and compatibility; deliver only when the owner has separately selected execution.

**Deletion/merge recommendation.**

Retire this narrative only after the requirements, compatibility behavior and exact evidence are carried by code/tests and current product/facts documentation. Keep blocked provider effects visible; never retire them as proved merely because local tests pass.
