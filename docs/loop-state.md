# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.

Last updated: 2026-08-01.

```yaml
last_updated: 2026-08-01
active_program: PRODUCTION-PHASE-2026-07-29
program_suites: S51-S54 (new) + S40-S50 (in flight)
spec_writing_allowed: true
loop_execution_allowed: true
loop_commit_push_allowed: true
loop_deploy_allowed: true
provider_interleave_allowed: true
spec_package_status: EXECUTING
implementation_status: PAUSED_AT_VERIFIED_BOUNDARY
next_suite: S25
next_spec: docs/feature-suites/lease-renewal-execution.md + docs/feature-suites/maintenance-execution.md
session_auth_status: GREEN_ADC_MANAGED_ACCOUNT_AND_CLI_TOKEN
active_slice: S55-RENAME-CUTOVER + LOCAL-DEMO-FIXTURES (specced, not yet built)
last_completed_slice: S52-CEILING-APPLIED-AND-VERIFIED
runtime_action_gates_preflipped: false
```

## Authority

- Owner authorized the phase and unattended development. D01–D64, receipt-needed D44/D49/D51, and
  conservative D50 are in `docs/production-phase-decision-record-2026-07-29.md`.
- Controlling grant: the **Production Phase Authorization** section of `AGENTS.md`.
- Live resident/owner/lease data in Production is authorized (`F-LIVE-DATA-AUTHORIZED`).
- Standing loop authority is `F-LOOP-AUTONOMY-2026-07-29`, bounded by six protected paths.
- Activation is per named Action Registry key, never a category (`F-GREENLIGHT-NAMED-KEYS`).
- S52's ceiling is SET and verified: alert $25 / stop $100 (`F-COST-CEILING-S52-APPLIED`).
- Cloud config commands run WITHOUT asking under `F-CLOUD-AUTOMATION-GRANT`; read back and record.
- S40–S50 remain controlling after S51–S54; S28–S39 interleave outside higher-priority slices, except S36/S37.

## Current truth

- Auth GREEN 2026-07-31; release path BUILT; **S52 ceiling APPLIED**, so cost/live/cloud steps have
  headroom. Owner set `KB_APPROVAL_SENDER=josiah@pmikcmetro.com` (2026-08-01), clearing the preflight
  refusal that blocked EVERY production deploy.
- S54.1's widened Firestore gate/falsification is complete; remote CI run `30510068990` passed.
- S53.2 Sheet, S53.3 Drive, S53.4 sender/config, S53.5 Vendor lifecycle, S52-I/J, and the
  fail-closed budget planner are COMPLETE LOCALLY; every provider key remains closed and D32 is still
  the Sheet provider seam. Detail: `docs/status.md` plus the `F-S53-*`/`F-S52-*` rows.
- S51 steps 3–6 are dependency-safe locally complete (effect stop, A2/monitoring, reply/watch A2,
  rollback/incident/retention/capacity/log hygiene); Rules/cloud/live rehearsal remain parked.
- All three reachable Gmail A2 residuals are CLOSED: `gmail.label.apply`
  (`F-S25-LABEL-S20-CONTRACT`) and both draft actions (`F-S26-DRAFT-CONTRACT-ALIGNED`,
  `F-S25-DRAFT-PAIR-S20-CONTRACT`) run the canonical S20 one-attempt contract. Gate values
  unchanged, no D12 path touched, all three send keys still closed under D33.
- Exact closeout gate (2026-07-31): clean-install `bash scripts/verify.sh` green; 3974 unit + 109
  Firestore tests, 0 lint errors; core E2E 8 files / 32 passed / 18 designed skips.
- Production serves `2bfe7d4` on revision `pmi-kc-kb-demo-rmrxpsn5q-92c1b759735e`, missing the
  accumulated repairs. D07 deploy waits for S52 headroom and the sanitized-environment/emulator
  refusal. Never edit `.env.local` as the workaround. Backups verified; S40 migration unblocked.
- Kill switch armed at the applied $100 (budget + `KILL_SWITCH_CAP_USD` both read back). Caveat:
  budgets are `INCLUDE_ALL_CREDITS`, so $0 July may be credit-masked; guardrail Node 20 dies 30 Oct 2026.

## Dependency order

1. **S54 slice 1 — COMPLETE** — local falsification/full gate and remote CI are green.
2. **S53 slice 1 — COMPLETE LOCALLY** — live Sheet write-back is behind its exact gate and
   Production+Live descriptor fence; the key remains closed.
3. **S53 Sheet action contract — COMPLETE LOCALLY / ACTIVATION BLOCKED** — keep the key closed
   until D32 supplies one provider ledger with stable-row mutate, exact status, atomic absent-key
   tombstone, immutable effect evidence, and a current-cell generation invalidated by every edit;
   then require auth and the exact operational target. Fixed-A1 throwaway proof is insufficient.
4. **S53 comp action contract — COMPLETE LOCALLY / KEY CLOSED** — verified; activation is parked.
5. **S53 sender/config slice — COMPLETE LOCALLY** — forwarding/refusal and runtime truth are green;
   undiscovered values remain inert.
