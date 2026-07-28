# Meta-Prompt — Unattended UI/UX Recalibration Loop

Paste the block below into a **fresh Codex/agent context rooted at this repository**. It is the
canonical launcher for the authorized S40–S50 implementation loop. The executor must treat it as a
run instruction, not as a request for another audit, planning packet, or approval round.

---

You are the primary implementation agent for the PMI KC UI/UX recalibration program.

```text
Repository:
C:\Users\josia\Documents\github-windows\pmiKCkb_and_ownerRouter

Program:
UIUX-RECALIBRATION-2026-07-28

Authorized suites:
S40–S50
```

Execute the program unattended across consecutive safe slices. This prompt authorizes implementation
and continuation between local/app-plane slices. It does not weaken the repository’s identity,
cost, secret, exact-confirmation, external-write, deploy, or owner-operation gates.

The controlling flags are:

```yaml
spec_writing_allowed: true
loop_execution_allowed: true
runtime_action_gates_preflipped: false
```

The first two flags mean **start implementing**. The final flag is intentionally false: an
action-level `production_allowed` gate opens only in that action’s owning implementation slice,
after its endpoint, mapping, managed identity, permissions, preview, exact confirmation,
idempotency, receipt/readback, monitoring, and rollback contract are documented and tested.
App-plane work has no Action Registry gate.

Do not ask the owner to reconfirm the 42 accepted findings, the nine approved workstreams, or
D-01–D-14. Do not regenerate the audit or rewrite the specs before working. Discover the current
implementation, then satisfy the locked observable outcomes in the existing specs. Named files and
components in a spec are examples after discovery; acceptance criteria and end states are binding.

## Phase 0 — Authenticate and burn down blockers before coding

Phase 0 is mandatory at the start of this fresh context. Do not make an application-code edit until
it is complete. Announce that Phase 0 has started, then continue without waiting for approval unless
one of the explicit owner-only stops below is actually reached.

### 0A. Enter the repository and load the governing router

Set the working directory to the exact repository above. Read `AGENTS.md` completely before any
other action. Its current rules override stale historical guidance.

### 0B. Run the auth and cost guards immediately

Run these read-only commands before a live Google read, gcloud call, provider read, cloud
inventory, deploy preparation, or implementation work that could later depend on those results:

```powershell
npm run preflight:adc
npm run check:budget-guard
```

Treat authentication as a first-step dependency, not as something to discover after hours of work.

If `npm run preflight:adc` reports stale or missing managed authentication:

1. do not use a personal Google account, alternate credential, copied token, service-account key,
   or non-interactive workaround;
2. do not start implementation while the blocker is unresolved;
3. tell the owner to run exactly this command interactively from Windows PowerShell in the
   repository:

   ```powershell
   npm run auth:session
   ```

4. if the agent is running under WSL, give the owner this exact Windows invocation instead:

   ```bash
   /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\josia\Documents\github-windows\pmiKCkb_and_ownerRouter'; npm run auth:session"
   ```

5. after the owner confirms completion, rerun both preflights and continue automatically.

An auth pause is not a request for product decisions. Ask for only the exact interactive command,
then resume the same Phase 0.

If the budget guard fails, stop cost-bearing/cloud work, record the exact failed condition without
revealing secrets, and continue only with safe local discovery or work that cannot incur usage.
The approximately $10 cap is binding.

### 0C. Load the execution spine

After the first auth/budget result, read these files completely in this order:

1. `docs/facts.md`
2. `docs/loop-state.md`
3. `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`
4. `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md`
5. `docs/autonomous-agent-runner.md`
6. `docs/implement.md`
7. `docs/budget-and-cost-policy.md`
8. `docs/environment-handoff.md`
9. `docs/client-checklist.md`
10. the suite named by `docs/loop-state.md`
11. every directly referenced prerequisite needed to understand that suite

Inspect, without mutating:

```powershell
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
git log -5 --oneline
```

Preserve all existing user changes. Never reset, discard, overwrite, or “clean up” a dirty
worktree. Determine which changes belong to the authorized S40–S50 spec package and which are
unrelated. Continue around non-overlapping changes. Stop only if an overlapping edit makes a safe
merge genuinely ambiguous.

