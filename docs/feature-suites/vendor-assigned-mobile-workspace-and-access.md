<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S211 — Assigned-vendor identity, access and mobile ticket workspace

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 083. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

A verified active vendor can use a simple mobile workspace for only currently assigned maintenance tickets, without internal staff access or a mailbox-connection prerequisite for ticket work.

**Current state / intended end state.**

Vendor authentication, verified email/TOTP and live invite/disable/assignment services exist. `vendor.account.invite`, `vendor.account.disable` and `vendor.assignment.change` are currently closed. `/vendor` and assigned detail expose a small read-only projection; they do not implement the requested contribution workflow.

Extend the existing scoped identity and portal rather than introduce a second vendor account system. Provide reliable invitation/setup, assignment/revocation and mobile detail with reviewed work context, then S212's allowed contributions. Existing actor isolation and scope remain server-enforced.

**Actors and entry conditions.**

Authorized PMI vendor-account managers control verified invitations/disablement; maintenance staff use only permitted assignment controls. Vendors complete their own approved identity challenge, then read/work only current assigned tickets. Runners never enter a person's password/code/passkey or copy cookies.

**What it is / how it functions.**

- **R-S211-1 — Reuse existing verified identity lifecycle.** Present current account/setup/active/disabled states and recoverable enrollment using the implemented Firebase/vendor service boundaries. Make required verification understandable; no hidden setup completion or fabricated account readiness.
- **R-S211-2 — Current assignment server authority.** Every list/detail/artifact/submission request checks current active vendor and assignment generation. Reassignment/removal/disablement stops access and new submissions promptly; previously recorded contributions remain with PMI.
- **R-S211-3 — Mobile reviewed work detail.** Provide responsive assigned-ticket list/detail with status, scope, reviewed troubleshooting, scheduling/access information and permitted attachments. Keep staff-only sentiment/private discussion/financial markup and unrelated lease records out of the vendor projection.
- **R-S211-4 — Independent ticket work.** Vendor ticket access and S212 uploads/logs must not require connecting the vendor's Gmail. Existing mailbox features remain separate and optional for their own contract; no external mailbox broadens assigned-ticket reach.
- **R-S211-5 — Recoverable lifecycle and honest activation.** Surface invitation/assignment pending, succeeded, ambiguous and recovery states from existing services. Read back exact outcomes before success. Current closed keys remain closed until later explicitly authorized activation; code readiness does not assert operational vendor enrollment.

**In scope / out of scope.**

In scope: existing vendor lifecycle usability, assignment authorization, mobile portal detail and contribution entrypoints. Out of scope: internal staff roles/Spaces for vendors, new identity provider, relaxed verification, mandatory vendor Gmail connection, automatic vendor dispatch or actual key activation by specification authoring.

**Open questions & assumptions.**

Real vendor enrollment and activation inputs remain exact external/authority dependencies. This READY implementation scope defines the current closed/unavailable state and later verified activation requirements without assuming an action grant exists.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `lib/vendor/auth.ts`, `access.ts`, `assignment.ts`, `model.ts`; `lib/firestore/vendors.ts` — current vendor identity and assignment checks.
- `lib/vendor/live-lifecycle-*`, `live-setup*`; `components/admin/LiveVendorLifecyclePanel.tsx` — implemented provisioning/recovery owners.
- `components/vendor/VendorPortal.tsx`, `VendorSignIn.tsx`, `VendorSetupBridge.tsx`; `app/vendor/**`, `app/api/vendor/tickets/**` — existing scoped portal routes.
- S210/S212; existing `lib/integrations/action-registry-seed.ts` exact closed lifecycle keys and protected auth/rules surfaces.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S211-1** — Extend existing vendor auth/setup/lifecycle owners and generation-bound prepared actions rather than create parallel credentials or session stores. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-2** — Reuse `requireAssignedTicket`, current vendor store/lifecycle and exact assignment identity; propagate current assignment authority into S212 handlers. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-3** — Expand `VendorTicketProjection` through an explicit minimized projection over S210/S209 instead of returning the staff ticket or raw source body. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-4** — Separate portal entitlement from mailbox health/OAuth dependencies; preserve current auth strength rather than coupling it to Gmail state. Freeze a focused falsification before changing this boundary.
- **ARCH-S211-5** — Use existing live-lifecycle claim/receipt/reconciliation owners; do not create replacement accounts or redispatch ambiguous delivery as a shortcut. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S211-1** — A real vendor can tell what setup remains, finish their own challenge and reach assigned work; missing permission/configuration explains only the exact unavailable step.
- **BEH-S211-2** — A vendor sees only their assigned work; an old saved link after reassignment no longer opens it.
- **BEH-S211-3** — At narrow screen widths a vendor can understand the job and find permitted actions with readable labels, focus and upload/progress affordances.
- **BEH-S211-4** — An active assigned vendor with no connected mailbox can read the job and contribute allowed ticket data.
- **BEH-S211-5** — PMI sees whether setup invitation/assignment actually settled; a lost response offers reconciliation instead of another account/send.

