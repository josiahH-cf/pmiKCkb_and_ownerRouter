<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S189 — Configurable schedules and durable end-state authorization

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

Any authorized staff member schedules a reviewed workflow message for a chosen date/time, optionally repeating every X days with an optional end date or send limit, through one clear Schedule action.

**Current state / intended end state.**

Existing notice rules resolve global/property/lease timing and follow-up attention, but defaults are unverified and do not dispatch. Generic Gmail confirmation records bind payload hashes and actors but expire for use after ten minutes; they cannot authorize long-lived recurrence. The desired new schedule uses staff-selected runtime values and durable approved content instead of a hardcoded monthly cadence or repurposed short-lived token.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Ordinary authorized PMI staff with accessible linked work and their managed sender. The user supplies date, time and explicit timezone; repeating work additionally supplies a positive interval. Optional end date/count are deliberate inputs. Recipient/content readiness affects dispatch, not ability to save an incomplete draft.

**What it is / how it functions.**

The hub provides one understandable schedule editor next to the final message. Staff may choose one-time sending or every-X-days recurrence, initial and separately editable follow-up content, optional end date and/or total send limit. Schedule approves the complete displayed end state once. The authorization persists across browser closure and server restart, records version/actor/sender/workflow and is distinct from worker occurrence claims.

This is intake 061 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Schedule editing, calendar semantics, initial/follow-up content authorization, optional bounds and durable versioning are in scope. No mandatory preset cadence, fixed 15th/three-day/ten-day interval, enrollment inferred from policy membership, model authorization or generic campaign management is added. S190 dispatches and S192 operates/revises schedules.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- New canonical schedule contract at the existing `lib/gmail-hub`/Firestore boundary; discover exact implementation paths during implementation.
- `lib/gmail-hub/contracts.ts`, `state-store.ts`, `retention-contract.ts` and lease exact snapshot primitives in `lib/firestore/renewal-message-drafts.ts`.
- S186/S187 schedule editor and composer, S188 responsibility, existing notice/follow-up consumers and S191/S192 state transitions.

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

- **ARCH-S189-1** — The canonical schedule stores first local date/time and named timezone, one-time versus positive every-X-days recurrence, optional end date and total send limit with server validation. At initial Schedule admission, reject a first instant already in the past according to server time; never silently convert it to an immediate send. The staff member may deliberately choose Send now through S187 or a future first instant. This differs from recovery of an already-authorized overdue occurrence under S192.
- **ARCH-S189-2** — Authorization references immutable initial-message and follow-up-message snapshots including sender, recipients, plain/HTML content and attachments; recurrence never invokes a model to produce unreviewed outgoing wording.
- **ARCH-S189-3** — One explicit Schedule request binds the displayed draft and schedule revision atomically with actor/workflow authority; saving a draft does not create dispatch authorization.
- **ARCH-S189-4** — Durable schedule authorization records workflow/purpose, responsible actor, managed sender, recipient/content identities, timing, version and approval time; worker credentials remain separate and secrets are not stored with the record.
- **ARCH-S189-5** — The schedule identity includes real lease/ticket and audience/purpose; atomic version checks prevent stale approval from authorizing revised content, ownership or recipients.
- **ARCH-S189-6** — One calendar projection derives the human schedule summary and next occurrence from the same stored contract used by workers; optional send limit counts confirmed sends rather than task delivery attempts.
- **ARCH-S189-7** — An active sequence uses its approved snapshots; edits to templates, source data or future policy do not silently authorize altered messages or enroll other leases.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S189-1** — Staff choose a date/time/timezone and optional repeat settings; missing/invalid or already-past first times stay visible without guessed cadence or dispatch. They can choose a future time or explicitly use Send now. Ordinary staff need no Admin timing-policy approval.
- **BEH-S189-2** — Staff inspect/edit the first message and follow-up message before Schedule. A one-time schedule does not require unused follow-up content; repeats send the approved follow-up wording.
- **BEH-S189-3** — Staff choose Schedule once and receive an exact scheduled-state readback. Double-click/reload cannot enroll duplicate sequences or create a hidden extra review task.
- **BEH-S189-4** — After closing the browser and restarting the server, the same approved sequence remains visible with its next occurrence and can run only under that preserved authorization.
- **BEH-S189-5** — Staff cannot accidentally schedule one lease's draft for another lease. A stale tab receives the current conflict and retains editable work rather than creating a mismatched schedule.
- **BEH-S189-6** — Before approval and afterward, staff see first date/time/timezone, repeat interval and any end/count bounds in plain language. Failures/retries do not consume a successful-send quota.
- **BEH-S189-7** — Staff can reuse a schedule pattern while choosing each actual linked work item; unrelated leases and old drafts remain unscheduled until explicitly authorized.

**Human litmus outcome.**

### Choose the schedule that fits the work

