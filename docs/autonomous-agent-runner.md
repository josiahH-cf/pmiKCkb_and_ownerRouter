# Autonomous Agent Runner

## Purpose

This is the active production runner for large unattended feature cycles. Use it when a
user says "let's plan the next feature run cycle" or asks for an agentic planning,
build, verification, and handoff loop.

The runner is documentation and process guidance only. Per the Go-Live, Roadmap Build, UI/UX
Recalibration, and Production Phase Authorizations in `AGENTS.md` (`F-SEND-AUTHORIZED`,
`F-ROADMAP-BUILD-AUTHORIZED`, `F-UIUX-RECALIBRATION-AUTHORIZED`,
`F-PRODUCTION-PHASE-AUTHORIZED`), the DEFAULT is to build every authorized suite to its observable
end state or external seam. The active sequence begins with the production-control prerequisites in
S54, S53, S52, and S51, then resumes S40–S50 and dependency-ready S28–S39 work in the order recorded
in `docs/loop-state.md`.

Keep implementation and activation claims separate. A locally verified provider is
**built to the seam**; a commit present on `main` is **pushed**; an exact serving revision with its
smoke and rollback evidence is **deployed/shipped**; and a capability is **active/live** only after
its exact gate, configuration, traffic, and acceptance evidence have been read back. Never turn
“built” into “shipped” or “active” in a fact row without the corresponding evidence.

The runner performs all safe local/app-plane work and, under D05, may deploy, smoke, and promote
traffic after the full gate, authentication, cost, rollback, and preflight conditions pass. The
owner still performs interactive authentication, IAM/billing/quota/scope or credential grants, and
destructive data operations. A named external dependency parks only that activation; it never
defers the rest of the feature or the independent queue. The runner never performs an autonomous
client-facing send or an unconfirmed system-of-record write.

## Entry Points

- `AGENTS.md` is the primary router for Codex and other agents.
- `docs/meta-prompts/production-phase-unattended-loop.md` is the canonical fresh-context launcher
  for the production-control sequence and the continuation into all remaining authorized suites.
- `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md` is the canonical fresh-context launcher
  for the S40–S50 program contract. The production-phase launcher now controls the active order.
- `CLAUDE.md` is a compatibility pointer for Claude-style runners. Keep it as a short
  pointer to `AGENTS.md`, not a duplicate rule file.
- `docs/agent-runner/` holds the prompt pack that created this scaffold. Treat it as
  scaffold source material, not the active runbook.
- `docs/temp/` is the disposable workspace for generated cycle packets, draft
  communications, and scratch planning artifacts.

## Session Authentication Preflight

Authentication is the first executable preflight in every new session, before any live Google,
Firebase, Firestore, Sheets, Vertex, or Cloud Run read. After confirming that a shell is available,
run these checks without printing a token:

```bash
npm run preflight:adc
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud auth print-access-token >/dev/null
```

The active CLI account must be a managed `pmikcmetro.com` identity or the documented project service
identity. `preflight:adc` checks ADC separately; a green CLI token does not make stale ADC green, and
a green ADC token does not excuse a personal active CLI account.

If any check fails or the identity is not managed, do not improvise a login, use a personal account,
or work around the organization reauthentication wall. Record the failed check and hand the owner
this exact interactive command:

```bash
npm run auth:session
```

Continue every independent local/app-plane, test, documentation, and build-to-seam slice. Park only
live reads, cloud mutations, deployment, traffic, and cost-bearing commands until the owner refreshes
the session and all three checks pass.

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
5. `docs/meta-prompts/production-phase-unattended-loop.md` — the current cross-suite order and
   production-control prerequisites.
6. `docs/ui-ux-recalibration-implementation-program-2026-07-28.md` — S40–S50 decisions,
   environment contract, order, and flags.
7. `docs/products/README.md` and the one active product-lane doc.
8. `docs/plan.md` — phase status and acceptance gates.

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

`docs/facts.md` and `docs/loop-state.md` are the Tier-0 spine. For the next-slice pointer,
`docs/loop-state.md` wins over the append-only history in `docs/status.md`; investigate and correct
either file when its evidence is stale. Run `npm run verify:context-freshness` to confirm the spine
is current before acting on it.

Authorization and implementation use different truth sources. `AGENTS.md`, `docs/facts.md`, and the
active suite specs govern permission, safety, and the intended end state. The code and observed
runtime govern what is actually implemented or active. Code may prove that a documented capability
is missing or inert; it can never widen authority. If code is more permissive than governance, fail
closed and record a control defect. If governance says “live” but the gate, configuration, or
runtime evidence is absent, report the capability as not active and repair the stale claim.

