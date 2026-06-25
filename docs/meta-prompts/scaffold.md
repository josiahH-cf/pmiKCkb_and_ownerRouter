# Meta-Prompt: Governance-First Scaffolding

Hand this to a model to stand up the solidified-context spine and the specs. It starts with
governance so everything built afterward is decided from current context. It does **not** build
product features.

```
You are scaffolding the PMI KC project so the new feature set and all later work are decided
from solidified context. Work in the smallest safe slices. Do NOT build product features.

STEP 0 — Re-anchor (read-only). Read AGENTS.md, then docs/facts.md, docs/loop-state.md, and
docs/north-star.md. Separate VERIFIED facts from ASSUMPTIONS as you read. Do not invent facts,
numbers, schemas, or vendor behavior; label every assumption.

STEP 1 — Governance spine FIRST.
  a. Ensure docs/facts.md has a `## Fact Ledger` table
     (id | claim | status[Verified|Assumption|Open] | evidence | verified-on | supersedes | review-by),
     a `## Supersede Log`, and a `## Open Questions` section. Seed/refresh it from STEP 0 (identity, the
     $10 budget cap, RentVine auth, sheet tabs, away-mode INACTIVE, the no-SoR-write gate, and the
     undefined term "ABC" as an open question).
  b. Ensure scripts/check-context-freshness.mjs + tests/unit/facts-ledger.test.mjs exist, mirroring
     plan-status-sync.test.mjs / the falsification preflight. The gate fails on: schema breaks; a
     Verified row missing evidence or ISO date; evidence/supersede paths that don't exist; loop-state.md
     over the size cap or older than the newest status.md entry; unresolved or orphaned supersedes
     (grep each supersede row's marker across the active governance set). It warns on past review-by.
  c. Wire it: "verify:context-freshness" in package.json and scripts/verify.sh; require docs/facts.md
     in scripts/check-router-boundary.mjs and assert its route in AGENTS.md.
  d. Keep intake tiered in docs/autonomous-agent-runner.md (Tier 0 = facts.md + a slim loop-state;
     Tier 1 = AGENTS.md, north-star, the one active lane doc, plan.md; Tier 2 = on-demand via the
     Route Table). docs/implement.md and docs/ai-execution-workflow.md point here, not a divergent list.
  e. Keep docs/loop-state.md a pointer (current snapshot + next slice + active blockers, under the
     cap); the history lives in docs/status.md.

STEP 2 — Scaffold the specs (docs only; no feature code).
  Ensure docs/voice-and-audience.md and docs/feature-suites/*.md exist (one per suite). Each follows:
  Goal / What it is / Open questions & assumptions (labeled) / Cross-product impacts / Ordered prompt
  sequence / Deletion-merge note. Register each in AGENTS.md routing and record remaining decisions in
  docs/facts.md open questions.

STEP 3 — Verify and hand off. Run npm run verify:context-freshness, npm test, npm run
verify:router-boundary, npm run verify:falsification, and bash scripts/verify.sh. Update docs/status.md
and docs/loop-state.md. Stop. Do not build features; lease-renewal stays gated until the team validates
process, columns, and golden data.
```
