<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S191 — Linked inbound observation and stop-on-reply behavior

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

The app observes linked communication reliably enough to pause future scheduled messages when a human replies or delivery fails, without treating an automatic response as renewal acceptance.

**Current state / intended end state.**

The public Gmail watch route is retired/410 although push processing, history cursor and replay-deduplication code remain. `observeWorkflowThread` currently considers the latest non-self sender incoming; it does not distinguish human reply, automatic reply or bounce, and the normalized message type drops relevant automatic-response headers. Manual refresh alone cannot meet unattended reply stopping. The desired state observes only authorized linked work, recovers observation gaps and performs a fresh complete check before dispatch.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Managed service observation for already-authorized linked conversations, authorized team staff reading that workflow, and S190's dispatcher. Gmail/provider evidence establishes message identity/time/direction; model interpretation is advisory and cannot establish acceptance or authorize continuation.

**What it is / how it functions.**

Build a current linked-message observation from provider history/readback and normalize evidence needed for human, automated-response and failed-delivery categories. Any human reply from a workflow participant pauses the affected sequence before a not-yet-claimed next send. A bounce/delivery failure pauses with a delivery issue. An identified autoreply is recorded but never counts as acceptance or completion. Staff explicitly review and resume/revise/complete paused work.

This is intake 063 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Incoming observations, timely background synchronization, recovery after missed/expired history/watch, immutable inbound evidence, reply pause and dispatch-time freshness are in scope. A general inbox, automatic renewal decision, sentiment-as-approval, autonomous reply generation and unrelated mailbox reads are outside scope.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- `lib/gmail-hub/service.ts` observe/refresh/push processing, `pubsub.ts`, `state-store.ts` and retired watch-route contract.
- `lib/gmail-runtime/mime.ts`, `types.ts`, `client.ts` message headers/pagination/completeness and documented Gmail history/watch interfaces.
- `lib/gmail-hub/communication-state.ts`, notice/follow-up projections and S189/S190/S192 sequence state; update retirement assertions intentionally rather than bypassing them.

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

- **ARCH-S191-1** — Background observation resolves mailbox authorization and workflow association before requesting or projecting thread content; cursors/replay records are mailbox-bound and protected.
- **ARCH-S191-2** — One monotonic mailbox/history owner handles notification replay and bounded resynchronization; any watch is renewed according to documented provider expiry and gap recovery does not rely solely on push delivery.
- **ARCH-S191-3** — Normalized provider message data retains required header/direction/provenance fields and completeness; classify human inbound, identified autoreply, delivery failure and uncertain state without equating arbitrary non-self sender with a human answer.
- **ARCH-S191-4** — A provider-backed post-baseline human reply updates sequence pause and inbound evidence together under the same version/claim ordering consumed by S190.
- **ARCH-S191-5** — An identified autoreply cannot produce an owner/tenant decision, mark completion or automatically resume a paused sequence; delivery-failure evidence pauses the affected send target with a recoverable state.
- **ARCH-S191-6** — S190 requests a bounded complete linked-thread check; unavailable, stale, paginated-incomplete or truncated evidence cannot certify absence of a newer reply.
- **ARCH-S191-7** — Paused state retains cause, message/provider evidence and authorization version; staff review/resume/revise is an ordinary direct operation governed by S192 and cannot be invoked by model classification.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S191-1** — Relevant replies reach the shared workflow view; unrelated personal mail never appears or becomes a stopping/dispatch input merely because it shares a name.
- **BEH-S191-2** — After a gap or restart, current linked replies are found without duplicate history items or backwards contact state. Staff see degraded observation until recovery succeeds.
- **BEH-S191-3** — Staff see whether a new message is a human reply, automatic response, failed delivery or needs review, with no fabricated renewal decision.
- **BEH-S191-4** — A question, objection, acceptance or refusal from a real linked participant pauses the sequence; staff must decide what happens next rather than the system continuing because the reply was not a final decision.
- **BEH-S191-5** — An out-of-office reply is shown as automatic, while a bounce stops future sending and asks for address/delivery review. No automatic response is reported as acceptance.
- **BEH-S191-6** — If the thread cannot be checked, the occurrence waits and staff see the issue; an actual reply already present at that check stops it even if no notification arrived.
- **BEH-S191-7** — Staff can inspect the reply and choose a deliberate next step in the hub; acknowledging the notification alone does not restart sending.

**Human litmus outcome.**

### A reply stops the follow-up

