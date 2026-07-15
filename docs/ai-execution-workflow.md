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
`docs/v1-gap-implementation-program-2026-07-14.md`. S20–S24 are Local green; S22 and every S25/S26
typed adapter run through the invented-alias synthetic journey; S27 local release-readiness artifacts
are built. All external/provider/configuration/deploy rows remain Gated. `/loop` now selects one exact
row from `docs/v1-client-unblock-checklist-2026-07-14.md`; it does not create another Round 3 packet,
reuse synthetic evidence as provider proof, or infer provider contracts. Stop before each unauthorized
live/config/provider gate.

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
- While an exact checklist row is pending, continue only regression repair, verification,
  dry-run/preflight, handoff, and evidence work that improves readiness and does not touch raw client
  data or systems of record. Use the canonical invented aliases for blocked-work tests.
- Once local readiness is green and the remaining blockers are client-owned access,
  sources, billing, production setup, migration, or real product decisions, stop
  selecting new local product-surface work and record the migration-ready blocked state.

## Work Humans Or Client Can Do In Parallel

- Choose one row from `docs/v1-client-unblock-checklist-2026-07-14.md` and return only its named
  non-secret official/account contract, mapping, identifiers, and credential-owner/location label.
- Approve production source roots and sensitivity/scanner policy for the exact launch Spaces.
- Approve only the bounded first proof named by that row; a setup approval does not authorize the
  action, deploy, send, write, or another row.
- Capture the exact prior revision before any approved deploy and name Dan/Josiah acceptance evidence
  only after deployed business/technical outcomes are green.

## Work Blocked On Access Or Missing Information

- S21 production root/scanner/import/index evidence and S24 production index/held-record/TTL/worker
  activation evidence.
- S22 Identity Platform/TOTP, invitation delivery, OAuth client/redirect/vault, same-mailbox, and
  first assigned-ticket Vendor proof.
- Each S25/S26 production action's official/account contract, authoritative mapping, credential
  location, bounded proof, readback, monitor, correction, Registry review, and explicit authority.
- S27 captured prior revision, approved deploy/smoke, deployed desktop/phone evidence, dependency
  disposition, rollback rehearsal, and named Dan/Josiah acceptance.

The exact fields, recommended closed default, responsible role, and first proof are in
`docs/v1-client-unblock-checklist-2026-07-14.md`. Do not expand these into generic access asks.

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
