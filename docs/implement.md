# Implementation Workflow

## Start Here

Read, in order:

1. `AGENTS.md`
2. `docs/facts.md`
3. `docs/loop-state.md`
4. `docs/plan.md`
5. `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`
6. `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`
7. `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md`, then the current S40–S50 suite
8. `docs/roadmap-unblock-2026-07-23.md` only when an S28–S39 provider activation is the current slice

The current environment outcome is Production Live-only with local, effect-refused rehearsal. Read
`docs/loop-state.md` for the next active suite. Build each bounded suite to its observable end state,
preserve S20–S39 action/security contracts, and stop only at the suite’s exact external dependency.
Do not reopen D-01–D-14 or rebuild the audit. Hosted Demo GCP provisioning is deferred under
`F-DEMO-DEFERRED-LOCAL-FIRST`; do not create that project or a fixture seeder.

## Session Start

Before any Google/GCP live read or cost-bearing command:

```powershell
npm run preflight:adc
npm run check:budget-guard
```

If ADC is stale, the owner runs this from Windows PowerShell in the repository:

```powershell
npm run auth:session
```

Stale auth parks only live reads, cloud mutations, deployment, traffic, smoke, and cost-bearing
commands. Continue every independent local/app-plane, test, documentation, and build-to-seam slice.