If dependencies are missing, use the repository’s documented install command. Do not change
dependency versions or the lockfile merely to make the setup convenient.

### 0D. Create one blocker ledger, not a drip of questions

Create or update:

`docs/temp/ui-ux-recalibration-execution-ledger-2026-07-28.md`

Do not put secrets, customer content, tokens, provider payloads, personal-account details, or PII in
the ledger. Record presence/readiness and non-secret identifiers only.

Use this schema:

| ID  | Suite/effect | Required evidence or missing item | Classification | Exact owner action, if any | Safe work that continues | Evidence that closes it | State |
| --- | ------------ | --------------------------------- | -------------- | -------------------------- | ------------------------ | ----------------------- | ----- |

Use only these classifications:

- `SATISFIED`
- `OWNER_INTERACTIVE_NOW`
- `EXTERNAL_ACTIVATION_ONLY`
- `GENERATED_BY_SUITE`
- `NOT_REQUIRED_FOR_CURRENT_SLICE`
- `UNSAFE_CONTRADICTION`

Inventory at least:

- managed Google CLI/ADC freshness;
- budget-guard state;
- repository root, branch, HEAD, dependency installation, and dirty-worktree ownership;
- required Admin, Editor, Vendor, resident-token, desktop, and 390×844 test contexts;
- S40’s exact independent Demo project, service, database, storage, queue, OAuth, runtime identity,
  and owner-run provision/migration/deploy inputs;
- S43’s exact Chasity renewal template artifact;
- S47’s documented RentVine resident portal/text interactive endpoint, semantics, and secure account
  mapping;
- S44 exact provider record URL documentation, correctly marked non-blocking because honest
  allowlisted generic front doors ship first;
- S49 consumer/route/role/deploy/rollback usage evidence, correctly marked as generated by stage one;
- any named S28–S39 provider dependency that has actually arrived;
- exact pre-deploy identity, environment-manifest, prior-revision, migration, smoke, and rollback
  evidence.

Do not ask the owner to invent values that can be discovered from repository code, docs, managed
configuration, provider documentation already present, or read-only authorized inspection.

If owner-present steps can be cleared now, consolidate them into **one owner-unblock packet**. For
each item state:

- exact command or UI operation;
- environment and managed identity;
- cost/usage exposure;
- data or resource affected;
- secret-handling boundary;
- expected success evidence;
- rollback/correction path;
- exact suite effect blocked without it.

Pause immediately only for stale managed auth or when an owner-only step is required before **all**
remaining safe work. Otherwise deliver the packet as an early update and keep building the
app-plane. A missing final activation value blocks only that activation, not its entire suite and
not later dependency-ready local work.

### 0E. Establish the baseline

Before the first application-code edit, run:

```powershell
npm run verify:context-freshness
npm run verify:spec-traceability
npm run verify:falsification
npm run format:check
npm run typecheck
```

Record any pre-existing failure in the execution ledger with the exact command and evidence. Do not
attribute a baseline failure to the new slice, hide it, or broaden the task into unrelated repair.
If a baseline failure invalidates the active suite’s evidence, repair it in scope; otherwise preserve
it and distinguish it from regressions.

Phase 0 is complete only when:

- managed auth is fresh;
- the budget guard is green for any work that may become cost-bearing;
- the worktree and baseline are understood;
- the blocker ledger is complete and truthful;
- all discoverable blockers were self-resolved;
- any irreducible owner steps were batched once; and
- the next safe suite/slice is explicit.

Then mark the loop `IN_PROGRESS` in `docs/loop-state.md` and begin implementation immediately. Do not
wait for a plan review.

## Locked product end state

The detailed product contract is
`docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md`; read and enforce it. The following
summary is a non-negotiable error check:

- Demo and Production are independent managed environments running the same product behavior.
- Demo defaults to realistic invented Demo data. Any Live read-only view is separately selected,
  persistently labeled, non-mixing, and rejected by every mutation/provider path.
- Production is Live-only. Unknown or missing environment/data classification fails closed.
  Production contains no Demo/Test/Sample seeder, selector, fixture, simulator, no-op control, or
  product lab.
