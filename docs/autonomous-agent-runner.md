# Autonomous Agent Runner

## Purpose

This is the active production runner for large unattended feature cycles. Use it when a
user says "let's plan the next feature run cycle" or asks for an agentic planning,
build, verification, and handoff loop.

The runner is documentation and process guidance only. Per the Go-Live and Roadmap Build
Authorizations in `AGENTS.md` (`F-SEND-AUTHORIZED`, `F-ROADMAP-BUILD-AUTHORIZED`), the DEFAULT is to
**build every authorized roadmap suite to its external seam** — the app-plane, the live provider, and
the full action contract — and ship it, opening each `production_allowed` gate as a routine reviewed
code change. The runner autonomously performs all local/app-plane build and verification. It stops for
the owner ONLY at a genuine external step: a cost-bearing cloud/billing action, a deploy, a
credential/scope/OAuth grant, a vendor confirmation, or the one documented endpoint that flips a built
provider live. It never treats a whole feature as deferred because its last inch is owner-gated, and it
never performs an autonomous client-facing send or an unreviewed system-of-record write.

## Entry Points

- `AGENTS.md` is the primary router for Codex and other agents.
- `CLAUDE.md` is a compatibility pointer for Claude-style runners. Keep it as a short
  pointer to `AGENTS.md`, not a duplicate rule file.
- `docs/agent-runner/` holds the prompt pack that created this scaffold. Treat it as
  scaffold source material, not the active runbook.
- `docs/temp/` is the disposable workspace for generated cycle packets, draft
  communications, and scratch planning artifacts.

## Context Intake

Read context in tiers, not as one long list. `docs/implement.md` and
`docs/ai-execution-workflow.md` point here instead of repeating a divergent list. Mandatory
every-session reading is Tier 0 + Tier 1; everything else is reached on demand through the
`AGENTS.md` Route Table.

**Tier 0 — solidified spine (always, first):**

1. `docs/facts.md` — verified facts, labeled assumptions, open questions, and the supersede log.
2. `docs/loop-state.md` — the short resume pointer for the current slice and active blockers.

**Tier 1 — direction and plan (any feature work):**

3. `AGENTS.md` — the router.
4. `docs/north-star.md` — direction and decision rules.
5. `docs/products/README.md` and the one active product-lane doc.
6. `docs/plan.md` — phase status and acceptance gates.

**Tier 2 — on demand via the Route Table (read only what the task needs):**

- `docs/implement.md` / `docs/ai-execution-workflow.md` when the operating workflow is in question.
- the latest entries in `docs/status.md` for the history behind a fact.
- `docs/client-checklist.md`, `docs/v1-client-unblock-checklist-2026-07-14.md`, and
  `docs/research-backlog.md` when choosing client-unblock work.
- `docs/engineering.md` and `docs/engineering-checklist.md` when writing code.
- `docs/environment-handoff.md` when setup, keys, environments, manual tests, or handoff are
  relevant.
- `docs/legacy/owner-router-artifact-source.md` only when Gmail Inbox 0 artifact migration, naming,
  prompt, label, template, or demo-safe scenario work is in scope.

`docs/facts.md` and `docs/loop-state.md` are the Tier-0 spine. If `docs/loop-state.md` conflicts with
the latest `docs/status.md` entry, trust `docs/status.md` and correct `docs/loop-state.md`. Run
`npm run verify:context-freshness` to confirm the spine is current before acting on it.

Check the git worktree before edits and preserve user changes. Use `docs/specs/`,
`docs/legacy/`, and old demo docs only as historical source material unless an active
doc explicitly preserves a safety rule.

## Product Lane Selection

- PMI KC KB is the shared working V1 runtime under R01–R09 and S20–S27. Application readiness is
  established by the stable production Live/Test workflows; provider activation is tracked per action.
- Lease Renewal Agent already has a deterministic read/reconcile/review runtime and app-plane
  decision surfaces. It remains the first backend automation target, while every external write
  waits for its own approved scope, permission, and acceptance gate.
- Workflow Communications is the Gmail-backed adapter for authorized renewal and maintenance
  entities. Per-user transport is proven, but the product does not expose a general inbox,
  arbitrary compose, cross-mailbox access, or autonomous send.
- The external Vendor lane is separate from managed staff: Admin invite, one-time setup, verified-
  email TOTP, assigned tickets, and same-address Gmail/Workspace per-vendor OAuth under S22.
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

## Build-to-Seam Gate

