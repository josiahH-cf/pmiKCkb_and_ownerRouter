# S8 — TDD that mirrors real app behavior (cross-cutting)

**Goal.** Ensure tests reflect how the app actually behaves, so every suite ships with behavior-true
coverage rather than thin unit checks.

**What it is / how it functions.** The repo already has strong contract-first TDD (injected transports,
mocks/fakes, the `MockSheet` writeback-safety tests, HTTP e2e). This suite (a) adds behavior/e2e
coverage for the new surfaces (nav/IA, Ask rescope, maintenance capture, renewal flows) and (b) makes
golden-data tests the acceptance gate for lease-renewal rule changes (tie to S3).

**Open questions & assumptions.**

- _Assumption:_ golden data stays in-boundary, out of git; tests use sanitized/synthetic derivations
  where values can't be committed.
- _Open:_ which flows warrant full e2e vs contract tests (cost/time tradeoff; e2e is serial).

**Cross-product impacts.** Every suite's prompt sequence ends with a test step that uses this standard.

**Ordered prompt sequence.**

1. _Discovery:_ inventory current test types and coverage gaps per surface.
2. _Understanding:_ define the "mirrors behavior" bar (what each suite must test).
3. _Build:_ add e2e/behavior tests alongside each feature slice (not after).
4. _Build:_ make golden-data tests the gate for renewal rule changes.
5. _Context update:_ record the testing standard in `docs/engineering-checklist.md` + `docs/facts.md`.

**Deletion/merge recommendation.** KEEP as a thin cross-cutting suite; fold concrete tests into each
feature's prompt sequence rather than running it standalone.
