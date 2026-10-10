<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S222 — Unified approved maintenance emergency policy and escalation configuration

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 094. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Every supported maintenance entry point applies the same approved emergency policy and immediately presents appropriate existing or verified guidance, while PMI can maintain escalation configuration without inventing policy or contacts.

**Current state / intended end state.**

`lib/maintenance/constants.ts` contains a broad emergency keyword list consumed by work-order drafting, while `lib/maintenance/intake-triage.ts` separately classifies fire/gas/carbon-monoxide and active flooding and owns approved acknowledgements/evidence requirements. The triage projection stores reports even when evidence is missing; its model helper may suggest a trade but cannot downgrade urgency. There is no single approved, versioned runtime emergency-policy configuration serving all these entry points.

One deterministic, versioned policy projection governs urgency and approved guidance across staff capture, public intake and any later configured phone/provider channel. Existing urgent guidance remains available when no approved replacement exists. PMI maintains real routing/policy inputs, while emergency response and routine financial approval remain distinct.

**Actors and entry conditions.**

Authorized PMI policy managers maintain draft and approved runtime policy under the current role model and the separate governance contract. Staff/reporter channels consume only applicable approved versions. Models and external provider observations may supply attributable facts or suggestions, but cannot approve policy or silently downgrade urgency. A real escalation contact/channel must be verified before it is offered as an actionable destination.

**What it is / how it functions.**

- **R-S222-1 — Approved scoped policy versions.** Provide a manageable policy configuration with purpose/scope, effective period, approval attribution, urgency rules, approved guidance and escalation references, plus draft, approved, superseded/revoked or unset states. Support applicable property/organization policy without creating conflicting simultaneous precedence. Missing or draft inputs never become approved policy. Seed no new legal/emergency wording, liability rule, phone number or service promise.
- **R-S222-2 — One urgency projection across channels.** Replace competing app-owned urgency logic with one shared projection and an explicit mapping to existing staff work-order priority and public-intake urgency fields. Preserve channel-specific evidence collection and display. The same facts and applicable policy produce compatible urgency outcomes; a model/provider label alone cannot downgrade an emergency. Retain the current whole-word protection against incidental terms such as gasket matching gas.
- **R-S222-3 — Immediate guidance without routine gates.** Keep existing approved emergency/flooding acknowledgements available as the fallback until a real replacement is approved. Present applicable urgent guidance when the report is recognized, record the report and outstanding evidence, and keep escalation visible even when photos, assessment completion, estimate or owner approval are missing. Routine assessment/preapproval does not certify emergency-response sufficiency or block existing life-safety guidance.
- **R-S222-4 — Verified escalation and takeover configuration.** Maintain actual escalation responsibility, verified contact/channel, availability/coverage and human takeover expectations as configuration. Show a clear unavailable/needs-staff-routing state when no valid contact exists. Internal staff routing and provider/phone takeover use only the later supported channel contract and exact authority; this suite itself creates no new phone call, vendor dispatch, emergency-service request or customer send.
- **R-S222-5 — Attributable staff review and safe revisions.** Record urgency review/override, original facts, reason, actor, time and policy version without overwriting the original decision. Staff may correct facts and route to review under actual approved rules; models cannot own an override. A policy change affects new decisions prospectively and flags active affected work for review when needed rather than silently rewriting closed historical urgency or reversing a prior escalation.

**In scope / out of scope.**

In scope: maintained approved-policy capability, shared deterministic urgency/priority projection, existing guidance fallback, verified escalation references and attributed reviews. Out of scope: inventing actual emergency/after-hours policy or legal wording, new phone/provider dispatch or send activation, guarantees of emergency-service response, automatic approval of emergency costs, and historical reclassification/backfill.

**Open questions & assumptions.**