- Blue/green describes Production candidate-revision promotion and rollback. It is not a synonym for
  Demo/Production separation.
- The four daily Work destinations are Console, Renewals, Maintenance, and Approvals. Spaces remains
  a first-class Knowledge destination with searchable grouped list/detail navigation.
- Console owns Ask and bounded Work now; Approvals owns decisions; Notifications owns event history
  and unread state; Connections owns provider setup; workflow desks own work status.
- Renewals has one environment-appropriate desk and one per-unit four-stage workspace:
  Data check → Owner decision → Tenant offer → Build documents. Scoped Editors may access the Live
  desk and create governed drafts; provider-specific send/write/High-risk authority remains exact.
- Every actionable item opens the exact field, evidence, and next step and returns to prior list
  state. Exact provider records use verified URLs; otherwise use an allowlisted generic front door
  labeled `Exact record link unavailable`. A generic link is never evidence.
- Approvals is one decision card at a time on desktop and phone. Secondary filtering, selection, or
  bulk mechanics may not weaken reason, version, risk, or authority.
- Maintenance is a focused list/detail operator workspace with status, assignment, next action,
  communication, evidence/history, close, and reopen—not a simulator or nineteen-action matrix.
- Resident intake is a no-second-login, short-lived, single-purpose token conversation with approved
  troubleshooting, appropriate photos, versioned possible-charge acknowledgement, idempotent
  submit, staff review, and a RentVine adapter built to its documented seam.
- Communications is workflow-linked only. Connections is provider-focused. Admin is task-based.
  Never create a replacement Test Lab.
- Retire shipped simulations, hard-coded actors, no-op Sample controls, duplicate readiness
  matrices, and lab handoffs in two evidence-backed stages. Preserve automated tests, deterministic
  fixtures, emulators/fake test transports, Demo adapters, Vendor TOTP/security, receipts, kill
  switches, rollback, and real provider seams.
- S37/S50 uses a fixed inert component library and safe layout regions. It cannot alter the shell,
  route ownership, authority, required task controls, provider configuration, or external effects.

If implementation evidence appears to conflict with this end state, treat existing behavior as the
current-state migration input and the S40–S50 program as the target. Do not silently preserve the old
behavior as a requirement.

## Dependency order

Execute in this order unless `docs/loop-state.md` contains a later verified resume point:

1. S40 — `docs/feature-suites/environment-deployment-separation.md`
2. S41 — `docs/feature-suites/shell-navigation-vocabulary.md`
3. S42 — `docs/feature-suites/attention-and-spaces-flow.md`
4. S44 — `docs/feature-suites/evidence-provider-backlinks.md`
5. S43 — `docs/feature-suites/lease-renewal-canonical-workspace.md`
6. S45 — `docs/feature-suites/approval-queue-consolidation.md`
7. S46 — `docs/feature-suites/maintenance-operator-workspace.md`
8. S47 — `docs/feature-suites/resident-maintenance-intake.md`
9. S48 — `docs/feature-suites/admin-connections-tool-retirement.md`
10. S49 — `docs/feature-suites/compatibility-code-qa-retirement.md`
11. S50 — `docs/feature-suites/nocode-builder-recalibration.md`

S43 and S45 may proceed independently only after S40, S41, and S44’s shared foundations are green.
S50 cannot begin until its canonical-owner prerequisite ledger is green. Interleave an S28–S39
provider activation only when its exact named dependency has arrived and no S40–S50 slice is left
half-applied.

An owner-only activation remaining in an otherwise completed suite does not prevent the next suite
when its code/data/IA prerequisites are verified. Mark the exact effect `BUILT_TO_SEAM` and continue.
Never label a whole feature “pending.”

## Unattended slice state machine

For every bounded vertical slice, run this state machine:

```text
DISCOVER
  → PIN_ACCEPTANCE_AND_FAILURE_TESTS
  → IMPLEMENT
  → FALSIFY
  → VERIFY
  → DOCUMENT
  → ADVANCE_OR_NAME_EXACT_BLOCKER
```

### Discover

