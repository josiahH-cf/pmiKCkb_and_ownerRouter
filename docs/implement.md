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

The active outcome is the decision-complete S40–S50 UI/UX/environment program. Its flags are open and
S40 is first. Build each bounded suite to its observable end state, preserve S20–S39 action/security
contracts, and stop only at the suite’s exact external dependency. Do not reopen D-01–D-14 or rebuild
the audit. The prior S20–S39 implementation remains evidence/provider work; interleave a provider
activation only when its named dependency is available and the S40–S50 slice stays clean.

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

From WSL, call the Windows command explicitly:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\josia\Documents\github-windows\pmiKCkb_and_ownerRouter'; npm run auth:session"
```

Never substitute a personal account.

## Build Order

1. Reproduce the gap or define the observable behavior.
2. Choose the server-owned environment/context:
   - Production + Live for authoritative records and configured providers.
   - Demo + Demo data for invented aliases and no-client/Demo adapters.
   - Demo + Live-read-only only when explicitly configured; it can never mutate or mix with Demo.
3. Write the failing boundary/behavior test.
4. Implement the smallest complete vertical slice, including UI, route, persistence,
   authorization, audit/receipt, and failure state.
5. Exercise the same product workflow in Demo-owned code/data. It may write Demo app state and
   reach Done, but its receipt must say no Live provider was contacted and cannot prove Live.
6. For a Live external action, verify the exact contract, account mapping, credential,
   target/effect preview, role decision, one-attempt/idempotency behavior, readback or
   reconciliation, monitoring, and rollback before enabling that action.
7. Update specs, facts, status, plan, and loop state in the same slice.
8. Run focused checks, then the full verifier.

## Demo/Production Rules

- S40 migration makes classification mandatory. The current legacy missing-lane→Live behavior is a
  deployed compatibility fact, not the target; new/migrated unknown classification fails closed.
- Production accepts Live only and exposes no Demo/Test data selector, seed, simulator, no-op Sample
  control, or product lab.
- Demo aliases and effects are server-owned, visibly labeled, stored in Demo resources, and rejected
  from Production. Demo adapters import/construct no Production provider client.
- Demo Live-read-only is a mutually exclusive context, persistent in the shell, and refused from
  every app/provider mutation/confirmation/receipt path.
- A browser flag, cookie, query parameter, or local-storage value cannot choose environment,
  data context, provider adapter, role, or execution authority.
- Demo evidence closes product-workflow checks only. Live activation requires a lane-correct Live
  receipt/readback from the exact configured action.
- Missing provider contract/credential becomes one activation checklist item; continue building the
  app-plane, Demo parity, and Live adapter/full contract to its documented seam.

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

- The currently named Test unit/Vendor IDs remain compatibility fixtures until S40 migrates them to
  the independently provisioned Demo environment. Do not create new Production Test fixtures.
- Demo Maintenance tickets use the focused S46 workspace and may progress through assignment,
  status, notes, Demo actions, close, and reopen with value-minimized non-Live receipts.
- The Demo Vendor uses Firebase Email/Password and TOTP, sees only matching Demo assignments, and
  uses the Demo-owned app mailbox. It is rejected before OAuth/Gmail client construction.
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
  secondary Admin, Test Vendor, and unauthenticated/public coverage.
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

Before deployment, also run identity, ADC, budget, exact environment manifest, production preflight,
cutover report, and dependency inventory. Capture the currently serving revision before changing
traffic. Until S40 replaces the ambiguous wrapper, `npm run deploy:demo -- --budget-confirmed`
targets the current legacy-named Production service: it creates a collision-resistant named revision, then
explicitly routes 100% traffic to that exact revision. This prevents a named revision selected during
a rollback rehearsal from remaining pinned and avoids a concurrent-deploy race through floating
`LATEST`; the traffic step does not alter invoker/IAM configuration. The deploy uses Cloud Run's supported
`--no-invoker-iam-check` service setting for the public sign-in shell, avoiding an org-blocked
`allUsers` IAM binding while leaving application authentication and authorization unchanged.

After S40, deploy a candidate at zero traffic, validate the exact Production descriptor, promote
that exact revision deliberately, and preserve the prior revision for rollback. Demo uses a
different validated resource manifest and owner-run deploy.

After deployment, use authenticated browser acceptance at desktop and 390×844 across Console/Ask,
Spaces, Approvals, Communications, Renewals, Maintenance, Connections, Admin, Notifications, Vendor,
and resident intake as applicable. Exercise at least one complete Demo workflow in Demo and verify
zero Live-provider calls; verify Production contains Live only and its enabled action paths retain
exact confirmation/receipts.

## Documentation and Stop Conditions

- Record verified facts with dated evidence in `docs/facts.md`.
- Delete superseded active guidance and add a unique Supersede Log marker.
- Keep `docs/loop-state.md` under 140 lines and focused on the next exact action.
- Update `docs/plan.md` whenever phase status or acceptance changes.
- Report a genuine blocker only after exhausting repository knowledge and safe Demo/app-plane work.
  State the exact missing value, why it affects a specific Live action, the recommended
  owner/process, the command or UI location, and the evidence that will close it.
- Stop only when the requested outcome is complete or a genuinely external, specific blocker
  prevents further in-scope work.
  The complete runner-neutral loop is in `docs/autonomous-agent-runner.md`. Temporary packets and
  working notes belong under `docs/temp/`; promote only durable verified decisions into active docs.