**If this was built correctly:** An owner or tenant replies with a question before the next reminder. The sequence pauses and the team can read the reply and decide the next step. Vacation replies never look like approval, and failed delivery is clearly flagged.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                               | Architecture outcome | Behavior outcome | Human litmus                | Deterministic evidence / falsification                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R-S191-1** — Observe only the permitted linked conversations.                           | `ARCH-S191-1`        | `BEH-S191-1`     | A reply stops the follow-up | `AC-S191-1`: Multi-mailbox adapter/back-end cases mix linked and unrelated threads and forged push identities; only authorized linked events are consumed/projected and no unrelated content escapes.              |
| **R-S191-2** — Recover missed, duplicate, out-of-order and expired observation.           | `ARCH-S191-2`        | `BEH-S191-2`     | A reply stops the follow-up | `AC-S191-2`: Fixed history fixtures and emulator cursor races cover replay/out-of-order/expired cursor/watch, dropped notifications and restart; exact linked reply eventually pauses with one evidence item.      |
| **R-S191-3** — Represent message direction and response class from evidence.              | `ARCH-S191-3`        | `BEH-S191-3`     | A reply stops the follow-up | `AC-S191-3`: MIME/header fixtures cover human reply, out-of-office, bounce, self-copy, malformed headers, forwarded/unknown sender and truncated thread; uncertain evidence never claims accepted/declined.        |
| **R-S191-4** — Pause on every qualifying human response.                                  | `ARCH-S191-4`        | `BEH-S191-4`     | A reply stops the follow-up | `AC-S191-4`: Human reply variants before first send and between repeats each prevent the next eligible unclaimed occurrence; historical pre-authorization messages do not falsely pause a newly reviewed sequence. |
| **R-S191-5** — Handle automated responses and bounces honestly.                           | `ARCH-S191-5`        | `BEH-S191-5`     | A reply stops the follow-up | `AC-S191-5`: Autoreply and bounce fixtures verify state/effect traces, follow-up behavior and no acceptance/completion marker; unknown classification is visible and defers affected dispatch pending review.      |
| **R-S191-6** — Require a fresh complete provider observation immediately before dispatch. | `ARCH-S191-6`        | `BEH-S191-6`     | A reply stops the follow-up | `AC-S191-6`: Drop push events while inserting a provider reply, then run due dispatch; fresh read prevents send. Unreadable/truncated result yields zero send and retains the schedule for recovery.               |
| **R-S191-7** — Keep review and resume human-directed without an approval queue.           | `ARCH-S191-7`        | `BEH-S191-7`     | A reply stops the follow-up | `AC-S191-7`: Browser acknowledgement versus Resume/Update/Complete journeys and model-trigger attempts prove only the explicit selected operation changes schedule eligibility.                                    |

**Preservation set.**

Existing monotonic history cursors, replay dedupe, mailbox-bound service-auth validation, linked-thread scope, actual contact provenance, draft/receipt meaning and logs without message bodies. Preserve manual targeted refresh as a useful recovery action.

**Adversarial acceptance checks.**

- **AC-S191-1** — Falsify `ARCH-S191-1` and `BEH-S191-1`: Multi-mailbox adapter/back-end cases mix linked and unrelated threads and forged push identities; only authorized linked events are consumed/projected and no unrelated content escapes.
- **AC-S191-2** — Falsify `ARCH-S191-2` and `BEH-S191-2`: Fixed history fixtures and emulator cursor races cover replay/out-of-order/expired cursor/watch, dropped notifications and restart; exact linked reply eventually pauses with one evidence item.
- **AC-S191-3** — Falsify `ARCH-S191-3` and `BEH-S191-3`: MIME/header fixtures cover human reply, out-of-office, bounce, self-copy, malformed headers, forwarded/unknown sender and truncated thread; uncertain evidence never claims accepted/declined.
- **AC-S191-4** — Falsify `ARCH-S191-4` and `BEH-S191-4`: Human reply variants before first send and between repeats each prevent the next eligible unclaimed occurrence; historical pre-authorization messages do not falsely pause a newly reviewed sequence.
- **AC-S191-5** — Falsify `ARCH-S191-5` and `BEH-S191-5`: Autoreply and bounce fixtures verify state/effect traces, follow-up behavior and no acceptance/completion marker; unknown classification is visible and defers affected dispatch pending review.
- **AC-S191-6** — Falsify `ARCH-S191-6` and `BEH-S191-6`: Drop push events while inserting a provider reply, then run due dispatch; fresh read prevents send. Unreadable/truncated result yields zero send and retains the schedule for recovery.
- **AC-S191-7** — Falsify `ARCH-S191-7` and `BEH-S191-7`: Browser acknowledgement versus Resume/Update/Complete journeys and model-trigger attempts prove only the explicit selected operation changes schedule eligibility.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

Do not claim every reply arriving before a provider's eventual delivery can prevent that delivery.
Prevention is guaranteed only for a reply included in the complete final provider read or a durable
pause observation serialized before claim. An unseen reply arriving at Gmail after that read,
including before the local claim, may race with dispatch because Gmail has no atomic
send-if-no-reply operation. Its later observation pauses subsequent work and preserves the actual
ordering; do not claim the already-started send was prevented. A known pause should still be
checked before invoking the provider.

**Dependencies / sequencing.**

S188 defines permitted linked-team access; S189 defines approved baseline and schedule; S190 checks/claims and S192 exposes review/resume. S183/S184 must explicitly reconcile old watch retirement and selected automated-read authority without expanding the inbox boundary.

**Standalone delivery contract.**

- **Deliverable now:** Canonical inbound evidence/response classification, background plus recovery synchronization, reply/bounce pause and fresh-pre-dispatch observation with deterministic gap/race evidence.
- **Consumes, but does not assume:** Real managed mailbox/thread association and provider-documented history/read interfaces. Absence or incomplete data is a visible observation problem, not evidence of no reply.
- **Externally blocked effect:** Live continuous observation depends on actual managed Gmail/Pub/Sub or selected documented polling configuration and permission; only that external lane is held. Its synchronization/classification/refusal contract is implementable and testable independently.
- **Produces for downstream suites:** One linked inbound observation and durable pause cause used by the hub, S190 dispatcher, S192 operations and S193 journeys.

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