Actual approved replacement wording, escalation contacts, availability and property-specific rules are runtime inputs to obtain from PMI. Their absence does not block the configuration/projection capability; the preserved current guidance remains available and only an unconfigured routing action waits. No particular fee, liability threshold, personal assignee or expanded emergency definition is established here.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- Policy consumers and present divergence: `lib/maintenance/constants.ts`, `lib/maintenance/work-order-draft.ts`, `lib/maintenance/intake-triage.ts` and `lib/maintenance/intake-triage-model.ts`.
- Staff/public intake owners: `components/maintenance/MaintenanceCapture.tsx`, current maintenance intake routes and triage review surfaces.
- Related boundaries: S205 assessment lifecycle, S207/S208 actual Vendoroo/channel contract, S209 durable policy-decision history, S213 financial preapproval, S223 responsibility guidance and the separately scoped staff/governance policy manager.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S222-1** — A typed app-owned policy repository and deterministic applicability resolver own version/approval/effective-state selection. The resolver exposes the applicable version and an explicit unavailable/conflicting state instead of choosing an arbitrary draft or silently combining rules. Freeze a focused falsification before changing this boundary.
- **ARCH-S222-2** — `lib/maintenance/intake-triage.ts`, `work-order-draft.ts` and their consumers use the shared pure approved-policy projection rather than separate authoritative keyword lists. Compatibility mappings preserve existing records without retroactively reclassifying their original evidence. Freeze a focused falsification before changing this boundary.
- **ARCH-S222-3** — The intake/workflow projection separates recorded report, urgency/guidance and evidence completeness from dispatch/financial approval. Current acknowledgement text remains a preserved source-controlled fallback, not new prose authored by the model. Freeze a focused falsification before changing this boundary.
- **ARCH-S222-4** — The policy references a validated routing configuration rather than hardcoded personal names/addresses. Each channel adapter reports delivery/takeover state separately from urgency. Missing channel capability/authority is an explicit operation hold while the report and guidance remain usable. Freeze a focused falsification before changing this boundary.
- **ARCH-S222-5** — Append/version decision events link to S209 history and current ticket projection. Revision/revocation selects the active policy prospectively and exposes relevant stale decisions; model output is typed advisory input outside the approval owner. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S222-1** — A policy manager can review which approved policy will apply and replace/revoke it; staff can see which version governed a report. Unset configuration does not display an invented contact or policy.
- **BEH-S222-2** — A staff-captured issue and the same public/provider report show consistent urgency and guidance, with the source facts and policy version available for review. Trade suggestions do not decide emergency status.
- **BEH-S222-3** — A reporter with an urgent issue receives immediate current approved guidance and a recorded-report acknowledgement; absent photos or cost approval remains an explicit outstanding item rather than hiding that guidance or discarding the report.
- **BEH-S222-4** — Staff see who is responsible and the verified available channel, or see that routing needs attention. A locally recorded escalation cannot be mistaken for a delivered call or confirmed provider takeover.
- **BEH-S222-5** — Staff can explain why urgency changed and which policy applied then; old reports retain original meaning. A new policy does not silently make previous emergency evidence disappear.

**Human litmus outcome.**

### Recognize and route urgent maintenance consistently

**If this was built correctly:** A staff member or reporter describes an urgent issue and sees the appropriate approved guidance immediately. PMI sees the same urgency, the responsible verified escalation route or an honest missing-route state, and the policy and review history behind the decision.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome | Behavior outcome | Human litmus                                        | Acceptance / deterministic falsification                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S222-1: Approved scoped policy versions                | ARCH-S222-1          | BEH-S222-1       | Recognize and route urgent maintenance consistently | AC-S222-1: Exercise approved, future, expired/revoked, draft-only and competing applicable versions. Assert only the explicit valid version governs, draft data never leaks into active guidance and ambiguity is visible with existing safe guidance preserved.                                                  |
| R-S222-2: One urgency projection across channels         | ARCH-S222-2          | BEH-S222-2       | Recognize and route urgent maintenance consistently | AC-S222-2: Feed the same life-safety, active-water, ordinary issue and incidental-word cases through each supported entry adapter. Compare the shared decision/version and compatible display; prove a model normal/trade suggestion cannot overwrite deterministic urgent evidence.                              |
| R-S222-3: Immediate guidance without routine gates       | ARCH-S222-3          | BEH-S222-3       | Recognize and route urgent maintenance consistently | AC-S222-3: Submit urgent reports without photos, estimate, owner decision or configured replacement. Read back the saved report and verify the current approved urgent guidance appears immediately, no promised response time/dispatch is fabricated, and ordinary financial gates do not erase the urgent path. |
| R-S222-4: Verified escalation and takeover configuration | ARCH-S222-4          | BEH-S222-4       | Recognize and route urgent maintenance consistently | AC-S222-4: Test valid and revoked contacts, missing coverage, unsupported provider takeover and unknown delivery outcome. Assert no guessed recipient/phone or falsely delivered escalation, and preserve urgency/report access throughout.                                                                       |
| R-S222-5: Attributable staff review and safe revisions   | ARCH-S222-5          | BEH-S222-5       | Recognize and route urgent maintenance consistently | AC-S222-5: Change a fact and then policy, concurrently review one active report, and reopen historical work. Verify attributed original/corrected decisions, stale-review indication and preserved old evidence; demonstrate an AI-only downgrade is refused.                                                     |

