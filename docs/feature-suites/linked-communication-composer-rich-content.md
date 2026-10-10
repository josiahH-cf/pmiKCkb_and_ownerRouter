<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S187 — Linked message composer and exact rich content

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

Staff freely save and edit source-filled linked messages, then approve the displayed end state once for sending or scheduling without losing formatting or attachments.

**Current state / intended end state.**

`renewal-message-preparation.ts` already allows autosave without a separate review or fresh-source gate. `currentRenewalMessage` builds lease-specific content; the renewal draft provider supports HTML and one receipt-bound image. Generic `GmailOutgoingMessage` and `sendMessage` currently encode plain text only. Existing generic workflow compose rejects new messages. The desired shared composer preserves current rich output and replaces fragmented preparation with one truthful draft/send/schedule experience.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Authorized PMI staff with accessible lease/ticket context. Actual source mappings supply recipients, facts and resources; a human may edit wording and choose the final end state. Incomplete factual input does not prevent private draft editing but cannot become an invented customer fact or recipient.

**What it is / how it functions.**

Prepopulate the linked composer from the same current source/working values used by the workflow. Autosave app-owned drafts, permit ordinary editing and AI refinement, and show the actual sender, recipient set, subject, formatted content and attachment list. Save draft creates no dispatch authorization. Send now or Schedule authorizes exactly the displayed content/version through S189/S190; there is no separate approval queue or repeated staged review.

This is intake 059 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Shared linked composition, app draft persistence, supported rich MIME and exact content authorization are in scope. This suite adds no generic autonomous compose authority, unreviewed AI dispatch, legal-content invention or arbitrary attachment-import feature. Other suites govern the actual workflow sources and scheduling/dispatch.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- `components/lease-renewal/RenewalMessagePreparation.tsx`, `lib/lease-renewal/current-renewal-message.ts`, `renewal-message-preparation.ts` and refined-message/AI edit consumers.
- `lib/firestore/renewal-message-preparations.ts`, `renewal-message-drafts.ts` and equivalent linked maintenance draft ownership.
- `lib/gmail-runtime/types.ts`, `raw-message.ts`, `client.ts` and `lib/lease-renewal/execution/live-gmail-draft-provider.ts`; align rich/plain transports without losing current bytes/evidence.

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

- **ARCH-S187-1** — The shared composer owns one persisted version with stable workflow identity; existing renewal composition is consumed rather than independently reconstructed with divergent facts.
- **ARCH-S187-2** — App-owned draft persistence is separate from Gmail creation/send authorization and follows S183/S184 ordinary-edit semantics.
- **ARCH-S187-3** — Server-resolved contacts and selected managed mailbox bind the draft; every edited recipient must still resolve through an allowed actual workflow contact contract.
- **ARCH-S187-4** — One canonical logical/MIME content contract includes plain text, HTML and supported attachment identity/bytes; send and draft transports cannot silently fall back to plaintext.
- **ARCH-S187-5** — The explicit action binds the visible version, actor, sender, recipients, content and attachment identities to S189's durable authorization or S190's immediate occurrence.
- **ARCH-S187-6** — AI refinement changes only a draft version under the program's conversational policy; it has no dispatch/approve/schedule entry point and cannot supply authoritative missing recipients.
- **ARCH-S187-7** — App-draft saved, Gmail-draft created, sending, sent and unknown outcome have different transitions and evidence; preserve exact prior draft receipts.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S187-1** — Opening from a lease yields available current content; reopening the draft restores staff edits rather than replacing them with a recomposed template.
- **BEH-S187-2** — Staff can edit, save and recover incomplete drafts without choosing a schedule, confirming a provider preview or seeking another approver.
- **BEH-S187-3** — Staff see To/Cc/Bcc where supported, sender and audience. Missing, ambiguous or changed contact mapping is explicit; no default recipient is guessed from a name or model answer.
- **BEH-S187-4** — Addresses/dollar formatting, line breaks and supported attachments seen in the final composer are retained in the provider-bound message; plain-text copy remains readable.
- **BEH-S187-5** — After reviewing the displayed end state, staff choose Send now or Schedule once; no second queue approval, hidden additional reviewer or separate preview-confirm-preview cycle appears.
- **BEH-S187-6** — Staff can prompt for wording changes and inspect/edit the result. The app gives a concise verification reminder, while actual source facts and outgoing content remain visible.
- **BEH-S187-7** — Staff know whether a draft is saved in the app, exists in Gmail or was sent. A provider failure never erases app content or displays a false Gmail success.

**Human litmus outcome.**

### Edit once and approve what will be sent

