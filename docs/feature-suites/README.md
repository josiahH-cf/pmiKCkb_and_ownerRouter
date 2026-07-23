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
> **Working-app clarification 2026-07-15.** V1 is the stable production app, not an all-provider-live
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

| Suite                                      | File                                                   | Status                                                |
| ------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| S1 Governance recalibration & routing      | `docs/feature-suites/governance.md`                    | Built this cycle (spine + gate)                       |
| S2 Voice & Copy                            | `docs/feature-suites/voice-copy.md`                    | Built (S2)                                            |
| S3 Lease-renewal maturation                | `docs/feature-suites/lease-renewal.md`                 | Spec — discovery-gated                                |
| S4 Maintenance work-order intake           | `docs/feature-suites/maintenance-intake.md`            | Spec                                                  |
| S5 Ask portal rescope                      | `docs/feature-suites/ask-rescope.md`                   | Spec — folded into R4                                 |
| S6 UI / IA re-architecture                 | `docs/feature-suites/ui-ia.md`                         | Built (F-IA-CONSOLE-HOME)                             |
| S7 Cross-product integration               | `docs/feature-suites/cross-product.md`                 | Spec                                                  |
| S8 TDD that mirrors behavior               | `docs/feature-suites/tdd.md`                           | Spec (cross-cutting)                                  |
| S9 Local-model live-data testing           | `docs/feature-suites/local-model.md`                   | Built (S9, cross-cutting)                             |
| S10 Console app-state front door           | `docs/feature-suites/console-app-state.md`             | Built (F-CONSOLE-APP-STATE)                           |
| S11 Per-Space "teeth"                      | `docs/feature-suites/space-teeth.md`                   | Spec — Q&A answered, runs via S13                     |
| S12 Dev↔prod parity                        | `docs/feature-suites/dev-prod-parity.md`               | Built + live-verified (F-DEVPROD-PARITY)              |
| S13 Pre-customer refinement                | `docs/feature-suites/pre-customer-refinement.md`       | Spec — decided 2026-07-02, ready to run               |
| S14 Approval Queue mobile redesign         | `docs/feature-suites/approval-queue-mobile.md`         | Spec — owner #1 target (D1 locked 2026-07-10)         |
| S15 Gmail synthetic fallback tools         | `docs/feature-suites/gmail-hub.md`                     | Historical fallback; Admin/demo only                  |
| S16 Role-scoped sub-users (space scopes)   | `docs/feature-suites/rbac-subusers.md`                 | Spec — app-plane; live claim mint owner-gated         |
| S17 Unified Console + attention hub        | `docs/feature-suites/unified-console-and-attention.md` | Spec — decided 2026-07-10 (D2)                        |
| S18 Process auto-initiation (anticipation) | `docs/feature-suites/process-auto-initiation.md`       | Spec — app-plane, ready to run                        |
| S19 Workflow-bounded Gmail per user        | `docs/feature-suites/gmail-live-per-user.md`           | Working V1; workflow-only transport                   |
| S20 Risk-bounded execution authority       | `docs/feature-suites/execution-authority.md`           | Working V1                                            |
| S21 Trusted immediate publication          | `docs/feature-suites/trusted-publication.md`           | Working V1; chunked and fenced                        |
| S22 External Vendor portal + Gmail OAuth   | `docs/feature-suites/vendor-portal-and-mailbox.md`     | Working Test portal/auth; Live OAuth per Vendor       |
| S23 Console Live + Test lanes              | `docs/feature-suites/console-live-data.md`             | Working V1 in production                              |
| S24 Communications policy + artifacts      | `docs/feature-suites/communications-policy.md`         | Working V1; TTL/scheduler optional                    |
| S25 Lease Renewal external execution       | `docs/feature-suites/lease-renewal-execution.md`       | Working Test journey; Live per action                 |
| S26 Maintenance external execution         | `docs/feature-suites/maintenance-execution.md`         | Working Test journey; Live per action                 |
| S27 Working-app release + activation       | `docs/feature-suites/v1-release-acceptance.md`         | Working V1 deployed and machine-accepted              |
| S28 Market comp provider + screenshot      | `docs/feature-suites/market-comp-data.md`              | Spec — Wave 1 app-plane; Wave 2 RentCast seam         |
| S29 Comp-informed rent suggestion          | `docs/feature-suites/rent-suggestion-admin-gated.md`   | Built — Wave 1 app-plane (F-RENT-SUGGEST-ADMIN-GATED) |
| S30 RentVine renewal-write activation      | `docs/feature-suites/rentvine-write-activation.md`     | Spec — Wave 2 seam (owner: RentVine endpoint)         |
| S31 Gmail reply-watch + follow-up          | `docs/feature-suites/gmail-watch-inbound.md`           | Spec — Wave 2 seam (owner: Pub/Sub + Scheduler)       |
| S32 KB corrections learning + freshness    | `docs/feature-suites/kb-corrections-learning.md`       | Built — Wave 1 app-plane (F-KB-CORRECTIONS-LEARNING)  |
| S33 Ask box to live-action orchestration   | `docs/feature-suites/ask-to-action.md`                 | Spec — Wave 1 app-plane, ready to run                 |
| S34 Dotloop e-signature activation         | `docs/feature-suites/dotloop-esign-activation.md`      | Spec — Wave 2 seam (owner: Dotloop OAuth app)         |
| S35 LeadSimple connector activation        | `docs/feature-suites/leadsimple-activation.md`         | Spec — Wave 2 seam (owner: API key + vendor)          |
| S36 Space self-service provisioning        | `docs/feature-suites/space-self-provisioning.md`       | Spec — Wave 2 seam (owner: billing + SA)              |
| S37 Full no-code page/layout builder       | `docs/feature-suites/nocode-page-builder.md`           | Spec — Wave 3 multi-slice, app-plane                  |
| S38 Maintenance notice activation          | `docs/feature-suites/maintenance-notice-activation.md` | Spec — S38a app-plane; S38b seam to flip              |
| S39 Internal notifications + center        | `docs/feature-suites/internal-notifications.md`        | Spec — Wave 1 app-plane (D-AUTOMATION-LINE)           |

The final hardening revision is deployed and machine-accepted. The only remaining S19–S27 acceptance
item is the secret-free outcome of the private human Test Vendor password/TOTP/assigned-ticket/
disable/reset ceremony. Live Vendor OAuth and other provider integrations remain optional activations
per exact Live action; they do not reopen the completed Test application workflow.
