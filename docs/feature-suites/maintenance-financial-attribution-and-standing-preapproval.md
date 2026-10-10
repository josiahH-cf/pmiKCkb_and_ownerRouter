<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S213 — Maintenance financial attribution, standing preapproval and retained evidence

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 085. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

PMI staff can assess actual maintenance costs, apply a correctly scoped standing preapproval and report estimates, vendor charges, owner charges and verified payment without conflating them.

**Current state / intended end state.**

S108 stores a staff estimate in whole cents and versioned property preapproval; RentVine maintenance-limit import exists. `waiting-on.ts` distinguishes provider owner approval from app preapproval, but there is no full invoice/markup/payment attribution ledger or lifecycle-aware approval basis.

Extend the current financial/preapproval owners with explicit scope, effective policy, amount boundary, cost basis and evidence. Record/review/reconcile/report; do not post accounting, collect funds or pay vendors under this suite. The accepted $250 recommendation is a configurable policy option, not a universal approved default.

**Actors and entry conditions.**

Authorized policy managers record real owner/property policies; PMI staff assess estimates, obtain required decisions and review invoices/attribution. Vendors provide invoice/quote evidence; verified payment comes from an actual authoritative observation, not their assertion alone.

**What it is / how it functions.**

- **R-S213-1 — Explicit scoped policy.** Support owner/property-applicable versioned standing preapproval, effective/revoked dates, amount, inclusive/exclusive comparison and explicit cost basis including whether tax/markup is included. Policies start unset until actual approval is recorded; $250 may be entered where truly approved, never seeded globally.
- **R-S213-2 — Assessment-linked owner decisions.** Apply policy after S205 assessment and the relevant current estimate/scope. Record actual owner decisions against that version/basis; material scope/amount change requires renewed evaluation, while valid standing approval removes only the unnecessary owner-decision step.
- **R-S213-3 — Separate financial meanings.** Represent proposed estimate/quote, vendor invoice/credit, reviewed vendor cost, PMI markup/adjustment, owner charge and provider-verified payment distinctly with dates/currency/source. Missing is not zero; approval is not posting and invoiced is not paid.
- **R-S213-4 — Invoice and attribution reconciliation.** Review invoice identity/line totals/period/property/lease attribution against quote, completed work and actual sources. Expose conflicts, duplicate/revised invoices and partial allocations; retain original evidence plus correction reason/actor.
- **R-S213-5 — Verified payment observation only.** Allow recording authoritative payment evidence/readback when actually available, with provider/reference/date/amount and unknown/partial states. Staff-recorded claims remain labelled; a missing provider integration does not manufacture payment verification.
- **R-S213-6 — Durable reporting and permission boundaries.** Retain financial/approval/artifact facts under S209 indefinite core retention; restrict internal markup/source details appropriately in vendor projection and produce owner-ready reviewed totals under S214.

**In scope / out of scope.**

In scope: configurable real policy, assessment-aware decisions, cost/invoice/markup/owner attribution, verified payment observation, reconciliation and reportable retained facts. Out of scope: accounting posting, opening balances, chargeback posting, fund collection, vendor payment or new tax/legal determination.

**Open questions & assumptions.**

Actual owner/property policy approvals, thresholds, boundary/cost basis, markup rules and source payment evidence are runtime inputs. This spec deliberately supplies no universal $250 policy or invented fee/markup. Lack of payment integration limits verification, not ordinary invoice recording.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `lib/maintenance/property-preapproval.ts`, `rentvine-preapproval-import.ts`, `waiting-on.ts`; `lib/firestore/maintenance-property-preapprovals.ts` — existing amount/effective-policy projection and store.
- `app/api/maintenance/property-preapprovals/**`, `MaintenancePreapprovalControl.tsx`, `MaintenancePreapprovalImport.tsx` — current policy/import controls.
- `lib/maintenance/ticket-model.ts`, ticket estimate action; S205/S209/S212/S214/S223 — lifecycle, retained evidence, vendor invoice, reports and separate liability guidance.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S213-1** — Extend `maintenance_property_preapprovals` and its pure policy projection; preserve source/effective history and distinguish RentVine-imported limits from reviewed policy semantics. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-2** — Bind approval facts to canonical case/current financial version without setting RentVine `isOwnerApproved` from app inference. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-3** — Create reviewed financial facts over S209/S212 provenance with explicit categories and correction lineage; no accounting executor is invoked. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-4** — Use stable invoice/source and allocation identities, version checks and one contribution lineage; ledger projection rejects incompatible or duplicate allocations. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-5** — Keep payment observation read-only in this scope and structurally separate from any accounting-post/payment action or closed QuickBooks draft seam. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-6** — Financial projection has separate staff/vendor/report consumers; no raw/internal payload is sent merely because an export is prepared. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S213-1** — Staff can see why an assessed job falls within a standing permission and the exact policy boundary; missing applicability/basis stays unresolved.
- **BEH-S213-2** — A small assessed job under a real standing policy proceeds without a forced owner email; changed cost exposes the new decision need.
- **BEH-S213-3** — Staff and reports can explain vendor cost versus owner amount and which totals are unverified or unpaid.
- **BEH-S213-4** — PMI can resolve a discrepancy and trace the resulting amount back to the invoice and reviewed work without losing the original.
- **BEH-S213-5** — A reviewed invoice can remain unpaid/unknown; a verified partial/full payment shows its exact evidence and balance semantics.
- **BEH-S213-6** — Vendors see their approved work/invoice context; owner reports contain deliberately selected reviewed charge/cost information with clear payment labels.

