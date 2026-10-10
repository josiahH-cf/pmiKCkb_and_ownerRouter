<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S210 — Approved primary and backup vendor roster and reviewed handoff

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 082. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Staff choose a verified suitable vendor from maintained primary/backup preferences and prepare one useful handoff containing the issue and reviewed troubleshooting already completed.

**Current state / intended end state.**

`suggestVendorAssignment` infers a trade but deliberately returns no named vendor because the roster is unverified. Existing vendor identity/assignment services and RentVine vendor/trade resources are separate; their existence does not establish PMI's preferred primary/backup list or activate RentVine assignment.

Maintain real vendor identity/contact/trade preferences and clearly separate a staff selection, app portal assignment, RentVine assignment and an actual dispatched message. The staff-reviewed handoff reduces repeated troubleshooting without exposing internal sentiment or granting spending authority.

**Actors and entry conditions.**

PMI maintenance staff select vendors and prepare/review handoffs. An authorized roster/policy manager records approved preferences and verified contacts; exact privileges follow the accepted governance contract. Vendors gain access only through S211's active assigned identity.

**What it is / how it functions.**

- **R-S210-1 — Verified reusable roster.** Maintain real vendor references, verified contact/channel, service categories, primary/backup preferences, availability/active state and source. Reuse authoritative RentVine vendor IDs when verified; no hardcoded names/emails or inferred relationship from a company label.
- **R-S210-2 — Primary and backup selection.** Show applicable primary and backup vendors, allow staff to deliberately choose a suitable alternative with reason, and retain selection history. Selection does not automatically assign in RentVine, send a work order or authorize cost.
- **R-S210-3 — Reviewed useful work packet.** Prepare the actual issue/location, applicable access/scheduling details, approved scope/cost limits, reviewed troubleshooting steps/outcomes and relevant approved attachments. Clearly label missing facts and omit unrelated tenant conversations, internal sentiment and unreviewed liability claims.
- **R-S210-4 — Deliberate human dispatch boundary.** Keep preparing/copying a handoff, granting portal assignment and external message delivery separate and visibly named. This suite preserves the accepted reviewed unsent handoff/human-send contract; any later communication automation uses only the separately finalized communications scope.
- **R-S210-5 — Versioned roster and handoff correction.** Record who changed shared preferences, selected a vendor or corrected packet facts. Fresh review after material changes replaces the current handoff while preserving earlier artifacts/history and avoiding duplicate tickets.

**In scope / out of scope.**

In scope: approved reusable roster/preferences, staff selection, reviewed packet and handoff state/correction. Out of scope: autonomous vendor choice/dispatch, new RentVine vendor assignment activation, accounting payment, exposing internal conversations/sentiment or inventing 'signed work order' legal content.

**Open questions & assumptions.**

Actual primary/backup vendors and verified contact details are PMI-owned runtime inputs. The transcript's 'signed work orders' is implemented under the accepted reviewed handoff recommendation, not as a new signature requirement or fabricated signature proof.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `lib/maintenance/vendor-assignment.ts`, `constants.ts` — existing trade suggestion and unverified roster state.
- `lib/vendor/assignment.ts`, `live-lifecycle-service.ts`, `lib/firestore/vendors.ts` — existing account/assigned-ticket ownership.
- `components/maintenance/MaintenanceQueue.tsx`, `lib/maintenance/execution/matrix.ts`; S205/S209/S211–S213 — current selection/assignment and new packet consumers.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S210-1** — Introduce shared roster preference ownership beside existing vendor identity/assignment services, separating contact identity from preference metadata. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-2** — Keep selection/preference projection distinct from `vendor.assignment.change` and the closed RentVine assignment seam. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-3** — Build one staff-reviewed handoff projection from S205/S209/S213 facts and S212 artifacts, with scoped artifact references and version binding. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-4** — Reuse existing exact assignment/communication services; no new generic provider method/path or hidden `sendVendorNotification` flag is introduced. Freeze a focused falsification before changing this boundary.
- **ARCH-S210-5** — Use server-resolved current generations for roster/selection/packet saves and retain historical versions through S209. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S210-1** — Staff see who is approved for the trade and why; missing preference/contact is an actionable missing input.
- **BEH-S210-2** — A busy primary can be replaced by the backup or reviewed alternative; the ticket shows the exact selected vendor and current handoff state.
- **BEH-S210-3** — The vendor can understand what has already been tried and what is authorized without repeating all intake questions.
- **BEH-S210-4** — Staff can tell whether the packet is prepared, assigned in the app, manually sent or provider-verified; a saved packet is not presented as delivery.
- **BEH-S210-5** — A stale tab cannot assign the old vendor after reassignment or conceal what an earlier vendor received.

**Human litmus outcome.**

### Choose a verified vendor and review the exact work handoff

**If this was built correctly:** A staff member selects the appropriate verified primary or backup vendor, reviews the useful work and access details, and prepares the handoff. The app distinguishes selection, assignment and an actually sent message, and changed facts require another review instead of silently reusing an old packet.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

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

- **AC-S210-1** — R-S210-1, ARCH-S210-1, BEH-S210-1: Import/record verified references, duplicate contacts and revoked/inactive vendors; unsupported mapping stays unresolved and no real contact is seeded by fixtures.
- **AC-S210-2** — R-S210-2, ARCH-S210-2, BEH-S210-2: Deactivate the primary or change preferences during selection; stale selections require review and no autonomous fallback dispatch occurs.
- **AC-S210-3** — R-S210-3, ARCH-S210-3, BEH-S210-3: Compare staff and vendor packets; raw sentiment/private discussions stay absent, required missing access is visible and a changed estimate invalidates stale handoff approval.
- **AC-S210-4** — R-S210-4, ARCH-S210-4, BEH-S210-4: Prepare and cancel a handoff with zero send/provider dispatch; a staff-recorded external send retains that attribution rather than minting a provider receipt.
- **AC-S210-5** — R-S210-5, ARCH-S210-5, BEH-S210-5: Race preference/assignment and packet edits; stale writes conflict, approved correction is attributable and the case count stays one.

**Forbidden actions / hard gates.**

No invented primary vendor/contact, automatic alternative dispatch, RentVine vendor assignment or notification through a different key, raw sentiment forwarding, or claim that handoff preparation proves signed/sent/received work.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Consumes S205 assessment and S213 authorization/cost basis; S211 controls app portal assignment and S212 submissions. Missing S208 evidence does not stop manual staff-reviewed handoff.

**Standalone delivery contract.**

- **Deliverable now:** Roster/preferences model and management UI, deliberate selection and versioned reviewed handoff, unset states and deterministic conflict/privacy checks.
- **Consumes, but does not assume:** Real verified vendor identities/contacts and actual reviewed work facts; no sample vendor becomes a production roster record.
- **Externally blocked effect:** App vendor access/assignment activation waits for its exact approved lifecycle contract; RentVine assignment remains separately unavailable. Human dispatch can occur outside the app with honest staff-recorded evidence.
- **Produces for downstream suites:** Verified preferred/selected vendor and minimized reviewed handoff packet for S211/S212/S215.

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
