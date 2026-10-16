<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S213 — Maintenance financial attribution, standing preapproval and retained evidence

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 085. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
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

- **ARCH-S213-1** — Extend `maintenance_property_preapprovals` and its pure policy projection; preserve source/effective history and distinguish RentVine-imported limits from reviewed policy semantics. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-2** — Bind approval facts to canonical case/current financial version without setting RentVine `isOwnerApproved` from app inference. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-3** — Create reviewed financial facts over S209/S212 provenance with explicit categories and correction lineage; no accounting executor is invoked. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-4** — Use stable invoice/source and allocation identities, version checks and one contribution lineage; ledger projection rejects incompatible or duplicate allocations. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-5** — Keep payment observation read-only in this scope and structurally separate from any accounting-post/payment action or closed QuickBooks draft seam. Freeze a focused falsification before changing this boundary.
- **ARCH-S213-6** — Financial projection has separate staff/vendor/report consumers; no raw/internal payload is sent merely because an export is prepared. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S213-1** — Staff can see why an assessed job falls within a standing permission and the exact policy boundary; missing applicability/basis stays unresolved.
- **BEH-S213-2** — A small assessed job under a real standing policy proceeds without a forced owner email; changed cost exposes the new decision need.
- **BEH-S213-3** — Staff and reports can explain vendor cost versus owner amount and which totals are unverified or unpaid.
- **BEH-S213-4** — PMI can resolve a discrepancy and trace the resulting amount back to the invoice and reviewed work without losing the original.
- **BEH-S213-5** — A reviewed invoice can remain unpaid/unknown; a verified partial/full payment shows its exact evidence and balance semantics.
- **BEH-S213-6** — Vendors see their approved work/invoice context; owner reports contain deliberately selected reviewed charge/cost information with clear payment labels.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Explain maintenance approval and costs without mixing amounts

**If this was built correctly:** PMI can see the actual owner or property policy, whether the assessed work needs a fresh owner decision, and the separate estimate, vendor invoice, markup and verified payment evidence. Unknown amounts stay unknown, changed scope needs review, and saving these records does not post an accounting charge or make a payment.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

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

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

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
