# Batched release runbook

Updated: 2026-09-29 (UTC). One candidate must ship every queued feature.
**BLOCKED — candidate assurance and date-comparison reconciliation.** Exact target `1fbf8c3d41dc9638f3d37e01e1cab7649b7c2151` passed [CI 36541531783](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36541531783); all thirteen features reached GO. Run `d63f66b3-db02-472e-bd72-11c7e713198c` was admitted at 09:38:37.326Z. The permit is now explicitly **HELD** after preserving an immutable admitted-permit snapshot; operator Resume remains true. Its one application-build claim is already used. No rebuild or resume is authorized while that claim is held; isolated repair work is not deployed.

Recovery's first failure at 09:40:50.710Z remains preserved; its underlying cause was not captured. Separate later readbacks passed cloud readiness, exact configuration and zero traffic, while guarded diagnostics found a tagged-host authentication mismatch. That later diagnosis does not establish the first failure's cause. Approved Google-session reuse restored that host. All 13 guarded routes passed with zero mutations at 09:46:31.802Z. Same-run receipt `57db0431-0f93-4fea-8a71-41d7dda72eab` issued at 09:47:29.810Z for Ready, zero-traffic, Sheet=false recovery revision `pmi-kc-app-recovery-d63f66b3db02472e`, fingerprint `sha256:34490b4330ff3bec3d38da1a81f097a196f4af4d6526abb979f148f542f695d8`.

The one application Cloud Build `ab087fe8-d629-497b-a98c-456dbf843bd4` ran from 09:47:46.710856231Z to 09:51:28.859504Z and read SUCCESS. Candidate `pmi-kc-app-rmumhi7df-f037af48a1fe`, tag `cand-rmumhi7df-f037af48a1fe`, carries the exact frozen SHA and fingerprint `sha256:27aa3df5fe4b36184aaa0f2163eb906ad1a480f182a2a75da48c6dd73a6e1cd8`: zero traffic, Production/Live, Demo=false, Sheet=false. Smoke, fingerprint and domain gates passed.

The watcher blocked at 09:54:53.550Z with `assurance_unverified` and emitted no underlying assurance report; its exact cause is not established. A separate canary using the unchanged script at 09:56:11.788Z–09:57:08.143Z passed 11 routes but timed out desk DOMContentLoaded at 30.006 seconds, recorded two landmark failures and did not run its dependent workspace; mutations and authentication errors were zero. These standalone diagnostics do not prove the watcher's cause. A further serial guarded desk probe at 10:02 passed in 6.338 seconds with zero mutations, without replacing either failure. Reconciliation at 09:58:35.690Z matched all 311 source/projected/rendered identities without missing records, duplicates or invalid destinations, but failed with 307 field mismatches and stable source drift. No candidate assurance receipt, promotion or observation exists.

The aggregate diagnostic at 10:11:29.336Z–10:12:40.060Z preserved that original FAILED/307 verdict. All mismatches were `endDate`; address, owners, tenants and base-rent mismatches were zero. The 311 source rows contained 307 valid ISO dates and four missing dates. Each of the 307 visible dates exactly matched an independent MM/DD/YYYY conversion, and its unique `time[datetime]` exactly matched the source ISO date. Rendered-DOM and other-field mismatches were zero; sources were complete/stable, with zero missing/unexpected/duplicate records or invalid destinations. This establishes the comparator's ISO-versus-display-format mismatch, not an assurance pass. Receipts remain at `~/pmi-kc-work/logs/candidate-reconciliation-field-diagnostic-2026-09-29T101129334Z/report.json` and `summary.json`. Checker repair `4f553dcae4e63eee0cddf9d689cdc8013e79b1a2` passed 63 focused tests, TypeScript, lint and independent review, then the full native gate: 7,244 unit tests passed with four local-config checks intentionally skipped in the clean snapshot, all 232 backend tests passed, required gates passed and production build `_F3DKdqhP0JMBovFiHYn2` completed. Those four unchanged config-key parity checks separately passed against the actual native configuration at 10:31:56.552Z. No credentials were copied into the isolated runner. A corrected-checker read-only diagnostic passed all 311 source/projected/rendered records with zero mismatches at 10:21:46.480Z. The unchanged full canary passed all thirteen routes with zero diagnostics or mutations at 10:22:44.437Z; desk/workspace timings were 9.577/15.428 seconds under unchanged deadlines. These new scoped results preserve every earlier failure and do not issue release receipts, change the admitted candidate or authorize continuation.

The current runner executes assurance and observation from the admitted application's exact checkout and has no separately bound checker-version override. A normal resume cannot substitute this corrected checker for the held 1fb candidate. The one-build claim remains consumed. Owner authorization is required for one replacement cumulative candidate carrying all thirteen features plus the repair, with the failed run preserved and every admission/release gate repeated; no per-feature cycles or receipt edits are permitted. A separate checker-version continuation would require a new reviewed capability and is not implemented.

A replacement is not ready to launch merely by archiving this checkpoint. The current watcher falls back to a historical candidate host when no checkpoint exists, and recovery accepts only a tag bound to the serving predecessor or this same run's recovery. The actual authorized tag now points to the failed 1fb candidate; the old S120 tag points to the old run's recovery. Neither is that serving-predecessor binding. A reviewed bootstrap/recovery correction must select the actual authorized host, verify its current revision and record the true previous tag binding while deriving a fresh recovery revision and receipt from canonical S120. The old recovery receipt must not be reassigned, and the failed checkpoint must not be marked complete or rolled back. This correction is not implemented by the date-checker commit.

