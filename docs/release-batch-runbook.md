# Batched release runbook

Updated: 2026-09-28 (UTC). One candidate must ship every queued feature.
Current state: **BLOCKED** by the release-safety and product findings in
`docs/evidence/batch-litmus-audit-2026-09-28.md`. Billing is enabled; this is no longer a billing
outage. Do not start the watcher until the identified defects are resolved and all gates pass.
The thirteen-feature queue stays intact.

## What ships

The thirteen features are cumulative commits on main:

| #   | Suite      | What it adds                                                |
| --- | ---------- | ----------------------------------------------------------- |
| 1   | S128 (F08) | Pause operating-Sheet writes; requires flag-false rollback  |
| 2   | S123 (F02) | Retain unfinished renewals across source date changes       |
| 3   | S124 (F03) | Move-out detection and non-renewal outreach filtering       |
| 4   | S134 (F14) | Color-coded lease status with matching sorting and filters  |
| 5   | S122 (F01) | All-lease visibility and explicit worklist views            |
| 6   | S125 (F04) | Thirty-day notice timing review with an explicit date basis |
| 7   | S126 (F06) | Consistent month/day/year date presentation                 |
| 8   | S127 (F07) | Clear blockers and exact next-action guidance               |
| 9   | S131 (F11) | Rhino-policy conditional logic, ready for approved material |
| 10  | S129 (F09) | Owner and tenant draft workflows, technical readiness       |
| 11  | S130 (F10) | Seven-template intake and Dotloop prefill readiness         |
| 12  | S132 (F12) | End-to-end walkthrough preparation and meeting evidence     |
| 13  | S133 (F13) | External maintenance-agent handoff assessment               |

Exact feature commits and CI runs remain in `docs/loop-state.md`. Existing implementation and
historical CI do not close the new audit gaps. One Cloud Build, candidate, assurance, promotion and
300,000 ms observation carry the complete repaired batch. Do not fall back to per-feature cycles.

## Before you start

Follow these gates in order. Read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`,
`docs/environment-handoff.md` and `docs/budget-and-cost-policy.md`.

**1. Read billing and cost controls.** On 2026-09-28 billing read enabled on the expected account;
alert 25 USD, project hard stop 100 USD, account backstop 100 USD and ACTIVE Node.js 22 guardrail
cap 100 were unchanged. Hard-stop Pub/Sub was present and both alerts retained two channels.
The runner never changes billing, a budget, guardrail or security setting. Re-read when resuming;
do not infer current spend or the original outage cause from billing being enabled.

```bash
gcloud beta billing projects describe pmi-kc-kb-prod --format="value(billingEnabled,billingAccountName)"
```

Expect True and account `01A5A3-65CA5A-614D45`. Stop if billing is disabled.

**2. Verify the watcher and checkpoint before any start.** The earlier stale-checkpoint cleanup
is now completed. A preexisting watcher PID 382 started stale S128-only build
`57f23335-8f8b-490e-b18e-5d6d4b1db564` at 2026-09-28T20:58:24.661Z. It was stopped and the
build read CANCELLED at 21:01:53.995Z; candidate `pmi-kc-app-rmu82xj2c-fa2fae08b587` is absent,
with no traffic change.

The exact checkpoint is archived at
`~/.local/state/pmi-kc-release/checkpoint-0bbd95c3dbd8f4a93b4b185b8ba09770170d1ca4-cancelled-stale-batch-20260928T2107Z.json`,
with its reason. Never overwrite that archive or relabel cancellation as success. The active
checkpoint names last completed S120 at `79493458` / `pmi-kc-app-rmu4wevd9-d89996133320`,
including its candidate origin and diff baseline. Zero processes and a free lock were read back;
the scheduled task remains Ready and unchanged. Recheck because stopped processes do not disable
the task. An unfinished checkpoint still pins the watcher to its SHA; inspect any new state before
archiving or resetting it.

**3. Verify approved authentication.** WSL CLI/ADC for `josiah@pmikcmetro.com` passed on
2026-09-28. Browser authentication remains UNVERIFIED after two sign-in navigation timeouts;
no challenge was observed. HTTP 200 alone is not authenticated assurance. Run `npm run auth:ensure`
and the guarded browser check when resuming. If enrollment is stale or expires, stop for the owner's
attended step; never enter a password, code, passkey or CAPTCHA:

```bash
npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com
```

Observed session longevity is under nine hours; a release must begin within the preflight's
seven-hour enrollment budget. An expired rollback remains held until authentication returns.

**4. Resolve the audit and confirm readiness.** Promotion compensation currently restores the raw
predecessor without enforcing S128, and observer rollback redeployment cannot satisfy the original
receipt-bound revision/fingerprint. Its replacement target is also not persisted. These are release
blockers, not retryable phase errors. The product audit additionally identifies missing withdrawal
history, incomplete manual non-renewal refusal and notice-review invalidation, paused automatic
Sheet proposals/stale pause-resume confirmations, raw ISO/impossible dates in move-out labels,
and the actual template-fill integration gap. Resolve them with adversarial tests,
full verification and exact-main CI before starting.

```bash
npm run release:batch-preflight -- --billing-re-enabled
```

The pre-edit head `f85abacc771dc0f85c2f7bf69af3d05d8402e88e` had exact CI 35549486717 and
preflight GO with thirteen features/current watcher target. This result does not clear the defects.
On resume, require GO again on the actual repaired head, exactly thirteen entries, equal native,
Windows and remote main SHAs, both ignored env files false, and known fresh enrollment. Unknown
preflight rows are not evidence of readiness.

## Run it after the blockers are closed

Use the native snap gcloud and one process on a verified free lock. Never use the Windows-mounted
Cloud SDK. Never start a second watcher.

```bash
cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter
export PATH=/snap/google-cloud-cli/current/bin:/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:$PATH
LOGS=/mnt/c/Users/josia/AppData/Local/PMI-KC/release-watcher
mkdir -p "$LOGS"
flock --nonblock ~/.local/state/pmi-kc-release/release.lock -c true && echo "lock free"
nohup setsid node scripts/release-watcher.mjs --watch \
  >> "$LOGS/native-status-batch.log" 2>> "$LOGS/native-errors-batch.log" < /dev/null &