Check the git worktree before edits and preserve user changes. Use `docs/specs/`,
`docs/legacy/`, and old demo docs only as historical source material unless an active
doc explicitly preserves a safety rule.

## Product Lane Selection

- PMI KC KB is the shared runtime. Production is Live-only; the former Production Live/Test
  workflows remain dated historical evidence. Rehearsal runs locally with explicit
  `environmentKind:"demo"` + `dataContext:"live_readonly"`, while provider activation stays per
  action. Hosted Demo GCP provisioning is deferred.
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

Before selecting the next slice, confirm it advances the production-control sequence in
`docs/meta-prompts/production-phase-unattended-loop.md`, the authorized S40–S50 program in
`docs/ui-ux-recalibration-implementation-program-2026-07-28.md`, a dependency-ready S28–S39
provider seam, or a real regression in shipped behavior. The runner BUILDS — it does not defer
product surface. For each suite, in order:

- build the app-plane (UI, routes, state, validation) unattended;
- build the live provider implementation, replacing any fake/synthetic provider, plus the full
  preview/confirm/receipt/rollback action contract and deterministic test/local-refusal proof; and
- build the gate-flip machinery (seed readiness/evidence, both `EXECUTABLE_ALLOWLIST` copies, pinned
  tests), left staged until the one named owner dependency is documented.

It hands back ONLY at that single named owner dependency (roadmap §5) — a documented endpoint, a
credential/scope grant, a vendor confirmation, or a billing approval — recorded as a one-line owner
step, never as "feature deferred." Do not stop a 90%-buildable feature at 0% because its last inch is
external. Do not invent scope beyond the roadmap suites; do not lower a schema/risk gate, override the
Registry, or use a synthetic escape to fake a Live receipt (test or local-rehearsal evidence never
closes Live-provider evidence).

For S40–S50, “build” additionally means meet the suite’s observable desktop/390×844 task, exact-link,
role/scope/environment, compatibility, and deletion-proof ACs. Named files/components are examples;
the end state is fixed. Do not reopen D-01–D-14, create a Test Lab or hosted Demo project, permit a
local Live-read-only mutation, default unknown mode to Live, guess provider URLs/endpoints, or start
S37 before S50 prerequisites.

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

For the active goal, `/loop` or any run/continue/implement trigger follows `docs/loop-state.md` and
the Active Production Order below. The loop flags are already open. Do not regenerate the production
audit or UI audit, re-ask the settled D01–D64 or D-01–D-14 decisions, or infer a Live provider
contract. Use deterministic tests for invented workflows and explicit local Live-read-only rehearsal
for bounded reads/refusals, build Live providers to their documented seam, and activate only exact
actions satisfying the owner/Registry contract.

After an implementation packet is locked, do not ask the user to review every internal
phase. Only stop for an approval gate, a stop-and-reset condition, or a genuine blocker.

## Autonomous Choices

An agent may choose conservative implementation details when active docs define the direction and
the choice:

- stays within an authorized S51–S54, S40–S50, or dependency-ready S28–S39 slice,
- does not expose private data,
- obeys the S52 cost gate before any cost-bearing command,
- does not create or change credentials, scopes, IAM, billing, or quotas,
- does not perform a LIVE external send or system-of-record write — building the provider, the full
  action contract, and a staged, unflipped gate is in-bounds; every real write still uses its
  exact-confirm contract, and
- can be verified in deterministic tests, in explicit local Demo + Live-read-only rehearsal, or
  through an authorized D05 deploy/read-only Production smoke after all preconditions pass.

The agent builds to the seam within those limits. Interactive authentication, a missing documented
provider endpoint, a credential/scope/IAM/billing input, or an exact human confirmation can park one
activation, but independent slices continue.

S31 has one narrow additional grant: the runner may create or update the single Cloud Scheduler job
that renews the read-only Gmail watch after S52 supplies a non-null ceiling and the auth and cost
preflights pass. That job may renew the watch and raise internal attention only. It may not create a
draft, send a message, or trigger any client-facing effect, and the grant does not authorize any
other scheduler, cron job, or scheduled workflow by analogy.

If `docs/away-mode.md` explicitly marks Remote Away Mode active, its bounded remote-work rules apply
in addition to D05. They never bypass the S52 non-null ceiling, managed-auth checks, protected-path
review, or the owner-only IAM/billing/scope/credential/destructive boundaries. Do not infer an
active overlay from owner absence alone.