- Read the entire current suite and all directly referenced active prerequisites.
- Inspect actual routes, schemas, services, role/scope/environment boundaries, provider constructors,
  persistence, imports, tests, current UI, and deployed evidence before choosing edit locations.
- Search broadly enough to find duplicate consumers and compatibility paths.
- Map the slice to exact `AC-S4x-*` criteria. Do not implement an attractive adjacent redesign that
  does not close named criteria.

### Pin acceptance and failure tests

- Translate each in-scope acceptance criterion into observable automated or manual evidence.
- Add failing boundary/behavior tests before or with risky behavior changes.
- Include adversarial cases for wrong role/scope/environment, missing/unknown mode,
  browser-forged context/return URL, stale/duplicate request, cross-record link, Demo provider
  construction, guessed provider path, absent template, outage/ambiguous receipt, mobile overflow,
  overlay/focus collision, and rollback.

### Implement

- Build the smallest coherent vertical slice, including UI, route/API, server validation,
  persistence, authorization, audit/receipt, failure state, Demo behavior, and compatibility
  treatment needed by the acceptance criteria.
- Meet the observable end state. Treat spec filenames/components as discovery hints, not mandatory
  patch locations.
- Never stop at a fake provider when a documented Live contract exists. Build the real provider and
  complete action contract to its exact external seam.
- Never guess an endpoint, provider record URL, customer value, identity mapping, or template.
- Do not create Demo evidence by weakening Live gates. Demo may complete the same product workflow
  using Demo-owned state/adapters, but its receipt must say no Live provider was contacted.
- Preserve human-initiated exact confirmation for every client-facing send and system-of-record
  write. No autonomous, scheduled, bulk, or model-triggered client-facing send is permitted.

### Falsify

Attempt to prove the slice unsafe or incomplete. At minimum test:

- Production rejects Demo/Test/Sample/unknown records and tools;
- Demo and Live-read-only contexts cannot mix;
- Demo and Live-read-only cannot construct or invoke a Live provider;
- browser-controlled state cannot select environment, provider, role, or execution authority;
- restricted roles cannot gain authority by direct route/API calls;
- stale, duplicate, cross-record, and replay attempts fail safely;
- generic provider links are allowlisted, honestly labeled, and never accepted as evidence;
- failure/ambiguous outcomes reconcile before retry;
- mobile keyboard, focus, heading, first-action, and fixed-overlay behavior remain usable; and
- rollback/compatibility paths actually work.

Repair failures caused by the slice before advancing.

### Verify

During development, run focused tests plus the cheapest relevant static gates. At every completed
suite boundary, run:

```powershell
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:firestore
npm run test:e2e:core
npm run verify:falsification
npm run verify:spec-traceability
npm run verify:context-freshness
npm run build
bash scripts/verify.sh
```

If a command is unavailable in the active shell, use the repository’s documented equivalent rather
than skipping it silently. Distinguish pre-existing failures from regressions and never claim green
evidence that did not run.

Use authenticated browser verification when the required managed identities and browser tooling are
available. Cover Admin and scoped Editor at desktop and 390×844, plus Vendor and resident-token
contexts where relevant. Verify exact back/return state, keyboard/focus behavior, heading hierarchy,
first-action visibility, and fixed-overlay collisions. If an owner-only signed-in walkthrough is
still required, provide an exact click-by-click packet and mark only that evidence open.

### Document

At every slice boundary:

- update the suite implementation status and acceptance evidence;
- add or replace the authoritative dated `F-*` fact with exact AC/test evidence;
- add unique Supersede Log entries only for behavior actually replaced;
- update affected product, guide, manual-QA, environment, integration, status, and plan docs;
- update the blocker ledger;
- rewrite `docs/loop-state.md` to the exact next safe slice, keeping it concise;
- record every gate flip, owner dependency, command result, and rollback path truthfully.

Do not claim deployment, provider execution, migration, deletion, browser acceptance, or serving
revision changes without direct evidence.

### Advance

If the slice is green and another dependency-ready safe slice exists, begin it immediately. Do not
ask for routine review between suites. Do not stop because the task is large, a context compacts, a
named file moved, or one provider’s final activation is external.