**Human litmus outcome.**

### Open assigned work securely from a phone

**If this was built correctly:** A verified vendor signs in on a phone and finds only the tickets currently assigned to them, with useful approved work details and contribution controls. They can work without connecting a mailbox; reassignment or account disablement removes access to the affected work and files.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                           | Architecture outcome | Behavior outcome | Human litmus                             | Acceptance / deterministic falsification                                                                                                                                            |
| ----------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S211-1: Reuse existing verified identity lifecycle  | ARCH-S211-1          | BEH-S211-1       | Open assigned work securely from a phone | AC-S211-1: Exercise expired invite, wrong identity, incomplete TOTP, disabled account and enrollment resume; no unverified principal reaches ticket detail.                         |
| R-S211-2: Current assignment server authority         | ARCH-S211-2          | BEH-S211-2       | Open assigned work securely from a phone | AC-S211-2: Try guessed ticket/artifact IDs, cached stale assignment, concurrent reassignment and disabled sessions; no unrelated data leaks or post-revocation submission succeeds. |
| R-S211-3: Mobile reviewed work detail                 | ARCH-S211-3          | BEH-S211-3       | Open assigned work securely from a phone | AC-S211-3: Render empty/loading/error/long-text/mobile/keyboard cases; compare staff versus vendor response fields and forbid hidden raw/private payload leakage.                   |
| R-S211-4: Independent ticket work                     | ARCH-S211-4          | BEH-S211-4       | Open assigned work securely from a phone | AC-S211-4: Use a principal with no mailbox, revoked mailbox and healthy mailbox; ticket outcomes are identical within assignment, while mailbox actions retain their own checks.    |
| R-S211-5: Recoverable lifecycle and honest activation | ARCH-S211-5          | BEH-S211-5       | Open assigned work securely from a phone | AC-S211-5: Lose invite/assignment response, restart and reconcile; one identity/assignment result is retained and no automatic duplicate invitation occurs.                         |

**Preservation set.**

`tests/unit/vendor-auth.test.ts`, `vendor-assignment-boundary.test.ts`, `vendor-readonly-access.test.ts`, `vendor-live-lifecycle-service.test.ts`, `live-vendor-setup-route.test.ts`, `s165-vendor-sign-in-mobile.test.tsx`, `tests/firestore/vendor-portal.rules.test.ts`.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S211-1** — R-S211-1, ARCH-S211-1, BEH-S211-1: Exercise expired invite, wrong identity, incomplete TOTP, disabled account and enrollment resume; no unverified principal reaches ticket detail.
- **AC-S211-2** — R-S211-2, ARCH-S211-2, BEH-S211-2: Try guessed ticket/artifact IDs, cached stale assignment, concurrent reassignment and disabled sessions; no unrelated data leaks or post-revocation submission succeeds.
- **AC-S211-3** — R-S211-3, ARCH-S211-3, BEH-S211-3: Render empty/loading/error/long-text/mobile/keyboard cases; compare staff versus vendor response fields and forbid hidden raw/private payload leakage.
- **AC-S211-4** — R-S211-4, ARCH-S211-4, BEH-S211-4: Use a principal with no mailbox, revoked mailbox and healthy mailbox; ticket outcomes are identical within assignment, while mailbox actions retain their own checks.
- **AC-S211-5** — R-S211-5, ARCH-S211-5, BEH-S211-5: Lose invite/assignment response, restart and reconcile; one identity/assignment result is retained and no automatic duplicate invitation occurs.

**Forbidden actions / hard gates.**

Do not open lifecycle keys by writing specs, bypass TOTP/email verification, reuse staff cookies, expose internal Spaces or make Gmail OAuth a gate for ticket submissions. Protected auth/rules changes require the later authorized governance/execution scope.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Build on existing vendor lifecycle. S210 supplies minimized work context and S212 contribution operations. S215 verifies invitations, assignment removal and mobile workflows with isolated fixtures; real enrollment uses separately approved real identities.

**Standalone delivery contract.**

- **Deliverable now:** Updated existing lifecycle/portal controls, explicit minimized ticket projection, current-assignment checks and mobile/access/recovery verification, with closed-key states supported.
- **Consumes, but does not assume:** Current verified vendor identities/assignment and reviewed handoff; actual provider/setup permission is not assumed.
- **Externally blocked effect:** Actual production invite/disable/assignment activation and real enrollment wait for exact approved authority/configuration; engineering can complete under local fixtures without creating test production vendors.
- **Produces for downstream suites:** A verified current assigned-vendor authority and accessible mobile ticket surface for S212.

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