Native Node 22 run L passed 7,212 unit tests, 232 backend tests, all gates and build
`MsohNlljqt7KxRmFLb2od`; new core E2E passed 31 tests with 18 intentional skips. Exact-build cold and
corrected desk-warmed notice passed in 15.459/17.456 seconds, and the separate cohort diagnostic
matched all 311 identity/category pairs before/after the notice API. That equality is observational,
not independent lifecycle derivation. Scopes and unchanged failed attempts are recorded in
`docs/evidence/batch-litmus-audit-2026-09-28.md`. Billing is enabled. The thirteen-feature queue stays
intact. The procedural commands below do not authorize continuation of the currently HELD run.
Preserve its frozen head, checkpoint, operator Resume=true and already-used one-build claim; no
second build, new run or watcher resume is authorized while the checker repair is prepared separately.

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

**1. Read billing and cost controls.** At 2026-09-29T07:48:03.544Z billing and exact cost-control validation passed with zero mutations. Billing read enabled on the expected account;
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
checkpoint now belongs to run `d63f66b3-db02-472e-bd72-11c7e713198c`, blocked at candidate assurance
with a HELD permit and an existing successful application-build claim. Preserve its frozen target.
S120 remains the serving baseline. After interlock installation, eleven release files
matched both checkouts, the permit was absent and zero watchers were found at 2026-09-29T02:31:17Z.
The temporary installation hold was released and the kernel lock read free; direct admission still
refused. The scheduled task remains Ready and unchanged. Recheck because stopped processes do not disable
the task. An unfinished checkpoint still pins the watcher to its SHA; inspect any new state before
archiving or resetting it.

**3. Verify approved authentication.** Fresh WSL CLI/ADC enrollment and binding for
`josiah@pmikcmetro.com` completed 2026-09-29T09:18:39.478Z. One owner-approved WSL restart resolved
the invisible WSLg window; headed Admin enrollment verified role Admin/human_completed at
09:34:11.947Z and post-restart probes passed. Approved Google-session reuse subsequently restored
the tagged recovery host. Expired authentication is not the current blocker. The earlier stale
enrollment and failed guarded read remain preserved. HTTP 200 alone is not authenticated assurance. Run `npm run auth:ensure`
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

An earlier session expired under nine hours. Ordinary refresh readiness does not waive the
preflight's seven-hour enrollment budget; a release must begin within it. An expired rollback
remains held until authentication returns. The separate 24-hour longevity proof remains open.

**4. Prepare the exact repaired batch.** Run L's full native gate, repair core E2E and affected
compiled checks passed. Exact `1fbf8c3d41dc9638f3d37e01e1cab7649b7c2151` CI 36541531783 and thirteen-feature
GO admitted the frozen run at 09:38:37.326Z. Its one build succeeded and its candidate now waits on
assurance/reconciliation. Current continuation is explicitly held. Any proposed repair/continuation
must reconcile the frozen target, receipts and one-build claim before separate authorization;
do not prepare a replacement run or rebuild automatically. Keep all thirteen entries until remote delivery is verified.

The 08:00:40.289Z preflight found thirteen features/current `a5d5791c` watcher target, aligned
checkouts, native runner READY, free lock/zero watchers and Sheet pause/Demo flags READY. It remained
held for missing permit/fresh prerequisites, 11.1-hour enrollment and then-in-progress CI. Later CI
success did not replace that failed verdict; fresh GO later admitted the exact frozen run above.
Missing collector evidence was not a finding of disabled billing.
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
   The reviewed local helper SHA256 is
   `0391875f006934b8b8ddd77973bd00cf8a1ca3fb8b84bf213d1802a40cf8a930`.
   Its corrected map check requires eleven nonempty entries in each exact Space map with matching
   keys, plus the unchanged runtime fingerprint and Sheet=false gates. Twenty-four synthetic
   sanitizer checks passed; the original variable-count defect and helper bytes remain preserved.
2. Confirm canonical/tagged identity, exact 100% traffic and fingerprint, exactly one candidate
   authorized domain, and revision env production/live with ASK_DEMO_MODE=false and
   LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false. Read service identity, maps and bindings independently.
3. Only after these pass, update facts, loop-state, status, plan and environment-handoff to the
   actual release evidence and clear the Awaiting release queue.
4. Run the pinned environment-handoff-provider-table and plan-status-sync tests, prettier and
   document gates; commit/push documentation-only closure. It must not trigger another deployment.

Current batch candidate assurance is BLOCKED; no passing candidate assurance receipt exists.
Prepared recovery assurance/receipt passed, while promotion and observation remain NOT RUN.
The old S120 receipts remain historical evidence only. Local compiled checks retain their exact
scopes in the batch audit; human verdicts remain NOT RUN.
B-DL1, B-DL2, B-DL3, B-S100, B-MNT1 and B-MNT2 stay open. No release can manufacture their
external inputs, connect Dotloop, activate a closed key or create a client-facing send.