**If this was built correctly:** A staff member opens a linked message, freely saves it, refines its wording, checks the actual recipients and formatted body, and chooses Send now or Schedule once. The approved output retains the formatting and attachment they saw.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                        | Architecture outcome | Behavior outcome | Human litmus                            | Deterministic evidence / falsification                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S187-1** — Use one editable draft for the linked communication.                | `ARCH-S187-1`        | `BEH-S187-1`     | Edit once and approve what will be sent | `AC-S187-1`: Save/reopen across fresh browser context and changed source fixture restores authored wording and shows current-source differences; concurrent stale saves report conflict instead of overwriting. |
| **R-S187-2** — Autosave drafts without an operational approval step.               | `ARCH-S187-2`        | `BEH-S187-2`     | Edit once and approve what will be sent | `AC-S187-2`: Backend and browser cases save incomplete fields/offline recovery with zero send/worker calls; assert no approval-queue item or confirmation token is required for an ordinary save.               |
| **R-S187-3** — Show real sender and recipients before the end-state action.        | `ARCH-S187-3`        | `BEH-S187-3`     | Edit once and approve what will be sent | `AC-S187-3`: Wrong-lease recipient, missing email, account takeover, stale source and client-forged sender scenarios fail the affected effect while the editable draft survives.                                |
| **R-S187-4** — Preserve the exact rich message across preview and dispatch.        | `ARCH-S187-4`        | `BEH-S187-4`     | Edit once and approve what will be sent | `AC-S187-4`: Decode provider-adapter MIME and compare approved plain/HTML bodies, headers and attachment hashes; mutate HTML or attachment bytes after approval and require refusal of that version.            |
| **R-S187-5** — Make Send now or Schedule the single end-state authorization.       | `ARCH-S187-5`        | `BEH-S187-5`     | Edit once and approve what will be sent | `AC-S187-5`: Browser action count and backend authorization trace prove one deliberate end-state action; double click uses the same attempt identity and draft-save alone creates no authorization.             |
| **R-S187-6** — Keep AI assistance editable and non-authorizing.                    | `ARCH-S187-6`        | `BEH-S187-6`     | Edit once and approve what will be sent | `AC-S187-6`: Model-adapter attempts to add a recipient, claim an external action or schedule a send cannot execute; accepted text edits autosave and still require the human end-state action.                  |
| **R-S187-7** — Separate app draft state from actual Gmail draft/provider outcomes. | `ARCH-S187-7`        | `BEH-S187-7`     | Edit once and approve what will be sent | `AC-S187-7`: Provider success/refusal/timeout fixtures plus fresh reload show the right durable state and recovery action; no state is inferred from elapsed spinner time.                                      |

**Preservation set.**

Existing source-filled owner/tenant composition, exact current email/offer and signature meaning, source versus working-value distinctions, app autosave recovery, supported attachment bounds and own-receipt draft recovery. Preserve historical draft receipts without reinterpreting them as sends.

**Adversarial acceptance checks.**

- **AC-S187-1** — Falsify `ARCH-S187-1` and `BEH-S187-1`: Save/reopen across fresh browser context and changed source fixture restores authored wording and shows current-source differences; concurrent stale saves report conflict instead of overwriting.
- **AC-S187-2** — Falsify `ARCH-S187-2` and `BEH-S187-2`: Backend and browser cases save incomplete fields/offline recovery with zero send/worker calls; assert no approval-queue item or confirmation token is required for an ordinary save.
- **AC-S187-3** — Falsify `ARCH-S187-3` and `BEH-S187-3`: Wrong-lease recipient, missing email, account takeover, stale source and client-forged sender scenarios fail the affected effect while the editable draft survives.
- **AC-S187-4** — Falsify `ARCH-S187-4` and `BEH-S187-4`: Decode provider-adapter MIME and compare approved plain/HTML bodies, headers and attachment hashes; mutate HTML or attachment bytes after approval and require refusal of that version.
- **AC-S187-5** — Falsify `ARCH-S187-5` and `BEH-S187-5`: Browser action count and backend authorization trace prove one deliberate end-state action; double click uses the same attempt identity and draft-save alone creates no authorization.
- **AC-S187-6** — Falsify `ARCH-S187-6` and `BEH-S187-6`: Model-adapter attempts to add a recipient, claim an external action or schedule a send cannot execute; accepted text edits autosave and still require the human end-state action.
- **AC-S187-7** — Falsify `ARCH-S187-7` and `BEH-S187-7`: Provider success/refusal/timeout fixtures plus fresh reload show the right durable state and recovery action; no state is inferred from elapsed spinner time.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

**Dependencies / sequencing.**

S186 hosts this composer. S188 supplies sender/responsibility context; S189 authorizes scheduling and S190 dispatches. Existing renewal policy/working-value suites supply facts; maintenance suites supply their own verified message context. S183/S184 remove ordinary-edit approval toil.

**Standalone delivery contract.**

- **Deliverable now:** Canonical linked draft/composer, autosave and conflict recovery, exact rich serialization and single end-state action integration with deterministic authorization/transport seams.
- **Consumes, but does not assume:** Real contact mapping, supported attachments/resources, managed sender and available dispatch/scheduling contracts. Unavailable effects remain explicit while drafts stay editable.
- **Externally blocked effect:** Actual Gmail draft/send needs the managed connection and selected operation capability. Missing resource content blocks only output requiring it; rich-content parity is proved with deterministic exact bytes.
- **Produces for downstream suites:** One approved message snapshot and editable draft/version contract consumed by S189–S193.

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
