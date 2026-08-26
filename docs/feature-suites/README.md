# Feature Suites

Executable specs for the discussed backlog. Each suite is self-contained: Goal · What it is / how it
functions · Open questions & assumptions (labeled) · Cross-product impacts · Ordered prompt sequence ·
Deletion/merge recommendation. **A suite's status column is authoritative; a spec alone is not a built
feature.** Historical S3 Lease Renewal discovery remains evidence; S25 is the final-V1 execution
contract. Its application/Test implementation and each provider's Live activation are separate states.

Order is deliberate — governance first, then audience/copy, then the per-process suites. Open design
decisions are tracked in `docs/facts.md`; the golden next-step order is in
`docs/meta-prompts/golden-next.md`.

> **Recalibrated 2026-06-29** to a multi-process **operations console** (lease-renewal = process #1, not
> the app). The active roadmap is in `docs/loop-state.md`: R1 spine+IA (done) → R2 golden-data harness →
> R3 renewal as a Space/Process → R4 action console. These suite specs remain the per-area detail; S6 is
> built (extended) and S5 is folded into R4.
>
> **Recalibrated again 2026-06-30** (operator note, `A-IA-V2`): Console-as-home, Spaces ⊇ Processes (retire
> the Processes tab, keep the engine), per-Space "teeth", dev↔prod parity. New suites S10–S12; S6 rewritten.
> Q&A-first — `docs/products/v1-process-qa.md`.
>
> **UI/UX + governance overhaul 2026-07-10** (operator transcript). Five new suites S14–S18 target the
> owner's overhaul asks: S14 mobile push-button Approval Queue (the #1 target), S15 Gmail hub, S16
> role-scoped sub-users, S17 unified Console + notifications hub, S18 process auto-initiation. These use
> the new `docs/feature-suites/TEMPLATE.md` (with a `<!-- spec-shape: overhaul-v1 -->` sentinel and two
> extra sections — _Adversarial acceptance checks_ + _Forbidden actions / hard gates_) and are gated by
> `tests/unit/feature-suite-spec-shape.test.mjs` + `npm run verify:spec-traceability`. Four owner
> decisions are locked (D1–D4, 2026-07-10; see `docs/facts.md`). Implementation is NOT started — the
> loop stops after specs for owner review.
>
> **Final V1 contract 2026-07-14.** Round 3 locks R01–R09 and replaces the remaining owner-question
> phase with S20–S27. The dependency-ordered outside-session packet is
> `docs/v1-gap-implementation-program-2026-07-14.md`. S20–S27 are final-V1 product contracts; they do
> not grant blanket authority to an external provider action. Deployment follows the release runbook,
> while every Live provider read/write/send follows its own identity/health/confirmation contract.
> Safe local hardening now includes bounded/chunked S21 publication, the bounded emulator-only S24
> cleanup worker, exact typed adapters for all 11 S25 and 19 S26 action keys, an S20 preparation bridge,
> and hardened S27 synthetic/manifest/cutover boundaries.
>
> **Historical working-app clarification 2026-07-15 (current implementation until S40).** V1 is the stable production app, not an all-provider-live
> milestone. Production contains clearly separated Live and Test record lanes. Invented Test app/
> Firestore records may progress through complete workflows and prove application behavior, but Test
> never contacts an external provider or proves Live activation. Real reads/writes activate per action
> and remain explicit, target-labeled, exact-confirmed, one-attempt, receipted, and reconciled. Vendor
> Firebase password/TOTP plus assigned-ticket Test mailbox and the Maintenance Test journey are V1.
> The canonical Test Vendor also has a required repeatable auth reset/re-enable lifecycle with
> UID/status/`inviteVersion`-bound preview, UID rotation, stale-session denial, preserved Test records,
> fail-closed recovery, one response-only `no-store` setup link, and zero provider effects. Live Vendor
> OAuth/vault and other providers activate independently as optional per-provider capabilities. TTL/
> index/scheduler automation is an optional operations improvement, not an application-release gate.
>
> **UI/UX recalibration 2026-07-28.** The owner accepted all 42 audit findings and all nine
> workstreams, settled D-01–D-14, opened spec writing and fresh-context loop execution, and changed
> the target environment model. S40–S50 are the controlling implementation package:
> `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`. Production becomes Live-only;
> realistic Demo workflows move to an isolated Demo environment using the same product contract,
> with optional explicitly selected Live read-only data and zero Live effects. S23 remains an honest
> record of the currently deployed dual-lane implementation until S40 migration is verified. Shipped
> developer/Test tools are retired without deleting automated tests, Demo parity, security, rollback,
> or provider activation seams. The canonical fresh-context unattended launcher is
> `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`; it runs auth and blocker burn-down
> before using `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md` as the product contract.
>
> **Production phase 2026-07-29.** S51–S54 add operational readiness, replacement cost governance,
> named-key gate integrity, and CI parity. The canonical runner is
> `docs/meta-prompts/production-phase-unattended-loop.md`. A stale/missing live credential or null
> S52 ceiling parks only live/cloud work; local app-plane and build-to-seam slices continue. S54.1
> widened the full verifier and CI workflow to include Firestore Rules tests and is locally/remotely
> green. S51 is complete at its dependency-safe local seam; Rules, owner-run cloud activation, and
> the fresh live rehearsal remain parked.

