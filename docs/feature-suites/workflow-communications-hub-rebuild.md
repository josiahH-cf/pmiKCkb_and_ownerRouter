<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S186 — Workflow Communications hub rebuilt around real work

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

Staff manage linked incoming mail, outgoing mail, drafts and schedules in one clear workspace, and open a prepopulated communication from a lease in a new tab.

**Current state / intended end state.**

The current `/gmail-hub` uses `GmailHubHome`, `LiveGmailWorkspace` and `WorkflowCommunicationPanel`; S175 changed hierarchy rather than replacing the complete experience. Workflow links already carry entity, purpose, contact and waiting metadata. Lease-specific message preparation remains a separate surface. The new end state replaces the Communications UI from top to bottom, uses those real workflow associations, and exposes a coherent working hub rather than a setup-led page or general inbox.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Ordinary authorized PMI staff use their managed account and accessible renewal/maintenance work. A lease or ticket link establishes context, not permission. Source mapping may be unresolved while a draft is editable; sending still needs real resolved recipients and the named capability.

**What it is / how it functions.**

Provide a simple tailored workspace for Incoming, Outgoing, Drafts and Scheduled work, with a selected communication and its linked lease/ticket always understandable. Lease message actions open the hub in a new tab with the real lease, audience/purpose and available source-filled content. Returning to the original lease preserves that work context. Normal page entry and deep linking perform no send, scheduling or provider mutation.

This is intake 058 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

The complete communication presentation, workflow navigation, selection/filtering, responsive hierarchy and truthful states are in scope. A full unrelated personal inbox, broad marketing/commercial campaigns and generic recipient discovery are outside scope. Read-only Gmail discovery may locate a relevant existing thread for explicit linking, subject to S188 privacy.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- `app/gmail-hub/page.tsx`, `components/gmail-hub/GmailHubHome.tsx`, `LiveGmailWorkspace.tsx` and `WorkflowCommunicationPanel.tsx`.
- Lease entry in `components/lease-renewal/RenewalMessagePreparation.tsx` and links derived from `lib/gmail-hub/workflow-context.ts`.
- Canonical labels in `lib/gmail-hub/communication-state.ts`, navigation and global search consumers, current workflow-linked help. S193 owns final retirement.

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

- **ARCH-S186-1** — One hub view model owns the four work categories and selected workflow context; remove duplicated client owners instead of layering another dashboard over them.
- **ARCH-S186-2** — A server-validated deep-link contract carries stable lease identity and audience/purpose into the shared composer; URL context is never authority or serialized private message content.
- **ARCH-S186-3** — Category, workflow, audience, responsible staff and status filters consume canonical associations; distinguish workspace filters from any personal Gmail discovery result.
- **ARCH-S186-4** — All hub badges, linked lease/ticket cards, Dashboard/search summaries and notification links consume the same communication/schedule projections; outgoing attempt is distinct from confirmed sent.
- **ARCH-S186-5** — Shared layout and transient controls retain selected entity/content without horizontal overflow, inaccessible icon-only controls or a hidden primary action.
- **ARCH-S186-6** — Hub entry and read projections have no dispatch/schedule/create-draft dependency; explicit composer actions invoke the appropriate effect contract.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S186-1** — Staff can reach incoming, outgoing, draft and scheduled work through clearly labelled controls; setup/recovery is available without leading every working screen.
- **BEH-S186-2** — From a lease, staff choose the owner/tenant communication action and a new hub tab opens with that lease and available subject/body/recipient mapping; the original tab stays usable.
- **BEH-S186-3** — Staff find a lease/ticket's related work, clear filters without losing the selected item's identity, and see an honest empty or unavailable state rather than unrelated mail.
- **BEH-S186-4** — A draft, scheduled message, paused sequence, confirmed send and unknown send each display their actual state consistently wherever linked.
- **BEH-S186-5** — Staff read/edit messages and reach primary actions at supported narrow and wide viewports with labelled keyboard controls and visible save/loading/error feedback.
- **BEH-S186-6** — Opening a tab, switching a category, filtering, viewing a linked item or following a return link never schedules, creates Gmail content or sends a message.

**Human litmus outcome.**

### One place for communication work