**Preservation set.**

Preserve current S109 stored-report/urgent acknowledgement and whole-word matching, model trade-only authority, normal reviewed troubleshooting resource selection, and existing work-order priority compatibility. Relevant checks include `tests/unit/s109-intake-triage.test.ts`, `maintenance-intake-public-route.test.ts`, `maintenance-intake-review.test.ts`, `maintenance-ai-boundary.test.ts` and `tests/firestore/s109-intake-triage-handoff.test.ts`.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S222-1** — R-S222-1, ARCH-S222-1, BEH-S222-1: Exercise approved, future, expired/revoked, draft-only and competing applicable versions. Assert only the explicit valid version governs, draft data never leaks into active guidance and ambiguity is visible with existing safe guidance preserved.
- **AC-S222-2** — R-S222-2, ARCH-S222-2, BEH-S222-2: Feed the same life-safety, active-water, ordinary issue and incidental-word cases through each supported entry adapter. Compare the shared decision/version and compatible display; prove a model normal/trade suggestion cannot overwrite deterministic urgent evidence.
- **AC-S222-3** — R-S222-3, ARCH-S222-3, BEH-S222-3: Submit urgent reports without photos, estimate, owner decision or configured replacement. Read back the saved report and verify the current approved urgent guidance appears immediately, no promised response time/dispatch is fabricated, and ordinary financial gates do not erase the urgent path.
- **AC-S222-4** — R-S222-4, ARCH-S222-4, BEH-S222-4: Test valid and revoked contacts, missing coverage, unsupported provider takeover and unknown delivery outcome. Assert no guessed recipient/phone or falsely delivered escalation, and preserve urgency/report access throughout.
- **AC-S222-5** — R-S222-5, ARCH-S222-5, BEH-S222-5: Change a fact and then policy, concurrently review one active report, and reopen historical work. Verify attributed original/corrected decisions, stale-review indication and preserved old evidence; demonstrate an AI-only downgrade is refused.

**Forbidden actions / hard gates.**

No policy manager grants itself a new role or protected authority. No model-generated legal/emergency guidance, invented destination, automatic provider takeover/dispatch or customer send. No missing photo or routine owner-cost step suppresses current approved urgent guidance. Maintain the current exact provider/communication boundaries until the separately authorized governance/channel contract changes them.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Consumes the existing current S109 fallback and later authorized policy-manager/governance contract. Exposes versioned urgency/guidance/routing to S205, S208 and later phone intake; integration may consume only finalized provider interfaces. S213 defines financial preapproval separately, and S209 retains the decision history.

**Standalone delivery contract.**

- **Deliverable now:** Versioned approved-policy configuration/resolution, one shared urgency projection and compatibility mapping, existing-guidance fallback, explicit routing holds and attributed staff review with deterministic service/rendered tests.
- **Consumes, but does not assume:** Actual PMI-approved rules/copy and verified contacts/coverage; later supported phone/provider channel delivery/takeover contracts. Unset, conflicting, expired or revoked values have explicit visible states.
- **Externally blocked effect:** A new configured escalation or provider/phone effect remains BLOCKED until its real approved contact/channel/coverage and separately required authority exist. Configuration, fallback guidance, deterministic classification and review checks remain independently deliverable.
- **Produces for downstream suites:** A shared policy-version/urgency/guidance/routing result, maintained actual escalation inputs and attributable decision records for lifecycle, intake, vendor/provider and report consumers.

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