## Approval And Execution Gates

These gates distinguish a D05 runner operation from an owner-only authority change. A routine
revision deploy to an already provisioned application service, bounded read-only production smoke,
and revision traffic promotion are runner operations when all of the following are true:

- the full local gate is green, including Firestore rules after S54.1;
- ADC, the managed active CLI account, and the suppressed-output CLI token check are green;
- S52 records a reviewed, non-null production ceiling and the cost preflight is green;
- the target manifest and environment/data classification are explicit and fail closed;
- the previous serving revision is captured, rollback is executable, and the smoke cannot send,
  draft, or write a client/system-of-record effect; and
- no protected-path review or named provider dependency for that operation remains open.

The owner still performs interactive reauthentication; creates or grants credentials, OAuth
scopes, IAM, billing, or quota changes; supplies vendor endpoints or artifacts; and authorizes or
executes service/project creation, Pub/Sub endpoint/audience changes, Firebase authorized-domain or
OAuth redirect mutations, and destructive Production migrations/deletions. A human in the product still initiates and
exact-confirms every client-facing send and Live system-of-record write.

The standing Go-Live grant makes a reviewed code gate flip routine only when the exact dependency
and full contract are documented. It never lets the runner:

- invent or widen a category of action keys;
- create, rotate, upload, expose, or substitute API keys or service-account credentials;
- grant roles/scopes, link billing, raise quotas, or use a personal account;
- import, rewrite, or delete live client records outside a documented reversible migration;
- read, modify, label, draft, or send live Gmail outside the exact action contract;
- send email or external communications autonomously;
- write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, operating Sheets, banks,
  ledgers, client Drive folders, or any system of record without its named executable gate and
  exact human confirmation; or
- execute an external action whose Action Registry entry is not `Approved for Execution`,
  `Documented`, and `production_allowed`.

Owner-operation requests must state the exact action, affected environment, product lane,
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

## Protected-Path Parking

D12's exact six protected paths are `firestore.rules`; `lib/integrations/action-gate.ts`;
`lib/auth/**`; a `production_allowed` change in `lib/integrations/action-registry-seed.ts`;
`scripts/check-budget-guard.mjs`; and `infra/budget-guardrail/**`. A protected-path change is a
review boundary, not a reason to stop unrelated work. Prepare it with tests and an explanation, then
park it in an isolated review diff or branch that is not an ancestor of a commit pushed under the
standing grant. Continue independent slices from a clean, pushable line. Never let a later push
carry the protected change indirectly.

An additive `docs/facts.md` evidence update may travel with a green slice when it records only
commands actually run, results observed, resolved `AC-*` ids, commits, revisions, or receipts.
Authority-bearing edits to `AGENTS.md` or `docs/facts.md` require explicit owner direction even
though those documents are not D12 code paths. Never silently change authority, safety, identity,
the cost ceiling, protected-path policy, live-data permission, or action-key activation.

## Cost Ceiling And Budget Policy

The production cost ceiling is owned by **S52** (`docs/feature-suites/production-cost-governance.md`),
which supersedes the retired flat cloud cap. Two things changed and both matter operationally: the
ceiling is per calendar month, not a lifetime total, and the hard stop is the smaller of the GCP
budget amount and the guardrail's own `KILL_SWITCH_CAP_USD`, so the two move together or the change
produces false headroom. Until S52 sets its value, treat the retired figure as void rather than
current and do not assume headroom. An unset ceiling is a closed gate: do not deploy, promote
traffic, create cloud alerting or Scheduler resources, run a billed provider smoke, or run the S54
live eval until the reviewed ceiling is non-null and both enforcement points are ready to move
together.
`docs/budget-and-cost-policy.md` remains the operational source of truth: it holds the cap, the
free-tier-first defaults, the inventory of every cost-bearing path and its gate, and the
`npm run check:budget-guard` preflight. Read it before any cost-bearing step.

- Default to the cheapest safe option: deterministic local tests/emulation, then explicit local
  `environmentKind:"demo"` + `dataContext:"live_readonly"` refusal/read-only proof, then an
  authorized bounded cheap-Live path, then anything billed. Hosted Demo GCP provisioning is deferred;
  never treat a loose `ASK_DEMO_MODE` flag as an environment descriptor or Production substitute.
- Run `npm run check:budget-guard` before any live, deploy, import, or notification command.
  In Remote Away Mode it allows explicitly bounded multi-Space migration setup, but still
  refuses Pro and notification-send overrides.
