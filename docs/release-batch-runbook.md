# Batched release runbook

Updated 2026-10-05 (UTC). One candidate must ship every queued feature.

The owner’s 2026-09-29 batch-scoped completion authorization is recorded in AGENTS.md. It permits
necessary Cloud Build/Cloud Run actions, diagnosed and verified repairs, resumes/replacements,
promotion, receipt-bound rollback and documentation closure through verified deployment of all
thirteen features. It supersedes per-attempt approval counts while retaining every technical and
safety gate. No source, checkpoint or receipt from a failed attempt may be rewritten as success.

Run `e372f7b5-3a1d-4224-945e-148a5f040660` released the release-tooling and audit follow-up (two queued items) at
`337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1` with 100% production traffic.
S51 (`717eb9ae`, PR #146) warms a possibly cold revision before each candidate, recovery
preparation and rollback canary, predecessor baseline and candidate smoke measures it, and the
post-promotion observation now decides by 480,000 ms. S54 bounds the Firestore lane for
transaction contention (`b680dd6e`, PR #145) and moves Next.js to the patched 16.3.8 for six
production audit advisories (`ea79bbbf`, PR #147).
Exact [CI 37747457191](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/37747457191) passed.
The release head passed lint, typecheck, format, 9,011 unit tests with four existing
configuration skips, all 340 backend tests and the production build; core E2E passed 32 tests with
22 existing configuration skips. The production audit reports zero findings. No phase paused: the
recovery preparation, candidate smoke and canaries ran their warm-ups and passed on the first attempt.
One application build `6e3cdead-5c8b-4c68-89cd-5d34617d87bb` succeeded at 2026-10-08T08:25:18.918163Z.
Candidate receipt `caaf4096-637a-4534-a998-3eaa567779c2` issued 2026-10-08T08:30:41.068Z;
promotion verified 2026-10-08T08:30:59.978Z.
Observation passed two checkpoints in 389,677 ms against the required 300,000 ms,
inside the 480,000 ms deadline. All 318 source/projected/rendered records matched with
zero discrepancies, candidate 5xx or unresolved live effects. All eleven independent readback
sections matched, completed 2026-10-08T08:37:49Z.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=true are verified.
The revision keeps the reviewed Dotloop client configuration with the client secret bound from
Secret Manager version 1. Both Dotloop write keys stay closed.
Tag `cand-rmuz9g28p-0a2909d490e1`; fingerprint `sha256:a52280044bfad3bbf657d03836fedb5c275ec581f6f346bba419d3e341f36960`.
Captured predecessor: `5ee574b2fba81c83fa63086496d7f2ebb299268c` / `pmi-kc-app-rmuybjtnr-f43dfa3d6d26`,
Sheet=true. Run-bound recovery `pmi-kc-app-recovery-e372f7b53a1d4224` preserves that actual configuration;
receipt `8302e68a-646e-4a1b-9abd-5c277e7ed4ad`, reference hash `sha256:2110c8a111f007999009daf4891a8c5d22a4a116cd327fca4c3c19e46e25974b`.
No traffic rollback or business mutation was used as proof.
The bounded live S106 connection check passed on 2026-10-07; the renewal template waits on a full
Dotloop admin and resource selection on the owner (B-DL2, F-DOTLOOP-ADMIN-RIGHTS).
Run `5622decd-0a6d-479a-bb75-545ba4aa0069` released the S130 stale-value follow-up at the captured predecessor;
run `87920129-23c0-4420-a787-13036029d6f8` released the Dotloop PDF renewal v1 second release (S182, S66, S130 and S34),
run `5b5c850e-a131-4e37-996a-457f5f9fd62c` the S106 connection slice and run
`61659874-478d-4135-9810-5033b2f732bf` the batch 005 open-item fixes.
Batch 005 (S168–S175, revised S87 and S176–S181; intake 035–049) was released by run
`8b7dc3f1-4c5b-482a-94ca-26985150c68d` at `fa5b2b27bbfbe13e7f0a9e70367cb3e727fe5a27`; runs
`5d1b4e3a-ef6d-4354-aef1-e9952dd28687` and `7753e5f5-2325-4b19-b83d-dc3475d71b0b` released its verification repairs and follow-up fixes.
Batch 005's 116 requirement records are in [native evidence](evidence/application-usability-batch005.json);
independent verification of it is recorded in F-BATCH-005-VERIFICATION.
The two-item queue is delivered and empty; the exact permit is consumed.
Editor browser coverage remains `not_run` under the approved Admin-only contract.
Run `47fabb7c-b26b-4032-b993-f6bc49c66abd` released the S152–S167 program at `e106a88a50d541b4a012111019b09c2183f6ce20` on 2026-10-03; run `8b7dc3f1-4c5b-482a-94ca-26985150c68d` released batch 005, run `5d1b4e3a-ef6d-4354-aef1-e9952dd28687` its first verification repairs, run `7753e5f5-2325-4b19-b83d-dc3475d71b0b` its follow-up fixes and run `61659874-478d-4135-9810-5033b2f732bf` its open-item fixes on 2026-10-05; run `5b5c850e-a131-4e37-996a-457f5f9fd62c` released the S106 connection slice, run `87920129-23c0-4420-a787-13036029d6f8` the Dotloop v1 second release and run `5622decd-0a6d-479a-bb75-545ba4aa0069` the S130 stale-value follow-up on 2026-10-07; all remain carried.

Run `e372f7b5` (the release-tooling and audit follow-up, after run `5622decd` shipped the S130 stale-value follow-up,
run `87920129` the Dotloop v1 second release, run `5b5c850e` the S106 connection slice, run `61659874`
the batch 005 open-item fixes, run `7753e5f5` its follow-up fixes, run `5d1b4e3a` its verification
repairs and run `8b7dc3f1` batch 005) is complete, its permit consumed and its queue empty.
Original completed runs remain preserved separately. This retained procedure does not authorize
a new dispatch or reuse of a consumed permit; future authorized work requires current gates.
The September 30 runner correction removes the former fixed thirteen-suite and seven-hour
enrollment-age preflight assumptions. An explicitly authorized future batch still needs its own
nonempty exact Awaiting release queue, ancestral commits, fresh CLI/ADC/browser prerequisites,
new run-bound permit, lock, receipts and all release readbacks. Completed runs remain historical
evidence and cannot be re-admitted.

## Authorized replacement preparation

The owner authorizes diagnosed and verified repairs, resumes and cumulative replacements through
verified delivery of all thirteen features, without another decision solely for attempt counts.
Every existing technical and safety gate remains. Preserve failed evidence byte-for-byte;
never substitute source or a receipt in the frozen run. S121 remains excluded.

1. For an authorized future repair, independently review the diagnosed correction. Retain the tested new-run entry
   against the actual existing authorized host, including a host currently bound to the failed
   candidate, changed or ambiguous tag bindings, unchanged canonical traffic and refusal before
   mutation on mismatches. Preserve the exact checker, one-build and receipt contracts.
2. Run the full corrected-tree gate, affected process/lock/recovery checks and exact-head main CI.
   Existing application/browser evidence retains its exact source/build scope; perform the new
   candidate's complete guarded route/reconciliation checks before promotion. No historical pass
   substitutes for the new run's receipts.
3. Under the release lock, prove no watcher, child process or cloud operation remains unresolved.
   Preserve the failed checkpoint, permit in its actual state, build claim, operation identities, original baseline,
   recovery receipt and all reports byte-for-byte with an explicit superseded-by-authorized-
   replacement record. Archive only through the reviewed procedure; do not rewrite the old verdict
   as complete or rolled back, clear its claim, or reuse its receipt for the new run.
4. Require the admitted watcher's bootstrap to re-read canonical 100% traffic and the unique
   already-authorized candidate host's actual tag/revision binding, then persist them separately
   before its preparation phase. Operators must not fabricate that checkpoint. The new intent must retain
   the actual previous tag revision through replay, while cloning only canonical configuration
   and resolved image digests. Verify the source revision/configuration,
   unrelated tags and service version before the new run's bounded recovery preparation. Unknown,
   missing, ambiguous or changed bindings refuse dispatch; no historical hostname is a fallback.
5. Prepare one new run for the exact current main SHA and all thirteen suites. Collect fresh
   authentication, billing/cost and environment evidence; require preflight GO and locked admission
   through the existing one-watcher path. Prepare a new recovery target/receipt that keeps the
   canonical predecessor's actual configuration; verify Admin readiness on canonical and the exact recovery origin
   before its guarded canary. Then build one replacement application candidate. The batch-scoped owner amendment
   permits diagnosed and verified replacements without a new decision solely for another attempt.

## Delivered scope

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

Exact implementation provenance and receipts remain in the shared batch audit and Git history.
The completed run `89e38cd9-b6dd-498f-be87-1963e0ed2d03` carried all thirteen features in one application build and candidate.
Run `ab803f8a-4ffb-4568-9178-05ccb588a94c` later carried request 001 and batches 002–003 (twelve queued items) in one build and candidate.
Batch 004 shipped in two candidates by owner direction: run `98f7e743-7345-4b74-a6a8-675fe9fac31f` (S108, S146–S148) and run `729d5716-bc5e-4e61-9932-c9107d1954f2` (S149–S151).
Run `0eb2cfeb-a238-4b37-b35f-f999eadfacff` then carried batch 004's corrective repair (two queued items) in one build and candidate, after run `175fee1d` rolled back verified.
Run `3a32f7a2-fd58-4652-b519-5a31517b0142` carried the S113 approval-read fix. Run `47fabb7c-b26b-4032-b993-f6bc49c66abd` carried the S152–S167 program (one queued item) in one build and candidate, after run `a83ed59b` stopped at candidate assurance and was archived as superseded.
Run `8b7dc3f1-4c5b-482a-94ca-26985150c68d` carried batch 005 (fifteen queued items), run `5d1b4e3a-ef6d-4354-aef1-e9952dd28687` its verification repairs (four queued items), run `7753e5f5-2325-4b19-b83d-dc3475d71b0b` its follow-up fixes (five queued items), run `61659874-478d-4135-9810-5033b2f732bf` its open-item fixes (seven queued items) run `5b5c850e-a131-4e37-996a-457f5f9fd62c` the S106 connection slice (one queued item) run `87920129-23c0-4420-a787-13036029d6f8` the Dotloop v1 second release (four queued items) run `5622decd-0a6d-479a-bb75-545ba4aa0069` the S130 stale-value follow-up (one queued item) and run `e372f7b5-3a1d-4224-945e-148a5f040660` the release-tooling and audit follow-up (two queued items), each in one build and candidate.
The cumulative corrective queue is cleared after independent verification. An empty queue refuses fresh admission; docs/loop-state.md records the completed state.

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

**2. Verify the watcher and checkpoint before any start.** Current run `e372f7b5-3a1d-4224-945e-148a5f040660` is complete,
its permit consumed and its original receipts preserved. The stale S128-only checkpoint and later
failed cumulative attempts were archived through checked retirement; none was relabeled a pass.
Blocked runs `dc4e1ac8`, `6eb157e1` and `a83ed59b` were archived the same way as superseded.
Never overwrite an unfinished checkpoint or clear a build claim. Before another authorized run,
prove no watcher, inherited child or cloud operation remains unresolved, preserve every original
checkpoint/permit/claim/receipt under the release lock, and verify actual traffic/tag bindings.
An unfinished checkpoint pins its exact SHA. The existing scheduled task remains unchanged and
cannot dispatch with a consumed permit; a stopped process alone never establishes the hold.

**3. Verify approved authentication.** Fresh approved CLI/ADC browser enrollment and identity
binding passed at 2026-09-29T20:23:16.794Z; approved-store refresh passed at 20:23:20.424Z.
Guarded Admin readiness passed before locked admission. Earlier enrollment timeouts and stale-age
verdicts remain preserved. Run `npm run auth:ensure` and the guarded browser check when resuming.
HTTP200 alone does not verify authentication. A genuine challenge requires the owner's attended
step; never enter a password, code, passkey or CAPTCHA:

```bash
npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com
```

That helper skips enrollment while the existing tokens refresh. A timestamp alone does not require
forced browser login or establish freshness. The owner completes a genuine Google challenge, then
`npm run auth:ensure -- --unattended` verifies CLI and ADC before the dependent phase resumes.
Verify Admin browser readiness separately; CLI/ADC readiness does not establish the application's
browser session. An expired rollback remains held until authentication and exact recovery readback
return. The separate 24-hour longevity proof remains open.

**4. Prepare only an authorized current batch.** An empty queue must refuse admission. This
corrective review is complete; any future explicitly authorized batch requires reviewed scope, green
exact-main CI, fresh prerequisites, compatible
checkpoint and actual lock ownership. Never reuse this consumed permit, one-build claim or receipt.
The local interlock refuses missing, malformed, held, expired, consumed or wrong-head permission
before dispatch. Preserve actual tag binding independently of canonical traffic.

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
receipt remain outside Git. Unknown or stale evidence is not GO. Require explicitly queued ordered
items, all queue commits ancestors of the head, equal native/Windows/remote main SHAs,
exact green push CI, both ignored env files in both checkouts with Demo explicitly false and the
operating-Sheet switch at the reviewed candidate value, a compatible
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
   full immutable configuration and resolved image digests, including its actual operating-Sheet
   switch value, change only revision identity, and keep original serving traffic explicit. A
   predecessor whose switch value cannot be read refuses. Persist one target before dispatch and use
   service-version conflict checks. Reuse its already-authorized candidate hostname by bounded tag
   reassignment. Exact Ready/configuration/digest/zero-traffic/unchanged-security readbacks plus guarded
   Admin assurance and monitoring issue a separate immutable supplemental receipt. The original
   baseline and earlier receipts retain their original revision, fingerprint and meaning. No second
   application build or preliminary production promotion occurs.
3. Build one application candidate at zero traffic, smoke its exact identity, capture its fingerprint,
   replace the superseded candidate authorized-domain entry, and pass Admin assurance/reconciliation.
   The two live renewal routes have a 60-second navigation bound because their current source reads
   can complete after 30 seconds. Every landmark, guarded-browser diagnostic, exact version, and
   reconciliation check remains required; all other routes keep a 30-second navigation bound.
4. Immediately before claiming promotion, re-read the original 100% baseline and prepared recovery
   target's Ready state, digest, configuration and the predecessor's recorded Sheet switch value. The
   candidate must read the reviewed candidate value and match its fingerprint. Version 5 candidate/promotion receipts bind the supplemental
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
  only the immutable supplemental receipt and its prepared target, persists one globally
  shared traffic-attempt claim before dispatch, preserves tag bindings and checks the service etag.
  A lost response is reconciled against that target and stored operation. Unchanged traffic is not
  proof that a request was never dispatched. An unresolved claim never permits blind redispatch.
- No recovery creates a replacement target on demand or rewrites the predecessor's Sheet switch value.
  ROLLED_BACK_VERIFIED requires exact canonical 100% traffic, identity/configuration, the recorded
  predecessor Sheet switch value, guarded Admin assurance and monitoring on the prepared target. Repeated terminal verification is
  read-only. Unexpected traffic, configuration drift or missing evidence remains blocked.
- If a candidate build is ambiguous, read back the existing build/revision; do not create another build.
  Attempt counts alone require no new approval under the batch-scoped owner amendment. Diagnose
  and verify repairs before resuming or replacing; never bypass a gate or redispatch an unresolved
  operation. Stop for an unshippable cumulative batch or a required safety/authority change.

## After verified completion

1. Run `bash ~/pmi-kc-work/scripts/s120-readbacks.sh <head-sha> <revision>`. Review the helper for
   safe field selection; never print raw Identity Platform configuration or provider/customer data.
   The reviewed local helper SHA256 is
   `844a715ae23409606b9041f0b1b0f809297910eff9a9acd22470ee7ec28dc4e8` (the S159 revision: its
   Sheet gate expects the reviewed candidate value true; the prior helper
   `0391875f006934b8b8ddd77973bd00cf8a1ca3fb8b84bf213d1802a40cf8a930` expected false).
   Its corrected map check requires eleven nonempty entries in each exact Space map with matching
   keys, plus the unchanged runtime fingerprint and the Sheet switch gate. Twenty-four synthetic
   sanitizer checks passed; the original variable-count defect and helper bytes remain preserved.
2. Confirm canonical/tagged identity, exact 100% traffic and fingerprint, exactly one candidate
   authorized domain, and revision env production/live with ASK_DEMO_MODE=false and
   LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED at the reviewed candidate value. Read service identity, maps and bindings independently.
3. Only after these pass, update facts, loop-state, status, plan and environment-handoff to the
   actual release evidence and clear the Awaiting release queue.
4. Run the pinned environment-handoff-provider-table and plan-status-sync tests, prettier and
   document gates; commit/push documentation-only closure. It must not trigger another deployment.

The combined request 001 and batch 002 + 003 release is complete. The retained procedure does not reopen its queue or
renew permission. Failed predecessors retain their exact reports and claims. External and human
holds live in `docs/open-blockers.md`; they do not alter the completed implementation or release
verdict.

## October operations Communications prerequisite

For the reviewed S183/S189–S192 configuration, the existing watcher assurance phase invokes
`scripts/communication-worker-assurance.mjs` before issuing the candidate receipt. The permanently
paused `pmi-kc-communication-worker-readiness` Scheduler job uses only GET and the existing managed
runtime service identity. A unique durable invocation is bound to the candidate origin/revision;
only its exact successful readiness log and a read-back restored canonical target pass. No
sequence is constructed, occurrence claimed, customer message sent or test production record made.
A failed/uncertain invocation remains consumed and holds for exact reconciliation. The ordinary
Communications browser canary also requires its real read-only managed-mailbox connection.

Keep the actual `pmi-kc-communication-sequence-worker` dispatch job paused until the candidate gate,
assurance and exact promotion pass. Resume/read it back only for the promoted implementation under
the approved schedule contract; no existing draft, old backlog or migrated record gains authorization.
The generic Gmail send and both Dotloop write keys remain closed. Every resulting configuration
mutation and readback stays in the same run evidence; the five pending outcomes remain in the program.

Both reviewed worker environment fields are mandatory before candidate assurance. Missing, partial
or unreadable configuration holds before browser auth/subprocesses; it cannot skip the managed
probe. A configured job alone is not its service-authentication/readback proof.
