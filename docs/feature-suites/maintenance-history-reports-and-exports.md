<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S214 — Readable maintenance history, monthly owner reports and PDF/CSV exports

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 086. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

PMI staff can explain maintenance over a selected month or date range with attractive, readable reports whose ticket counts, costs and evidence remain traceable years later.

**Current state / intended end state.**

`MaintenanceBlockerReport.tsx` reports current blockers/estimates/preapproval/assignee and last activity. There is no historical maintenance analytics, owner/lease cost report, or dedicated PDF/CSV export service.

Provide monthly/custom-period history views and presentation-quality exports over S209's prospective history and S213's explicit financial categories. Report coverage, count/date definitions, missing evidence and payment verification clearly; do not backfill history or automatically send reports.

**Actors and entry conditions.**

Authorized PMI staff prepare/view/export reports for a real owner/property/unit/lease scope. Vendors see only their assigned work under their own projection. Owner-facing export is a reviewed artifact, not a new owner account or delivery grant.

**What it is / how it functions.**

- **R-S214-1 — Explicit scope, period and coverage.** Select owner/property/unit/lease and calendar month or custom date range in the configured business timezone. Show period and history coverage start; define opened-in-period, completed-in-period and open-as-of-end counts separately, and keep service/invoice/payment date labels distinct.
- **R-S214-2 — Separated cost and payment totals.** Display estimated, invoiced/vendor cost, reviewed owner charge/markup and verified-paid amounts separately with source/period basis. Unknown is not zero, credits/partial allocation are explicit, and an invoice is not labelled paid.
- **R-S214-3 — History and evidence drilldown.** Show chronological jobs, trade/vendor, assessment/work/completion dates, reviewed scope, cost and permitted retained documents with source labels. Keep raw sentiment/internal conversations out of default owner-ready content; expired raw source is marked unavailable.
- **R-S214-4 — Useful visual design.** Provide clear summary hierarchy, readable tables, monthly trend charts and concise legends with accessible text equivalents; chart axes/counts/totals must agree with the underlying report. Handle empty/incomplete periods and long addresses/vendor names gracefully.
- **R-S214-5 — Reliable PDF and CSV export.** Generate a readable paginated PDF and a data-faithful UTF-8 CSV for the same selected report snapshot. Include scope/period/generated time/coverage/definitions, repeat table headers and prevent clipping; CSV neutralizes spreadsheet formula injection without losing values.
- **R-S214-6 — Long-term reproducibility and access.** Retain a report's selected facts/version references and approved export artifact as core evidence when deliberately saved. Corrected source records yield a newly identified report, without silently altering an earlier exported artifact; exports remain subject to current actor scope.

**In scope / out of scope.**

In scope: staff report workspace, monthly/custom range projections, readable charts/tables, reviewed owner-ready PDF/CSV, evidence drilldown and reproducibility. Out of scope: historical maintenance backfill, automated report send, owner portal, accounting posting, inferred liability or raw-conversation retention changes.

**Open questions & assumptions.**