- The S52 ceiling supersedes both the retired flat cap and the higher per-service figures in older
  preserved specs. Treat it as a hard ceiling: if a step would approach it, stop and raise an
  approval request. Note that `npm run check:budget-guard` enforces posture and configuration, not
  a dollar amount — it is not the ceiling's enforcement point and cannot make an unset ceiling
  usable.
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
- Never mutate, delete entries from, or rewrite a user's `.env.local` to make a deploy pass. Build
  the deployment input from an explicit, sanitized target-environment map. The deploy preflight
  must refuse local-only/emulator credentials or variables — including
  `FIRESTORE_EMULATOR_HOST`, `GOOGLE_APPLICATION_CREDENTIALS`, and local-model overrides — whether
  they came from `.env.local` or the ambient process. If that named refusal is not implemented or
  does not pass, the deploy remains parked; do not “clean” the source file as a workaround.
- Production secrets live in client-approved Secret Manager/workload identity, impersonation, or
  equivalent managed secret storage. Local rehearsal receives no Production effect credential.
- Avoid downloadable service account keys. If a key is unavoidable, record the owner,
  purpose, rotation path, storage location, and revocation plan without committing the
  key.
- Client-owned API keys, OAuth apps, billing projects, domains, and service accounts
  need named owners, access boundaries, rotation expectations, and handoff notes before
  production work depends on them.
- Handoff docs should explain where non-secret identifiers live, who owns each
  environment, what manual setup remains, and how a future team can rotate or revoke
  access.
- Local rehearsal must resolve `environmentKind:"demo"`, `dataContext:"live_readonly"`, and
  `source:"explicit"`; it has no mutation scope or effect credentials. The Production manifest
  resolves Live-only resources and cannot be selected by browser state. A hosted Demo manifest is
  deferred and must not be inferred or provisioned.
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

## Active Production Order

Use `docs/loop-state.md` for the first unfinished slice, while preserving these dependencies:

1. **S54.1 first:** wire `test:firestore` into the full local gate and CI and prove that a
   permissive Rules seed makes the widened gate fail.
2. **S53 app-plane controls:** route the live Sheet write-back through its exact gate and
   environment descriptor; then build the approval-sender and deploy-forwarding checks to the
   seam. Do not set a live value, flip a protected registry seed, or deploy yet.
3. **S52 prerequisites:** build the single-source ceiling, paired-enforcement, inventory,
   baseline, and refusal machinery with the numeric values unset until supported evidence and
   owner-owned billing inputs exist. Park protected guardrail changes for review.
4. **S51 close-only first:** implement and falsify the pure close-only runtime-suspension
   combinator before adding its store or route. Continue the incident, rollback, retention,
   alert-policy, and notification-channel definitions locally, but do not apply cloud resources.
5. **S52 activation:** only a reviewed non-null ceiling and the paired budget/guardrail
   enforcement make cost-bearing operations eligible. Owner-run billing/IAM changes remain
   owner-run.
6. **S40 release-safety prerequisite:** before any D05 deploy, land the
   environment-parameterized zero-traffic candidate path, sanitized-env refusal, current-manifest
   monitoring targeting, candidate smoke before promotion, and rollback command. The legacy
   auto-promoting wrapper is not D05-eligible.
7. **Live operational work:** after steps 5–6 and fresh auth, complete S51 cloud alerting, bounded
   D05 deployment/rollback rehearsal, and the remaining S54 work. The one bounded S54 live eval
   occurs here, never while the S52 ceiling is null.
8. Resume the remaining S40–S50 and dependency-ready S28–S39 work in the order recorded by the
   production launcher and `docs/loop-state.md`. S31's Scheduler grant remains the narrow
   separately authorized cloud-resource exception described above.

If a protected review, owner input, auth refresh, or cost gate parks one item, continue the next
independent local item in this order. “Do not skip ahead” means do not violate a dependency; it does
not require the whole loop to idle behind an external action.

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

## Commit, Push, And Deploy Authority

Standing grant, 2026-07-29 — see the Production Phase Authorization in `AGENTS.md` (D04, D05).
The runner commits and pushes to `main` whenever the full local gate is green, and deploys and
promotes traffic when the gate, preflights, prior-revision capture, and smoke all pass. It does
not pause at a slice boundary to request permission for either.

Bounded by:

- Never force-push, rewrite history, create a tag or release, or delete a branch.
- A change touching a protected path (Production Phase Authorization, D12) is prepared and
  parked as described above instead of pushed under the standing grant. The narrow additive
  `docs/facts.md` evidence exception still applies.
