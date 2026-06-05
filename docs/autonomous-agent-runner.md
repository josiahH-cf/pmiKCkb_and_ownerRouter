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

## Cycle Packet

Create or update a cycle packet before implementation. Store scratch packets in
`docs/temp/` unless the user asks for a permanent artifact. Promote only durable
decisions into active docs.

The packet must lock:

- Feature-cycle objective and product lane.
- Why this is the next task from roadmap, status, client checklist, or backlog context.
- In-scope and out-of-scope work.
- Confirmed facts and constraints from active docs.
- Decisions already answered by docs.
- Decisions or approvals still needed before unattended execution.
- Implementation approach and affected subsystems.
- Cost, cloud, API, Gmail, deploy, import, key, and client-environment gates.
- Secrets, manual setup, and handoff requirements with no real secret values.
- Human-side work: client asks, manual setup, draft communications, and acceptance
  review.
- Verification commands, acceptance scenarios, stop conditions, and commit queue plan.

Ask planning questions in one batch when a reasonable autonomous choice would be risky,
would incur cost, would touch a client environment, or would invent product behavior.
After the packet is locked, do not ask the user to review every internal phase.

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