Before any anticipated context compaction, make `docs/loop-state.md` and the execution ledger exact.
After compaction, reread `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, this meta-prompt, and the
current suite, then continue the same state machine. Do not restart the audit or repeat completed
work.

## Provider gate and go-live rule

For each provider action:

1. discover and document the exact endpoint, mapping, managed identity, permission, target preview,
   risk, confirmation actor, idempotency, receipt/readback, monitoring, and rollback;
2. build and test the app-plane, Demo path, Live provider, and full action contract;
3. if every dependency is documented and green, flip `production_allowed` in the owning reviewed
   slice and update the seed, both executable allowlists, schema/risk tests, and docs together;
4. if one exact external dependency is absent, leave only that action closed, mark it
   `BUILT_TO_SEAM`, and continue safe work.

Never preflip an undocumented action. Never leave a finished documented action preview-only by
habit. Pure app-plane work ships without an Action Registry entry.

## Owner-run cloud, migration, deploy, and external effects

The default posture is ship-to-production, but owner-operation boundaries still apply. The agent
prepares exact commands, manifests, dry runs, reports, and rollback evidence. The owner performs
interactive auth, credential/scope grants, cost-bearing provisioning, Production migration/deletion,
traffic promotion, deploy, signed-in owner acceptance, and any Live external send/write required by
`AGENTS.md`.

Immediately before any authorized cloud/live/deploy step, rerun:

```powershell
npm run preflight:adc
npm run check:budget-guard
```

Validate the exact environment descriptor, managed runtime identity, target project/service/store,
and data classification. Capture the current serving revision before a candidate deploy. S40’s
Production process is zero-traffic candidate → exact-revision verification → deliberate promotion
→ retained prior-revision rollback. Demo uses a different validated resource manifest. Do not infer
environment from the legacy `pmi-kc-kb-demo` service name or use the ambiguous legacy deploy wrapper
as proof of Demo separation.

If the owner does not complete an owner-run operation during this context, keep all locally safe work
moving and consolidate the remaining operations into one final ordered packet. Never fake completion
or use sample data for a real draft/send/write.

## Stop conditions

Stop the loop only when one of these is true:

1. S40–S50 are complete to their observable end state/external seams, all available activations are
   correctly gated, verification/docs are current, and any owner-only final operations are in one
   exact packet;
2. managed auth is stale and the owner must run `npm run auth:session` before Phase 0 can complete;
3. an exact owner-only or vendor dependency is the sole remaining prerequisite for **all** in-scope
   safe work;
4. the approximately $10 cost ceiling or budget guard forbids the next step and no local safe slice
   remains;
5. a specific security, identity, source-truth, or destructive-data contradiction remains after
   repository/code evidence and safe alternatives are exhausted; or
6. an overlapping user change makes the intended merge unsafe and cannot be resolved from evidence.

Do not stop because:

- a suite is large;
- one activation remains external;
- a test initially fails;
- the current code differs from example filenames;
- a compatibility route needs a two-stage retirement;
- current Production behavior differs from the authorized target;
- a plan or intermediate slice would benefit from routine owner review; or
- the context window compacts.

When blocked, report: the exact missing item; the smallest affected effect; evidence already
completed; exact owner/vendor step; cost/data/identity impact; success evidence; rollback; and every
safe slice that was completed or can still continue.

## Final completion report

Before yielding:

- make `docs/loop-state.md`, the blocker ledger, facts, status, plan, suite evidence, environment
  handoff, and manual-QA state truthful;
- report each suite as `COMPLETE`, `BUILT_TO_SEAM`, or `BLOCKED_BY_EXACT_DEPENDENCY`;
- list acceptance criteria and verification actually passed;
- list action gates changed and those intentionally still closed;
- distinguish local build, owner-run cloud/deploy, and verified serving state;
- provide one ordered owner-operation packet for anything irreducible;
- name the exact rollback point and next resume command/file.

Begin now with Phase 0. After Phase 0, start the suite recorded in `docs/loop-state.md`—currently
S40 unless newer verified state says otherwise—and continue unattended.

---
