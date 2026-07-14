# Feature Suites

Executable specs for the discussed backlog. Each suite is self-contained: Goal · What it is / how it
functions · Open questions & assumptions (labeled) · Cross-product impacts · Ordered prompt sequence ·
Deletion/merge recommendation. **These are specs, not built features.** Lease-renewal in particular
stays discovery-gated until the team validates the process, column meanings, and golden data.

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
> `docs/v1-gap-implementation-program-2026-07-14.md`. S20–S27 are final-V1 product contracts, not
> standing authorization for live accounts, OAuth, reads, sends, writes, configuration, or deploys.

| Suite                                      | File                                                   | Status                                        |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------- |
| S1 Governance recalibration & routing      | `docs/feature-suites/governance.md`                    | Built this cycle (spine + gate)               |
| S2 Voice & Copy                            | `docs/feature-suites/voice-copy.md`                    | Built (S2)                                    |
| S3 Lease-renewal maturation                | `docs/feature-suites/lease-renewal.md`                 | Spec — discovery-gated                        |
| S4 Maintenance work-order intake           | `docs/feature-suites/maintenance-intake.md`            | Spec                                          |
| S5 Ask portal rescope                      | `docs/feature-suites/ask-rescope.md`                   | Spec — folded into R4                         |
| S6 UI / IA re-architecture                 | `docs/feature-suites/ui-ia.md`                         | Built (F-IA-CONSOLE-HOME)                     |
| S7 Cross-product integration               | `docs/feature-suites/cross-product.md`                 | Spec                                          |
| S8 TDD that mirrors behavior               | `docs/feature-suites/tdd.md`                           | Spec (cross-cutting)                          |
| S9 Local-model live-data testing           | `docs/feature-suites/local-model.md`                   | Built (S9, cross-cutting)                     |
| S10 Console app-state front door           | `docs/feature-suites/console-app-state.md`             | Built (F-CONSOLE-APP-STATE)                   |
| S11 Per-Space "teeth"                      | `docs/feature-suites/space-teeth.md`                   | Spec — Q&A answered, runs via S13             |
| S12 Dev↔prod parity                        | `docs/feature-suites/dev-prod-parity.md`               | Built + live-verified (F-DEVPROD-PARITY)      |
| S13 Pre-customer refinement                | `docs/feature-suites/pre-customer-refinement.md`       | Spec — decided 2026-07-02, ready to run       |
| S14 Approval Queue mobile redesign         | `docs/feature-suites/approval-queue-mobile.md`         | Spec — owner #1 target (D1 locked 2026-07-10) |
| S15 Gmail synthetic fallback tools         | `docs/feature-suites/gmail-hub.md`                     | Historical fallback; Admin/demo only          |
| S16 Role-scoped sub-users (space scopes)   | `docs/feature-suites/rbac-subusers.md`                 | Spec — app-plane; live claim mint owner-gated |
| S17 Unified Console + attention hub        | `docs/feature-suites/unified-console-and-attention.md` | Spec — decided 2026-07-10 (D2)                |
| S18 Process auto-initiation (anticipation) | `docs/feature-suites/process-auto-initiation.md`       | Spec — app-plane, ready to run                |
| S19 Workflow-bounded Gmail per user        | `docs/feature-suites/gmail-live-per-user.md`           | Built locally; promotion gates remain         |
| S20 Risk-bounded execution authority       | `docs/feature-suites/execution-authority.md`           | Local green — 2026-07-14                      |
| S21 Trusted immediate publication          | `docs/feature-suites/trusted-publication.md`           | Local green — 2026-07-14                      |
| S22 External Vendor portal + Gmail OAuth   | `docs/feature-suites/vendor-portal-and-mailbox.md`     | Spec — Round 3 R03/R04 locked                 |
| S23 Console live/test-data boundary        | `docs/feature-suites/console-live-data.md`             | Local green — 2026-07-14                      |
| S24 Communications policy + artifacts      | `docs/feature-suites/communications-policy.md`         | Spec — Round 3 R06/R07 locked                 |
| S25 Lease Renewal external execution       | `docs/feature-suites/lease-renewal-execution.md`       | Spec — every R02 action required for V1       |
| S26 Maintenance external execution         | `docs/feature-suites/maintenance-execution.md`         | Spec — every R03 action required for V1       |
| S27 Staged pre-V1 + final acceptance       | `docs/feature-suites/v1-release-acceptance.md`         | Spec — Round 3 R09 release gate               |
