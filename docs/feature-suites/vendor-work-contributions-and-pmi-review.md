<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S212 — Vendor quotes, scheduling, work logs, artifacts and completion reports

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 084. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
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

- **ARCH-S212-1** — Implement contribution records under current assignment checks and S209 timeline identity, with material revisions requiring renewed PMI review. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-2** — Keep contribution writers bounded to current assigned ticket and approved fields; record provenance in S209. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-3** — Reuse the current scanned/photo storage principles and extend only the supported document contract; bind durable artifacts/hashes to ticket/submission, with no public storage-link leakage. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-4** — Separate vendor invoice submissions from S213 reviewed financial facts/provider payment evidence; preserve document and correction lineage. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-5** — Route completion submission into PMI review, enforcing final closure privilege at the server and preserving current provider status separately. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-6** — Share S206 recovery principles and S211 assignment authority across contribution endpoints; no generic unrestricted document/ticket writer. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S212-1** — PMI sees a new quote/proposed visit distinctly from an accepted amount/appointment; the vendor sees the review outcome.
- **BEH-S212-2** — Staff see what the vendor reported and when, with late/corrected entries clear; useful progress updates feed S205 age.
- **BEH-S212-3** — A vendor can see which files saved, which need retry/reconciliation and who may access them; PMI can open the retained approved artifacts.
- **BEH-S212-4** — An invoice is visibly Submitted/Needs review/Reviewed with its actual amount/source; the app never marks it paid merely from upload.
- **BEH-S212-5** — The vendor sees Awaiting PMI review; staff can return incomplete work and later close it deliberately.
- **BEH-S212-6** — Users can resume an interrupted contribution and determine what saved before sending it again.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Submit vendor work evidence and receive PMI review

**If this was built correctly:** An assigned vendor submits a quote, proposed schedule, progress note, photos and invoice from the job, sees whether each submission saved, and requests completion. PMI can review or return the work, and only PMI can close the ticket; interrupted uploads or retries do not create duplicate evidence.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                                       | Architecture outcome | Behavior outcome | Human litmus                                       | Acceptance / deterministic falsification                                                                                                                                                          |
| ------------------------------------------------- | -------------------- | ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S212-1: Versioned quotes and proposed schedules | ARCH-S212-1          | BEH-S212-1       | Submit vendor work evidence and receive PMI review | AC-S212-1: Revise an accepted quote or race a staff review; prior acceptance cannot cover changed scope/cost and stale approval conflicts.                                                        |
| R-S212-2: Work descriptions and progress logs     | ARCH-S212-2          | BEH-S212-2       | Submit vendor work evidence and receive PMI review | AC-S212-2: Submit duplicate/retried/late logs and corrections; each intent is recorded once, original meaning remains and automatic source refresh does not count as work.                        |
| R-S212-3: Photos and document upload              | ARCH-S212-3          | BEH-S212-3       | Submit vendor work evidence and receive PMI review | AC-S212-3: Exercise spoofed MIME, oversize, failed scan/storage, response loss, reassignment mid-upload and guessed artifact IDs; no unauthorized artifact or duplicate committed upload results. |
| R-S212-4: Invoice evidence and staff review       | ARCH-S212-4          | BEH-S212-4       | Submit vendor work evidence and receive PMI review | AC-S212-4: Submit duplicate invoice numbers, conflicting totals, credit/revised invoices and unsupported paid claims; review/deduplication exposes discrepancies without double-counting.         |
| R-S212-5: Completion request and return loop      | ARCH-S212-5          | BEH-S212-5       | Submit vendor work evidence and receive PMI review | AC-S212-5: Direct vendor close/provider-status calls refuse; incomplete evidence and reopened work retain earlier reports and new review context.                                                 |
| R-S212-6: Reliable scoped submission recovery     | ARCH-S212-6          | BEH-S212-6       | Submit vendor work evidence and receive PMI review | AC-S212-6: Simulate concurrent tabs, restart/transport loss after commit, reassignment and unknown storage result; retain one result and no blind redispatch.                                     |

**Preservation set.**

Vendor auth/assignment/rules checks; `tests/unit/maintenance-photo-mime.test.ts`, `maintenance-photo-executor.test.ts`, `maintenance-image-store.test.ts`, existing product/communications retention and staff close/reopen tests.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S212-1** — R-S212-1, ARCH-S212-1, BEH-S212-1: Revise an accepted quote or race a staff review; prior acceptance cannot cover changed scope/cost and stale approval conflicts.
- **AC-S212-2** — R-S212-2, ARCH-S212-2, BEH-S212-2: Submit duplicate/retried/late logs and corrections; each intent is recorded once, original meaning remains and automatic source refresh does not count as work.
- **AC-S212-3** — R-S212-3, ARCH-S212-3, BEH-S212-3: Exercise spoofed MIME, oversize, failed scan/storage, response loss, reassignment mid-upload and guessed artifact IDs; no unauthorized artifact or duplicate committed upload results.
- **AC-S212-4** — R-S212-4, ARCH-S212-4, BEH-S212-4: Submit duplicate invoice numbers, conflicting totals, credit/revised invoices and unsupported paid claims; review/deduplication exposes discrepancies without double-counting.
- **AC-S212-5** — R-S212-5, ARCH-S212-5, BEH-S212-5: Direct vendor close/provider-status calls refuse; incomplete evidence and reopened work retain earlier reports and new review context.
- **AC-S212-6** — R-S212-6, ARCH-S212-6, BEH-S212-6: Simulate concurrent tabs, restart/transport loss after commit, reassignment and unknown storage result; retain one result and no blind redispatch.

**Forbidden actions / hard gates.**

No vendor approval of cost/liability/markup, final closure, generic arbitrary upload, raw sentiment exposure, public artifact access or paid/accounting claim from an invoice. Removing an assignment never deletes its historical accepted contributions.

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