```

The separate lock-free check must pass before launch. A dry run prints one decision:
`npm run release:watch:dry-run`. The watcher must target the complete repaired batch and progress
only on readbacks: prepare, deploy, smoke, fingerprint, domains, assurance, promote, observe,
complete. Follow status lines; optimistic command text is never a passed phase.

## If a phase fails

- Preserve each receipt, report and terminal checkpoint unchanged outside Git.
- Authentication expiry requires attended enrollment; stop rather than looping login.
- Diagnose a stale Identity Platform client before a same-lock relaunch after enrollment.
- For repeated assurance failure, stop between passes before a manual canary uses the Admin profile.
- A NOT_FOUND response after a build requires proof that no revision was created before retrying.
- Rollback must use a durably bound, independently verified Sheet-paused target. The current defects
  must be repaired before relying on this behavior; never restore the Sheet-enabled serving image
  by a bare traffic shift.
- Stop if the same phase fails twice for different reasons or a safety control would need lowering.

## After verified completion

1. Run `bash ~/pmi-kc-work/scripts/s120-readbacks.sh <head-sha> <revision>`. Review the helper for
   safe field selection; never print raw Identity Platform configuration or provider/customer data.
2. Confirm canonical/tagged identity, exact 100% traffic and fingerprint, exactly one candidate
   authorized domain, and revision env production/live with ASK_DEMO_MODE=false and
   LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false. Read service identity, maps and bindings independently.
3. Only after these pass, update facts, loop-state, status, plan and environment-handoff to the
   actual release evidence and clear the Awaiting release queue.
4. Run the pinned environment-handoff-provider-table and plan-status-sync tests, prettier and
   document gates; commit/push documentation-only closure. It must not trigger another deployment.

Current batch assurance, promotion and observation are NOT RUN. The old S120 receipts remain
historical evidence only. Browser smokes and human verdicts remain NOT RUN until actually executed.
B-DL1, B-DL2, B-DL3, B-S100, B-MNT1 and B-MNT2 stay open. No release can manufacture their
external inputs, connect Dotloop, activate a closed key or create a client-facing send.
