# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.

Last updated: 2026-07-30.

```yaml
last_updated: 2026-07-30
active_program: PRODUCTION-PHASE-2026-07-29
program_suites: S51-S54 (new) + S40-S50 (in flight)
spec_writing_allowed: true
loop_execution_allowed: true
loop_commit_push_allowed: true
loop_deploy_allowed: true
provider_interleave_allowed: true
spec_package_status: EXECUTING
implementation_status: IN_PROGRESS
next_suite: S51
next_spec: docs/feature-suites/production-operational-readiness.md
session_auth_status: BLOCKED_INTERACTIVE_ADC_CLI_GREEN
active_slice: S51-ROLLBACK-INCIDENT-RETENTION-LOG-HYGIENE
last_completed_slice: S53.5 + S52-I/J/PLANNER + S51-CLOSE-ONLY-KERNEL/EFFECT-STOP/A2-MONITORING
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

- Session-start `npm run preflight:adc` failed because ADC is absent/stale. Exact owner action:
  `npm run auth:session`, then rerun the ADC, managed-account, and suppressed CLI-token checks.
  The subsequently located Windows CLI reports managed `josiah@pmikcmetro.com`, and the suppressed
  CLI-token check passes. ADC alone remains red, so live reads, deploys, cloud mutations, and the S54
  live eval stay parked; local/app-plane work continues.
- S54.1's widened Firestore gate/falsification is complete; remote CI run `30510068990` passed.
- S53.2's AC-S53-12 Sheet contract is locally complete through immutable preview, one-attempt
  execution, receipt/reconcile/correction, and ABA-safe recovery; D32 is still the provider seam.
- S53.3's AC-S53-13 Drive contract is locally complete through preview, one upload, bodyless
  receipt/reconcile, and exact trash rollback; the key remains closed/hidden.
- S53.4 is complete locally: reviewed preflight/deploy source parity, explicit Production+Live,
  committed-seed gate truth plus complete Firestore drift, action-keyed sender/DWD readiness,
  paired intake secrets, fail-closed Space flag, and strict runtime scalar validation. D33's direct
  notice-send non-targets are reconciled as Disabled without changing `production_allowed`.
- S53.5 Vendor lifecycle and S52-I/J plus the fail-closed print-only budget planner are locally
  green; every provider key remains closed.
- S51 steps 3–5 are locally green: close-only effect stop, explicit A2 logging, and the print-only
  monitoring bundle/verifier. Rules/cloud apply are parked; direct Gmail A2 reachability remains.
- Exact clean-install gate: 441/3,872 unit, 21/92 Firestore, 96-page build, and core E2E
  32 passed / 18 designed skips; runtime audit is zero.
- Production serves `2bfe7d4` on revision `pmi-kc-kb-demo-rmrxpsn5q-92c1b759735e`, missing the
  accumulated repairs. D07 deploy waits for S52 headroom and the sanitized-environment/emulator
  refusal. Never edit `.env.local` as the workaround.
- Firestore backups are verified (`F-FIRESTORE-BACKUPS`); the S40 migration is unblocked.
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
8. **S51 app-plane — ACTIVE** — stop/A2/monitoring seams complete; next rehearsal/incident/retention/log hygiene; Rules/cloud apply parked; harden direct-Gmail A2 reachability before final verify.
9. **S52/S51 activation** — after the complete-calendar-month baseline, supply the two
   owner-selected values, second-project disposition, and operator destination; apply owner-run
   billing/IAM/monitoring changes and verify live lockstep/delivery. Do not synthesize or infer a
   bootstrap value.
10. **S40 release-safety prerequisite** — land the environment-parameterized, sanitized,
    zero-traffic candidate deploy path, current-manifest policy targeting, candidate smoke before
    exact-revision promotion, and rollback command. The legacy auto-promoting wrapper is not eligible
    for D07.
11. **D07 deploy and live operational evidence** — only after steps 9–10, fresh auth, full gate,
    prior-target capture, rollback, and bounded candidate smoke.
12. **S40 remaining environment/data slices** — provider-construction sentinel, un-merge Demo/Live
    lists, Production route exclusion, shell banner, and migration dry-run.
13. **S53 remaining activations** — as each owner value lands, each with its paired
    deploy-wrapper change.
14. Then S41 → S42 → S44 → S43/S45 → S46 → S47 → S48 → S49 → S50; interleave S28–S39 seams.

## Named external evidence

- RentVine write endpoint and resident-channel semantics — one combined ask (S30, S47).
- RentCast free-tier key — owner self-serve; still needs rate limits, radius, min comp count.
- Dotloop OAuth registration; LeadSimple key plus endpoint contract.
- Chasity's renewal-template artifact (gates S43 template-dependent output only).
- Exact Demo project/service/database/storage/queue/OAuth/identity values, then owner-run
  provisioning and migration.
- S51 Rules review/operator destination; S52 burn evidence, values, and project disposition.
- S53 sender value; the D32 Sheet transaction broker (mutate + status + absent-key tombstone +
  same-value-ABA-safe effect generation/protected range) plus column/id/tab confirmation; intake
  secrets/binding; first Vendor identity; and S36 IAM grant.
- Approved resident wording plus fallback contact and RentVine contract evidence for S47.
- Official brand artwork/usage approval (D44); D49/D51 response receipts if those assumptions should
  become owner-ratified policy.
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

Build S51 ordered step 6: rollback rehearsal plus incident, capacity, retention, and log-hygiene artifacts. Keep the protected Rules packet and monitoring activation unapplied. Re-run auth before live/cloud work; thresholds remain unset.
