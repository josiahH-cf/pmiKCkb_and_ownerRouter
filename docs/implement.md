# PMI KC Implementation Runbook

## Start Here

Read the Tier-0 spine first, then Tier 1; reach everything else on demand via the `AGENTS.md` Route
Table. `docs/autonomous-agent-runner.md` holds the full tiered context-intake order — this list is the
lighter task-triage entry point and does not repeat a divergent order.

1. `docs/facts.md`, then `docs/loop-state.md` (Tier 0 — solidified facts and the resume pointer).
2. `AGENTS.md`, `docs/north-star.md`, the one active `docs/products/` lane doc, and `docs/plan.md`
   (Tier 1).
3. On demand: the latest `docs/status.md` entries, `docs/product-definition-gap-plan.md` when scope,
   product shape, or follow-up questions are part of the task, and the rest of the Route Table.
4. Check the git worktree and preserve user changes.

For the active final-V1 goal, then read `docs/v1-gap-implementation-program-2026-07-14.md` and S20–S27.
`/loop` starts at the suite named in `docs/loop-state.md` and continues through safe local slices.

## Local Demo Firestore Writes

`npm run seed:demo`, `npm run demo:reset`, and any `npm run demo:operator` mode that resets data
are emulator-only commands. Before Firebase Admin is imported or initialized they resolve the effective
`FIRESTORE_EMULATOR_HOST`, permit only a reachable loopback target (`127.0.0.0/8`, `localhost`, or `[::1]`),
and propagate that verified target to child processes. A configured project id is only the emulator namespace;
it never authorizes a live fallback. These commands intentionally have no `--live` option.

Start the emulator, then set the target explicitly in the same shell before demo mutation:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FIREBASE_PROJECT_ID="pmi-kc-kb-e2e"
npm run seed:demo
```

The startup line prints only host, port, project id, and final counts. An absent, malformed, non-local, or
unreachable target exits nonzero before any write. Never work around that refusal with ADC, a personal account,
a production endpoint, or a permissive live flag.

Do not start from older KB-only or separate Owner Router assumptions. Those are legacy
unless an active product doc preserves a specific safety rule.

## Select The Next Task

Default priority:

1. Keep the existing PMI KC KB verification/demo path healthy.
2. Clear the audited internal-V1 owner decisions in
   `docs/v1-readiness-audit-2026-07-14.html`; do not treat every open research item as a launch
   blocker.
3. Use `docs/product-definition-gap-plan.md` to close real product-definition gaps before
   treating plans, demos, or legacy artifacts as build scope.
4. Convert client answers into product-lane scope and acceptance gates.
5. Prepare KB production cutover only from approved client-owned resources.
6. Finish Lease Renewal operational source/acceptance alignment before widening its built
   read/reconcile/review runtime to any external action.
7. Operate Workflow Communications only through S19's server-authorized workflow contexts, governed
   artifacts, exact confirmation, bodyless audit, and targeted-receive rules.

## While Waiting On Client Replies

The current outbound client asks are tracked in `docs/client-checklist.md`. They still
block unknown-cost work, raw client data handling, unapproved Gmail expansion, external-system writes,
and Lease Renewal operational mutation, but they do not block reversible product work,
API-backed setup, or migration preparation when Remote Away Mode allows it.

Safe local development is not unlimited. Before starting another local feature cycle,
check whether the work still improves production readiness, migration/cutover prep,
verification quality, handoff, or a known regression. If local verification is green,
cutover/preflight artifacts are prepared or blocked only on client-owned values, and
the next idea would add speculative product surface, stop the feature loop. Record the
repo as migration-ready but client-blocked and make the next recommended task client
unblock, approved production setup, migration, or cutover prep.

Continue iterating on:

- The decision-complete S20–S27 program in dependency order, one external provider/action per slice,
  using fake providers/emulators and preserving current Action Registry values until the exact live gate.

- KB demo/runtime health, tests, preflights, dry-runs, Admin visibility, and source
  manifest templates.
- Reversible GCP/Firebase/API setup and migration helpers when `docs/away-mode.md` is
  ACTIVE, `npm run check:budget-guard` passes, and non-secret identifiers are recorded in
  `docs/environment-handoff.md`.
- S20 risk/authority/ledger, S21 trusted publication, S23 Console live/test-data, and S24 retention/
  artifact/AI-reply policy are Local green and remain shared boundaries.
- Start S22 Vendor auth/OAuth app-plane, then S25/S26
  orchestrators/adapters and S27 integrated release acceptance.
- Action Registry catalog/schema modeling (metadata only; do not widen `production_allowed`)
  and integration architecture per `docs/integration-architecture.md`, with Maintenance
  Work Order Intake as the first executable-write target and the Rentvine lease-renewal
  writeback gated as undocumented.
- S24's built v1.0 workflow artifacts/AI policy and synthetic linked-thread scenarios; production
  Gmail actions still require entity scope, authoritative S25/S26 runtime values, exact confirmation,
  separately activated cleanup/TTL, and per-action live authority.
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

R01–R09 need no further product-definition batch. Ask only for irreducible production mappings,
provider contracts/credentials, or exact live authority after repo/code research is exhausted.

When the user asks to plan the next feature run cycle, route through
`docs/autonomous-agent-runner.md`. Read the trigger literally: "plan" produces a
decision-complete packet and stops; "run the loop", "continue", "build", or "implement"
authorizes the unattended implementation loop, the verification-and-falsification phase,
and the multi-slice continuation loop without user review between internal phases or safe
slices. Update `docs/loop-state.md` at each slice boundary and stop when a stop-and-reset
condition fires.

Use `docs/temp/` for scratch cycle packets and draft client communications. Promote only
durable decisions, blockers, client asks, and research questions into active docs.

If the user asks for a new runtime action or a wider Lease Renewal/Workflow Communications
capability, first confirm that the relevant product doc contains approved scope, permissions, and
acceptance criteria for that exact action. Preserve and test existing runtime boundaries without
reopening settled discovery.

## Keep Changes Scoped

- KB runtime changes belong in the existing Next.js/Firebase/Firestore/Vertex/Gemini
  boundaries.
- Lease Renewal Agent already has read/reconcile/review runtime. Keep new work app-plane/read-only
  until the exact operational action is scoped and approved.
- Gmail's four technical scopes are approved, but product authorization is narrower: workflow-linked
  read, governed draft/label, and exact-confirmed reply only. Generic send, automatic processing,
  historical scans, unrelated inbox access, and cross-mailbox behavior remain disabled or out of scope.
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
