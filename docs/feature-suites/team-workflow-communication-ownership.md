<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S188 — Team communication ownership with mailbox isolation

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

Authorized staff share workflow-linked communication context, pause schedules and transfer responsibility, while unrelated personal mailbox content remains private and takeover sends use the new responsible person's managed mailbox.

**Current state / intended end state.**

Current links carry `actor_uid`, mailbox identity, workflow lane/entity/purpose and source references. Runtime Gmail clients act for one managed mailbox and require From to match that subject. Public workflow authorization does not by itself grant staff arbitrary access to another person's mailbox. The desired end state introduces team work ownership without copying an account or treating an old sender's identity as transferable.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Authorized PMI staff who can access the linked renewal/maintenance work may see its linked conversation, drafts, schedule and responsibility. Managed sender identity remains explicit. Directory/role/Space rules and vendor boundaries govern access; workflow assignment alone cannot reveal unrelated mail.

**What it is / how it functions.**

Show a responsible staff member on linked communication work. Staff with that workflow's access can inspect linked history, pause work and transfer responsibility through ordinary direct controls. Transfer pauses pending dispatch until the new responsible person has reviewed and authorized the intended future work from their own managed mailbox; retained prior-message evidence continues to identify the original sender.

This is intake 060 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Team visibility of linked threads, responsibility transfer, pause authority, sender continuity and privacy enforcement are in scope. Shared impersonation, forwarding all private mail, role/IAM changes, external vendor access to staff mail and invented shared sender addresses are outside scope.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- `lib/gmail-hub/workflow-context.ts`, `workflow-authorization.ts`, `service.ts` and `state-store.ts` ownership/access consumers.
- `lib/gmail-runtime/client.ts` From/subject checks, linked conversation projections and S186 hub filters.
- Staff directory and existing server role/Space enforcement; lease/ticket linked histories and schedule ownership supplied to S189–S192.

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

- **ARCH-S188-1** — Server authorization resolves accessible workflow identity before projecting linked thread content, message/draft state or responsibility; UI filtering is not the security boundary.
- **ARCH-S188-2** — Team reads are constrained to exact established workflow-thread associations; personal mailbox discovery remains scoped to the acting mailbox and cannot be reused as cross-mailbox authority.
- **ARCH-S188-3** — An authorized pause updates durable workflow schedule state before future occurrence claims; it records actor/time/reason metadata without an approval-queue dependency.
- **ARCH-S188-4** — Responsibility and sender identity are separate fields; transfer preserves prior authorizations/receipts and requires future authorization bound to the new responsible managed mailbox.
- **ARCH-S188-5** — Stable workflow association joins original and successor provider threads without claiming a different mailbox's provider thread ID is directly reusable; maintain original message/provider provenance.
- **ARCH-S188-6** — A sequence cannot rely on the former actor's browser session or borrowed token; mailbox availability and current authority are evaluated for the designated sender at dispatch.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S188-1** — Two staff with the same workflow access can inspect its linked conversation and schedule; a staff member without that access receives no content or identifying search result.
- **BEH-S188-2** — Team members see linked work, not all incoming/outgoing mail in a colleague's mailbox. A discovery result becomes team-visible only after permitted explicit linking to real work.
- **BEH-S188-3** — A staff member who sees the work can pause it promptly and everyone sees the paused state. The control explains an already-dispatched occurrence separately.
- **BEH-S188-4** — The new responsible person sees the conversation and draft, then authorizes future sending from their own address. Nothing sends as the prior staff member merely because responsibility changed.
- **BEH-S188-5** — Staff can read the earlier work and later continuation as one workflow history, with sender changes clear. A new mailbox continuation remains linked even when Gmail creates a different thread.
- **BEH-S188-6** — Unavailable sender access leaves drafts/history intact and pending sends paused with an actionable transfer/reconnect explanation; no fallback mailbox is chosen automatically.

**Human litmus outcome.**

### Shared work without shared private mail

