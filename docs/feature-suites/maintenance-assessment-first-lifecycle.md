<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S205 — Assessment-first maintenance lifecycle and staff control

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 077. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
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

- **ARCH-S205-1** — Extend the existing ticket/activity owner rather than create a competing workflow store or overwrite provider status. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-2** — Make one assessment-aware projection extend `projectMaintenanceWaitingOn`, consuming S213 policy/results and keeping source versus staff decisions distinct. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-3** — Define legal transitions and version conflict handling within the current ticket/activity service; persist actor/time/reason for material transitions. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-4** — Enforce closure authority in the server transition owner and feed S212 reports as evidence only. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-5** — Use one queue/detail projection over ticket/activity records; no new external follow-up sender is introduced. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S205-1** — A newly captured routine issue opens in assessment and does not tell staff to email an owner merely because no estimate exists.
- **BEH-S205-2** — The ticket explains the applicable standing approval or exact owner decision needed after assessment; unchanged trivial intake creates no communication automatically.
- **BEH-S205-3** — Staff can advance or return a case deliberately; a stale tab cannot overwrite another staff member's assessment or closeout.
- **BEH-S205-4** — A vendor-complete ticket waits for PMI review; PMI sees remaining issues and may accept or return it.
- **BEH-S205-5** — Staff can filter aging cases and see why a case waits without treating elapsed age as automatic approval or dispatch.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Assess and finish maintenance with clear PMI control

**If this was built correctly:** A PMI staff member records an issue, assesses it before deciding whether owner approval or a vendor is needed, and sees the current next action and how long it has waited. A vendor can submit completed work, but PMI reviews the evidence and makes the final closure decision.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                            | Architecture outcome | Behavior outcome | Human litmus                                         | Acceptance / deterministic falsification                                                                                                                                      |
| -------------------------------------- | -------------------- | ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S205-1: Assess before approval       | ARCH-S205-1          | BEH-S205-1       | Assess and finish maintenance with clear PMI control | AC-S205-1: A missing-estimate intake starts at assessment; a resolved-by-troubleshooting outcome needs no owner draft and retains its evidence.                               |
| R-S205-2: Conditional owner decision   | ARCH-S205-2          | BEH-S205-2       | Assess and finish maintenance with clear PMI control | AC-S205-2: Exercise absent estimate, within/equal/above configured threshold, revoked policy and existing provider approval; no test substitutes a made-up production policy. |
| R-S205-3: Staff-controlled lifecycle   | ARCH-S205-3          | BEH-S205-3       | Assess and finish maintenance with clear PMI control | AC-S205-3: Table-test every supported forward/return/cancel/reopen transition and concurrent conflicting transitions; provider status is never silently rewritten.            |
| R-S205-4: PMI final closure            | ARCH-S205-4          | BEH-S205-4       | Assess and finish maintenance with clear PMI control | AC-S205-4: Attempt vendor/direct-route closure and stale completion acceptance; both refuse while a valid PMI review closes once with evidence.                               |
| R-S205-5: Usable next action and aging | ARCH-S205-5          | BEH-S205-5       | Assess and finish maintenance with clear PMI control | AC-S205-5: At the three-day calendar boundary a still-open case appears in the internal queue; a read refresh does not hide aging; closed cases are excluded.                 |

**Preservation set.**

`tests/unit/maintenance-tickets.test.ts`, `maintenance-ticket-activity-route.test.ts`, `s108-maintenance-waiting-on.test.ts`, `s109-intake-triage.test.ts` and `maintenance-ai-boundary.test.ts`; S99/S100 source-state distinctions, public quarantine and existing staff access.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S205-1** — R-S205-1, ARCH-S205-1, BEH-S205-1: A missing-estimate intake starts at assessment; a resolved-by-troubleshooting outcome needs no owner draft and retains its evidence.
- **AC-S205-2** — R-S205-2, ARCH-S205-2, BEH-S205-2: Exercise absent estimate, within/equal/above configured threshold, revoked policy and existing provider approval; no test substitutes a made-up production policy.
- **AC-S205-3** — R-S205-3, ARCH-S205-3, BEH-S205-3: Table-test every supported forward/return/cancel/reopen transition and concurrent conflicting transitions; provider status is never silently rewritten.
- **AC-S205-4** — R-S205-4, ARCH-S205-4, BEH-S205-4: Attempt vendor/direct-route closure and stale completion acceptance; both refuse while a valid PMI review closes once with evidence.
- **AC-S205-5** — R-S205-5, ARCH-S205-5, BEH-S205-5: At the three-day calendar boundary a still-open case appears in the internal queue; a read refresh does not hide aging; closed cases are excluded.

**Forbidden actions / hard gates.**

Do not require an intake owner email, infer owner consent from silence, let a model/vendor close a PMI case, or bypass a real spending decision. Emergency guidance is shown immediately and is not delayed by ordinary assessment.

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
