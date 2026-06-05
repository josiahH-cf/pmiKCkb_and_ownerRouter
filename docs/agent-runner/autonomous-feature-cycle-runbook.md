# Autonomous Feature-Cycle Runbook

## Trigger

Use this runbook when the user asks for a large autonomous planning/build cycle,
especially with language like "let's plan the next feature run cycle".

The goal is one coherent agentic run: plan thoroughly, ask needed questions up front,
build what can be built safely, verify, prepare commit-ready work, and then let the user
review functionality at the end.

## Context Intake

Start by reading active routing and current state:

1. `AGENTS.md`
2. `docs/north-star.md`
3. `docs/products/README.md` and the relevant product lane doc
4. `docs/plan.md`
5. `docs/implement.md`
6. `docs/ai-execution-workflow.md`
7. latest entries in `docs/status.md`
8. `docs/client-checklist.md`
9. `docs/research-backlog.md`
10. `docs/engineering.md` and `docs/engineering-checklist.md`

Check the worktree before edits and preserve user changes. Use legacy docs only as
history unless active docs explicitly preserve a safety rule.

## Planning Packet

Before implementation, produce or maintain a cycle packet with these decisions locked:

- Feature-cycle objective and product lane.
- Why this is the next task according to active roadmap/status context.
- In-scope work and explicit out-of-scope work.
- Product facts and constraints already confirmed.
- Implementation approach and affected subsystems.
- Decisions that were resolved from docs.
- Decisions requiring user/client approval before unattended execution.
- Cost, cloud, API, Gmail, deployment, import, key, and client-environment approvals
  required before any side-effectful action.
- Required tests, dry-runs, and manual acceptance checks.
- Human-side work: client asks, setup steps, draft communication needs, and handoff
  notes.
- Stop conditions.

Ask clarifying questions during this planning packet only when a reasonable autonomous
choice would be risky or would invent product scope. Batch questions so implementation
does not pause after every phase.

## Build Loop

After planning is locked, execute the safe local work without asking for phase-by-phase
confirmation:

1. Implement tightly scoped changes.
2. Update tests with behavior changes.
3. Update docs that future agents need.
4. Track blockers and client asks as they are discovered.
5. Run the smallest relevant verification checks while working.
6. Prepare changes for a commit queue.

The loop may continue through local code, docs, tests, scripts, and dry-runs. It must
stop before unapproved cost, cloud, API, Gmail, deploy, import, key, client-environment,
send, or external-write actions.

## Cost And Approval Protocol

When a blocked action needs approval, present a concrete approval request:

- Exact action.
- Environment affected.
- Product lane affected.
- Expected cost, usage, or billing exposure when known.
- Data touched.
- Whether secrets, keys, roles, domains, labels, filters, sources, imports, deploys, or
  external systems are involved.
- Verification and rollback or correction path.
- What remains blocked if approval is denied or deferred.

Do not bundle broad approval. Approval is per action or tightly related action group.

## Blocker Protocol

Before stopping, search available context and retry the path if the missing answer is
discoverable. Use `docs/status.md`, `docs/client-checklist.md`,
`docs/research-backlog.md`, product docs, configs, tests, and current code.

Only record a blocker when the missing item cannot be derived safely. A blocker record
must include the product lane, missing item, reason, exact ask, work that can continue,
and verification step after unblock.

## Human-Side Parallel Track

During the same run, maintain the non-code path:

- Add concrete client asks to `docs/client-checklist.md` when they require client action.
- Add research questions to `docs/research-backlog.md` when they require investigation
  before becoming a client ask.
- Draft client communications when they would help unlock work.
- Record manual setup and testing requirements without storing secrets or private data.
- Keep handoff notes readable for a non-technical owner.

Draft communications should name the ask, why it matters, what the client should do, and
how success will be verified.

## Verification And Commit Queue

Use the smallest checks that prove the work:

- Documentation-only: format check and router-boundary check when available.
- TypeScript/runtime changes: format, lint, typecheck, and unit tests.
- Firestore or persistence changes: Firestore tests.
- Production cutover preparation: dry-runs before live commands.
- Final handoff when relevant: full verification script.

Prepare a commit queue instead of relying on the user to inspect every intermediate
phase. The queue should group related changes, name validation status, and list any
manual end-of-run checks the user should perform.

## Stop Conditions

Stop and ask for approval or clarification when:

- A choice would invent product requirements.
- A live client system, Gmail mailbox, cloud resource, billing path, API key, role,
  domain, deploy, source import, or external write would be touched.
- The next step requires secrets or customer-private data.
- Verification reveals a failing behavior that cannot be resolved without changing
  product scope.
- Active docs conflict in a way that affects user-facing behavior or safety.

Do not stop merely because the next implementation step is large, tedious, or involves
multiple local files.
