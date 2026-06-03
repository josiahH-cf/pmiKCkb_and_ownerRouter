# PMI KC Implementation Runbook

## Start Here

1. Read `AGENTS.md`.
2. Read `docs/north-star.md`.
3. Read the relevant file in `docs/products/`.
4. Read the latest entries in `docs/status.md`.
5. Check the git worktree and preserve user changes.

Do not start from older KB-only or separate Owner Router assumptions. Those are legacy
unless an active product doc preserves a specific safety rule.

## Select The Next Task

Default priority:

1. Keep the existing PMI KC KB verification/demo path healthy.
2. Clear P0/P1 governance and discovery blockers from `docs/plan.md`.
3. Convert client answers into product-lane scope and acceptance gates.
4. Prepare KB production cutover only from approved client-owned resources.
5. Scope Lease Renewal Agent before implementation.
6. Scope Gmail Inbox 0 live Gmail setup before implementation.

If the user asks for runtime work in Lease Renewal Agent or Gmail Inbox 0, first confirm
that the relevant product doc contains approved v1 scope, permissions, and acceptance
criteria. If not, document the blocker and prepare the missing checklist instead of
building speculative features.

## Keep Changes Scoped

- KB runtime changes belong in the existing Next.js/Firebase/Firestore/Vertex/Gemini
  boundaries.
- Lease Renewal Agent changes are docs/discovery only until scope is locked.
- Gmail Inbox 0 changes are docs/artifact migration only until Gmail setup authority and
  test model are approved.
- Do not add a dependency or integration unless the active product lane needs it.
- Do not add product behavior not present in confirmed direction or approved sources.

## Blocked Work

When blocked, update `docs/status.md` and, if durable, `docs/research-backlog.md` with:

- Product lane.
- Missing access, answer, source, or permission.
- Why it blocks work.
- Exact client ask.
- What AI can still do while waiting.
- Verification step after unblock.

Avoid vague blockers such as "coordinate with client" when a concrete ask can be named.

## Validate After Meaningful Changes

Use the smallest relevant checks during development:

```bash
npm run format:check
npm run typecheck
npm test
npm run lint
```

For Firestore rules or editable persistence:

```bash
npm run test:firestore
```

For KB source and cutover preparation, prefer dry-runs first:

```bash
npm run corpus:plan -- --write-temp
npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --project=<client-project-id> --location=us --dry-run
npm run seed:launch-skeletons -- --dry-run
npm run preflight:production -- --env-file=.env.production.local
```

Before handoff when relevant:

```bash
bash scripts/verify.sh
```

## Update Documentation

- Update `docs/status.md` after meaningful work.
- Update `docs/plan.md` only when phases, milestones, or acceptance gates change.
- Update this file when the operating workflow changes.
- Update `docs/products/*.md` when product scope changes.
- Update `docs/client-checklist.md` when new client asks are discovered.
- Update `docs/research-backlog.md` when questions are answered or added.
- Preserve original specs in `docs/specs/`.
- Mark or move stale docs as legacy before adding contradictory guidance.

## Prepare Changes For Review

- Keep `AGENTS.md` concise and routing-focused.
- Include tests for behavior changes.
- Do not commit secrets or raw client/customer material.
- Summarize validation, remaining blockers, exact client asks, and next recommended
  step.
