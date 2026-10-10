<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S215 — Integrated maintenance verification, prospective migration and process retirement

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 087. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

PMI can run one complete, attributable maintenance journey from a new report through staff closure and a later owner report, with honest provider readiness and a controlled transition from current open work.

**Current state / intended end state.**

The current application has staff capture/queue, app-owned activities, governed work-order linking and creation/status controls, waiting-on projections, intake triage, a minimal assigned-vendor read-only portal and long-lived core ticket retention. It does not yet provide the full assessed lifecycle, vendor contributions, cost evidence and polished history reports. Some provider effects and account contracts remain unavailable; current source behavior alone does not prove the October 8 operational failures or successful live integration.

The maintenance suite is delivered as a connected staff/vendor workflow, with preserved existing records, a prospective coverage boundary, independently evidenced app and provider outcomes, and old process surfaces retired only when their replacement is demonstrably usable.

**Actors and entry conditions.**

PMI staff perform assessment, decisions, assignment, financial review and final closure. Assigned vendors contribute work evidence within their current assignment. The implementation runner later verifies authorized slices using isolated fixtures and deterministic provider adapters. Real-account/provider checks require their own actual account inputs and exact authority; a human observation is recorded only when one occurred.

**What it is / how it functions.**

- **R-S215-1 — One connected outcome.** Verify the journey new report → local creation/reconciliation → actual property/unit and applicable lease association → assessment → either recorded resolution without dispatch or estimate/current standing preapproval or explicit owner decision → reviewed vendor assignment/handoff → vendor work submissions → PMI review → reviewed invoice/financial attribution → PMI final closure → monthly/custom report. Reopening remains a new attributable event on the same work history. No step may infer an owner/provider approval, sent handoff, payment or closure from a weaker local state.
- **R-S215-2 — Prospective existing-work transition.** Retain current open tickets and their existing activity meaning. At rollout, make them discoverable and progressively add required assessment/association/cost fields as staff work them; represent absent pre-rollout facts as unknown. Record the prospective coverage anchor. Do not import historical maintenance, fabricate old milestones, recreate provider work orders or turn old closed records into a fully covered reporting period.
- **R-S215-3 — Complete risk and recovery matrix.** Verify denied vendor access and reassignment; concurrent/stale staff decisions; creation and submission unknown outcomes; duplicate provider observations; absent/expired source communication; cost/policy boundary changes; association corrections; report regeneration after corrections; and restart/retry. Keep urgent escalation usable when photos or routine financial approval are missing, subject to the real approved policy.
- **R-S215-4 — Separate engineering, account and live completion.** Publish a completion matrix distinguishing independently green app code, configured actual runtime inputs, finalized provider interface, exact activation, live readback and human observation. S208 remains pending until S207 and clarification resolve its material contract. Deterministic substitutes may prove local behavior only. Full Vendoroo-integrated operational completion cannot be declared while any required contract, coverage or exact effect is still blocked.
- **R-S215-5 — Retire duplicated processes with parity.** Inventory current maintenance checklists, capture, portal and communication entry points that duplicate this workflow. Redirect or retire obsolete duplicate steps only after their preserved capabilities, existing work entry and retained evidence are covered by the new journey. Retirement must remove forced intake owner-email sequencing and obsolete read-only portal instructions where replaced, while preserving governed unsent handoffs and existing provider truth. Do not delete client/provider records or external spreadsheets as an assumed cleanup.

**In scope / out of scope.**

In scope: integrated verification, compatibility for existing current work, prospective coverage marking, a bounded retirement inventory and removal/redirection of duplicate app-owned process surfaces. Out of scope: historical maintenance backfill, destructive cleanup of provider/client records, accounting posting/payment, sending customer/vendor messages, manufacturing real provider proof, or starting an implementation/release loop from this specification.

**Open questions & assumptions.**