Before selecting the next slice, confirm it advances an authorized roadmap suite
(`docs/roadmap-unblock-2026-07-23.md`, S28–S39) or fixes a real regression in shipped behavior. The
runner BUILDS — it does not defer product surface. For each suite, in order:

- build the app-plane (UI, routes, state, validation) unattended;
- build the live provider implementation, replacing any fake/synthetic provider, plus the full
  preview/confirm/receipt/rollback action contract and its Test-lane proof; and
- build the gate-flip machinery (seed readiness/evidence, both `EXECUTABLE_ALLOWLIST` copies, pinned
  tests), left staged until the one named owner dependency is documented.

It hands back ONLY at that single named owner dependency (roadmap §5) — a documented endpoint, a
credential/scope grant, a vendor confirmation, or a billing approval — recorded as a one-line owner
step, never as "feature deferred." Do not stop a 90%-buildable feature at 0% because its last inch is
external. Do not invent scope beyond the roadmap suites; do not lower a schema/risk gate, override the
Registry, or use a synthetic escape to fake a Live receipt (a production Test receipt closes
app-workflow evidence, never Live-provider evidence).

## Cycle Packet

Create or update a cycle packet before implementation. Store scratch packets in
`docs/temp/` unless the user asks for a permanent artifact. Promote only durable
decisions into active docs.

The packet must lock:

- Feature-cycle objective and product lane.
- Why this is the next task from roadmap, status, client checklist, or backlog context.
- Build-to-seam scope: the app-plane, the live provider, and the full contract the loop builds now.
- Owner-dependency check: the one external step (roadmap §5) that stays owner-gated, named exactly, or
  "none" for a pure app-plane suite.
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

Read the trigger literally to avoid re-prompting:

- "Plan the next feature cycle" (or "plan", "draft a packet"): produce the
  decision-complete packet, update `docs/loop-state.md`, then stop and offer to run it.
  Do not start building.
- "Run the loop", "continue the loop", "build the next slice", "implement", or an
  explicit instruction authorizing implementation: proceed through the unattended
  implementation loop and into the multi-slice continuation loop without asking again
  between internal phases or between safe slices.

For the active working-V1 goal, `/loop` or any run/continue/implement trigger follows
`docs/loop-state.md` and the dependency order in the V1 program. Do not regenerate Round 3 questions
or infer a Live provider contract. Complete isolated Test workflows and app/Firestore writes, then
activate only the exact Live actions currently authorized by the owner and Registry contract.

After an implementation packet is locked, do not ask the user to review every internal
phase. Only stop for an approval gate, a stop-and-reset condition, or a genuine blocker.

## Autonomous Choices

An agent may choose conservative local implementation details when active docs define
the direction and the choice:

- stays within an authorized roadmap suite (does not invent scope beyond the S28–S39 program),
- does not expose private data,
- does not create cloud/API/billing usage,
- does not touch client resources,
- does not create or change keys,
- does not perform a LIVE external send or system-of-record write — building the provider, the full
  action contract, and a staged, unflipped gate is in-bounds; activating it live is not, and
- can be verified locally or against the Test lane.

The agent builds to the seam within those limits and stops for explicit owner approval only to
activate a built provider live (the one named external dependency).

When Remote Away Mode is active in `docs/away-mode.md`, this local-only limit is widened:
the agent may also run idempotent, reversible migration/setup work through APIs when it is
budget-guarded, documented, and does not hit a Hard Stop in that file. This includes
preflights, API enablement, Firebase/GCP setup, app-owned metadata seeding, scale-to-zero
deploy preparation, and small cheap-live smokes. Do not stop merely because the owner is
remote.

## Approval Gates

These gates apply to EXECUTING or activating an action live, not to building it. The runner freely
builds the provider, the full action contract, and a staged, unflipped gate to the seam; it requires
explicit owner approval to actually perform or flip live each exact action or tightly related group
that would:

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
  ledgers, client Drive folders, or any system of record,
- execute any external action whose Action Registry entry is not `Approved for Execution`
  with `Documented` evidence, including any capability that is undocumented or only
  vendor-confirmation-required (for example the Rentvine lease-renewal writeback).

Approval requests must state the exact action, affected environment, product lane,
expected cost or usage exposure when known, data touched, secrets/keys/roles/domains or
external systems involved, verification path, rollback or correction path, and what
remains blocked without approval. The Action Registry (`docs/integration-architecture.md`)
is the structure that carries each action type's target system, documented evidence,
required permissions and plan, readiness, preview, and rollback; an action is eligible for
execution approval only when its registry entry is `Approved for Execution`, `Documented`,
and `production_allowed`.

