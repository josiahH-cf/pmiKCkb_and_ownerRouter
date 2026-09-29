# Batched release runbook

Updated: 2026-09-29 (UTC). One candidate must ship every queued feature.
Current state: **BLOCKED pending fresh attended authentication, exact repair-head CI and remote delivery**.
Local objective verification passed; scopes and unchanged failed attempts are recorded in
`docs/evidence/batch-litmus-audit-2026-09-28.md`. Billing is enabled. Do not start the watcher until
all release gates pass. The thirteen-feature queue stays intact.

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
including its candidate origin and diff baseline. After interlock installation, eleven release files
matched both checkouts, the permit was absent and zero watchers were found at 2026-09-29T02:31:17Z.
The temporary installation hold was released and the kernel lock read free; direct admission still
refused. The scheduled task remains Ready and unchanged. Recheck because stopped processes do not disable
the task. An unfinished checkpoint still pins the watcher to its SHA; inspect any new state before
archiving or resetting it.

**3. Verify approved authentication.** WSL CLI/ADC refresh for `josiah@pmikcmetro.com` passed on
2026-09-29 at approximately 04:58 UTC. The enrollment record still names 2026-09-28T20:56:36.677Z;
its age is now beyond the seven-hour release-start budget. Fresh attended WSL enrollment is required
even while token refresh succeeds. A guarded Admin browser check reached a genuine Google challenge;
its attended enrollment window closed before verification. Browser authentication remains UNVERIFIED.
HTTP 200 alone is not authenticated assurance. Run `npm run auth:ensure`
and the guarded browser check when resuming. If enrollment is stale or expires, stop for the owner's
attended step; never enter a password, code, passkey or CAPTCHA:

```bash
npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com
```

That helper intentionally skips enrollment while the existing tokens still refresh. If the
enrollment-age gate is stale before refresh fails, the owner must complete fresh CLI and ADC browser
flows using the existing native SDK/store, then the existing binding verifier. Do not edit the
enrollment timestamp to claim freshness. With the owner attending and the approved account already
verified, use:

```bash
export BROWSER="$PWD/scripts/auth/open-windows-browser.sh"
gcloud auth login josiah@pmikcmetro.com --force --launch-browser --no-activate
gcloud auth application-default login --account=josiah@pmikcmetro.com --launch-browser
node scripts/auth/verify-enrollment.mjs
npm run auth:ensure
```

The owner completes any Google challenge. Verify Admin browser readiness separately; successful
CLI/ADC enrollment does not establish the application's browser session.

Observed session longevity is under nine hours; a release must begin within the preflight's
seven-hour enrollment budget. An expired rollback remains held until authentication returns.

**4. Prepare the exact repaired batch.** Finish product and release-safety tests, the full verify
script and exact-head green CI first. Keep all thirteen entries until remote delivery is verified.
The installed local interlock is fail-closed: missing, malformed, held, expired, consumed or wrong-head
permits cannot dispatch forward release work. It applies to the Windows launcher, watcher and direct
release entry. The scheduled task configuration stays unchanged. Inspect checkpoint, process and lock
state before preparing; never overwrite an unfinished attempt or its receipts.

Use the native Node 22 and snap gcloud paths in WSL. With no other watcher and the lock free:

```bash
cd ~/pmi-kc-work/main
export PATH=/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:/snap/google-cloud-cli/current/bin:/home/josiah/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node scripts/release-control.mjs --prepare
node scripts/release-prerequisites.mjs
npm run release:batch-preflight
```

The prepared permit is outside Git at `~/.local/state/pmi-kc-release/release-permit.json`; preparation
is not deployment authority. The prerequisite collector performs approved CLI/ADC and guarded Admin
browser reads, billing and exact cost-control readbacks. Its sanitized immutable history and latest
receipt remain outside Git. Unknown or stale evidence is not GO. Require exactly thirteen ordered
expected suites, all queue commits ancestors of the head, equal native/Windows/remote main SHAs,
exact green push CI, both ignored env files with explicit false flags in both checkouts, a compatible
checkpoint, native tools, zero other watchers and an owned/free lock. Historical GO does not admit
this batch. Resolve every reported failure before continuing.

## Run the admitted batch

```bash
node scripts/release-control.mjs --admit-and-watch
```