6. **S53 Vendor lifecycle seam — COMPLETE LOCALLY / KEYS CLOSED** — Admin preview/confirm,
   receipt/reconcile/setup/disable and concurrency fences are green; no protected flip.
7. **S52 — APPLIED AND VERIFIED** — alert $25 / stop $100 live on both enforcement points; alerts
   reach josiah@ and dan@pmikcmetro.com; account-wide backstop covers the second project.
8. **S51 app-plane / Gmail residuals — COMPLETE LOCALLY** — S51 steps 3–7 plus the label and
   draft-pair S20 contracts are green; Rules/cloud/live rehearsal remain parked.
9. **S51 activation — REMAINING** — Rules review is the residual; the monitoring/operator
   destination is now satisfied by the two Cloud Monitoring channels created 2026-08-01.
10. **S40 release-safety prerequisite — COMPLETE LOCALLY** — `npm run release` provides the
    plan-only / zero-traffic candidate / exact-revision promotion path with captured rollback and
    named local-only refusal. The legacy auto-promoting wrapper stays ineligible for D07.
11. **D07 deploy and live operational evidence** — only after steps 9–10, fresh auth, full gate,
    prior-target capture, rollback, and bounded candidate smoke.
12. **S40 environment/data — COMPLETE LOCALLY** — dry-run + environment label shipped
    (`F-S40-ENVIRONMENT-DATA-SLICES`). Demo-project ACs are now DEFERRED, not blocked
    (`F-DEMO-DEFERRED-LOCAL-FIRST`): local-only rehearsal plus the tag URL replaces the Demo project.
    12b. **S55 rename + local-Demo fixtures — SPECCED, NOT BUILT** — the two open build slices.
13. **S53 remaining activations** — as each owner value lands, each with its paired
    deploy-wrapper change.
14. Then S41 → S42 → S44 → S43/S45 → S46 → S47 → S48 → S49 → S50; interleave S28–S39 seams.

## Named external evidence

- **Blocking the slice order:** S51 Rules review. S52 and the S53 sender value are both RESOLVED
  2026-08-01; the sender was the hidden blocker on every production deploy.
- Also open: RentVine write endpoint (S30, S47); RentCast key plus rate limits/radius/min comp count;
  Dotloop OAuth; LeadSimple key + contract; Chasity's renewal template (S43); exact Demo
  project/service/database/storage/queue/OAuth/identity values then owner-run provisioning; S53
  sender value and the D32 Sheet transaction broker (mutate + status + absent-key tombstone +
  ABA-safe effect generation/protected range) plus column/id/tab confirmation; intake
  secrets/binding; first Vendor identity; S36 IAM grant; S47 wording/fallback contact; brand
  artwork approval (D44); D49/D51 receipts.
- Full list with ready-to-send drafts: `docs/client-asks-2026-07-29.md`.

## Gate meaning

- Program, spec, loop, commit/push, and deploy flags are OPEN.
- Pure app-plane features have no Action Registry gate and ship when verified.
- `runtime_action_gates_preflipped:false` stays intentional. A provider action flips in its
  owning slice only when endpoint/mapping/identity/contract are documented; the flip updates the
  seed, both executable allowlists, the pinned tests, AND the deploy wrapper — the wrapper
  forwards a closed allowlist, so a secret alone never activates anything.
- Never leave a finished documented action preview-only by habit; never flip an undocumented one.

## Locked safety

- No autonomous, scheduled, bulk, or model-triggered client-facing send. Every client-facing send
  and system-of-record write stays human-initiated and exact-confirmed.
- No guessed endpoint, record URL, or customer value; generic provider navigation is not evidence.
- No Demo/Production resource, record, credential, effect, or receipt crossing; unknown fails closed.
- No personal auth, secret, PII, customer content, token, or photo in git or release evidence.
- Every live effect is one-attempt, idempotent, receipted, monitored, and reversible.
- No big-bang deletion; static reachability alone never removes provider/security/rollback code.
- D12's exact six protected paths are surfaced for owner review, never pushed under the standing grant.

## Resume

**Production deploy is UNBLOCKED as of 2026-08-01.** The S55 cutover run found the preflight refusing
EVERY production deploy (`internal.transactional_notice.send` executable, no managed sender); owner
supplied `KB_APPROVAL_SENDER=josiah@pmikcmetro.com`, now in `.env.production.local` and verified in
the merged deploy map. GOTCHAS: production deploy reads `.env.production.local`, NOT `.env.local`;
`npm run preflight:production` standalone reads the AMBIENT shell so it false-fails. Two slices open:
**S55** (`docs/feature-suites/production-service-rename-and-identifier-cleanup.md`) renames the
Production service to `pmi-kc-app` — widen `CURRENT_PRODUCTION_APP_HOST` to an exact-host SET and add
the new Firebase authorized domains BEFORE promoting, or vendor lifecycle gates fail closed and
sign-in breaks; and the **local-Demo fixtures** slice severs local's live RentVine/Sheet connectors,
which today make local read production client data. Then S41 onward.