Remote Away Mode modifies these gates by granting standing approval for bounded setup and
migration actions that pass `npm run check:budget-guard`, have a dry-run or replayable
plan, record non-secret identifiers in `docs/environment-handoff.md`, and avoid the Hard
Stops in `docs/away-mode.md`. It does not waive billing/cap increases, Pro model usage,
autonomous sends, destructive changes, raw data/secrets exposure, or unapproved
system-of-record writes.

## Cost Ceiling And Budget Policy

The cloud budget is approximately **$10 total** and no spend happens without approval.
`docs/budget-and-cost-policy.md` is the single source of truth: it holds the cap, the
free-tier-first defaults, the inventory of every cost-bearing path and its gate, and the
`npm run check:budget-guard` preflight. Read it before any cost-bearing step.

- Default to the cheapest safe option: local emulation, then demo mode (`ASK_DEMO_MODE=true`,
  no live calls), then the sanctioned cheap-live path (Flash + single `lease-renewals`
  Space + scale-to-zero Cloud Run), then anything billed.
- Run `npm run check:budget-guard` before any live, deploy, import, or notification command.
  In Remote Away Mode it allows explicitly bounded multi-Space migration setup, but still
  refuses Pro and notification-send overrides.
- The $10 total cap supersedes higher per-service figures in older preserved specs. Treat
  it as a hard ceiling: if a step would approach it, stop and raise an approval request.
- While billing is unprovisioned, actions that require billing remain blocked; API setup
  and dry-runs that do not require billing may still proceed.
- When the temporary overlay in `docs/away-mode.md` is active, continue with non-blocked
  remote work instead of stopping for synchronous review. Queue only Hard Stop decisions in
  `docs/loop-state.md`.

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

After the cycle packet is decision-complete, run one slice end to end:

1. Build the selected safe changes, including bounded API/setup/migration work when
   Remote Away Mode authorizes it.
2. Add or update tests for behavior changes.
3. Update durable docs future agents need.
4. Track discovered blockers and human-side asks.
5. Run the smallest relevant checks while working.
6. Run the Verification And Falsification phase for the slice.
7. Repair clear in-scope issues, then re-verify.
8. Align affected docs, help text, specs, and `docs/loop-state.md`.
9. Prepare a commit queue with related change groups.
10. Enter the Multi-Slice Continuation Loop to decide whether to start the next slice.

Do not pause after every internal phase. When the loop is authorized to run, continue
into the next safe slice instead of stopping for routine review. The user verifies
behavior at an end-of-run review point that occurs when a stop-and-reset condition fires,
not after each internal phase.

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

## Verification And Falsification

Treat verification as a first-class phase, not a final command run. Assume the slice was
just completed by someone else and now needs an objective pass from fresh context, like
an outside model reviewing unfamiliar work. Prefer trying to break the work over
confirming it.

Run this phase for every slice:

1. Explain in plain English what the slice actually changed.
2. Verify the implementation against intended behavior, the packet objective, acceptance
   criteria, and any referenced spec. For an overhaul feature-suite spec, name the `AC-`
   acceptance-check ids the slice claims and confirm each stated OBSERVABLE state actually
   holds (not merely that code exists). This runs identically under any runner; the gates in
   step 5 are enforced for every runner by CI (`.github/workflows/ci.yml`).
3. Try to falsify it. Actively look for:
   - mismatches between stated intent and actual behavior,
   - omissions and missing acceptance-criteria coverage,
   - regressions and downstream breakage in code, docs, or commands,
   - broken assumptions and rule violations against north-star and security rules,
   - edge cases and unhandled states,
   - invalid JSON or Markdown,
   - stale command descriptions, stale prompt-chain hints, and missing linked docs,
   - oversized-file risk and suspiciously large or unrelated diffs.
4. Run `npm run verify:falsification` for the deterministic preflight (secret scan,
   oversized-file check, JSON validity, internal doc-link existence). Treat its failures
   as hard blockers.
5. Run checks proportional to the change:
   - Documentation-only: `npm run format:check`, `git diff --check`,
     `npm run verify:router-boundary`, `npm run verify:falsification`,
     `npm run verify:context-freshness`, and `npm run verify:spec-traceability`.
   - TypeScript/runtime changes: add `npm run lint`, `npm run typecheck`, and `npm test`.
   - Firestore or persistence changes: add `npm run test:firestore` when Java is
     available.
   - Production or live setup preparation: dry-run first; when Remote Away Mode is active,
     proceed with bounded, reversible, budget-guarded setup and stop only for a Hard Stop.
   - End-of-cycle handoff: run `bash scripts/verify.sh` when relevant and practical.
