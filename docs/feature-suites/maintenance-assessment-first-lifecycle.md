<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S205 — Assessment-first maintenance lifecycle and staff control

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 077. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

PMI staff can assess a reported issue and its troubleshooting evidence before deciding whether any owner approval, vendor action or communication is necessary.

**Current state / intended end state.**

`MaintenanceCapture.tsx` builds a work-order draft, owner-notice preview and vendor-trade suggestion together. `waiting-on.ts` prioritizes owner approval when an estimate/preapproval is absent, without a complete assessment lifecycle. Tickets already support staff status/note/estimate/close/reopen actions; public intake is separately quarantined.

Introduce an explicit, durable assessment-first journey over the existing ticket: assess and resolve through troubleshooting where possible, otherwise size work, apply an actual standing preapproval or request the required owner decision, coordinate approved work, review completion and close through PMI. An intake does not automatically require an owner email.

**Actors and entry conditions.**

Ordinary authorized maintenance staff assess and manage real tickets; current Admin controls maintain approved policies. Assigned vendors report their own work through S211/S212. PMI staff retain final closure/reopening; a vendor's completion report is not closure or provider verification.

**What it is / how it functions.**

- **R-S205-1 — Assess before approval.** Present intake facts, source/troubleshooting evidence, urgency and unresolved location as the first working context. Staff may record resolved-by-troubleshooting, needs information, estimate needed or work required, with attributable time/reason; owner approval is evaluated after that assessment.
- **R-S205-2 — Conditional owner decision.** Derive whether owner approval is actually required from the current assessed work, cost basis, effective policy and provider evidence. Recognize actual standing preapproval; absent or conflicting policy is clearly unresolved. Preserve a staff option to communicate without making email a gate.
- **R-S205-3 — Staff-controlled lifecycle.** Support troubleshooting resolution, awaiting information/estimate, owner decision, vendor coordination, scheduled/in progress, completion review, closed/cancelled and reopening as explicit observable outcomes. Reuse existing status vocabulary where suitable; distinguish richer workflow stages from RentVine status.
- **R-S205-4 — PMI final closure.** Vendors can report work complete; only permitted PMI staff accept completion and close/reopen the ticket. Closing retains disposition, evidence, unresolved financial reconciliation and source-status differences rather than inventing payment/provider completion.
- **R-S205-5 — Usable next action and aging.** Show the next useful action, current owner, age since creation and since the last meaningful staff/vendor progress. Flag unresolved work at three calendar days from creation in the configured business timezone; read/import timestamp churn does not reset progress age.

**In scope / out of scope.**

In scope: assessment, conditional routing, staff lifecycle, PMI closeout and internal aging visibility. Out of scope: Vendoroo transport, vendor account provisioning, accounting posting/payment, new autonomous dispatch or any sending cadence owned by the separate communications program.

**Open questions & assumptions.**

Specific real preapproval values, named participants and approved escalation destinations remain runtime inputs. The accepted configurable $250 recommendation is not a universal approved rate or blanket permission; S213 owns an explicit boundary and cost basis.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `components/maintenance/MaintenanceCapture.tsx`, `MaintenanceQueue.tsx`, `MaintenanceBlockerReport.tsx`; `app/maintenance/page.tsx` — current capture/queue/report owners.
- `lib/maintenance/ticket-model.ts`, `lib/firestore/maintenance-tickets.ts`, `lib/maintenance/waiting-on.ts` — lifecycle, activity and blocker projection.
- `app/api/maintenance/tickets/[ticketId]/route.ts`; S108, S109, S213 and S222/S223 — existing transition, triage and policy boundaries.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S205-1** — Extend the existing ticket/activity owner rather than create a competing workflow store or overwrite provider status. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-2** — Make one assessment-aware projection extend `projectMaintenanceWaitingOn`, consuming S213 policy/results and keeping source versus staff decisions distinct. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-3** — Define legal transitions and version conflict handling within the current ticket/activity service; persist actor/time/reason for material transitions. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-4** — Enforce closure authority in the server transition owner and feed S212 reports as evidence only. Freeze a focused falsification before changing this boundary.
- **ARCH-S205-5** — Use one queue/detail projection over ticket/activity records; no new external follow-up sender is introduced. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S205-1** — A newly captured routine issue opens in assessment and does not tell staff to email an owner merely because no estimate exists.
- **BEH-S205-2** — The ticket explains the applicable standing approval or exact owner decision needed after assessment; unchanged trivial intake creates no communication automatically.
- **BEH-S205-3** — Staff can advance or return a case deliberately; a stale tab cannot overwrite another staff member's assessment or closeout.
- **BEH-S205-4** — A vendor-complete ticket waits for PMI review; PMI sees remaining issues and may accept or return it.
- **BEH-S205-5** — Staff can filter aging cases and see why a case waits without treating elapsed age as automatic approval or dispatch.

**Human litmus outcome.**

### Assess and finish maintenance with clear PMI control

**If this was built correctly:** A PMI staff member records an issue, assesses it before deciding whether owner approval or a vendor is needed, and sees the current next action and how long it has waited. A vendor can submit completed work, but PMI reviews the evidence and makes the final closure decision.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

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

- **AC-S205-1** — R-S205-1, ARCH-S205-1, BEH-S205-1: A missing-estimate intake starts at assessment; a resolved-by-troubleshooting outcome needs no owner draft and retains its evidence.
- **AC-S205-2** — R-S205-2, ARCH-S205-2, BEH-S205-2: Exercise absent estimate, within/equal/above configured threshold, revoked policy and existing provider approval; no test substitutes a made-up production policy.
- **AC-S205-3** — R-S205-3, ARCH-S205-3, BEH-S205-3: Table-test every supported forward/return/cancel/reopen transition and concurrent conflicting transitions; provider status is never silently rewritten.
- **AC-S205-4** — R-S205-4, ARCH-S205-4, BEH-S205-4: Attempt vendor/direct-route closure and stale completion acceptance; both refuse while a valid PMI review closes once with evidence.
- **AC-S205-5** — R-S205-5, ARCH-S205-5, BEH-S205-5: At the three-day calendar boundary a still-open case appears in the internal queue; a read refresh does not hide aging; closed cases are excluded.

**Forbidden actions / hard gates.**

Do not require an intake owner email, infer owner consent from silence, let a model/vendor close a PMI case, or bypass a real spending decision. Emergency guidance is shown immediately and is not delayed by ordinary assessment.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Governance clarification defines any revised staff effect contract. S213 supplies actual preapproval/financial semantics; S222 supplies unified emergency policy. S206 fixes creation/reconciliation; S209 supplies durable history. The core assessment state/UI can be built independently with explicit missing inputs.

**Standalone delivery contract.**

- **Deliverable now:** Assessment state/transition projection, staff controls, PMI closure checks, internal aging views and deterministic verification with actual missing-policy representations.
- **Consumes, but does not assume:** Existing ticket/activity and source snapshots; S212 vendor completion; S213 effective policy. Missing evidence remains named and does not fabricate approval.
- **Externally blocked effect:** Any actual provider update, owner communication or policy-dependent authorization waits for its verified exact contract/configuration; the app assessment slice has no dependency on a Vendoroo account.
- **Produces for downstream suites:** One assessment/lifecycle contract, staff review state and internal next-action projection for S210–S215.

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
