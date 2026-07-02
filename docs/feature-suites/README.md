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

| Suite                                 | File                                             | Status                                   |
| ------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| S1 Governance recalibration & routing | `docs/feature-suites/governance.md`              | Built this cycle (spine + gate)          |
| S2 Voice & Copy                       | `docs/feature-suites/voice-copy.md`              | Built (S2)                               |
| S3 Lease-renewal maturation           | `docs/feature-suites/lease-renewal.md`           | Spec — discovery-gated                   |
| S4 Maintenance work-order intake      | `docs/feature-suites/maintenance-intake.md`      | Spec                                     |
| S5 Ask portal rescope                 | `docs/feature-suites/ask-rescope.md`             | Spec — folded into R4                    |
| S6 UI / IA re-architecture            | `docs/feature-suites/ui-ia.md`                   | Built (F-IA-CONSOLE-HOME)                |
| S7 Cross-product integration          | `docs/feature-suites/cross-product.md`           | Spec                                     |
| S8 TDD that mirrors behavior          | `docs/feature-suites/tdd.md`                     | Spec (cross-cutting)                     |
| S9 Local-model live-data testing      | `docs/feature-suites/local-model.md`             | Built (S9, cross-cutting)                |
| S10 Console app-state front door      | `docs/feature-suites/console-app-state.md`       | Built (F-CONSOLE-APP-STATE)              |
| S11 Per-Space "teeth"                 | `docs/feature-suites/space-teeth.md`             | Spec — Q&A answered, runs via S13        |
| S12 Dev↔prod parity                   | `docs/feature-suites/dev-prod-parity.md`         | Built + live-verified (F-DEVPROD-PARITY) |
| S13 Pre-customer refinement           | `docs/feature-suites/pre-customer-refinement.md` | Spec — decided 2026-07-02, ready to run  |