**Human litmus outcome.**

### Explain maintenance approval and costs without mixing amounts

**If this was built correctly:** PMI can see the actual owner or property policy, whether the assessed work needs a fresh owner decision, and the separate estimate, vendor invoice, markup and verified payment evidence. Unknown amounts stay unknown, changed scope needs review, and saving these records does not post an accounting charge or make a payment.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                           | Architecture outcome | Behavior outcome | Human litmus                                                  | Acceptance / deterministic falsification                                                                                                                                                       |
| ----------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S213-1: Explicit scoped policy                      | ARCH-S213-1          | BEH-S213-1       | Explain maintenance approval and costs without mixing amounts | AC-S213-1: Test below/equal/above threshold for both comparison modes, taxes/markup basis, multiple owner/property scopes, expiry/revocation and unset $250; no absent policy authorizes work. |
| R-S213-2: Assessment-linked owner decisions           | ARCH-S213-2          | BEH-S213-2       | Explain maintenance approval and costs without mixing amounts | AC-S213-2: Raise a quote after approval, revoke the policy or change scope; stale approval cannot silently cover it and no automatic owner message is created.                                 |
| R-S213-3: Separate financial meanings                 | ARCH-S213-3          | BEH-S213-3       | Explain maintenance approval and costs without mixing amounts | AC-S213-3: Use estimate-only, invoice-only, credit/revised invoice, partial payment and markup cases; amounts reconcile by category without double-counting.                                   |
| R-S213-4: Invoice and attribution reconciliation      | ARCH-S213-4          | BEH-S213-4       | Explain maintenance approval and costs without mixing amounts | AC-S213-4: Exercise duplicate invoice across tickets, conflicting totals, split work/common-area allocation and stale concurrent correction; totals remain attributable and conserved.         |
| R-S213-5: Verified payment observation only           | ARCH-S213-5          | BEH-S213-5       | Explain maintenance approval and costs without mixing amounts | AC-S213-5: A vendor's paid checkbox or uploaded invoice cannot create verified-paid state; real-source-shaped observation is validated separately from an adapter test.                        |
| R-S213-6: Durable reporting and permission boundaries | ARCH-S213-6          | BEH-S213-6       | Explain maintenance approval and costs without mixing amounts | AC-S213-6: Compare projections and long-horizon report readback; unauthorized markup/private data is absent, retained totals/artifacts remain coherent and no posting/send occurs.             |

**Preservation set.**

`tests/unit/s108-maintenance-waiting-on.test.ts`, `s108-rentvine-preapproval-import.test.ts`, `s108-preapproval-import-route.test.ts`, `tests/firestore/s108-property-preapprovals.test.ts`, `s108-preapproval-import.test.ts`; product retention and S99 provider approval distinction.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S213-1** — R-S213-1, ARCH-S213-1, BEH-S213-1: Test below/equal/above threshold for both comparison modes, taxes/markup basis, multiple owner/property scopes, expiry/revocation and unset $250; no absent policy authorizes work.
- **AC-S213-2** — R-S213-2, ARCH-S213-2, BEH-S213-2: Raise a quote after approval, revoke the policy or change scope; stale approval cannot silently cover it and no automatic owner message is created.
- **AC-S213-3** — R-S213-3, ARCH-S213-3, BEH-S213-3: Use estimate-only, invoice-only, credit/revised invoice, partial payment and markup cases; amounts reconcile by category without double-counting.
- **AC-S213-4** — R-S213-4, ARCH-S213-4, BEH-S213-4: Exercise duplicate invoice across tickets, conflicting totals, split work/common-area allocation and stale concurrent correction; totals remain attributable and conserved.
- **AC-S213-5** — R-S213-5, ARCH-S213-5, BEH-S213-5: A vendor's paid checkbox or uploaded invoice cannot create verified-paid state; real-source-shaped observation is validated separately from an adapter test.
- **AC-S213-6** — R-S213-6, ARCH-S213-6, BEH-S213-6: Compare projections and long-horizon report readback; unauthorized markup/private data is absent, retained totals/artifacts remain coherent and no posting/send occurs.

**Forbidden actions / hard gates.**

No universal $250 seed, policy from absence, amount approval from a model, app-to-provider approval inference, invented markup/liability, actual posting or payment, or verified-paid claim from uploaded/staff-only evidence.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

S205 assessment precedes policy-dependent work; S212 supplies vendor evidence and S209 retention; S214 consumes financial projections. S223 liability decisions remain distinct from amounts and no liability guidance authorizes financial posting.

**Standalone delivery contract.**

- **Deliverable now:** Explicit policy semantics/control, reviewed financial attribution/reconciliation projection, retained evidence and scoped display/export contract with complete unset/unknown states.
- **Consumes, but does not assume:** Actual approved policy/markup and verified external observations; adapters prove implementation behavior only.
- **Externally blocked effect:** A live policy-dependent authorization waits for actual approved scope/value/boundary/basis; verified payment waits for actual authoritative input. No posting/payment effect is authorized or part of completion.
- **Produces for downstream suites:** Versioned applicable approval/cost facts and category-separated report totals for maintenance workflow and S214.

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
