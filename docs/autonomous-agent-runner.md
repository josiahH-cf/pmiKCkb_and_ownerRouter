# Autonomous Agent Runner

## Purpose

This is the active production runner for large unattended feature cycles. Use it when a
user says "let's plan the next feature run cycle" or asks for an agentic planning,
build, verification, and handoff loop.

The runner is documentation and process guidance only. It does not authorize cloud
spend, billing changes, client-environment changes, live imports, Gmail access, key
creation, deploys, sends, or external system writes.

## Entry Points

- `AGENTS.md` is the primary router for Codex and other agents.
- `CLAUDE.md` is a compatibility pointer for Claude-style runners. Keep it as a short
  pointer to `AGENTS.md`, not a duplicate rule file.
- `docs/agent-runner/` holds the prompt pack that created this scaffold. Treat it as
  scaffold source material, not the active runbook.
- `docs/temp/` is the disposable workspace for generated cycle packets, draft
  communications, and scratch planning artifacts.

## Context Intake

Before choosing work, read:

1. `AGENTS.md`
2. `docs/north-star.md`
3. `docs/products/README.md` and the relevant product lane doc
4. `docs/plan.md`
5. `docs/implement.md`
6. `docs/ai-execution-workflow.md`
7. the latest entries in `docs/status.md`
8. `docs/client-checklist.md`
9. `docs/research-backlog.md`
10. `docs/engineering.md` and `docs/engineering-checklist.md`
11. `docs/environment-handoff.md` when setup, keys, environments, manual tests, or
    handoff are relevant
12. `docs/legacy/owner-router-artifact-source.md` only when Gmail Inbox 0 artifact
    migration, naming, prompt, label, template, or demo-safe scenario work is in scope

Check the git worktree before edits and preserve user changes. Use `docs/specs/`,
`docs/legacy/`, and old demo docs only as historical source material unless an active
doc explicitly preserves a safety rule.

## Product Lane Selection

- PMI KC KB is the only current app runtime and the first production-lift lane.
- Lease Renewal Agent is the first backend automation target after the KB production
  lift, but runtime behavior waits for approved scope, permissions, and acceptance
  gates.
- Gmail Inbox 0 is the Dan-email-first Gmail lane. It preserves human send authority
  and does not add live Gmail read/modify runtime until approved.
- Cross-product work is allowed only when the active docs define the shared governance,
  source, approval, or handoff behavior.

If more than one lane is plausible, choose the lane with the clearest active roadmap
entry and record why. If the choice would invent product scope, ask during the planning
phase before implementation begins.

## End-State First Planning

Start each cycle by describing the desired end state, then work backward. The cycle
packet must make clear:

- What a user or operator can do at the end of the run.
- What production, staging, client-environment, source, or handoff state changes.
- Which docs, code paths, tests, setup steps, and approvals must exist before that end
  state is credible.
- Which dependencies can be handled locally and which require explicit approval.
- What the user should verify manually at the end of the run.

If the end state cannot be stated without inventing product requirements, ask planning
questions before implementation.

## Migration-Readiness Stop Gate

Safe local development is useful only while it improves the production path. Before
selecting another local feature cycle, decide whether the proposed work is still one of
these:

- removes a migration, cutover, verification, handoff, or known quality blocker;
- prepares source manifests, preflights, dry-runs, acceptance scenarios, tests, or
  client asks needed for migration;
- fixes a real regression in existing approved behavior;
- hardens existing KB/workflow behavior that will ship to the client-owned
  environment; or
- records product decisions, blockers, and setup evidence without inventing scope.

If the repo already has green local verification, current cutover/preflight artifacts,
clear client asks, and no known migration-relevant bug, stop adding new local product
surface. Record the state as migration-ready but client-blocked, move speculative work
to backlog/status, and make the next recommended task client unblock, production setup,
approved migration, or cutover prep.

Defer work that would expand workflow, Approval Queue, Lease Renewal, Gmail Inbox 0, or
demo-only behavior without a direct migration-readiness reason. This is not a hard stop
on useful prep; it is a stop on local feature loops that substitute for customer
unblock, production migration, or real application decisions.

## Cycle Packet

Create or update a cycle packet before implementation. Store scratch packets in
`docs/temp/` unless the user asks for a permanent artifact. Promote only durable
decisions into active docs.

The packet must lock:

- Feature-cycle objective and product lane.
- Why this is the next task from roadmap, status, client checklist, or backlog context.
- Migration-readiness impact and why the work belongs before production cutover.
- Local-development exhaustion check: what would make this work deferred instead of
  implemented now.
- In-scope and out-of-scope work.
- Confirmed facts and constraints from active docs.
- Decisions already answered by docs.
- Decisions or approvals still needed before unattended execution.
- Implementation approach and affected subsystems.
- End-state target and backward dependencies.
- Cost, cloud, API, Gmail, deploy, import, key, and client-environment gates.
- Environment, secrets, manual setup, and handoff requirements with no real secret
  values; update `docs/environment-handoff.md` when durable.
- Human-side work: client asks, manual setup, draft communications, and acceptance
  review.
- Verification commands, acceptance scenarios, stop conditions, and commit queue plan.

Ask planning questions in one batch when a reasonable autonomous choice would be risky,
would incur cost, would touch a client environment, or would invent product behavior.
When the trigger is only "plan the next feature cycle", stop after the packet unless the
user asks to run it or the current session instructions clearly authorize implementation.
After an implementation packet is locked, do not ask the user to review every internal
phase.

## Autonomous Choices

An agent may choose conservative local implementation details when active docs define
the direction and the choice:

- stays within the selected product lane,
- does not change product scope,
- does not expose private data,
- does not create cloud/API/billing usage,
- does not touch client resources,
- does not create or change keys,
- does not send messages or write to external systems, and
- can be verified locally.

The agent must stop for explicit approval before any action outside those limits.

## Approval Gates

Require explicit approval for each exact action or tightly related action group that
would:

- enable or increase cloud/API cost,
- change billing or quotas,
- create, rotate, upload, or use API keys or service account keys,
- modify GCP, Firebase, Google Workspace, Gmail, Drive, domains, labels, filters, roles,
  source folders, or client-owned resources,
- deploy or run production smoke tests,
- import live sources or index client data,
- read, modify, label, draft, or send live Gmail,
- send email or external communications,
- write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, operating Sheets, banks,
  ledgers, client Drive folders, or any system of record.

Approval requests must state the exact action, affected environment, product lane,
expected cost or usage exposure when known, data touched, secrets/keys/roles/domains or
external systems involved, verification path, rollback or correction path, and what
remains blocked without approval.

## Secrets And Environments

- Store no real secrets in git, docs, status entries, tickets, prompt packets, or draft
  emails.
- `.env.example` records variable names only.
- Local development uses `.env.local`, active-shell values, or approved local credential
  helpers.
- Production and staging secrets live in client-approved Secret Manager, workload
  identity, impersonation, or equivalent managed secret storage.
- Avoid downloadable service account keys. If a key is unavoidable, record the owner,
  purpose, rotation path, storage location, and revocation plan without committing the
  key.
- Client-owned API keys, OAuth apps, billing projects, domains, and service accounts
  need named owners, access boundaries, rotation expectations, and handoff notes before
  production work depends on them.
- Handoff docs should explain where non-secret identifiers live, who owns each
  environment, what manual setup remains, and how a future team can rotate or revoke
  access.
- Use `docs/environment-handoff.md` as the central non-secret registry for environment
  IDs, key owners, manual setup state, and verification evidence.

## Human-Side Parallel Track

Maintain the human side while technical work proceeds:

- Put concrete client actions in `docs/client-checklist.md`.
- Put unresolved research or integration questions in `docs/research-backlog.md`.
- Draft client communications when they would unlock setup, access, source approval, or
  testing.
- Record manual setup and web-app testing steps without secrets or raw client data.
- Keep handoff notes plain enough for a non-technical owner.

Draft communications should name the ask, why it matters, what PMI KC should provide or
approve, what happens after approval, how success will be verified, and the security
boundary.

## Blocker Protocol

Do not declare a blocker until current context has been searched. Check active docs,
latest status entries, client checklist, research backlog, product docs, code, configs,
and relevant tests. If the missing answer is discoverable, update the packet and
continue.

Only record a blocker when work cannot safely continue. A blocker must include product
lane, missing item, why it blocks the cycle, exact user or client ask, work that can
continue, and verification after unblock.

## Unattended Implementation Loop

After the cycle packet is decision-complete:

1. Build safe local changes.
2. Add or update tests for behavior changes.
3. Update durable docs future agents need.
4. Track discovered blockers and human-side asks.
5. Run the smallest relevant checks while working.
6. Prepare a commit queue with related change groups.
7. Hand the user one end-of-run review point.

The user verifies behavior at the end of the agentic run unless a stop condition occurs.
Do not pause after every internal phase.

## Commit Queue

Prepare a commit queue; do not assume commit, push, deploy, or merge authority unless the
user explicitly asks for it. The queue should list:

- Suggested commit title.
- Files or concerns included.
- Validation run and result.
- Manual end-of-run verification still needed.
- Any excluded changes or unrelated work left untouched.

If the user asks to ship, first confirm the branch, remotes, status, relevant diff,
validation, and absence of unrelated changes.

## Verification

Use checks proportional to the change:

- Documentation-only: `npm run format:check`, `git diff --check`, and
  `npm run verify:router-boundary`.
- TypeScript/runtime changes: add `npm run lint`, `npm run typecheck`, and `npm test`.
- Firestore or persistence changes: add `npm run test:firestore` when Java is
  available.
- Production or live setup preparation: dry-run first and stop before any unapproved
  live action.
- End-of-cycle handoff: run `bash scripts/verify.sh` when relevant and practical.

If a check cannot run, record the reason and residual risk.

## Stale Context Retirement

Do not delete preserved history solely because direction changed. Instead:

- keep active routing in `AGENTS.md`, this file, `docs/north-star.md`,
  `docs/products/`, `docs/plan.md`, and `docs/implement.md`;
- keep original specs in `docs/specs/` as historical preserved specs;
- keep superseded material in `docs/legacy/` or explicitly label it as demo/history;
- treat `docs/router-repo-template/` as a legacy template and do not use it to start
  new work unless the active Gmail Inbox 0 product doc requests historical artifact
  migration;
- treat the local sibling Owner Router repo as source material through
  `docs/legacy/owner-router-artifact-source.md`, not as active governance;
- remove stale docs from active routes when they no longer support production;
- update validation guards when stale language could misroute future agents.

Old KB-only, separate Owner Router, Bailey Brain, and Dan's AI Assistant references are
history or reusable source material. They do not override the three-product direction.

## Final Handoff

End each feature cycle with:

- what was planned and built,
- files changed,
- verification run and results,
- cost/client-environment actions avoided or awaiting approval,
- remaining blockers and exact asks,
- commit queue status and suggested grouping,
- manual user review items for the end of the run.

Do not claim production or client-environment work was completed unless it actually was.
