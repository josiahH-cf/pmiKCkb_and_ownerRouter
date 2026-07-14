# AI Execution Workflow

This workflow keeps daily AI sessions aligned with the three purchased products.

## Start Of Session

Read in tiers; `docs/autonomous-agent-runner.md` holds the full tiered context-intake order for
feature cycles, and this section does not repeat a divergent one.

1. Tier 0: `docs/facts.md` (solidified facts, assumptions, open questions), then `docs/loop-state.md`
   (resume pointer).
2. Tier 1: `AGENTS.md`, `docs/north-star.md`, the relevant product lane in `docs/products/`, and
   `docs/plan.md`.
3. On demand: `docs/status.md` from the latest entry backward for history, and the rest of the
   `AGENTS.md` Route Table.
4. Check the git worktree before edits and preserve user changes.

## Autonomous Feature Run Cycle

When the user asks to plan the next feature run cycle, use
`docs/autonomous-agent-runner.md`. "Plan" produces a decision-complete packet and stops;
"run the loop", "continue", "build", or "implement" authorizes unattended execution.

The target loop is: gather context starting from `docs/loop-state.md`, create a
decision-complete cycle packet in `docs/temp/`, ask planning-phase questions in one batch
when needed, build unattended, run the verification-and-falsification phase, repair clear
issues, align docs and `docs/loop-state.md`, prepare a commit queue, and continue into the
next safe slice until a stop-and-reset condition fires. The user verifies at the
end-of-run review point, not after every internal phase.

For the active 2026-07-14 final-V1 goal, the permanent packet already exists at
`docs/v1-gap-implementation-program-2026-07-14.md`. S20/S21/S23 are Local green; `/loop` starts with S24 and follows the remaining suites in
that packet; it does not create another Round 3 question packet. Use fake providers/emulators and
continue safe slices, stopping before exact live/config/provider gates.

Before choosing a local feature, run the migration-readiness stop gate in
`docs/autonomous-agent-runner.md`. If the proposed work does not improve production
readiness, migration/cutover prep, verification, handoff, or an approved product
quality issue, defer it and move the session toward client unblock or cutover prep.

When Remote Away Mode is active, do not stop merely because work uses APIs, migration
setup, or client-environment setup. Proceed when the action is reversible/idempotent,
budget-guarded, documented, and does not hit a Hard Stop in `docs/away-mode.md`. Stop
before unbounded cost, breaking/destructive change, key creation without an approved
storage plan, Gmail send/live mailbox access, external communication, or unapproved
system-of-record write.

Use `docs/autonomous-feature-cycle-packet-template.md` when a packet or handoff template
is useful. Treat `docs/agent-runner/` as the scaffold prompt pack that created the
runner, not as active production routing.

## Work AI Can Do Now

- Maintain governance, plans, checklists, and status.
- Convert confirmed client answers into product docs and acceptance gates.
- Maintain `docs/integration-architecture.md` and the Action Registry catalog
  (`action_registry`); registry entries are metadata only, stay `production_allowed:
false`, and execute no external action.
- Prepare source manifests and templates without committing source content.
- Draft non-secret setup runbooks and validation checklists.
- Add or improve tests for existing KB behavior when implementation changes.
- Audit docs for stale KB-only or separate-Owner-Router assumptions.
- While Dan/team replies are pending, continue KB/workflow-control hardening, Lease
  Renewal discovery/modeling, Gmail Inbox 0 planning, tool-access templates, and
  dry-run/preflight/API setup work that is reversible, budget-guarded, and does not touch
  raw client data or systems of record.
- Once local readiness is green and the remaining blockers are client-owned access,
  sources, billing, production setup, migration, or real product decisions, stop
  selecting new local product-surface work and record the migration-ready blocked state.

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
- Gmail Inbox 0 live mailbox read/modify/draft/send beyond documented safe-thread setup
  until Dan approves the safe test-thread model.
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