Actual cost/markup/payment policies come from S213 and remain explicit. Date/count definitions above are required presentation semantics, not claims about current data. The report states incomplete prospective coverage and unavailable payment evidence rather than inventing an arbitrary accuracy target.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `components/maintenance/MaintenanceBlockerReport.tsx`, `app/maintenance/page.tsx` — current operational report entry to extend without replacing its blocker purpose.
- `lib/firestore/maintenance-tickets.ts`, `maintenance-work-order-links.ts`; S209/S212/S213 — canonical history, artifacts and financial projection.
- Existing authorized artifact storage/product retention — candidate reuse for saved report artifacts; a new report/export owner is implementation work, not an established path.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S214-1** — Build one report projection over canonical S209 identities/history; preserve point-in-time associations instead of attributing all old work to the current tenancy/owner. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-2** — Consume S213 category/allocation projections and produce reproducible totals; do not recalculate policy or make accounting writes inside reporting. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-3** — Use durable artifact access and minimized audience projections from S209/S212/S213, with report snapshot/source references for reproducibility. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-4** — Keep one report data model for interactive display and exported layouts; visuals consume the exact projected data rather than independently querying/recounting. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-5** — Use a standalone bounded export service over the same snapshot, with progress/failure/retry states and access recheck at download. Freeze a focused falsification before changing this boundary.
- **ARCH-S214-6** — Integrate with S209 retention/artifact lineage and query pagination; bounded projections explicitly report incomplete reads rather than silently truncating. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S214-1** — A user can explain what 'five tickets this month' means and see whether prior coverage is incomplete.
- **BEH-S214-2** — Staff can explain why owner charge differs from vendor invoice and which amounts await review/payment evidence.
- **BEH-S214-3** — A reader can follow a reported amount to the job/invoice and understand staff/vendor/provider evidence distinctions.
- **BEH-S214-4** — The report is easy to scan on screen and in print; missing data and no-work periods are understandable.
- **BEH-S214-5** — A staff member downloads the selected report with all rows and totals; a failed generation reports the real state rather than a blank file.
- **BEH-S214-6** — Ten-plus-year reporting can use retained history and explain corrections/coverage; a saved old report remains attributable.

**Human litmus outcome.**

### Export a readable owner maintenance history

**If this was built correctly:** PMI chooses an owner, property, unit or lease and a month or custom period, then sees clearly defined work counts, separate financial totals and evidence links. The matching PDF is readable across pages, the CSV contains the same scoped facts, and a later correction is distinguishable from an earlier retained export.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

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

S209 canonical prospective history and S213 financial semantics supply report inputs; S212 artifacts add evidence. Full Vendoroo integration is not required for ordinary staff/vendor reports, and missing S208 data is visibly limited.

**Standalone delivery contract.**

- **Deliverable now:** One historical report projection/UI, PDF+CSV service, evidence/access/coverage handling and rendered export verification across representative cases.
- **Consumes, but does not assume:** Retained actual history/financial facts and current user scope; missing categories remain missing and provenance is preserved.
- **Externally blocked effect:** None for engineering/report preparation. Actual owner delivery and unavailable provider/payment evidence remain separate; reports cannot claim missing information has been verified.
- **Produces for downstream suites:** Readable traceable period report snapshots and exports for staff/owner handoff and S215 integrated verification.

**Verification and delivery contract.**

1. Re-read current owners and refresh the baseline before implementation. Materialize the named architecture, behavior and acceptance falsifications; record pre-existing unrelated failures separately.
2. Exercise every row with service/transaction and rendered journeys appropriate to the outcome, including denial, interruption, concurrency and partial completion. Use isolated local fixtures and deterministic external adapters; keep the preservation result separate.
3. Read back saved artifacts/state and reconcile them with the acted-on identity/version. A UI success label, supplied example or passing adapter cannot establish live provider success.
4. Run focused checks, then `bash scripts/verify.sh` and applicable compiled-browser checks for any later ship candidate. Audit secrets/PII, authority, runtime configuration and cross-suite traceability.
5. A later authorized implementation reports ALL_GATES_GREEN only for completed declared engineering checks; a named live/account proof remains separately BLOCKED when its input is missing. BUDGET_EXHAUSTED applies only to an explicit budget. Never label the whole operational outcome complete from a partial green slice.
6. Authoring registration/validation is documentary only. Commit, push, deployment, implementation-loop start and external communication require their own explicit instruction.

**Ordered prompt sequence.**

1. Re-verify current source, accepted decisions, dependency contracts and relevant read-only state.
2. Freeze the requirement/architecture/behavior/acceptance matrix and preservation baseline before implementation.
3. Implement the bounded owner and all unavailable/recovery paths; reuse existing services and keep adjacent suite ownership explicit.
4. Falsify every row, read back persisted results, run focused/canonical checks, update verified current documentation and deliver only when separately authorized.

**Deletion/merge recommendation.**

Retain this suite until its full behavior, remaining dependencies and acceptance evidence are represented in current code/tests/facts. Then merge its operating contract into current maintenance documentation; preserve historical evidence without keeping duplicate active instructions.