**If this was built correctly:** A staff member chooses a date and time, sees the timezone, optionally sets every X days and an end date or limit, reviews the first and follow-up messages, and clicks Schedule once. The app remembers exactly that choice without requiring an Admin or prescribing a cadence.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                        | Architecture outcome | Behavior outcome | Human litmus                           | Deterministic evidence / falsification                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------- | ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S189-1** — Let staff choose all actual timing values.                          | `ARCH-S189-1`        | `BEH-S189-1`     | Choose the schedule that fits the work | `AC-S189-1`: Table-driven date/time/interval/end/count validation and browser staff flow cover empty values, invalid date, interval zero, end before start and valid one-time/repeating schedules.                        |
| **R-S189-2** — Approve initial and separately editable follow-up content together. | `ARCH-S189-2`        | `BEH-S189-2`     | Choose the schedule that fits the work | `AC-S189-2`: Adapter sends occurrence one and occurrence two with distinct approved content; absent follow-up blocks only repeating authorization and post-approval model/source edits cannot alter either snapshot.      |
| **R-S189-3** — Use one Schedule end-state action with no approval queue.           | `ARCH-S189-3`        | `BEH-S189-3`     | Choose the schedule that fits the work | `AC-S189-3`: Concurrent duplicate Schedule commands produce one durable authorization; browser action trace contains one end-state authorization and no approval-queue creation.                                          |
| **R-S189-4** — Persist authorization independently of ephemeral sessions/tokens.   | `ARCH-S189-4`        | `BEH-S189-4`     | Choose the schedule that fits the work | `AC-S189-4`: Fresh process/browser reconstruction loads the exact authorization; expired ten-minute generic confirmations do not invalidate it or become a substitute; missing/malformed authorization prevents dispatch. |
| **R-S189-5** — Bind authority to a specific workflow and version.                  | `ARCH-S189-5`        | `BEH-S189-5`     | Choose the schedule that fits the work | `AC-S189-5`: Swap workflow, actor, recipient, attachment or draft revision between prepare/action and require bounded conflict with zero dispatch; ordinary unchanged schedule succeeds.                                  |
| **R-S189-6** — Make selected timing and optional bounds transparent.               | `ARCH-S189-6`        | `BEH-S189-6`     | Choose the schedule that fits the work | `AC-S189-6`: Compare editor/readback/worker projections for timezone and count cases; rejected dispatch and duplicate task events cannot advance confirmed-send count.                                                    |
| **R-S189-7** — Keep enrollment and future changes deliberate.                      | `ARCH-S189-7`        | `BEH-S189-7`     | Choose the schedule that fits the work | `AC-S189-7`: Edit shared template/policy/source and add a lease after authorization; assert no additional schedule or changed approved payload and visible affected-state handling through S192.                          |

**Preservation set.**

Existing notice-rule/last-contact history retains its original meaning; no unverified notice default becomes a selected send time. Preserve app draft autosave, managed sender checks, exact rich snapshots, durable claims and Space/role isolation.

**Adversarial acceptance checks.**

- **AC-S189-1** — Falsify `ARCH-S189-1` and `BEH-S189-1`: Table-driven date/time/interval/end/count validation covers empty values, invalid date, interval zero, end before start and valid schedules. A newly approved past first instant, including client/server clock disagreement, is rejected with zero dispatch and retained inputs; explicit Send now remains a separate deliberate action. An existing overdue authorization instead follows S192 recovery.
- **AC-S189-2** — Falsify `ARCH-S189-2` and `BEH-S189-2`: Adapter sends occurrence one and occurrence two with distinct approved content; absent follow-up blocks only repeating authorization and post-approval model/source edits cannot alter either snapshot.
- **AC-S189-3** — Falsify `ARCH-S189-3` and `BEH-S189-3`: Concurrent duplicate Schedule commands produce one durable authorization; browser action trace contains one end-state authorization and no approval-queue creation.
- **AC-S189-4** — Falsify `ARCH-S189-4` and `BEH-S189-4`: Fresh process/browser reconstruction loads the exact authorization; expired ten-minute generic confirmations do not invalidate it or become a substitute; missing/malformed authorization prevents dispatch.
- **AC-S189-5** — Falsify `ARCH-S189-5` and `BEH-S189-5`: Swap workflow, actor, recipient, attachment or draft revision between prepare/action and require bounded conflict with zero dispatch; ordinary unchanged schedule succeeds.
- **AC-S189-6** — Falsify `ARCH-S189-6` and `BEH-S189-6`: Compare editor/readback/worker projections for timezone and count cases; rejected dispatch and duplicate task events cannot advance confirmed-send count.
- **AC-S189-7** — Falsify `ARCH-S189-7` and `BEH-S189-7`: Edit shared template/policy/source and add a lease after authorization; assert no additional schedule or changed approved payload and visible affected-state handling through S192.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

**Dependencies / sequencing.**

S187 supplies approved content and S188 sender/responsibility. S190 consumes authorization, S191 pauses on inbound replies, S192 revises/operates it and S193 validates migration. S183/S184 govern ordinary staff use; these new outcomes supersede old blanket draft-only semantics only for the explicitly selected future program.

**Standalone delivery contract.**

- **Deliverable now:** Validated configurable schedule model/editor, durable exact authorization, conflict/idempotency behavior and calendar projections with deterministic future-time scenarios.
- **Consumes, but does not assume:** Real workflow/contact/content snapshots and named timezone; actual chosen schedule values are runtime user inputs. Missing send capability creates an honest blocked operation, not a fabricated authorization.
- **Externally blocked effect:** Live dispatch requires the exact provider permission/configuration and named send capability once implemented under the selected governance program. Creating the schedule model and verifying its refusal paths needs no live send.
- **Produces for downstream suites:** One versioned durable approved-sequence contract for S190–S193, including immutable content and runtime-selected timing.

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
