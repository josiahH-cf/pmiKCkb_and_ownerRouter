# Feature Suites

Executable specs for the discussed backlog. Each suite is self-contained: Goal · What it is / how it
functions · Open questions & assumptions (labeled) · Cross-product impacts · Ordered prompt sequence ·
Deletion/merge recommendation. **These are specs, not built features.** Lease-renewal in particular
stays discovery-gated until the team validates the process, column meanings, and golden data.

Order is deliberate — governance first, then audience/copy, then the per-process suites. Open design
decisions are tracked in `docs/facts.md`; the golden next-step order is in
`docs/meta-prompts/golden-next.md`.

| Suite                                 | File                                        | Status                          |
| ------------------------------------- | ------------------------------------------- | ------------------------------- |
| S1 Governance recalibration & routing | `docs/feature-suites/governance.md`         | Built this cycle (spine + gate) |
| S2 Voice & Copy                       | `docs/feature-suites/voice-copy.md`         | Spec                            |
| S3 Lease-renewal maturation           | `docs/feature-suites/lease-renewal.md`      | Spec — discovery-gated          |
| S4 Maintenance work-order intake      | `docs/feature-suites/maintenance-intake.md` | Spec                            |
| S5 Ask portal rescope                 | `docs/feature-suites/ask-rescope.md`        | Spec                            |
| S6 UI / IA re-architecture            | `docs/feature-suites/ui-ia.md`              | Spec                            |
| S7 Cross-product integration          | `docs/feature-suites/cross-product.md`      | Spec                            |
| S8 TDD that mirrors behavior          | `docs/feature-suites/tdd.md`                | Spec (cross-cutting)            |
| S9 Local-model live-data testing      | `docs/feature-suites/local-model.md`        | Spec (cross-cutting)            |
