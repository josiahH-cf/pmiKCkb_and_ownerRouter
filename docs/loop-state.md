# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.

Last updated: 2026-07-29.

```yaml
last_updated: 2026-07-29
active_program: PRODUCTION-PHASE-2026-07-29
program_suites: S51-S54 (new) + S40-S50 (in flight)
spec_writing_allowed: true
loop_execution_allowed: true
loop_commit_push_allowed: true
loop_deploy_allowed: true
provider_interleave_allowed: true
spec_package_status: EXECUTING
implementation_status: IN_PROGRESS
next_suite: S53
next_spec: docs/feature-suites/greenlight-activation-and-gate-integrity.md
session_auth_status: BLOCKED_INTERACTIVE_ADC
last_completed_slice: S53.1
runtime_action_gates_preflipped: false
```

## Authority

- Owner authorized the production phase and unattended development of all specs on 2026-07-29.
  The sanitized D01–D64 reconstruction, including the receipt-needed D44/D49/D51 rows and
  conservative D50 interpretation, is `docs/production-phase-decision-record-2026-07-29.md`.
- Controlling grant: the **Production Phase Authorization** section of `AGENTS.md`.
- Live resident/owner/lease data in Production is authorized (`F-LIVE-DATA-AUTHORIZED`).
- Standing loop authority to commit, push, deploy, promote traffic, and continue through
  uncertainty (`F-LOOP-AUTONOMY-2026-07-29`), bounded by six protected paths.
- Activation is per named Action Registry key, never a category (`F-GREENLIGHT-NAMED-KEYS`).
- The flat cloud cost cap is retired; S52 owns the replacement (`F-COST-CEILING-S52`).
- S40–S50 remain the controlling UI/environment programme after S51–S54 prerequisites; S28–S39 may
  interleave only outside a higher-priority active slice, except S36/S37.

## Current truth

- Repository baseline: `main` / `d1da44a` plus the locally green S53.1 refusal-path slice.
- Session-start `npm run preflight:adc` failed because ADC is absent/stale. Exact owner action:
  `npm run auth:session`, then rerun the ADC, managed-account, and suppressed CLI-token checks.
  The current WSL shell also has no callable `gcloud` or Windows `cmd.exe`, so the managed-account and
  suppressed CLI-token checks could not run here. Live reads, deploys, cloud mutations, and the S54
  live eval are parked; local/app-plane work continues.
- S54.1 is locally complete: `test:firestore` is in the local/CI gate; 17 files / 59 tests passed,
  permissive-Rule falsification failed as intended, and the exact Rules hash was restored. Full
  evidence is in `docs/status.md`; remote CI run `30510068990` passed.
- S53.1 is locally green: write-back now refuses before live dependency construction unless both the
  server descriptor and exact committed action gate allow it. The key remains closed.
- Production serves `2bfe7d4` on revision `pmi-kc-kb-demo-rmrxpsn5q-92c1b759735e` — **14 commits
  behind `main`**, missing eleven defect repairs including the safety-critical rollback fix.
  D07 authorizes deploying this gap only after S52 establishes verified headroom and the deploy
  wrapper has an explicit sanitized-environment/emulator-variable refusal. Never edit `.env.local`
  as the workaround.
- Firestore backup posture is live and verified (`F-FIRESTORE-BACKUPS`): PITR on with a 7-day
  window, delete protection on, daily 7d + weekly 14w schedules. The S40 migration is unblocked.
- The budget kill-switch is armed and verified end to end at the observed legacy monthly amount,
  which is enforcement state rather than approved headroom. S52's replacement values are null.
- Control-surface defects take priority over activation: Sheet write-back is now fenced but still
  uses boolean-only confirmation; the comp-screenshot route can upload on its first POST without the
  full action contract; and S39's internal notice is recorded live but inert because its sender
  mailbox is empty. Both provider keys remain closed.

## Dependency order

1. **S54 slice 1 — COMPLETE** — local falsification/full gate and remote CI are green.
2. **S53 slice 1 — COMPLETE LOCALLY** — live Sheet write-back is behind its exact gate and
   Production+Live descriptor fence; the key remains closed.
3. **S53 action-contract hardening** — replace Sheet boolean-only commit with immutable preview-hash
   confirmation, one-attempt idempotency, receipt/readback/reconcile, and guarded correction; replace
   comp screenshot upload-on-first-POST with preview/confirm/idempotency/receipt/reconcile/Drive-trash
   rollback. Keep both keys closed until their independent contracts pass.
4. **S53 sender/config slice** — build the `KB_APPROVAL_SENDER`/forwarding refusal to the seam; leave the value
   inert if approved non-secret config does not reveal it. Do not flip protected keys.
5. **S52 prerequisites** — build baseline capture, single-source values, lockstep enforcement,
   coverage, and refusals with values unset; park protected guardrail/check changes for review.
6. **S51 app-plane** — close-only combinator first, then store/route/rehearsal/incident/logging/
   alert definitions. Isolate protected `firestore.rules`; do not apply cloud resources.
7. **S52/S51 activation** — after the complete-calendar-month baseline, supply the two
   owner-selected values, second-project disposition, and operator destination; apply owner-run
   billing/IAM/monitoring changes and verify live lockstep/delivery. Do not synthesize or infer a
   bootstrap value.
8. **S40 release-safety prerequisite** — land the environment-parameterized, sanitized,
   zero-traffic candidate deploy path, current-manifest policy targeting, candidate smoke before
   exact-revision promotion, and rollback command. The legacy auto-promoting wrapper is not eligible
   for D07.
9. **D07 deploy and live operational evidence** — only after steps 7–8, fresh auth, full gate,
   prior-target capture, rollback, and bounded candidate smoke.
10. **S40 remaining environment/data slices** — provider-construction sentinel, un-merge Demo/Live
    lists, Production route exclusion, shell banner, and migration dry-run.
11. **S53 remaining activations** — as each owner value lands, each with its paired
    deploy-wrapper change.
12. Then S41 → S42 → S44 → S43/S45 → S46 → S47 → S48 → S49 → S50, interleaving S28–S39 seams.

## Named external evidence

- RentVine write endpoint and resident-channel semantics — one combined ask (S30, S47).
- RentCast free-tier key — owner self-serve; still needs rate limits, radius, min comp count.
- Dotloop OAuth registration; LeadSimple key plus endpoint contract.
- Chasity's renewal-template artifact (gates S43 template-dependent output only).
- Exact Demo project/service/database/storage/queue/OAuth/identity values, then owner-run
  provisioning and migration.
- S51 operator destination; S52 burn evidence, alert/hard-stop values, and second-project disposition.
- S53 sender value, sheet column/id/tab confirmation, intake secrets/binding, first Vendor identity,
  and S36 IAM grant.
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
- No Demo/Production resource, record, credential, effect, or receipt crossing; unknown mode
  fails closed.
- No personal auth, secret, PII, customer content, token, or photo in git or release evidence.
- Every live effect is one-attempt, idempotent, receipted, monitored, and reversible.
- No big-bang deletion; static reachability alone never removes provider/security/rollback code.
- D12's exact six protected paths are surfaced for owner review, never pushed under the standing grant.

## Resume

Start at S53 action-contract hardening, then follow the dependency order above. Re-run auth before
any live read/cloud step; if stale, keep that operation parked. Green lights are named-key lists,
never categories. Do not infer the missing D44/D49/D51 receipt or widen reconstructed D50.
