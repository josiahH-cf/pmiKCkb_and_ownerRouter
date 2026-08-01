# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.

Last updated: 2026-07-31.

```yaml
last_updated: 2026-07-31
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
active_slice: STOPPED-AT-S40-RELEASE-SAFETY-PATH
last_completed_slice: S40-RELEASE-SAFETY-PATH
runtime_action_gates_preflipped: false
```

## Authority

- Owner authorized the phase and unattended development. D01–D64, receipt-needed D44/D49/D51, and
  conservative D50 are in `docs/production-phase-decision-record-2026-07-29.md`.
- Controlling grant: the **Production Phase Authorization** section of `AGENTS.md`.
- Live resident/owner/lease data in Production is authorized (`F-LIVE-DATA-AUTHORIZED`).
- Standing loop authority is `F-LOOP-AUTONOMY-2026-07-29`, bounded by six protected paths.
- Activation is per named Action Registry key, never a category (`F-GREENLIGHT-NAMED-KEYS`).
- The flat cloud cost cap is retired; S52 owns the replacement (`F-COST-CEILING-S52`).
- S40–S50 remain controlling after S51–S54; S28–S39 interleave outside higher-priority slices, except S36/S37.

## Current truth

- Auth is GREEN 2026-07-31 (owner ran `auth:session`): ADC fresh, managed `josiah@pmikcmetro.com`,
  CLI token mints; live Google reads available. S40's release path is now BUILT
  (`F-S40-RELEASE-SAFETY-PATH`), so **S52's null ceiling is the only remaining blocker** on
  cost-bearing/live/cloud steps. The guard's legacy $10 posture is enforcement state, not headroom.
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
- The budget kill-switch is armed and verified end to end at the observed legacy monthly amount,
  which is enforcement state rather than approved headroom. S52's replacement values are null.

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
7. **S52 prerequisites — PARKED** — planner refusal plus I/J are green; source/handler/check are
   protected, and baseline/values/project disposition/operator destination remain external.
8. **S51 app-plane / Gmail residuals — COMPLETE LOCALLY** — S51 steps 3–7 plus the label and
   draft-pair S20 contracts are green; Rules/cloud/live rehearsal remain parked.
9. **S52/S51 activation** — after the complete-calendar-month baseline, supply the two
   owner-selected values, second-project disposition, and operator destination; apply owner-run
   billing/IAM/monitoring changes and verify live lockstep/delivery. Do not synthesize or infer a
   bootstrap value.
10. **S40 release-safety prerequisite — COMPLETE LOCALLY** — `npm run release` provides the
    plan-only / zero-traffic candidate / exact-revision promotion path with captured rollback and
    named local-only refusal. The legacy auto-promoting wrapper stays ineligible for D07.
11. **D07 deploy and live operational evidence** — only after steps 9–10, fresh auth, full gate,
    prior-target capture, rollback, and bounded candidate smoke.
12. **S40 remaining environment/data slices** — provider-construction sentinel, un-merge Demo/Live
    lists, Production route exclusion, shell banner, and migration dry-run.
13. **S53 remaining activations** — as each owner value lands, each with its paired
    deploy-wrapper change.
14. Then S41 → S42 → S44 → S43/S45 → S46 → S47 → S48 → S49 → S50; interleave S28–S39 seams.

## Named external evidence

- **Blocking the slice order:** S52 burn evidence, the two owner-selected ceiling values, and
  second-project disposition; S51 Rules review and the managed operator destination.
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

Stop at the verified S40 release-safety boundary. Auth is green and the release path is built, so
S52's null ceiling is now the ONLY thing parking deploy: it needs the owner's burn evidence, the two
reviewed values, second-project disposition, and the managed operator destination, with the GCP
budget amount and `KILL_SWITCH_CAP_USD` moved together because the guard applies the smaller. Next
dependency-ready local work is S40's remaining environment/data slices (provider-construction
sentinel, un-merge Demo/Live lists, Production route exclusion, shell banner, migration dry-run),
then S41 onward.
