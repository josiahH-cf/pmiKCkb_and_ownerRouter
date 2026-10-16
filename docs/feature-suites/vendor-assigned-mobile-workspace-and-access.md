<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S211 — Assigned-vendor identity, access and mobile ticket workspace

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 083. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Retain the original maintenance/vendor records, receipts, permissions and historical requirement evidence after custom maintenance retirement. S227 owns the current operating contract; Vendoroo remains standalone.

**Current state / intended end state.**

October 15 30:54–31:32 and the confirming maintenance emails retire the custom workflow. The source baseline 0b892865 contains the earlier implementation or proposal recorded below; S227 retires operational entry and preserves authorized read-only history. S227–S229 are under verification, with no new deployment claimed. Earlier authoring and delivery evidence retains its original scope.

**Actors and entry conditions.**

Existing authorized readers retain their current permissions. No new maintenance intake, vendor work, provider action, maintenance draft, integration access request or old proof window may start from this contract. Shared renewal and knowledge behavior remains separately owned.

**What it is / how it functions.**

Read-only retention uses the existing stores and receipt/history readers under their original authorization, with operational requests refused before dispatch. No records are deleted or relabeled. Current maintenance is managed in standalone Vendoroo; no destination URL or integration is invented.

**In scope / out of scope.**

Only retention, historical interpretation and permission compatibility remain applicable. All former operational maintenance/vendor requirements and Vendoroo ingestion work in the historical trace below are superseded by S227. Raw private sources remain outside Git. This file grants no new execution or release authority.

**Open questions & assumptions.**

Former provider/account/policy inputs are not prerequisites for retirement and must not trigger duplicate requests. Fresh read-only provider evidence and deployment are held only by the exact authentication/browser limitations recorded in docs/open-blockers.md. Missing observations are not success.

**Cross-product impacts.**

S227 owns retired HTTP and shared effect admission, authorized history and reports. Existing stores, receipts and permissions remain unchanged. Renewal, workflow-linked unsent communications, search and knowledge retain their independent contracts. The historical architecture below identifies original owners for preservation only; it does not request extensions or integration.

**Authority and evidence map.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **ARCH-S211-1** — Extend existing vendor auth/setup/lifecycle owners and generation-bound prepared actions rather than create parallel credentials or session stores. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-2** — Reuse `requireAssignedTicket`, current vendor store/lifecycle and exact assignment identity; propagate current assignment authority into S212 handlers. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-3** — Expand `VendorTicketProjection` through an explicit minimized projection over S210/S209 instead of returning the staff ticket or raw source body. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-4** — Separate portal entitlement from mailbox health/OAuth dependencies; preserve current auth strength rather than coupling it to Gmail state. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-5** — Use existing live-lifecycle claim/receipt/reconciliation owners; do not create replacement accounts or redispatch ambiguous delivery as a shortcut. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S211-1** — A real vendor can tell what setup remains, finish their own challenge and reach assigned work; missing permission/configuration explains only the exact unavailable step.
- **BEH-S211-2** — A vendor sees only their assigned work; an old saved link after reassignment no longer opens it.
- **BEH-S211-3** — At narrow screen widths a vendor can understand the job and find permitted actions with readable labels, focus and upload/progress affordances.
- **BEH-S211-4** — An active assigned vendor with no connected mailbox can read the job and contribute allowed ticket data.
- **BEH-S211-5** — PMI sees whether setup invitation/assignment actually settled; a lost response offers reconciliation instead of another account/send.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Open assigned work securely from a phone

**If this was built correctly:** A verified vendor signs in on a phone and finds only the tickets currently assigned to them, with useful approved work details and contribution controls. They can work without connecting a mailbox; reassignment or account disablement removes access to the affected work and files.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                                           | Architecture outcome | Behavior outcome | Human litmus                             | Acceptance / deterministic falsification                                                                                                                                            |
| ----------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S211-1: Reuse existing verified identity lifecycle  | ARCH-S211-1          | BEH-S211-1       | Open assigned work securely from a phone | AC-S211-1: Exercise expired invite, wrong identity, incomplete TOTP, disabled account and enrollment resume; no unverified principal reaches ticket detail.                         |
| R-S211-2: Current assignment server authority         | ARCH-S211-2          | BEH-S211-2       | Open assigned work securely from a phone | AC-S211-2: Try guessed ticket/artifact IDs, cached stale assignment, concurrent reassignment and disabled sessions; no unrelated data leaks or post-revocation submission succeeds. |
| R-S211-3: Mobile reviewed work detail                 | ARCH-S211-3          | BEH-S211-3       | Open assigned work securely from a phone | AC-S211-3: Render empty/loading/error/long-text/mobile/keyboard cases; compare staff versus vendor response fields and forbid hidden raw/private payload leakage.                   |
| R-S211-4: Independent ticket work                     | ARCH-S211-4          | BEH-S211-4       | Open assigned work securely from a phone | AC-S211-4: Use a principal with no mailbox, revoked mailbox and healthy mailbox; ticket outcomes are identical within assignment, while mailbox actions retain their own checks.    |
| R-S211-5: Recoverable lifecycle and honest activation | ARCH-S211-5          | BEH-S211-5       | Open assigned work securely from a phone | AC-S211-5: Lose invite/assignment response, restart and reconcile; one identity/assignment result is retained and no automatic duplicate invitation occurs.                         |