**If this was built correctly:** A staff member opens an owner message from a lease, sees a new tab already filled for the correct lease, edits it, and can clearly find that message later among drafts or scheduled work without hunting through setup panels.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                         | Architecture outcome | Behavior outcome | Human litmus                     | Deterministic evidence / falsification                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | -------------------- | ---------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S186-1** — Replace the entire Communications UI with a task-led hub.            | `ARCH-S186-1`        | `BEH-S186-1`     | One place for communication work | `AC-S186-1`: Compiled browser journey visits all four categories with nonempty, empty and selected states; compare the actual render against the old setup-led starting screen and inspect category/source ownership. |
| **R-S186-2** — Open lease communication in a new tab, already populated and linked. | `ARCH-S186-2`        | `BEH-S186-2`     | One place for communication work | `AC-S186-2`: Browser test asserts a new page, exact linked real-id context and populated editable content; forged/wrong-scope links refuse without sending or exposing another lease.                                 |
| **R-S186-3** — Make communication discovery and filtering predictable.              | `ARCH-S186-3`        | `BEH-S186-3`     | One place for communication work | `AC-S186-3`: Seed multiple workflow identities and owners in the adapter; filter combinations preserve the full eligible set, exclude inaccessible work and separate zero matches from read failure.                  |
| **R-S186-4** — Use one truthful communication status vocabulary.                    | `ARCH-S186-4`        | `BEH-S186-4`     | One place for communication work | `AC-S186-4`: Cross-consumer parity fixture traverses draft/scheduled/paused/sent/ambiguous states and verifies no view calls an attempted or scheduled message sent.                                                  |
| **R-S186-5** — Support useful desktop and phone workspaces.                         | `ARCH-S186-5`        | `BEH-S186-5`     | One place for communication work | `AC-S186-5`: Compiled-browser checks at repository-supported responsive sizes cover long address/body, keyboard focus, loading, autosave failure and recovery without content loss.                                   |
| **R-S186-6** — Keep navigation free of live effects.                                | `ARCH-S186-6`        | `BEH-S186-6`     | One place for communication work | `AC-S186-6`: Provider/worker spies across all navigation journeys record zero mutation calls; forged and stale links preserve that property.                                                                          |

**Preservation set.**

Preserve authorized workflow/Space visibility, real lease/ticket links, existing unsent drafts and receipts, managed-mailbox boundaries, canonical contact/waiting evidence and existing read-only discovery behavior. Preserve the original lease tab's working state. Verify these separately from the new hub layout.

**Adversarial acceptance checks.**

- **AC-S186-1** — Falsify `ARCH-S186-1` and `BEH-S186-1`: Compiled browser journey visits all four categories with nonempty, empty and selected states; compare the actual render against the old setup-led starting screen and inspect category/source ownership.
- **AC-S186-2** — Falsify `ARCH-S186-2` and `BEH-S186-2`: Browser test asserts a new page, exact linked real-id context and populated editable content; forged/wrong-scope links refuse without sending or exposing another lease.
- **AC-S186-3** — Falsify `ARCH-S186-3` and `BEH-S186-3`: Seed multiple workflow identities and owners in the adapter; filter combinations preserve the full eligible set, exclude inaccessible work and separate zero matches from read failure.
- **AC-S186-4** — Falsify `ARCH-S186-4` and `BEH-S186-4`: Cross-consumer parity fixture traverses draft/scheduled/paused/sent/ambiguous states and verifies no view calls an attempted or scheduled message sent.
- **AC-S186-5** — Falsify `ARCH-S186-5` and `BEH-S186-5`: Compiled-browser checks at repository-supported responsive sizes cover long address/body, keyboard focus, loading, autosave failure and recovery without content loss.
- **AC-S186-6** — Falsify `ARCH-S186-6` and `BEH-S186-6`: Provider/worker spies across all navigation journeys record zero mutation calls; forged and stale links preserve that property.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

**Dependencies / sequencing.**

S183/S184 define the simplified operational authority contract. S187 supplies the composer; S188 supplies team visibility; S189–S192 supply scheduling and states; S193 retires old entry paths. The hub must render unavailable capabilities honestly while those boundaries are absent.

**Standalone delivery contract.**

- **Deliverable now:** A complete hub presentation and secure deep-link/selection contract, with deterministic category state adapters and compiled-browser evidence; no live dispatch is required to prove it.
- **Consumes, but does not assume:** Verified lease/ticket mapping, communication projections and composer/schedule capability availability. Missing data appears as an editable draft context or bounded unavailable operation, never invented content.
- **Externally blocked effect:** An actual Gmail read/draft/send is blocked only by its real managed connection, provider permission or exact operation capability. Hub navigation and local interaction acceptance remain independently testable.
- **Produces for downstream suites:** One workflow-centred navigation/view contract for S187–S193, global search and lease/ticket links.

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
