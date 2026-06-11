# PMI KC Implementation Runbook

## Start Here

1. Read `docs/loop-state.md` first to resume the loop without rediscovering context.
2. Read `AGENTS.md`.
3. Read `docs/north-star.md`.
4. Read the relevant file in `docs/products/`.
5. Read `docs/product-definition-gap-plan.md` when scope, product shape, or follow-up
   questions are part of the task.
6. Read the latest entries in `docs/status.md`.
7. Check the git worktree and preserve user changes.

For a full feature cycle, `docs/autonomous-agent-runner.md` holds the canonical
context-intake order; this list is the lighter task-triage entry point.

Do not start from older KB-only or separate Owner Router assumptions. Those are legacy
unless an active product doc preserves a specific safety rule.

## Select The Next Task

Default priority:

1. Keep the existing PMI KC KB verification/demo path healthy.
2. Clear P0/P1 governance and discovery blockers from `docs/plan.md`.
3. Use `docs/product-definition-gap-plan.md` to close product-definition gaps before
   treating plans, demos, or legacy artifacts as build scope.
4. Convert client answers into product-lane scope and acceptance gates.
5. Prepare KB production cutover only from approved client-owned resources.
6. Scope Lease Renewal Agent before implementation.
7. Scope Gmail Inbox 0 live Gmail setup before implementation.

## While Waiting On Client Replies

The current outbound client asks are tracked in `docs/client-checklist.md`. They still
block unknown-cost work, raw client data handling, live Gmail work, external-system writes,
and Lease Renewal runtime execution, but they do not block reversible product work,
API-backed setup, or migration preparation when Remote Away Mode allows it.

Safe local development is not unlimited. Before starting another local feature cycle,
check whether the work still improves production readiness, migration/cutover prep,
verification quality, handoff, or a known regression. If local verification is green,
cutover/preflight artifacts are prepared or blocked only on client-owned values, and
the next idea would add speculative product surface, stop the feature loop. Record the
repo as migration-ready but client-blocked and make the next recommended task client
unblock, approved production setup, migration, or cutover prep.

Continue iterating on:

- KB demo/runtime health, tests, preflights, dry-runs, Admin visibility, and source
  manifest templates.
- Reversible GCP/Firebase/API setup and migration helpers when `docs/away-mode.md` is
  ACTIVE, `npm run check:budget-guard` passes, and non-secret identifiers are recorded in
  `docs/environment-handoff.md`.
- Approval Queue and workflow-control primitives that do not require live integrations
  or client data.
- Lease Renewal discovery artifacts, workflow-run/process-definition modeling,
  acceptance scenarios, read/gather fact models, and non-executable fixtures.
- Action Registry catalog/schema modeling (metadata only, `production_allowed: false`)
  and integration architecture per `docs/integration-architecture.md`, with Maintenance
  Work Order Intake as the first executable-write target and the Rentvine lease-renewal
  writeback gated as undocumented.
- Gmail Inbox 0 label/rule/prompt planning, legacy artifact mining, safe-thread
  scenario design, and management-page planning without live Gmail access.
- Tool access templates and integration capability classification using placeholders
  until Dan/team provide the spreadsheet answers.

After the migration-readiness stop gate is reached, keep only the work that preserves or
improves readiness: regression fixes, docs/status/client asks, test coverage, source
manifest templates, cutover runbooks, dry-run/preflight checks, acceptance scenarios,
and handoff evidence. Defer new workflow-control slices, Approval Queue expansion,
Lease Renewal runtime, Gmail runtime, or demo-only complexity unless the active docs
show a direct cutover or quality reason.

Stop before any unbounded Google Cloud cost, billing/quota change, destructive production
change, raw source import, Gmail read/modify/draft/send, API-key creation/use without an
approved storage path, client Drive write, or
RentVine/LeadSimple/DotLoop/QuickBooks/Boom/Sheets write unless the active docs and
`docs/away-mode.md` explicitly allow that exact bounded action.

When running product-definition follow-up loops, group related questions into small
batches. Include a recommended default answer for each question based on the active
context so the client can answer "yes" or provide targeted edits.

When the user asks to plan the next feature run cycle, route through
`docs/autonomous-agent-runner.md`. Read the trigger literally: "plan" produces a
decision-complete packet and stops; "run the loop", "continue", "build", or "implement"
authorizes the unattended implementation loop, the verification-and-falsification phase,
and the multi-slice continuation loop without user review between internal phases or safe
slices. Update `docs/loop-state.md` at each slice boundary and stop when a stop-and-reset
condition fires.

Use `docs/temp/` for scratch cycle packets and draft client communications. Promote only
durable decisions, blockers, client asks, and research questions into active docs.

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

For production corpus plans, inspect the printed `readiness` object. Continue to
staging-copy creation, upload, import, or metadata seeding only when `readiness.ok` is
`true` and `readiness.blockers` is empty.

For production or staging setup, record non-secret identifiers, manual setup state,
secret-owner records, and verification evidence in `docs/environment-handoff.md`.

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
- Update `docs/environment-handoff.md` when environment ownership, manual setup,
  non-secret identifiers, or secret storage locations change.
- Preserve original specs in `docs/specs/`.
- Mark or move stale docs as legacy before adding contradictory guidance.

## Prepare Changes For Review

- Keep `AGENTS.md` concise and routing-focused.
- Include tests for behavior changes.
- Do not commit secrets or raw client/customer material.
- Summarize validation, remaining blockers, exact client asks, and next recommended
  step.