This single command acquires the release lock, freshly recollects the prerequisites, re-runs preflight,
atomically admits the exact run/SHA only on GO, and transfers that same held lock to one watcher.
The watcher owns a kernel-locked open descriptor and passes that same descriptor to every release
and recovery subprocess. Mutation entry points verify the descriptor's exact lock-file inode and
kernel lock plus the persisted run/SHA/revision/in-flight phase before authentication or dispatch.
A command-line flag or environment boolean cannot substitute for this capability. Direct mutation
commands without the inherited descriptor refuse. Script children load TypeScript in the same
process; nested provider commands share its process group, so aborts and timeouts terminate the whole
group. A crashed parent cannot free the lock while an inherited child still exists. Treat a busy lock
with no watcher as unresolved child work; diagnose its process and provider state before resuming.
Do not use a separate lock-free check followed by an unguarded launch. Scheduled/manual entry points
independently validate the permit; one durable application-build claim prevents a second Cloud Build
for the run. The completed permit is consumed. Documentation-only commits do not deploy.

Each phase advances only on independent readback:

1. Prepare the clean exact-head checkout and original 100% traffic baseline.
2. Prepare the recovery-only revision before the application build. Preserve the original predecessor's
   full immutable configuration and resolved image digests, change only Sheet=false and revision
   identity, and keep original serving traffic explicit. Persist one target before dispatch and use
   service-version conflict checks. Reuse its already-authorized candidate hostname by bounded tag
   reassignment. Exact Ready/configuration/digest/zero-traffic/unchanged-security readbacks plus guarded
   Admin assurance and monitoring issue a separate immutable supplemental receipt. The original
   baseline and earlier receipts retain their original revision, fingerprint and meaning. No second
   application build or preliminary production promotion occurs.
3. Build one application candidate at zero traffic, smoke its exact identity, capture its fingerprint,
   replace the superseded candidate authorized-domain entry, and pass Admin assurance/reconciliation.
4. Immediately before claiming promotion, re-read the original 100% baseline and prepared recovery
   target's Ready state, digest, configuration and explicit false Sheet flag. The candidate must also
   read false and match its fingerprint. Version 5 candidate/promotion receipts bind the supplemental
   recovery receipt identity/hash to this exact run; historical version 4 receipts remain readable.
5. Promote the one exact candidate and complete the full 300,000 ms observation with required
   checkpoints. Follow status/readback evidence, never optimistic command text.

## If a phase fails

- Preserve every receipt, report, dispatch claim, operation identity and terminal checkpoint outside
  Git. Never turn a failed attempt into a pass or delete a claim to permit another request.
- The watcher exits on a blocked phase and marks explicit operator resume required. The scheduled
  launcher refuses that checkpoint. Diagnose before `node scripts/release-control.mjs --resume`;
  it takes the same lock and same run/target. It cannot mint a second candidate or ignore expiry.
- Authentication expiry requires owner-attended enrollment. A held forward permit still permits
  already-authorized receipt-bound recovery after explicit resume and fresh authentication. The
  runner never enters credentials or changes policy.
- Promotion compensation and observation rollback both invoke the same recovery executor. It accepts
  only the immutable supplemental receipt and prepared Sheet=false target, persists one globally
  shared traffic-attempt claim before dispatch, preserves tag bindings and checks the service etag.
  A lost response is reconciled against that target and stored operation. Unchanged traffic is not
  proof that a request was never dispatched. An unresolved claim never permits blind redispatch.
- No recovery creates a replacement target on demand or restores the original Sheet-enabled revision.
  ROLLED_BACK_VERIFIED requires exact canonical 100% traffic, identity/configuration/Sheet=false,
  guarded Admin assurance and monitoring on the prepared target. Repeated terminal verification is
  read-only. Unexpected traffic, configuration drift or missing evidence remains blocked.
- If a candidate build is ambiguous, read back the existing build/revision; do not create another build.
  Stop if the same phase fails twice for different reasons, the one-batch contract cannot be satisfied,
  or a safety control would need lowering.

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
historical evidence only. Local compiled checks are recorded in the batch audit; remote browser assurance and human verdicts remain NOT RUN.
B-DL1, B-DL2, B-DL3, B-S100, B-MNT1 and B-MNT2 stay open. No release can manufacture their
external inputs, connect Dotloop, activate a closed key or create a client-facing send.