From WSL, call the Windows command explicitly:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\josia\Documents\github-windows\pmiKCkb_and_ownerRouter'; npm run auth:session"
```

Never substitute a personal account.

## Build Order

1. Reproduce the gap or define the observable behavior.
2. Choose the server-owned environment/context:
   - Production + Live for authoritative records and configured providers.
   - Local `environmentKind:"demo"` + `dataContext:"live_readonly"` with `source:"explicit"` for
     bounded rehearsal reads and mutation/effect refusal.
3. Write the failing boundary/behavior test.
4. Implement the smallest complete vertical slice, including UI, route, persistence,
   authorization, audit/receipt, and failure state.
5. Exercise invented scenarios in deterministic automated tests. In the local rehearsal runtime,
   verify bounded Live reads and prove every durable write, receipt, confirmation, and provider
   effect refuses before construction.
6. For a Live external action, verify the exact contract, account mapping, credential,
   target/effect preview, role decision, one-attempt/idempotency behavior, readback or
   reconciliation, monitoring, and rollback before enabling that action.
7. Update specs, facts, status, plan, and loop state in the same slice.
8. Run focused checks, then the full verifier.

## Production and Local-Rehearsal Rules

- Production accepts Live only and exposes no Demo/Test data selector, seed, simulator, no-op Sample
  control, or product lab.
- Local rehearsal has no invented product records or effect adapter. Its server-owned descriptor is
  exactly `environmentKind:"demo"` + `dataContext:"live_readonly"` with `source:"explicit"`.
- Local rehearsal is refused from every app/provider mutation, confirmation, receipt, draft,
  durable-log, photo, and reconciliation path before a writer/effect client is constructed.
- A browser flag, cookie, query parameter, or local-storage value cannot choose environment,
  data context, provider adapter, role, or execution authority.
- Local rehearsal evidence closes only bounded-read and refusal checks. Live activation requires a
  Live receipt/readback from the exact configured action.
- Missing provider contract/credential becomes one activation checklist item; continue building the
  app-plane, deterministic test coverage, and Live adapter/full contract to its documented seam.

## External Writes and Sends

Every Live external effect must show:

- action key and provider;
- exact target/account/recipient;
- values and effect the user is confirming;
- whether the action is Low, Medium, High, or technically Blocked;
- the actor/approval requirement;
- the idempotency key or deterministic identity;
- receipt/readback and correction/rollback path.

Human-initiated exact confirmation remains mandatory for sends. No scheduled, bulk,
background, or model-triggered send is permitted. A technical blocker cannot be approved
away, and an ambiguous outcome must reconcile before any correction.

## Maintenance, Vendor, and Resident Defaults

- Product Test unit/Vendor fixtures and their intake routes are retired. Local rehearsal cannot
  create tickets, assignments, Vendor identities, mailbox state, actions, or receipts.
- Deterministic automated tests retain invented Maintenance/Vendor scenarios without exposing a
  product lane or provider client.
- Staff inspect Vendor handoff through the read-gated Maintenance projection. It may show only
  current Waiting/Complete state, bounded bodyless label history, draft-present, reply count, update
  time, and next internal action; never expose draft/reply bodies, message/thread ids, credentials,
  UIDs, provider payloads, or Live evidence.
- Live Vendor mailbox activation separately requires a routable verified email, TOTP,
  same-address OAuth, vault references, and assigned-ticket authorization.
- Resident intake is a single-purpose short-lived token/session, not a staff/Vendor identity. It
  exposes one approved question/photo/acknowledgement flow and one idempotent submit only.

## Retention Default

The V1 baseline uses bodyless state, legal hold, bounded on-demand cleanup, and visible
health. TTL policies, extra composite indexes, and Cloud Scheduler are optional improvements,
not prerequisites. Enable them later only with a measured volume need and rollback plan.

## Resumable Process-Audit Remediation

- Preserve stable case/finding/capability IDs and the immutable prior run. Bootstrap the new
  remediation ledger and capability matrix from the reusable runner; never rewrite pass-one evidence.
- Use `amend-ledger` and `amend-matrix` with the checkpoint's exact expected revision for incremental
  updates. The runner rejects stale concurrent changes and treats an exact one-revision replay as
  idempotent. Do not bypass it with an ad hoc reconciliation script or direct sidecar edit.
- Keep auth checkpoints bodyless and use distinct session contexts for Admin, restricted staff,
  secondary Admin, Live Vendor where configured, and unauthenticated/public coverage. A retired Test
  Vendor context may appear only when replaying immutable historical audit evidence.
- Finalization requires every applicable ledger row to include commit, deployment, and passing
  post-deployment evidence; every evidence exclusion needs an approved classification and precise
  rationale; every capability needs `pass` or `expected_denial` plus evidence; and all five identity
  contexts must be ready and separated.

## Verification

Use focused tests during development, then:

```powershell
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:firestore
npm run test:e2e:core
npm run build
bash scripts/verify.sh
```

Before deployment, also run identity, ADC, the non-null S52 cost gate, exact environment manifest,
production preflight, cutover report, and dependency inventory. Capture the currently serving
revision before changing traffic. The current legacy wrapper immediately routes 100% traffic after
revision creation; that behavior is preserved as historical implementation evidence but is not
D05-eligible because it cannot smoke a zero-traffic candidate before promotion.

Use the environment-parameterized release path: run the guaranteed non-executing `--plan-only`
branch, then named candidate creation at zero traffic, explicit Production descriptor validation,
authenticated candidate smoke, deliberate exact-revision promotion, and a captured rollback
command. Hosted Demo provisioning is deferred. Routine application deploy, smoke, exact-revision
traffic promotion, and rollback follow D05 only after the authority, cost, identity, and release
preflights pass.

After deployment, use authenticated browser acceptance at desktop and 390×844 across Console/Ask,
Spaces, Approvals, Communications, Renewals, Maintenance, Connections, Admin, Notifications, Vendor,
and resident intake as applicable. Verify Production contains Live only and its enabled action paths
retain exact confirmation/receipts. Separately run local rehearsal with explicit Demo +
Live-read-only resolution and prove bounded reads plus zero durable writes, receipts, or provider
effects.

## Documentation and Stop Conditions

- Record verified facts with dated evidence in `docs/facts.md`.
- Delete superseded active guidance and add a unique Supersede Log marker.
- Keep `docs/loop-state.md` under 140 lines and focused on the next exact action.
- Update `docs/plan.md` whenever phase status or acceptance changes.
- Report a genuine blocker only after exhausting repository knowledge, app-plane work, automated
  tests, and safe local Live-read-only rehearsal.
  State the exact missing value, why it affects a specific Live action, the recommended
  owner/process, the command or UI location, and the evidence that will close it.
- Stop only when the requested outcome is complete or a genuinely external, specific blocker
  prevents further in-scope work.
  The complete runner-neutral loop is in `docs/autonomous-agent-runner.md`. Temporary packets and
  working notes belong under `docs/temp/`; promote only durable verified decisions into active docs.