The actual Vendoroo integration contract is deliberately unresolved in S208. This suite defines how that limitation is represented and prevents a false full-completion claim; it does not resolve or bypass it. Concrete retirement targets must come from the refreshed current-source inventory, rather than assuming external tools are abandoned.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- Existing staff workflow: `components/maintenance/MaintenanceCapture.tsx`, `MaintenanceQueue.tsx`, `lib/maintenance/ticket-model.ts`, `lib/firestore/maintenance-tickets.ts` and work-order-link services.
- Vendor boundaries: `lib/vendor/model.ts`, `lib/vendor/assignment.ts`, `app/api/vendor/tickets/[ticketId]/route.ts`, `components/vendor/VendorPortal.tsx` and assigned-ticket page.
- Cross-suite contracts: S205–S214, S222/S223; current S99 existing-work-order, S100 marked-read chat sync, S108 waiting-on/preapproval and S109 triage behavior.
- History/retention and process owners: `lib/operations/product-record-retention.ts`, `lib/gmail-hub/retention-contract.ts`, maintenance process template and governed communication handoff.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S215-1** — Integration ownership spans the existing maintenance services/routes/components, vendor access boundary and report generation; one shared work identity and versioned history connects their separately owned contracts. Deterministic service/transaction plus rendered journey checks cover both resolution branches and reopening. Freeze a focused falsification before changing this boundary.
- **ARCH-S215-2** — A version-aware compatibility/transition projection reads existing ticket/activity/work-order-link shapes and writes only new attributable prospective events. Migration checks prove record identity/count preservation and absence of provider effects. Freeze a focused falsification before changing this boundary.
- **ARCH-S215-3** — Maintain a requirement-indexed integration matrix using S205–S214, S222/S223 and the relevant current S99/S100/S108/S109 contracts. Each crossing has an explicit state, denial/recovery expectation and authoritative owning service; interruption tests exercise persistent rather than only in-memory guards. Freeze a focused falsification before changing this boundary.
- **ARCH-S215-4** — The batch evidence owner consumes per-suite acceptance results with explicit scope and pending/blocked states. No aggregate PASS can overwrite an incomplete required provider row or convert adapter evidence into live-provider evidence. Freeze a focused falsification before changing this boundary.
- **ARCH-S215-5** — A source-owned retirement map identifies each changed route/component/process template and its replacement plus preservation check. Read-only compatibility entry points and stable record links keep current work reachable; no new parallel maintenance tracker is introduced. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S215-1** — A staff member can finish the entire supported workflow and later retrieve matching ticket, cost and evidence in a report; a vendor completion submission waits visibly for PMI closure.
- **BEH-S215-2** — Staff can open and continue an existing ticket without losing its prior history or entering fictional historical facts; reports visibly distinguish prospective complete coverage from older incomplete history.
- **BEH-S215-3** — The person sees what succeeded, what awaits review and what needs reconciliation; retrying an unknown outcome does not blindly create another effect. An urgent report is retained and its existing urgent guidance remains available.
- **BEH-S215-4** — PMI can tell whether the app is ready locally, awaiting actual Vendoroo configuration/contract, or verified operationally; the implementation loop does not silently omit the Vendoroo portion to mark the batch complete.
- **BEH-S215-5** — Users reach one coherent workflow instead of two contradictory checklists, and existing links/work still resolve. An intake can be assessed without sending an owner email.

**Human litmus outcome.**

### Run and revisit one complete maintenance job

**If this was built correctly:** A staff member assesses a new or existing issue, sends work through an assigned vendor when needed, reviews the vendor’s evidence and actual invoice, closes the job, and later opens a clear report showing the same work. They can see missing integration readiness without being told the whole system is complete.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                 | Architecture outcome | Behavior outcome | Human litmus                                 | Acceptance / deterministic falsification                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S215-1: One connected outcome                             | ARCH-S215-1          | BEH-S215-1       | Run and revisit one complete maintenance job | AC-S215-1: Run both assessment-resolution and assigned-vendor journeys through actual app routes/stores with deterministic external adapters. Assert the same work identity, actor attribution and financial meanings at every step; vendor submission alone never produces staff closure.                                      |
| R-S215-2: Prospective existing-work transition              | ARCH-S215-2          | BEH-S215-2       | Run and revisit one complete maintenance job | AC-S215-2: Load existing open and closed shapes plus missing lease/cost inputs, apply transition twice, and compare unchanged record/link identities and previous evidence. Verify no synthetic historical event, duplicate work order or claimed old coverage appears.                                                         |
| R-S215-3: Complete risk and recovery matrix                 | ARCH-S215-3          | BEH-S215-3       | Run and revisit one complete maintenance job | AC-S215-3: Interrupt at app commit, provider dispatch/readback and artifact receipt boundaries using isolated adapters. Restart, reconcile exact identities and prove no duplicate fact/effect. Exercise revocation, zero-versus-unknown cost, retained artifact versus expired raw body, and changed policy/association cases. |
| R-S215-4: Separate engineering, account and live completion | ARCH-S215-4          | BEH-S215-4       | Run and revisit one complete maintenance job | AC-S215-4: Provide a green app fixture run with S208 pending and assert the full operational verdict stays incomplete. Replace only one prerequisite at a time and prove remaining blocked rows persist. Human evidence stays NOT RUN without an observer.                                                                      |
| R-S215-5: Retire duplicated processes with parity           | ARCH-S215-5          | BEH-S215-5       | Run and revisit one complete maintenance job | AC-S215-5: Verify old supported routes/link targets reach the replacement or clear compatible guidance, no forced owner-email gate remains, and existing activity/provider receipts retain their original meaning. Inspect the final source for contradictory obsolete process instructions.                                    |

