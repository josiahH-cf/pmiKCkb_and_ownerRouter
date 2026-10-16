<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S214 — Readable maintenance history, monthly owner reports and PDF/CSV exports

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 086. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
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

- **ARCH-S214-1** — Build one report projection over canonical S209 identities/history; preserve point-in-time associations instead of attributing all old work to the current tenancy/owner. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-2** — Consume S213 category/allocation projections and produce reproducible totals; do not recalculate policy or make accounting writes inside reporting. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-3** — Use durable artifact access and minimized audience projections from S209/S212/S213, with report snapshot/source references for reproducibility. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-4** — Keep one report data model for interactive display and exported layouts; visuals consume the exact projected data rather than independently querying/recounting. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-5** — Use a standalone bounded export service over the same snapshot, with progress/failure/retry states and access recheck at download. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-6** — Integrate with S209 retention/artifact lineage and query pagination; bounded projections explicitly report incomplete reads rather than silently truncating. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S214-1** — A user can explain what 'five tickets this month' means and see whether prior coverage is incomplete.
- **BEH-S214-2** — Staff can explain why owner charge differs from vendor invoice and which amounts await review/payment evidence.
- **BEH-S214-3** — A reader can follow a reported amount to the job/invoice and understand staff/vendor/provider evidence distinctions.
- **BEH-S214-4** — The report is easy to scan on screen and in print; missing data and no-work periods are understandable.
- **BEH-S214-5** — A staff member downloads the selected report with all rows and totals; a failed generation reports the real state rather than a blank file.
- **BEH-S214-6** — Ten-plus-year reporting can use retained history and explain corrections/coverage; a saved old report remains attributable.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Export a readable owner maintenance history

**If this was built correctly:** PMI chooses an owner, property, unit or lease and a month or custom period, then sees clearly defined work counts, separate financial totals and evidence links. The matching PDF is readable across pages, the CSV contains the same scoped facts, and a later correction is distinguishable from an earlier retained export.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                                    | Architecture outcome | Behavior outcome | Human litmus                                | Acceptance / deterministic falsification                                                                                                                                                         |
| ---------------------------------------------- | -------------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S214-1: Explicit scope, period and coverage  | ARCH-S214-1          | BEH-S214-1       | Export a readable owner maintenance history | AC-S214-1: Use turnover, tickets spanning months, late-recorded events and a pre-rollout period; counts match their declared definition with no invented backfill.                               |
| R-S214-2: Separated cost and payment totals    | ARCH-S214-2          | BEH-S214-2       | Export a readable owner maintenance history | AC-S214-2: Reconcile totals for estimate-only, credit, revised/duplicate invoice, split cost and partial payment fixtures; no category mixing or double-counting.                                |
| R-S214-3: History and evidence drilldown       | ARCH-S214-3          | BEH-S214-3       | Export a readable owner maintenance history | AC-S214-3: Expire raw communications and provider links while retaining core artifacts; report evidence still works, inappropriate raw/internal content never enters export.                     |
| R-S214-4: Useful visual design                 | ARCH-S214-4          | BEH-S214-4       | Export a readable owner maintenance history | AC-S214-4: Render long/multi-page, sparse/empty, many-ticket and incomplete-period cases; inspect charts/tables/labels and narrow-screen accessibility against exact data.                       |
| R-S214-5: Reliable PDF and CSV export          | ARCH-S214-5          | BEH-S214-5       | Export a readable owner maintenance history | AC-S214-5: Inspect actual rendered PDF pages and parse CSV with commas/newlines/formula-like text; totals/rows/scope match screen and no private data leaks.                                     |
| R-S214-6: Long-term reproducibility and access | ARCH-S214-6          | BEH-S214-6       | Export a readable owner maintenance history | AC-S214-6: Simulate ten-year time passage, access revocation, correction and partial query; current report and retained prior artifact remain distinguishable and unauthorized download refuses. |

**Preservation set.**

Existing blocker projection/report and `tests/unit/s108-maintenance-waiting-on.test.ts`, current ticket/vendor access, product/communications retention, financial no-post/no-paid-inference contract and source privacy.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S214-1** — R-S214-1, ARCH-S214-1, BEH-S214-1: Use turnover, tickets spanning months, late-recorded events and a pre-rollout period; counts match their declared definition with no invented backfill.
- **AC-S214-2** — R-S214-2, ARCH-S214-2, BEH-S214-2: Reconcile totals for estimate-only, credit, revised/duplicate invoice, split cost and partial payment fixtures; no category mixing or double-counting.
- **AC-S214-3** — R-S214-3, ARCH-S214-3, BEH-S214-3: Expire raw communications and provider links while retaining core artifacts; report evidence still works, inappropriate raw/internal content never enters export.
- **AC-S214-4** — R-S214-4, ARCH-S214-4, BEH-S214-4: Render long/multi-page, sparse/empty, many-ticket and incomplete-period cases; inspect charts/tables/labels and narrow-screen accessibility against exact data.
- **AC-S214-5** — R-S214-5, ARCH-S214-5, BEH-S214-5: Inspect actual rendered PDF pages and parse CSV with commas/newlines/formula-like text; totals/rows/scope match screen and no private data leaks.
- **AC-S214-6** — R-S214-6, ARCH-S214-6, BEH-S214-6: Simulate ten-year time passage, access revocation, correction and partial query; current report and retained prior artifact remain distinguishable and unauthorized download refuses.

**Forbidden actions / hard gates.**

No misleading complete-history claim, guessed paid/markup amount, silent row truncation, external report send, raw sentiment/default transcript export, unsafe CSV formula execution or creation of an owner login by inference.

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
