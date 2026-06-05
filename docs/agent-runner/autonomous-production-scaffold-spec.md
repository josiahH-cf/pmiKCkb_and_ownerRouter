# Autonomous Production Scaffold Spec

## Purpose

This spec defines the documentation scaffold needed before an outside agent can run a
large feature cycle with minimal interruption. It does not authorize runtime product
changes, deploys, live imports, Gmail access, billing changes, key creation, or external
system writes.

The scaffold should let a future agent start from a user trigger such as "let's plan the
next feature run cycle", gather the right context, front-load decisions, build safely,
verify locally, prepare a commit queue, and hand the result to the user for final
functional review.

## Durable Documentation Shape

The outside agent should convert this prompt pack into durable active guidance:

- `AGENTS.md`: short router only. Add a route for autonomous feature-cycle work and keep
  detailed behavior in `docs/`.
- `CLAUDE.md`: compatibility surface for Claude-style runners. Prefer a symlink to
  `AGENTS.md`; if unsupported, use a short redirect file with no separate product rules.
- `docs/autonomous-agent-runner.md`: main durable runner spec for the feature-cycle loop.
- `docs/ai-execution-workflow.md`: daily/session workflow that references the runner
  when the feature-cycle trigger appears.
- `docs/implement.md`: implementation runbook that explains how feature-cycle planning,
  unattended build, verification, and final review fit the existing task-selection flow.
- `docs/client-checklist.md`: concrete client asks only, never vague coordination notes.
- `docs/research-backlog.md`: unresolved integration, setup, or policy questions that
  are not yet client asks.
- `docs/status.md`: append-only status updates after meaningful scaffold work.

Do not move original specs out of `docs/specs/`. Preserve history, but keep active
routing pointed at the three-product direction. If old docs contain stale KB-only or
separate Owner Router guidance, mark them as legacy or keep them behind `docs/legacy/`
instead of linking them as active execution context.

## Runner Behavior To Specify

The durable runner must start with context, then decide. It should read `AGENTS.md`, the
north star, product lane docs, plan, implementation runbook, current status, client
checklist, research backlog, and engineering guidance before selecting work.

The runner should build a cycle packet before implementation. The packet should include:

- Product lane or cross-product classification.
- Chosen feature-cycle goal.
- Current confirmed facts from active docs.
- In-scope and out-of-scope work.
- Decisions already answered by docs.
- Decisions still needed before unattended execution.
- Cost, cloud, API, Gmail, deployment, import, and client-environment actions that need
  explicit approval.
- Secrets or key-management needs, recorded as setup requirements without real secret
  values.
- Parallel human-side work such as client asks, manual setup, testing support, and draft
  communications.
- Verification commands and acceptance scenarios.
- Commit queue expectations.

The runner may make conservative implementation choices when active docs define the
direction and the choice does not create external side effects, new costs, data exposure,
or product-scope expansion. It must stop for explicit approval before any cost-incurring
or client-environment action.

## Safety And Cost Gates

The scaffold must make these approval gates unambiguous:

- Cloud/API cost: require explicit approval before enabling services, deploying,
  importing live data, running live smoke tests, creating paid resources, increasing
  indexed volume, or starting recurring jobs.
- Secrets/API keys: never store real secrets in git. Record names only in `.env.example`;
  use `.env.local`, Secret Manager, workload identity, impersonation, or approved client
  setup paths for real values.
- Client environments: require explicit approval before modifying client GCP/Firebase,
  Google Workspace, Gmail, Drive, production domains, roles, labels, filters, or source
  folders.
- External systems: require a future approved spec before any writes to RentVine,
  LeadSimple, DotLoop, QuickBooks, Boom, operating Sheets, banks, ledgers, or client
  Drive folders.
- Human authority: preserve human send and approval authority. Drafts must remain
  reviewable and marked with the existing review boundary.

Approval requests should state the exact action, why it is needed, expected cost or
usage exposure when known, affected environment, rollback or correction path, and what
will remain blocked without approval.

## Blockers And Human-Side Track

Before declaring a blocker, the agent should search active docs, status history, client
checklist, research backlog, code/config, and relevant tests. If the answer is
discoverable, it should update the cycle packet and continue. If not, it should record a
concrete blocker:

- Product lane.
- Missing access, answer, source, permission, or approval.
- Why it blocks the current cycle.
- Exact client or user ask.
- Work that can continue while waiting.
- Verification step after unblock.

Human-side work should not wait until implementation is done. The runner should maintain
client asks, manual setup notes, draft emails, handoff notes, and acceptance-review items
in parallel with technical work. Draft communications must avoid secrets and raw client
or customer data.

## End-State Handoff

The end of a feature cycle should present one user review point, not repeated review
after every internal phase. The final handoff should include:

- What was planned and built.
- Files changed.
- Verification run and results.
- Cost/client-environment actions avoided or still awaiting approval.
- Remaining blockers and exact asks.
- Commit queue status and recommended commit grouping.
- What the user should verify manually at the end of the agentic run.

If the work includes docs only, validation should still include formatting and router
checks where available.