**Preservation set.**

Keep current staff ticket/activity access, exact provider link/receipt behavior, Vendor assignment denial, triage acknowledgement and marked-read warning green. Relevant existing checks include `tests/unit/maintenance-tickets-route.test.ts`, `maintenance-queue-component.test.tsx`, `maintenance-process-template.test.ts`, `vendor-assignment-boundary.test.ts`, `s99-work-order-link-store.test.ts`, `s100-existing-work-order-link.test.ts`, `s108-maintenance-waiting-on.test.ts`, `s109-intake-triage.test.ts` and `product-record-retention.test.ts`.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S215-1** — R-S215-1, ARCH-S215-1, BEH-S215-1: Run both assessment-resolution and assigned-vendor journeys through actual app routes/stores with deterministic external adapters. Assert the same work identity, actor attribution and financial meanings at every step; vendor submission alone never produces staff closure.
- **AC-S215-2** — R-S215-2, ARCH-S215-2, BEH-S215-2: Load existing open and closed shapes plus missing lease/cost inputs, apply transition twice, and compare unchanged record/link identities and previous evidence. Verify no synthetic historical event, duplicate work order or claimed old coverage appears.
- **AC-S215-3** — R-S215-3, ARCH-S215-3, BEH-S215-3: Interrupt at app commit, provider dispatch/readback and artifact receipt boundaries using isolated adapters. Restart, reconcile exact identities and prove no duplicate fact/effect. Exercise revocation, zero-versus-unknown cost, retained artifact versus expired raw body, and changed policy/association cases.
- **AC-S215-4** — R-S215-4, ARCH-S215-4, BEH-S215-4: Provide a green app fixture run with S208 pending and assert the full operational verdict stays incomplete. Replace only one prerequisite at a time and prove remaining blocked rows persist. Human evidence stays NOT RUN without an observer.
- **AC-S215-5** — R-S215-5, ARCH-S215-5, BEH-S215-5: Verify old supported routes/link targets reach the replacement or clear compatible guidance, no forced owner-email gate remains, and existing activity/provider receipts retain their original meaning. Inspect the final source for contradictory obsolete process instructions.

**Forbidden actions / hard gates.**

No real resident/vendor/customer action is created merely to demonstrate a journey. No destructive provider/spreadsheet cleanup, historical backfill, payment/posting or implicit key activation. PMI final closure and source/provider receipt distinctions remain mandatory. Closed vendor/provider keys block their exact real effects until separately authorized; a process retirement cannot remove that boundary.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Consumes the stable contracts and scoped acceptance evidence of S205–S214 and S222/S223. Can build compatibility, integration tests, visible pending states and retirement parity independently. Full end-to-end Vendoroo live acceptance waits for finalized S208 plus actual permitted account inputs; this dependency cannot be relabeled as optional or covered by an adapter.

**Standalone delivery contract.**

- **Deliverable now:** Compatibility projection, prospective coverage metadata, source retirement map, complete deterministic app journey and failure matrix, and truthful completion reporting for the implemented contracts. A local green result identifies its exact app/adapter scope.
- **Consumes, but does not assume:** Actual provider capabilities/readbacks, actual approved emergency/chargeback/preapproval policies, current roster/assignments and other suite outputs. Missing values remain explicit rather than filled with fixtures in production.
- **Externally blocked effect:** Full operational Vendoroo-connected acceptance remains BLOCKED while S208 has material unanswered contract questions or required real account/configuration/effect authority is absent; per-suite engineering and migration preservation checks remain independently runnable.
- **Produces for downstream suites:** One integrated requirement/evidence matrix, prospective transition contract, parity-backed retirement decisions and exact remaining external holds for future authorized implementation and verification.

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
