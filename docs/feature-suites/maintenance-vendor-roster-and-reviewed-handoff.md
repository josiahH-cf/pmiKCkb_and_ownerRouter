<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S210 — Approved primary and backup vendor roster and reviewed handoff

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 082. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
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

- **ARCH-S210-1** — Introduce shared roster preference ownership beside existing vendor identity/assignment services, separating contact identity from preference metadata. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-2** — Keep selection/preference projection distinct from `vendor.assignment.change` and the closed RentVine assignment seam. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-3** — Build one staff-reviewed handoff projection from S205/S209/S213 facts and S212 artifacts, with scoped artifact references and version binding. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-4** — Reuse existing exact assignment/communication services; no new generic provider method/path or hidden `sendVendorNotification` flag is introduced. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-5** — Use server-resolved current generations for roster/selection/packet saves and retain historical versions through S209. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S210-1** — Staff see who is approved for the trade and why; missing preference/contact is an actionable missing input.
- **BEH-S210-2** — A busy primary can be replaced by the backup or reviewed alternative; the ticket shows the exact selected vendor and current handoff state.
- **BEH-S210-3** — The vendor can understand what has already been tried and what is authorized without repeating all intake questions.
- **BEH-S210-4** — Staff can tell whether the packet is prepared, assigned in the app, manually sent or provider-verified; a saved packet is not presented as delivery.
- **BEH-S210-5** — A stale tab cannot assign the old vendor after reassignment or conceal what an earlier vendor received.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Choose a verified vendor and review the exact work handoff

**If this was built correctly:** A staff member selects the appropriate verified primary or backup vendor, reviews the useful work and access details, and prepares the handoff. The app distinguishes selection, assignment and an actually sent message, and changed facts require another review instead of silently reusing an old packet.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                                       | Architecture outcome | Behavior outcome | Human litmus                                               | Acceptance / deterministic falsification                                                                                                                                                  |
| ------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S210-1: Verified reusable roster                | ARCH-S210-1          | BEH-S210-1       | Choose a verified vendor and review the exact work handoff | AC-S210-1: Import/record verified references, duplicate contacts and revoked/inactive vendors; unsupported mapping stays unresolved and no real contact is seeded by fixtures.            |
| R-S210-2: Primary and backup selection            | ARCH-S210-2          | BEH-S210-2       | Choose a verified vendor and review the exact work handoff | AC-S210-2: Deactivate the primary or change preferences during selection; stale selections require review and no autonomous fallback dispatch occurs.                                     |
| R-S210-3: Reviewed useful work packet             | ARCH-S210-3          | BEH-S210-3       | Choose a verified vendor and review the exact work handoff | AC-S210-3: Compare staff and vendor packets; raw sentiment/private discussions stay absent, required missing access is visible and a changed estimate invalidates stale handoff approval. |
| R-S210-4: Deliberate human dispatch boundary      | ARCH-S210-4          | BEH-S210-4       | Choose a verified vendor and review the exact work handoff | AC-S210-4: Prepare and cancel a handoff with zero send/provider dispatch; a staff-recorded external send retains that attribution rather than minting a provider receipt.                 |
| R-S210-5: Versioned roster and handoff correction | ARCH-S210-5          | BEH-S210-5       | Choose a verified vendor and review the exact work handoff | AC-S210-5: Race preference/assignment and packet edits; stale writes conflict, approved correction is attributable and the case count stays one.                                          |

**Preservation set.**

`tests/unit/maintenance-notice-vendor.test.ts`, `maintenance-vendor-handoff-route.test.ts`, `vendor-assignment-boundary.test.ts`, `maintenance-execution-authority.test.ts`, S99 notification-off checks and existing vendor privacy.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S210-1** — R-S210-1, ARCH-S210-1, BEH-S210-1: Import/record verified references, duplicate contacts and revoked/inactive vendors; unsupported mapping stays unresolved and no real contact is seeded by fixtures.
- **AC-S210-2** — R-S210-2, ARCH-S210-2, BEH-S210-2: Deactivate the primary or change preferences during selection; stale selections require review and no autonomous fallback dispatch occurs.
- **AC-S210-3** — R-S210-3, ARCH-S210-3, BEH-S210-3: Compare staff and vendor packets; raw sentiment/private discussions stay absent, required missing access is visible and a changed estimate invalidates stale handoff approval.
- **AC-S210-4** — R-S210-4, ARCH-S210-4, BEH-S210-4: Prepare and cancel a handoff with zero send/provider dispatch; a staff-recorded external send retains that attribution rather than minting a provider receipt.
- **AC-S210-5** — R-S210-5, ARCH-S210-5, BEH-S210-5: Race preference/assignment and packet edits; stale writes conflict, approved correction is attributable and the case count stays one.

**Forbidden actions / hard gates.**

No invented primary vendor/contact, automatic alternative dispatch, RentVine vendor assignment or notification through a different key, raw sentiment forwarding, or claim that handoff preparation proves signed/sent/received work.

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
