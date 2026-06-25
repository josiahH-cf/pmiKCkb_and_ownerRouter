# S1 — Governance recalibration & retrieval/routing (DO FIRST)

**Goal.** Make every later decision flow from one small, gated, non-contradictory body of solidified
context, and make stale rules impossible to leave behind. Routing already exists, so the fix is the
missing spine, a freshness gate, a delete-on-supersede discipline, and truncating the rotted resume
artifact — not another "if looking for X, look here" pointer.

**What it is / how it functions.**

- **Spine — `docs/facts.md`.** A `## Fact Ledger` of atomic claims
  (`id | claim | status(Verified|Assumption|Open) | evidence | verified-on | supersedes | review-by`),
  plus a `## Supersede Log` and `## Open Questions`. It references north-star/plan/integration-
  architecture as evidence rather than restating them.
- **Freshness gate — `scripts/check-context-freshness.mjs`** (+ `verify:context-freshness` +
  `tests/unit/facts-ledger.test.mjs`), mirroring `plan-status-sync` and the falsification preflight.
  Hard-fails on: schema breaks; a Verified row missing evidence/date; evidence/supersede paths that
  don't exist; `docs/loop-state.md` over the size cap or older than the newest `docs/status.md` entry;
  unresolved or orphaned supersedes (greps each supersede `marker` across the active governance set).
  Warns on past `review-by`.
- **Delete-on-supersede discipline.** New direction deletes the old rule from the active doc, logs it
  in the Supersede Log with a marker, and points the new fact's `supersedes` at the old id.
- **Tiered intake (13 → ~5).** Tier 0 = `docs/facts.md` + a slim `docs/loop-state.md`; Tier 1 =
  `AGENTS.md`, `docs/north-star.md`, the one active lane doc, `docs/plan.md`; Tier 2 = on demand via the
  Route Table.
- **Truncation.** `docs/loop-state.md` keeps only the current snapshot + next slice + active blockers;
  the changelog tail moved to `docs/status.md`.

**Open questions & assumptions.**

- _Assumption:_ a ~30-day `review-by` cadence for live-integration facts is reasonable — confirm.
- _Open:_ the exact loop-state line cap (140 set; tune to taste). Its only job is to stop a second
  history regrowing.

**Cross-product impacts.** Every other suite registers its verified facts, assumptions, and open
questions in `docs/facts.md`. The gate runs in CI, so it gates all merges. No existing `verify:*` task
is weakened; `check-router-boundary.mjs` is extended by one required file + one route assertion.

**Ordered prompt sequence.**

1. _Discovery:_ enumerate dated/"verified" claims across north-star, plan, integration-architecture,
   loop-state, status; mark each fact/assumption/open.
2. _Understanding:_ design the `facts.md` schema; agree allowed statuses and evidence forms.
3. _Build:_ author `docs/facts.md` (seeded with identity, budget, RentVine, sheet, away-mode, write-gate
   facts plus the `ABC` unknown).
4. _Build:_ write `scripts/check-context-freshness.mjs` + `tests/unit/facts-ledger.test.mjs`; add
   `verify:context-freshness` to `package.json` and `scripts/verify.sh`.
5. _Build:_ require `docs/facts.md` in `scripts/check-router-boundary.mjs`; assert its route in `AGENTS.md`.
6. _Build:_ re-tier `## Context Intake` in `docs/autonomous-agent-runner.md`; point `docs/implement.md`
   and `docs/ai-execution-workflow.md` at it.
7. _Build:_ truncate `docs/loop-state.md` to the pointer; history stays in `docs/status.md`.
8. _Context update:_ add the `facts.md` route and supersede Documentation Rule to `AGENTS.md`; run the
   verify chain; record the cycle.

**Deletion/merge recommendation.** KEEP, do first. DELETE the loop-state changelog tail and any
superseded active rule found during seeding (logged in the Supersede Log). This suite is the mechanism
"delete what's no longer needed" runs on going forward.
