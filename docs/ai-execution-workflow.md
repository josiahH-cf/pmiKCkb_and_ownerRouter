# AI Execution Workflow

This workflow keeps daily AI sessions aligned with the three purchased products.

## Start Of Session

1. Read `AGENTS.md`.
2. Read `docs/north-star.md`.
3. Read the relevant product lane in `docs/products/`.
4. Read `docs/status.md` from the latest entry backward.
5. Check the git worktree before edits and preserve user changes.

## Autonomous Feature Run Cycle

When the user asks to plan the next feature run cycle, use
`docs/autonomous-agent-runner.md`.

The target loop is: gather context, create a decision-complete cycle packet in
`docs/temp/`, ask planning-phase questions in one batch when needed, build safe local
work unattended, verify, prepare a commit queue, and then hand one end-of-run review
point to the user.

Stop before any unapproved cloud cost, API setup, key creation, deploy, live import,
Gmail access, client-environment change, send, or external system write.

Use `docs/autonomous-feature-cycle-packet-template.md` when a packet or handoff template
is useful. Treat `docs/agent-runner/` as the scaffold prompt pack that created the
runner, not as active production routing.

## Work AI Can Do Now

- Maintain governance, plans, checklists, and status.
- Convert confirmed client answers into product docs and acceptance gates.
- Prepare source manifests and templates without committing source content.
- Draft non-secret setup runbooks and validation checklists.
- Add or improve tests for existing KB behavior when implementation changes.
- Audit docs for stale KB-only or separate-Owner-Router assumptions.
- While Dan/team replies are pending, continue local KB/workflow-control hardening,
  Lease Renewal discovery/modeling, Gmail Inbox 0 planning, tool-access templates, and
  dry-run/preflight work that does not touch client resources.

## Work Humans Or Client Can Do In Parallel

- Provide admin access, non-secret project IDs, and authorized domains.
- Approve source documents and mark sensitivity.
- Confirm Lease Renewal Agent requirements and success criteria.
- Confirm Gmail Inbox 0 label/filter/testing model.
- Name users for roles, training, acceptance, and monitoring.
- Approve production cutover date and rollback owner.

## Work Blocked On Access Or Missing Information

- Client-owned KB production deploy.
- Live Agent Search imports from PMI KC sources.
- Firebase production role assignment.
- Google Cloud billing/client-project migration until Dan adds billing and approves
  exact cost-bearing actions.
- Gmail Inbox 0 live label/filter/setup beyond safe local planning until Dan approves
  the safe test-thread model.
- Any Lease Renewal Agent runtime design.
- Any integration with RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or live
  Gmail beyond explicitly approved safe setup and tool-access answers.
- The first authoritative Lease Renewal trigger source until Dan identifies where signed
  leases and lease end dates live.

## Blocked-Work Protocol

When blocked, record:

- Product lane.
- Missing item.
- Why it blocks work.
- Exact client ask.
- Work AI can do while waiting.
- Verification command or manual check once unblocked.

Do not write vague blockers such as "coordinate with client" when a concrete ask can be
named.

## Documentation Maintenance

- Update `docs/status.md` after meaningful work.
- Update `docs/plan.md` only when phases, milestones, or acceptance criteria change.
- Update `docs/implement.md` when the operating workflow changes.
- Update the relevant `docs/products/*.md` when product scope changes.
- Preserve original specs in `docs/specs/`.
- Move or mark stale docs as legacy before adding new contradictory guidance.
