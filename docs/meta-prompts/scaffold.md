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
  Ensure docs/voice-and-audience.md and docs/feature-suites/*.md exist (one per suite). A new or
  overhaul spec is copied from docs/feature-suites/TEMPLATE.md, keeps the
  `<!-- spec-shape: overhaul-v1 -->` sentinel on line 1, and carries ALL required sections:
  Goal / What it is / how it functions (with an explicit "Buildable now (app-plane)" vs
  "Gated (owner/vendor)" split) / Open questions & assumptions (labeled) / Cross-product impacts /
  Adversarial acceptance checks (falsifiable Done-when bullets as observable states, each with a
  stable AC-S<n>-<k> id, the Verify command list, and named sentinel tests) / Forbidden actions &
  hard gates / Ordered prompt sequence / Deletion-merge note. Register each in the
  docs/feature-suites/README.md table AND the AGENTS.md Route Table + Project Map, and record
  remaining decisions as Q-/A- rows in docs/facts.md open questions. The sentinel opts the spec into
  tests/unit/feature-suite-spec-shape.test.mjs (shape) and npm run verify:spec-traceability (AC-id
  integrity + facts.md cross-reference); the 13 pre-existing S1–S13 specs keep their original shape.

STEP 3 — Verify and hand off. Run npm run verify:context-freshness, npm run
verify:spec-traceability, npm test, npm run verify:router-boundary, npm run
verify:falsification, and bash scripts/verify.sh. Update docs/status.md
and docs/loop-state.md. Stop. Do not build features; lease-renewal stays gated until the team validates
process, columns, and golden data.
```
