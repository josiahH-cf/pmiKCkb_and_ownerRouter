<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S212 — Vendor quotes, scheduling, work logs, artifacts and completion reports

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 084. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

An assigned vendor records the facts and artifacts of their work from a phone, while PMI reviews material submissions and retains final work-order closure.

**Current state / intended end state.**

The existing vendor ticket API is GET-only and its detail is a minimal read-only projection. Staff can record notes/photos/estimates in the app, but vendors lack the requested quote, schedule, log, invoice and completion submission journey.

Add scoped attributable contributions through S211's current assignment authority. Submissions save against the canonical ticket/history, preserve versions and upload results, and expose review state. Vendor completion requests do not close PMI/RentVine work or prove payment.

**Actors and entry conditions.**

A verified active currently assigned vendor submits their own work; authorized PMI staff review scope/cost and accept/return submissions. Vendors cannot approve owner spending, alter internal markup, post accounting or close a case.

**What it is / how it functions.**

- **R-S212-1 — Versioned quotes and proposed schedules.** Allow a vendor to submit/revise itemized scope/amount, estimate versus fixed quote, availability or proposed visit window, with notes and permitted evidence. Keep accepted/rejected/superseded states; schedule proposals do not silently become PMI approvals.
- **R-S212-2 — Work descriptions and progress logs.** Allow timestamped work notes, arrival/departure or scheduling updates and descriptions, attributed to the submitting vendor with occurrence and recording times. Corrections append or version history; no mutable note masquerades as independent provider evidence.
- **R-S212-3 — Photos and document upload.** Provide mobile selection/capture and progress for relevant photos and quote/invoice/completion documents, with actual MIME/size validation, authorized storage and per-ticket access. Handle partial/unknown upload outcomes without duplicating artifacts or falsely reporting success.
- **R-S212-4 — Invoice evidence and staff review.** Accept invoice identifier, issue/service dates, itemized amounts and original document as vendor-reported invoice evidence. PMI validates/corrects financial attribution under S213; invoices do not establish paid status, owner markup or an accounting post.
- **R-S212-5 — Completion request and return loop.** Let vendors report complete with description, relevant evidence and unresolved issues. PMI can accept/return with reason, seek more work or close under S205; a vendor report cannot close either authoritative record.
- **R-S212-6 — Reliable scoped submission recovery.** Use durable per-submission identities/version checks; same-intent retry returns its outcome, changed content conflicts or creates an explicit revision. Loss of response preserves draft and offers reconciliation; assignment revocation stops undispatched work.

**In scope / out of scope.**

In scope: assigned-ticket quotes, schedule proposals, logs, relevant artifacts, invoices, completion reports and PMI review/recovery. Out of scope: vendor final closure, owner approval, accounting posting/payment, RentVine attachments or messages without separate supported authority, or viewing other tickets/leases.

**Open questions & assumptions.**

Actual file limits/types and scanner/storage runtime are verified implementation inputs to publish in the UI; do not invent unsupported provider capability. The requirement is reliable relevant photo/document contribution with explicit unsupported-file behavior, not acceptance of arbitrary executable formats.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `app/api/vendor/tickets/[ticketId]/route.ts`, `lib/vendor/assignment.ts`, `VendorTicketProjection` and current portal detail — existing read/authority owners to extend.
- `lib/maintenance/image-mime.ts`, `image-store.ts`, `photo-action.ts`; existing photo route/executor — scanned in-boundary photo principles.
- `lib/firestore/maintenance-tickets.ts`; S205/S206/S209/S211/S213 — staff lifecycle, recovery, canonical history, assignment and financial review.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S212-1** — Implement contribution records under current assignment checks and S209 timeline identity, with material revisions requiring renewed PMI review. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-2** — Keep contribution writers bounded to current assigned ticket and approved fields; record provenance in S209. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-3** — Reuse the current scanned/photo storage principles and extend only the supported document contract; bind durable artifacts/hashes to ticket/submission, with no public storage-link leakage. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-4** — Separate vendor invoice submissions from S213 reviewed financial facts/provider payment evidence; preserve document and correction lineage. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-5** — Route completion submission into PMI review, enforcing final closure privilege at the server and preserving current provider status separately. Freeze a focused falsification before changing this boundary.
- **ARCH-S212-6** — Share S206 recovery principles and S211 assignment authority across contribution endpoints; no generic unrestricted document/ticket writer. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S212-1** — PMI sees a new quote/proposed visit distinctly from an accepted amount/appointment; the vendor sees the review outcome.
- **BEH-S212-2** — Staff see what the vendor reported and when, with late/corrected entries clear; useful progress updates feed S205 age.
- **BEH-S212-3** — A vendor can see which files saved, which need retry/reconciliation and who may access them; PMI can open the retained approved artifacts.
- **BEH-S212-4** — An invoice is visibly Submitted/Needs review/Reviewed with its actual amount/source; the app never marks it paid merely from upload.
- **BEH-S212-5** — The vendor sees Awaiting PMI review; staff can return incomplete work and later close it deliberately.
- **BEH-S212-6** — Users can resume an interrupted contribution and determine what saved before sending it again.

**Human litmus outcome.**

### Submit vendor work evidence and receive PMI review

**If this was built correctly:** An assigned vendor submits a quote, proposed schedule, progress note, photos and invoice from the job, sees whether each submission saved, and requests completion. PMI can review or return the work, and only PMI can close the ticket; interrupted uploads or retries do not create duplicate evidence.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

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

S211 current authority is required for vendor operations; S209 retains facts/artifacts, S213 reviews financial attribution, S205 owns closure and S215 proves the end-to-end journey. Manual staff contributions can continue when vendor provisioning is unavailable.

**Standalone delivery contract.**

- **Deliverable now:** Contribution/revision/review service and responsive UI, durable artifact handling, submission reconciliation and denial/concurrency/failure verification.
- **Consumes, but does not assume:** Current assignment, reviewed handoff and configured authorized artifact storage; no sample identity/document is uploaded to production for proof.
- **Externally blocked effect:** Actual vendor enrollment/assignment and storage permission/activation wait for their real approved inputs; independent app-owned contribution logic and local verification continue.
- **Produces for downstream suites:** Attributable submitted/reviewed quotes, logs, schedules, invoices/artifacts and vendor completion evidence for S205/S213/S214.

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
