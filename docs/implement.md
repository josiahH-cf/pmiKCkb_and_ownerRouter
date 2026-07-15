# Implementation Workflow

## Start Here

Read, in order:

1. `AGENTS.md`
2. `docs/facts.md`
3. `docs/loop-state.md`
4. `docs/plan.md`
5. the relevant product doc and S20–S27 feature-suite specification

The active outcome is a working production V1 with distinct Live and Test lanes. Do not
reopen R01–R09 or turn an unavailable optional provider into an application-wide blocker.

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
2. Choose the data lane:
   - Live for authoritative records and configured providers.
   - Test for reserved invented aliases and no-client adapters.
3. Write the failing boundary/behavior test.
4. Implement the smallest complete vertical slice, including UI, route, persistence,
   authorization, audit/receipt, and failure state.
5. Exercise the Test workflow in production-shaped code. It may write real app state and
   reach Done, but its receipt must say no provider was contacted and cannot prove Live.
6. For a Live external action, verify the exact contract, account mapping, credential,
   target/effect preview, role decision, one-attempt/idempotency behavior, readback or
   reconciliation, monitoring, and rollback before enabling that action.
7. Update specs, facts, status, plan, and loop state in the same slice.
8. Run focused checks, then the full verifier.

## Live/Test Rules

- Legacy records without a lane resolve to Live.
- Test aliases are server-owned, visibly labeled, and rejected from Live records.
- A browser flag, cookie, query parameter, or environment fallback cannot switch a Live
  record to Test or choose a Test adapter.
- The production Test execution workspace is memory-only for typed external adapters and
  persistent in Firestore for Maintenance/Vendor application records. It imports no Live
  provider client.
- Test evidence closes application-workflow checks only. Live activation requires a Live
  receipt from the exact configured action.
- Missing provider contracts or credentials become a specific activation checklist item;
  continue building and validating the Test path.

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

## Maintenance and Vendor V1 Defaults

- Canonical Test unit: `unit:test-maple-204` / `TEST — 204 Maple Court Unit 2`.
- Canonical Test Vendor: `vendor:test-summit-plumbing` /
  `service@summit-plumbing.example.invalid`.
- Maintenance Test tickets may progress through assignment, status, notes, simulated actions,
  close, and reopen with bodyless non-Live receipts.
- The Test Vendor uses Firebase Email/Password and TOTP, sees only matching Test assignments,
  and uses the app-only Test mailbox. Test principals are rejected before OAuth/Gmail client
  construction.
- Live Vendor mailbox activation separately requires a routable verified email, TOTP,
  same-address OAuth, vault references, and assigned-ticket authorization.

## Retention Default

The V1 baseline uses bodyless state, legal hold, bounded on-demand cleanup, and visible
health. TTL policies, extra composite indexes, and Cloud Scheduler are optional improvements,
not prerequisites. Enable them later only with a measured volume need and rollback plan.

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

Before deployment, also run identity, ADC, budget, production preflight, cutover report, and
dependency inventory. Capture the currently serving revision before changing traffic.
`npm run deploy:demo -- --budget-confirmed` creates a collision-resistant named revision, then
explicitly routes 100% traffic to that exact revision. This prevents a named revision selected during
a rollback rehearsal from remaining pinned and avoids a concurrent-deploy race through floating
`LATEST`; the traffic step does not alter invoker/IAM configuration. The deploy uses Cloud Run's supported
`--no-invoker-iam-check` service setting for the public sign-in shell, avoiding an org-blocked
`allUsers` IAM binding while leaving application authentication and authorization unchanged.

After deployment, use authenticated browser acceptance at desktop and phone widths across
Console, Ask, Spaces, Approvals, Workflow Communications, Lease Renewals, Maintenance,
Admin, Notifications, and Vendor sign-in/assigned-ticket work. Exercise at least one complete
production Test workflow and verify zero Live-provider calls.

## Documentation and Stop Conditions

- Record verified facts with dated evidence in `docs/facts.md`.
- Delete superseded active guidance and add a unique Supersede Log marker.
- Keep `docs/loop-state.md` under 140 lines and focused on the next exact action.
- Update `docs/plan.md` whenever phase status or acceptance changes.
- Report a genuine blocker only after exhausting repository knowledge and safe Test defaults.
  State the exact missing value, why it affects a specific Live action, the recommended
  owner/process, the command or UI location, and the evidence that will close it.
- Stop only when the requested outcome is complete or a genuinely external, specific blocker
  prevents further in-scope work.
  The complete runner-neutral loop is in `docs/autonomous-agent-runner.md`. Temporary packets and
  working notes belong under `docs/temp/`; promote only durable verified decisions into active docs.