**If this was built correctly:** A teammate opens a lease's linked conversation, sees who is responsible, pauses its schedule and hands it over. The new responsible person continues from their own managed mailbox, while everyone can still understand the original history and nobody sees unrelated private mail.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                     | Architecture outcome | Behavior outcome | Human litmus                            | Deterministic evidence / falsification                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S188-1** — Expose linked communication context to the authorized team.      | `ARCH-S188-1`        | `BEH-S188-1`     | Shared work without shared private mail | `AC-S188-1`: Backend two-actor/Space tests and browser team view compare eligible linked records; direct API, forged entity and global-search access attempts disclose nothing out of scope.             |
| **R-S188-2** — Keep unrelated mailbox content private.                          | `ARCH-S188-2`        | `BEH-S188-2`     | Shared work without shared private mail | `AC-S188-2`: Place linked and unrelated threads in two mailbox adapters; assert team listing/read/search/export cannot fetch unrelated thread IDs or snippets, including client-crafted context.         |
| **R-S188-3** — Allow direct team pause without another approval.                | `ARCH-S188-3`        | `BEH-S188-3`     | Shared work without shared private mail | `AC-S188-3`: Two-actor concurrent pause/claim scenario proves an acknowledged pre-claim pause prevents dispatch; browser action requires no reviewer or separate approval item.                          |
| **R-S188-4** — Transfer responsibility without impersonating the former sender. | `ARCH-S188-4`        | `BEH-S188-4`     | Shared work without shared private mail | `AC-S188-4`: Transfer a scheduled sequence between actors; inspect future MIME From/client subject and immutable old receipts. A transfer alone, stale worker or client-forged old From cannot dispatch. |
| **R-S188-5** — Preserve linked history across a change of sender/thread.        | `ARCH-S188-5`        | `BEH-S188-5`     | Shared work without shared private mail | `AC-S188-5`: Provider-adapter takeover returns a new thread; hub timeline preserves exact old/new associations and identities without duplicating delivery or silently losing history.                   |
| **R-S188-6** — Represent missing/offboarded sender access honestly.             | `ARCH-S188-6`        | `BEH-S188-6`     | Shared work without shared private mail | `AC-S188-6`: Revoke/remove sender availability before due time and on reload; assert zero substituted-mailbox dispatch, retained content and successful explicit takeover path.                          |

**Preservation set.**

Server role/Space checks, self-mailbox sender validation, canary mutation refusal, historical author and provider IDs, linked-thread scope, body-minimized logs and unrelated mailbox isolation. Keep access tests separate from new ownership behavior.

**Adversarial acceptance checks.**

- **AC-S188-1** — Falsify `ARCH-S188-1` and `BEH-S188-1`: Backend two-actor/Space tests and browser team view compare eligible linked records; direct API, forged entity and global-search access attempts disclose nothing out of scope.
- **AC-S188-2** — Falsify `ARCH-S188-2` and `BEH-S188-2`: Place linked and unrelated threads in two mailbox adapters; assert team listing/read/search/export cannot fetch unrelated thread IDs or snippets, including client-crafted context.
- **AC-S188-3** — Falsify `ARCH-S188-3` and `BEH-S188-3`: Two-actor concurrent pause/claim scenario proves an acknowledged pre-claim pause prevents dispatch; browser action requires no reviewer or separate approval item.
- **AC-S188-4** — Falsify `ARCH-S188-4` and `BEH-S188-4`: Transfer a scheduled sequence between actors; inspect future MIME From/client subject and immutable old receipts. A transfer alone, stale worker or client-forged old From cannot dispatch.
- **AC-S188-5** — Falsify `ARCH-S188-5` and `BEH-S188-5`: Provider-adapter takeover returns a new thread; hub timeline preserves exact old/new associations and identities without duplicating delivery or silently losing history.
- **AC-S188-6** — Falsify `ARCH-S188-6` and `BEH-S188-6`: Revoke/remove sender availability before due time and on reload; assert zero substituted-mailbox dispatch, retained content and successful explicit takeover path.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

**Dependencies / sequencing.**

S183/S184 establish ordinary staff authority and direct operational edits. S186/S187 consume ownership; S189–S192 bind dispatch to it. Provider-supported cross-mailbox linking may require a new thread; this contract never assumes the same Gmail thread ID works across mailboxes.

**Standalone delivery contract.**

- **Deliverable now:** Server-enforced team projection, mailbox isolation, durable responsibility/pause/transfer behavior and deterministic sender-continuation journeys.
- **Consumes, but does not assume:** Existing staff directory and workflow access plus managed mailbox availability. Missing sender capability is visible and cannot be replaced by impersonation.
- **Externally blocked effect:** Live read/send requires permission for the exact designated managed mailbox. Team functionality and takeover refusal remain independently testable without broad mailbox permission changes.
- **Produces for downstream suites:** Canonical workflow visibility, responsible actor, sender and transfer-state contract for S189–S193.

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