- The gate that licenses the push is the full one — including `test:firestore` once S54 wires it
  in. A partial green is not a green.
- Before a deploy: re-run all three auth checks; require the reviewed non-null S52 ceiling and
  budget preflight; confirm branch, remotes, status, the relevant diff, and the absence of
  unrelated work; capture the prior serving revision as the rollback target; and use only the
  sanitized explicit target-environment map after the local-only-variable refusal passes. Do not
  edit `.env.local`.
- After a deploy: record the commit range, the serving revision, the prior revision, and the
  bounded read-only smoke result in `docs/facts.md` and `docs/status.md`. Deployment alone does not
  make an action active.

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
   - any non-Live Production record or intake, unknown-mode fallback, local-rehearsal mutation/effect
     construction, a descriptor other than explicit Demo + Live-read-only, and misleading generic
     provider links,
   - mobile header/overlay/first-action/focus failures and duplicate attention owners,
   - two-stage deletion without consumer/role/route/script/provider/security/deployed-boundary/
     rollback proof,
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
   - Production or live setup preparation: dry-run first. A live mutation additionally requires
     fresh auth, a reviewed non-null S52 ceiling when it can incur cost, the relevant D05
     preflights, and a rollback.
   - S54 live eval: run it once only after the S52 ceiling is non-null, `preflight:adc` and the
     managed CLI checks are green, and `check:budget-guard` passes. A local eval-runner test is not
     live evidence.
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

Select the next slice from the Active Production Order above and the finer-grained pointer in
`docs/loop-state.md`. A dependency-ready S28–S39 provider slice may interleave only where the
production launcher permits and without leaving an active slice half-applied. Do not invent scope
to manufacture a next slice. If every suite is deployed/active or built to its named external seam,
stop and record the exact remaining owner operations without overstating the latter as shipped.

## Stop And Reset Conditions

Keep going while slices stay safe, decision-complete, and readiness-improving. Stop and
hand back when any condition below fires. State which condition fired and the recommended
next action in `docs/loop-state.md`.

- Owner dependency reached with no independent work left: the next step is interactive auth, an
  IAM/billing/quota/credential/scope grant, a destructive data operation, a vendor-supplied
  documented endpoint, or exact human confirmation for a client-facing effect. A routine D05
  deploy/smoke/traffic promotion is not owner-only once all preconditions pass. Building the
  provider, contract, and staged unflipped gate is not a stop; park the one activation, continue
  independent slices, and hand back the exact owner step only when the independent queue is empty.
- Requested release complete: verification, docs, commit/push/deploy, production acceptance, and
  rollback evidence are complete; remaining provider activations are specifically inventoried.
- Quality degrading: the same root issue survives two repair cycles, checks that were
  green turn red and do not recover, or new lint/type/test failures are introduced and
  not fixed in the same slice. Stop, record the regression, and recommend a focused fix
  session.
- Uncertainty too high: the next slice cannot be made decision-complete without inventing
  scope, a product decision, a source, a credential, or an approval. Stop and record the
  exact missing decision as a blocker.
- Protected review pending with no independent work left: the protected patch is isolated,
  verified, and surfaced; no pushable slice remains that can proceed without stacking on it.
- Context reset needed: the working context is large or drifting, lane focus is slipping,
  or accumulated state risks errors. Write `docs/loop-state.md`, recommend a fresh context
  window, and stop.
- Program complete: S51–S54 and every authorized S40–S50 suite are either active with runtime
  evidence or built to a named external seam, S49 has explicit retained/deleted dispositions, and
  S50 is verified; record remaining S28–S39/S47/S43 owner dependencies and stop.

A clean stop with a current `docs/loop-state.md` is a successful outcome, not a failure.

## Loop State Capture

`docs/loop-state.md` is the durable single-read resume artifact for the loop. Keep it
current so the next unattended session resumes without rediscovering context.

Update it:

- at the start of a cycle, with the selected slice and why it is next,
- at each slice boundary, with what was built, verified, and queued,
- whenever a blocker, approval gate, or stop-and-reset condition changes.

Record only non-secret state. Keep `docs/status.md` as the append-only history and
`docs/loop-state.md` as the always-current pointer. Use the explicit built/pushed/deployed/active
vocabulary from Purpose. If the two docs disagree about the next slice, the current loop-state
pointer wins while the stale history claim is corrected; neither can override code/runtime
evidence or governance authority.

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