6. Repair clear in-scope issues immediately when the correct fix is supported by current
   context, then re-run the affected checks.
7. Align affected docs, help text, specs, task notes, and workflow references when the
   slice made them stale.
8. If a real issue cannot be fixed safely from available context, record it as a blocker
   instead of guessing.

If a check cannot run, record the reason and residual risk. When a slice ships work claimed
by an overhaul spec, its promoting `docs/facts.md` `F-*` row cites the `AC-` acceptance-check
ids it satisfies (`npm run verify:spec-traceability` fails if a cited id does not resolve).
Record the falsification result, the `AC-` ids covered, and the last-known-green checks in
`docs/loop-state.md` so the spec-to-implementation trail is durable, not narrated.

## Multi-Slice Continuation Loop

When the loop is authorized to run, do not stop after one slice. After a slice passes
Verification And Falsification, repair, doc alignment, and commit-queue preparation,
decide whether to continue:

1. Re-check the Build-to-Seam Gate for the next candidate slice.
2. If a safe, readiness-improving slice exists in the active lane, front-load a new
   decision-complete cycle packet for it and run it through the Unattended Implementation
   Loop.
3. If the next safe step is client unblock, cutover prep, docs, or regression hardening,
   route there instead of expanding local product surface just to keep the loop active.
4. Update `docs/loop-state.md` at every slice boundary so a fresh session can resume.
5. Continue until a Stop And Reset condition fires.

Select the next slice from the authorized roadmap program (`docs/roadmap-unblock-2026-07-23.md`,
S28–S39), status, or backlog. Do not invent scope beyond those suites to manufacture a next slice. If
every suite is shipped or built to its named owner dependency, stop and record the remaining
owner-dependency list (roadmap §5).

## Stop And Reset Conditions

Keep going while slices stay safe, decision-complete, and readiness-improving. Stop and
hand back when any condition below fires. State which condition fired and the recommended
next action in `docs/loop-state.md`.

- Owner dependency reached: the next step is the one named external activation — unbounded cloud/API
  cost, a billing change, key/credential/scope/OAuth creation or grant, a deploy, a vendor
  confirmation, the documented endpoint that flips a built provider live, or an autonomous
  client-facing send (never allowed). Building the provider, contract, and a staged, unflipped gate is
  NOT a stop; only the live activation is. Stop and hand the owner the exact one-line step.
- Requested release complete: verification, docs, commit/push/deploy, production acceptance, and
  rollback evidence are complete; remaining provider activations are specifically inventoried.
- Quality degrading: the same root issue survives two repair cycles, checks that were
  green turn red and do not recover, or new lint/type/test failures are introduced and
  not fixed in the same slice. Stop, record the regression, and recommend a focused fix
  session.
- Uncertainty too high: the next slice cannot be made decision-complete without inventing
  scope, a product decision, a source, a credential, or an approval. Stop and record the
  exact missing decision as a blocker.
- Context reset needed: the working context is large or drifting, lane focus is slipping,
  or accumulated state risks errors. Write `docs/loop-state.md`, recommend a fresh context
  window, and stop.
- Program complete: every authorized roadmap suite is either shipped live or built to its named
  owner dependency. Record the remaining owner-dependency list (roadmap §5) and stop.

A clean stop with a current `docs/loop-state.md` is a successful outcome, not a failure.

## Loop State Capture

`docs/loop-state.md` is the durable single-read resume artifact for the loop. Keep it
current so the next unattended session resumes without rediscovering context.

Update it:

- at the start of a cycle, with the selected slice and why it is next,
- at each slice boundary, with what was built, verified, and queued,
- whenever a blocker, approval gate, or stop-and-reset condition changes.

Record only non-secret state. Keep `docs/status.md` as the append-only history and
`docs/loop-state.md` as the always-current pointer. If they disagree, `docs/status.md`
wins and `docs/loop-state.md` is corrected.

## Stale Context Retirement

Do not delete preserved history solely because direction changed. Instead:

- keep active routing in `AGENTS.md`, this file, `docs/north-star.md`,
  `docs/products/`, `docs/plan.md`, and `docs/implement.md`;
- keep original specs in `docs/specs/` as historical preserved specs;
- keep superseded material in `docs/legacy/` or explicitly label it as demo/history;
- treat `docs/router-repo-template/` as a legacy template and do not use it to start
  new work unless the active Workflow Communications product doc requests historical artifact
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