| Suite                                       | File                                                                         | Status                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| S1 Governance recalibration & routing       | `docs/feature-suites/governance.md`                                          | Built this cycle (spine + gate)                          |
| S2 Voice & Copy                             | `docs/feature-suites/voice-copy.md`                                          | Built (S2)                                               |
| S3 Lease-renewal maturation                 | `docs/feature-suites/lease-renewal.md`                                       | Spec — discovery-gated                                   |
| S4 Maintenance work-order intake            | `docs/feature-suites/maintenance-intake.md`                                  | Spec                                                     |
| S5 Ask portal rescope                       | `docs/feature-suites/ask-rescope.md`                                         | Spec — folded into R4                                    |
| S6 UI / IA re-architecture                  | `docs/feature-suites/ui-ia.md`                                               | Built (F-IA-CONSOLE-HOME)                                |
| S7 Cross-product integration                | `docs/feature-suites/cross-product.md`                                       | Spec                                                     |
| S8 TDD that mirrors behavior                | `docs/feature-suites/tdd.md`                                                 | Spec (cross-cutting)                                     |
| S9 Local-model live-data testing            | `docs/feature-suites/local-model.md`                                         | Built (S9, cross-cutting)                                |
| S10 Console app-state front door            | `docs/feature-suites/console-app-state.md`                                   | Built (F-CONSOLE-APP-STATE)                              |
| S11 Per-Space "teeth"                       | `docs/feature-suites/space-teeth.md`                                         | Spec — Q&A answered, runs via S13                        |
| S12 Dev↔prod parity                         | `docs/feature-suites/dev-prod-parity.md`                                     | Built + live-verified (F-DEVPROD-PARITY)                 |
| S13 Pre-customer refinement                 | `docs/feature-suites/pre-customer-refinement.md`                             | Spec — decided 2026-07-02, ready to run                  |
| S14 Approval Queue mobile redesign          | `docs/feature-suites/approval-queue-mobile.md`                               | Spec — owner #1 target (D1 locked 2026-07-10)            |
| S15 Gmail synthetic fallback tools          | `docs/feature-suites/gmail-hub.md`                                           | Historical; retire under S48                             |
| S16 Role-scoped sub-users (space scopes)    | `docs/feature-suites/rbac-subusers.md`                                       | Spec — app-plane; live claim mint owner-gated            |
| S17 Unified Console + attention hub         | `docs/feature-suites/unified-console-and-attention.md`                       | Spec — decided 2026-07-10 (D2)                           |
| S18 Process auto-initiation (anticipation)  | `docs/feature-suites/process-auto-initiation.md`                             | Built — ordinary `/runs`; Live read-only input           |
| S19 Workflow-bounded Gmail per user         | `docs/feature-suites/gmail-live-per-user.md`                                 | Working V1; D62 race hardening remains                   |
| S20 Risk-bounded execution authority        | `docs/feature-suites/execution-authority.md`                                 | Working V1                                               |
| S21 Trusted immediate publication           | `docs/feature-suites/trusted-publication.md`                                 | Working V1; chunked and fenced                           |
| S22 External Vendor portal + Gmail OAuth    | `docs/feature-suites/vendor-portal-and-mailbox.md`                           | Live Vendor portal/auth; Test contract is historical     |
| S23 Console Live + Test lanes               | `docs/feature-suites/console-live-data.md`                                   | Historical dual-lane contract; retired by S56            |
| S24 Communications policy + artifacts       | `docs/feature-suites/communications-policy.md`                               | Working V1; TTL/scheduler optional                       |
| S25 Lease Renewal external execution        | `docs/feature-suites/lease-renewal-execution.md`                             | Live action contract; Test journey is historical         |
| S26 Maintenance external execution          | `docs/feature-suites/maintenance-execution.md`                               | Live action contract; Test journey is historical         |
| S27 Working-app release + activation        | `docs/feature-suites/v1-release-acceptance.md`                               | Working V1 — manifest 3.0/report 2.3; Live-only contract |
| S28 Market comp provider + screenshot       | `docs/feature-suites/market-comp-data.md`                                    | Spec — Wave 1 app-plane; Wave 2 RentCast seam            |
| S29 Comp-informed rent suggestion           | `docs/feature-suites/rent-suggestion-admin-gated.md`                         | Built — Wave 1 app-plane (F-RENT-SUGGEST-ADMIN-GATED)    |
| S30 RentVine renewal-write activation       | `docs/feature-suites/rentvine-write-activation.md`                           | Spec — Wave 2 seam (owner: RentVine endpoint)            |
| S31 Gmail reply-watch + follow-up           | `docs/feature-suites/gmail-watch-inbound.md`                                 | Spec — loop-only; NO owner dependency (D37)              |
| S32 KB corrections learning + freshness     | `docs/feature-suites/kb-corrections-learning.md`                             | Built — Wave 1 app-plane (F-KB-CORRECTIONS-LEARNING)     |
| S33 Ask box to live-action orchestration    | `docs/feature-suites/ask-to-action.md`                                       | Built — gated Live action + ordinary `/runs`             |
| S34 Dotloop e-signature activation          | `docs/feature-suites/dotloop-esign-activation.md`                            | Spec — Wave 2 seam (owner: Dotloop OAuth app)            |
| S35 LeadSimple connector activation         | `docs/feature-suites/leadsimple-activation.md`                               | Spec — Wave 2 seam (owner: API key + vendor)             |
| S36 Space self-service provisioning         | `docs/feature-suites/space-self-provisioning.md`                             | Spec — Wave 2 seam (owner: billing + SA)                 |
| S37 Full no-code page/layout builder        | `docs/feature-suites/nocode-page-builder.md`                                 | Spec — sequenced after IA; executed as amended by S50    |
| S38 Maintenance owner-notice draft          | `docs/feature-suites/maintenance-notice-activation.md`                       | Built — Gmail draft + human Gmail send is final (D33)    |
| S39 Internal notifications + center         | `docs/feature-suites/internal-notifications.md`                              | Spec — Wave 1 app-plane (D-AUTOMATION-LINE)              |
| S40 Demo/Production separation              | `docs/feature-suites/environment-deployment-separation.md`                   | Superseded by S56 local-first Live-only posture          |
| S41 Shell, navigation, vocabulary           | `docs/feature-suites/shell-navigation-vocabulary.md`                         | Spec — authorized after S40                              |
| S42 Attention ownership + Spaces flow       | `docs/feature-suites/attention-and-spaces-flow.md`                           | Spec — authorized after S41                              |
| S43 Canonical Renewal workspace             | `docs/feature-suites/lease-renewal-canonical-workspace.md`                   | Spec — authorized after S40/S41/S44                      |
| S44 Evidence + provider backlinks           | `docs/feature-suites/evidence-provider-backlinks.md`                         | Spec — authorized foundation after S41                   |
| S45 Approval one-card consolidation         | `docs/feature-suites/approval-queue-consolidation.md`                        | Spec — authorized after S44                              |
| S46 Maintenance operator workspace          | `docs/feature-suites/maintenance-operator-workspace.md`                      | Spec — authorized after S44                              |
| S47 Resident Maintenance intake             | `docs/feature-suites/resident-maintenance-intake.md`                         | Spec — app-plane + RentVine seam                         |
| S48 Admin/Connections/tool retirement       | `docs/feature-suites/admin-connections-tool-retirement.md`                   | Spec — authorized; no Test Lab                           |
| S49 Compatibility/code/QA retirement        | `docs/feature-suites/compatibility-code-qa-retirement.md`                    | Spec — two-stage proof/delete                            |
| S50 S37 builder recalibration               | `docs/feature-suites/nocode-builder-recalibration.md`                        | Spec — controls S37 execution after baseline             |
| S51 Production operational readiness        | `docs/feature-suites/production-operational-readiness.md`                    | Local seam complete; protected/cloud/live parked         |
| S52 Production cost governance              | `docs/feature-suites/production-cost-governance.md`                          | Applied/live-verified — `$25` alert, `$100` hard stop    |
| S53 Green-light activation + gate integrity | `docs/feature-suites/greenlight-activation-and-gate-integrity.md`            | Spec — named-key activation table                        |
| S54 Verification and CI parity              | `docs/feature-suites/verification-and-ci-parity.md`                          | S54.1 locally and remotely green                         |
| S55 Service rename + identifier cleanup     | `docs/feature-suites/production-service-rename-and-identifier-cleanup.md`    | Complete — rollback rehearsed; legacy service deleted    |
| S56 Production Live-only, Test lane retired | `docs/feature-suites/production-live-only-test-lane-retirement.md`           | Complete — Production Live-only; local rehearsal         |
| S57 Portfolio-complete lease reads          | `docs/feature-suites/portfolio-complete-lease-reads.md`                      | Spec — first slice; desk reads 25 of 305 today           |
| S58 Live lease data currency + refresh      | `docs/feature-suites/live-lease-data-currency.md`                            | Spec — staleness contract; depends on S57                |
| S59 RentCast live activation                | `docs/feature-suites/rentcast-live-activation.md`                            | Activated in code 2026-08-26 — release proof pending     |
| S60 Comp persistence + under-market signal  | `docs/feature-suites/comp-persistence-and-under-market-signal.md`            | Spec — owner-draft truth; depends on S59                 |
| S61 Recipient fan-out + channel separation  | `docs/feature-suites/renewal-recipient-fanout-and-separation.md`             | Spec — all owners; amends S24                            |
| S62 Owner-policy renewal pricing            | `docs/feature-suites/owner-policy-renewal-pricing.md`                        | Spec — MKD rule; owner dep is the portfolio id           |
| S63 Four-lease renewal test set             | `docs/feature-suites/four-lease-renewal-test-set.md`                         | Spec — the core-functionality proof                      |
| S64 Per-person approval authority           | `docs/feature-suites/per-person-approval-authority.md`                       | Spec — NOT authorized; needs a grant extension           |
| S65 Feedback report closure                 | `docs/feature-suites/feedback-report-closure.md`                             | Spec — small; before training volume starts              |
| S66 Lease document packet truth + prefill   | `docs/feature-suites/lease-document-packet-truth-and-prefill.md`             | Deployed — exact content/provider seams remain named     |
| S67 Feedback dictation intake               | `docs/feature-suites/feedback-dictation-intake.md`                           | Deployed — volatile audio, editable transcript           |
| S68 Staff work assignment + accountability  | `docs/feature-suites/staff-work-assignment-and-accountability.md`            | Deployed — app-owned tasks and explicit sessions         |
| S69 Human-verification session reliability  | `docs/feature-suites/human-verification-session-and-evidence-reliability.md` | Spec — 2026-08-19 audit feedback; not built here         |
| S70 Renewal queue integrity                 | `docs/feature-suites/renewal-queue-integrity.md`                             | Deployed 2026-08-25 - Cherry Bridge N1/N2                |
| S71 Lease identity + address truth          | `docs/feature-suites/lease-identity-and-address-truth.md`                    | Deployed 2026-08-25 - Cherry Bridge N3/N8                |
| S72 Renewal step model + defaults           | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md`           | Spec - Cherry Bridge N5/N7/N10; not built here           |
| S73 Current-rent truth + badges             | `docs/feature-suites/current-rent-truth-and-badge-integrity.md`              | Implemented — client rent-definition question remains    |
| S74 Tenant offer copy + channel truth       | `docs/feature-suites/tenant-offer-copy-and-channel-truth.md`                 | Spec - Cherry Bridge N9; not built here                  |
| S75 Renewal follow-up state                 | `docs/feature-suites/renewal-follow-up-state.md`                             | Spec - Cherry Bridge N11; not built here                 |
| S76 Renewal Sheet rehearsal copy            | `docs/feature-suites/renewal-sheet-rehearsal-copy.md`                        | Built seam — awaiting distinct client copy + proof       |

S57–S63 are the authorized 2026-08-06 program. S64 is specified but NOT authorized. S65 is authorized separately and narrowly, outside the four scope items. Ordered dependency: S57 first (nothing else is
reachable until the desk reads the whole portfolio), then S58, then S59, then S60, then S61,
then S62, then S63 as the proof. S64 is specified but deliberately unauthorized. S65 is independent.

S66–S68 began as the specification-only output of the 2026-08-07 training-transcript discovery and
the owner's 2026-08-10 plan approval. The owner's 2026-08-11 session grant separately authorized
their app-plane implementation, verification, push, and routine deployment under the existing
gates. That grant did not open S64, provider/action activation by implication, a D12 push, sends,
unconfirmed system writes, monitoring, or an employee-policy change.

> **Cherry Bridge renewal notes 2026-08-24.** S70-S75 are the project-native specs for the eleven
> notes in the client's "Cherry Bridge Renewal Fixes Needed" document, grounded against the code
> rather than taken at face value. Note N4 (MKD) has no suite of its own: its pricing half is an
> Admin data entry and its outreach-skip half contradicts a recorded owner ruling, both recorded as
> an S62 amendment. Amendments also land on S24, S31, S43, and S58. The note-to-spec map is
> `docs/cherry-bridge-renewal-note-map-2026-08-24.md`, gated by
> `tests/unit/cherry-bridge-note-coverage.test.mjs`. The 2026-08-24 work produced specifications
> only. Build state has since moved and this table's status column is the authority: S70 and S71
> are deployed as of 2026-08-25; S72-S75 remain specification only.

## Deferred, with owner direction to keep it visible (2026-08-06)

These were consciously deferred rather than dropped. They are recorded here so they do not disappear
from scope, per the owner's direction on the contact directory in particular. None is in the S57–S63
program; each needs its own slice or suite when it is picked up.

| Item                                            | Owner direction                                   | Where the detail lives                             |
| ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Per-owner contact-by-topic directory            | Defer past the test set, keep visible (N6)        | `Q-CONTACT-BY-TOPIC-DIRECTORY` in `docs/facts.md`  |
| Budget-guardrail Node 20 upgrade (hard date)    | Defer, keep visible (N5)                          | `Q-GUARDRAIL-NODE20-OWNER` in `docs/facts.md`      |
| Product rename off "KCKB"                       | Keep KCKB this cycle (N3)                         | `Q-PRODUCT-RENAME-SCOPE` in `docs/facts.md`        |
| Per-user RentCast credentials                   | Evaluate only after the shared key is proven (Q7) | `docs/feature-suites/rentcast-live-activation.md`  |
| S51 monitoring activation in the cloud          | Pending one alert address (A3)                    | `Q-MONITORING-OPERATOR-ADDRESS` in `docs/facts.md` |
| F-AUTH-1 onboarding sequencing                  | Unresolved; Bailey is an Admin instead (Q8)       | `docs/whats-next.md` §2.1 (historical rationale)   |
| Whether Dan inspects test evidence in-app       | Not specified (Q11)                               | `Q-TESTSET-EVIDENCE-IN-APP` in `docs/facts.md`     |
| Restoring the Sheet-vs-RentVine date comparison | Leave as-is, do not restore (N2)                  | `F-RENEWAL-DATE-SEMANTICS` in `docs/facts.md`      |

The prior Production Test journeys remain dated implementation evidence, not a current product lane.
S56 is complete: intake is fenced, Production records are zero, Test machinery is retired, and local
rehearsal is explicit Live-read-only with no Live effect. A hosted Demo environment remains deferred;
S40–S50 are broader historical and UI program context rather than a claim that every later UI suite is
complete.