**Preservation set.**

`tests/unit/vendor-auth.test.ts`, `vendor-assignment-boundary.test.ts`, `vendor-readonly-access.test.ts`, `vendor-live-lifecycle-service.test.ts`, `live-vendor-setup-route.test.ts`, `s165-vendor-sign-in-mobile.test.tsx`, `tests/firestore/vendor-portal.rules.test.ts`.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S211-1** — R-S211-1, ARCH-S211-1, BEH-S211-1: Exercise expired invite, wrong identity, incomplete TOTP, disabled account and enrollment resume; no unverified principal reaches ticket detail.
- **AC-S211-2** — R-S211-2, ARCH-S211-2, BEH-S211-2: Try guessed ticket/artifact IDs, cached stale assignment, concurrent reassignment and disabled sessions; no unrelated data leaks or post-revocation submission succeeds.
- **AC-S211-3** — R-S211-3, ARCH-S211-3, BEH-S211-3: Render empty/loading/error/long-text/mobile/keyboard cases; compare staff versus vendor response fields and forbid hidden raw/private payload leakage.
- **AC-S211-4** — R-S211-4, ARCH-S211-4, BEH-S211-4: Use a principal with no mailbox, revoked mailbox and healthy mailbox; ticket outcomes are identical within assignment, while mailbox actions retain their own checks.
- **AC-S211-5** — R-S211-5, ARCH-S211-5, BEH-S211-5: Lose invite/assignment response, restart and reconcile; one identity/assignment result is retained and no automatic duplicate invitation occurs.

**Forbidden actions / hard gates.**

Do not open lifecycle keys by writing specs, bypass TOTP/email verification, reuse staff cookies, expose internal Spaces or make Gmail OAuth a gate for ticket submissions. Protected auth/rules changes require the later authorized governance/execution scope.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Use S227 for maintenance retirement and retained read-only compatibility. S228 owns current Dotloop diagnostics and S229 renewal/unsent communications preservation. Do not resume the old maintenance, Vendoroo integration or proof sequence from this historical contract.

**Standalone delivery contract.**

- **Deliverable now:** The S227 retirement/retention slice, preserving original evidence without migration effects.
- **Consumes, but does not assume:** Existing authorized history and exact receipts.
- **Externally blocked effect:** No former maintenance/provider effect is requested. Current live verification holds are in docs/open-blockers.md.
- **Produces for downstream suites:** Original record/receipt meanings and permissions, without new operational authority.

**Verification and delivery contract.**

1. Verify current S227 retirement and read-only retention through the real request, service and authorized reader boundaries.
2. Preserve original requirement IDs, historical verdicts, records and receipt meanings. Do not execute the superseded operational acceptance outcomes or collect retired integration inputs.
3. Use S227-S229 for current focused regressions, required repository checks and authorized gated delivery. Record local, live-provider, human and deployment outcomes separately; missing evidence cannot become success.
4. Report ALL_GATES_GREEN only for actually completed current engineering gates, BUDGET_EXHAUSTED only for an explicit budget, or BLOCKED with its exact unavailable external input after independent work. These terminal states do not resume the superseded operational outcomes.

**Ordered prompt sequence.**

1. Read the current router and S227; verify actual retirement/retention behavior.
2. Use original evidence below only for provenance and preservation scope.
3. Do not execute former operational instructions, collect retired integration inputs or rerun completed proofs.
4. Verify and deliver the currently authorized S227–S229 slice through existing gates.

**Deletion/merge recommendation.**

The original operational contract is superseded by S227. Its historical trace remains temporarily available for native program-ledger consistency; it is not an execution queue. Remove that provenance only with its remaining evidence references reconciled, retaining originals in Git history.
