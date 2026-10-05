# PMI KC current status

Last updated: 2026-10-05 (UTC).

## Serving release

Run `7753e5f5-2325-4b19-b83d-dc3475d71b0b` released the batch 005 follow-up fixes (S173, S169, S170, S172 and S87; five queued items)
at `b2308bc506132853ebd54e4ba0678abbf853fce0` / `pmi-kc-app-rmuv84r3a-f9fac2efc1af` with 100% production traffic.
Code slice `5261563e7f21651333c2be3925953b1a38231349` (PR #133) carries the fixes and their fail-first regressions.
Exact [CI 37308062054](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/37308062054) passed.
The fixed tree passed 8,774 unit tests, four existing configuration skips, all 325
backend tests, zero production audit findings, all required checks and the production build.
Core E2E passed 32 tests with 22 existing configuration skips.
One application build `26be4261-a782-434b-851d-cc3327fa44f7` succeeded at 2026-10-05T12:42:00.650833Z.
Candidate receipt `2fcac9b1-949d-41ff-9a72-92ed1b1dd44e` issued 2026-10-05T12:47:07.997Z;
promotion verified 2026-10-05T12:47:30.209Z.
Observation passed two checkpoints in 390,684 ms against the required 300,000 ms,
inside the 420,000 ms deadline. All 312 source/projected/rendered records matched with
zero discrepancies, candidate 5xx or unresolved live effects. All eleven independent readback
sections matched, completed 2026-10-05T12:54:10Z.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=true are verified.
Tag `cand-rmuv84r3a-f9fac2efc1af`; fingerprint `sha256:7d48dfce165dd3ca022a1f2d84fe17b4ef360b36728b93200af94f9b9bbd3857`.
Captured predecessor: `9e76c14f5238f22be9ddecbffed149eee3db6d38` / `pmi-kc-app-rmuv5c6eu-e3c268629df8`,
Sheet=true. Run-bound recovery `pmi-kc-app-recovery-7753e5f523254b19` preserves that actual configuration;
receipt `c20682b1-13bb-4fa9-aebb-2d81fb4b5cce`, reference hash `sha256:e09ff997a705dde2b27bc15e082bb2fb211fa815ebffd8f5ce7c37a4aef01f06`.
No traffic rollback or business mutation was used as proof. The first recovery assurance failed at
2026-10-05T12:30:28.033Z and remains failed in immutable evidence: the new recovery instance took 33.0 s
for its first Dashboard render against the 30-second route bound, with every request answered 200. Two separate
guarded 13-route diagnostics passed and the same run resumed on the existing target.
Batch 005 (S168–S175, revised S87 and S176–S181; intake 035–049) was released by run
`8b7dc3f1-4c5b-482a-94ca-26985150c68d` at `fa5b2b27bbfbe13e7f0a9e70367cb3e727fe5a27`, and run
`5d1b4e3a-ef6d-4354-aef1-e9952dd28687` released its first four verification repairs at the captured predecessor.
Batch 005's 116 requirement records are in [native evidence](evidence/application-usability-batch005.json);
independent verification of it is recorded in F-BATCH-005-VERIFICATION.
The five-item queue is delivered and empty; the exact permit is consumed.
Editor browser coverage remains `not_run` under the approved Admin-only contract.
Human verdicts: **NOT RUN — no human observer**.

Independent verification on 2026-10-05 reproduced the gates, compiled checks and serving readbacks
and passed a guarded 13-route production canary. It also found released defects, recorded in
F-BATCH-005-VERIFICATION. Repairs merged in PR #130 and were released by run `5d1b4e3a` on
2026-10-05. Follow-up fixes for several items left open merged in PR #133 and were released by
run `7753e5f5` the same day. Fixes for the items still open merged in PR #136 and are queued in
docs/loop-state.md.

## Current operational maintenance

Request 001, governance simplification and unattended authentication renewal, was authorized for
direct implementation and mainline merge. Focused tests passed. A fresh WSL unattended auth probe
verified both CLI and ADC refresh under the approved managed identity, and a read-only Cloud Run
describe confirmed the documented serving revision still has 100% traffic. The reported eight-hour
failure remains a user observation, not a verified token lifetime. The mandatory production audit
required three patched transitive dependency overrides; its then-current audit had zero production
findings. The earlier full local gate passed 7,470 unit tests (four existing skips), 234 backend tests, all
policy checks and a production build. PR #92 merged at `41ad65cb` on 2026-09-30. Its release run
built a zero-traffic candidate and blocked at assurance when live renewal routes exceeded the
30-second canary navigation bound; production traffic did not change. By owner decision on
2026-10-01, PR #107 applied PR #93's 60-second bound to those two routes (PR #93 was closed
unmerged), and run `ab803f8a` released request 001 with batches 002 and 003.
During batch 003 intake, a fresh mandatory production audit failed on four high
`@grpc/grpc-js` findings in Firebase's dependency chain. PR #95 overrode `@grpc/grpc-js` to the
patched 1.14.5 and merged at `dc493dfe` after its full gate and exact CI passed. On 2026-10-01 a fresh audit found a
Hono advisory; PR #104 patched it and merged at `f449520e` after the same gates.

## Feature intake

Batch 005 (application-usability-reliability-2026-10) is verified deployed under the October 4
named owner launch: fifteen specs, 116 requirements, intake 035–049. Final focused selection passed
781 checks/104 owner files. Native full 14 passed 8,753 unit/four existing skips/325 backend, zero
audit findings, all policies and production build; core 12 passed 32/22 existing configuration skips.
Compiled matrix 19 passed 438 observations/eight journeys/168 axe audits, zero violations/errors;
six-owner recovery 6 passed 18 observations/126 intercepted attempts with zero effects. Additional
publication recovery passed six width/theme observations/18 intercepted actions, retaining the
unknown post-commit conflict fence and the full wrapping preview hash. Identity lookup/verified
shortcut, complete tables, dock/mobile/focus and private-view CAS journeys passed.
All fifteen finalized owner-supplied spec bytes remain unchanged. Failed/superseded attempts retain
their actual evidence. Private-view expiresAt TTL read back ACTIVE; runner wrote no app record.
[Native evidence](evidence/application-usability-batch005.json) records all 116 verified engineering
traces, exact-main CI 37250383538, one cumulative release, full observation/independent readbacks
and end feedback. The fifteen-item queue is empty and its exact-run permit consumed.
Human verdicts: NOT RUN — no human observer. Rental permits, move-out business workflow redesign
and the public website shortcut remain deferred.

Batch 002 requests 002–008 are recorded in supplied order as S135–S141. On 2026-09-30 the owner
explicitly instructed their execution, then batch 003's, through implementation, mainline merge
and deployment. The owner clarified 006–007 as all existing workflow-linked
draft screens. S136 merged via PR #96, S135/S137/S138 via PR #98 and S139/S140 via PR #99
(`f43629aa`); each slice passed its full local gate and exact CI. S141's local rehearsal matched
Dashboard answers to the desk's own filtered views and recorded 43 real model calls served by
`gemini-3.1-flash-lite`. Since the release, the serving revision reads `gemini-3.1-flash-lite` on the
global location for answer and classify; production inference was not run.
The overlapping old S88–S93/S101 assistant plans are superseded for this scope. No batch 002
application effect or provider activation has occurred. Its release run
`6eb157e1-73e6-4e36-8a66-998cd06f31f3` (admitted at `b1c6135c`) resumed after the owner's canary
enrollments and blocked at recovery assurance: the live renewal desk took about 30 seconds against
the canary's 30-second bound. Production traffic did not change. On 2026-10-01 the owner decided to
apply PR #93's 60-second bound to the two live renewal routes and to ship batches 002 and 003 in one
cumulative replacement run, which released them as run `ab803f8a-4ffb-4568-9178-05ccb588a94c`.

Batch 003 requests 009–012 are recorded in order as S142–S145 under the same instruction.
Implemented and merged: S142 (PR #101, `f5368c2f`), S143/S144 (PR #102, `884b7759`), S145 (PR
#103, `752d7dda`) and the acceptance run's repairs and production Focus check (PR #105,
`ef7e0956`). Tested: every local FV criterion passes at unit, backend or local
compiled-browser level (`docs/evidence/renewal-focus-batch-003-validation-2026-10-01.md`). Live-verified: released with batch 002
in run `ab803f8a`, and the read-only production Focus check passed on three live lease workspaces
with zero mutation attempts. Unverified: live staff-record saves, live Gmail and provider effects
from Focus, and human verdicts.

Batch 004 requests 013–018 are recorded in order as S146–S151 and were executed on 2026-10-01
under the owner's explicit start. Implemented and merged: S146/S147 (PR #111, `87d6fd7c`), S148
(PR #112, `fe78b0c9`), S149/S150 (PR #113, `129c833e`) and S151's checks and live-check script
(PR #115, `85524308` and `404abdf3`). Tested: each merge head passed `verify.sh` and
`test:e2e:core` on its exact commit; the AF-01 to AF-70 ledger in
`docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md` records the unit, backend,
E2E and compiled-browser results. Live-verified: interim run `98f7e743` released S146–S148 by
owner direction for a client call and run `729d5716` released S149–S151; the owner's bounded live
check passed on `pmi-kc-app-rmuq2qvcc-8074bfd97707`. AF-67 (one cumulative candidate) is No by that owner direction.
Unverified: human verdicts, and live knowledge answers inside the live check (its guard refuses
`/api/ask`). Independent verification on 2026-10-02 reproduced the readbacks, the live check's
bodyless log counts and each suite's key behaviour (one falsification per suite). It also ran the
full gate on the three docs-only merge heads (PRs #114, #116 and #117), which had merged on docs
gates and exact CI only; each passed (2316dbb7 on its third run, after two failures of the known S113 journey flake). It corrected the stale records listed in the
ledger. On 2026-10-02 run `0eb2cfeb` released the corrective repair (after run `175fee1d` rolled back
verified): the S147 Dashboard lease read order that had consumed the release-check margin, and
answer-position checks in the S151 smoke.

S152–S167 (lease-renewal simplification and mobile) were executed on 2026-10-02 under the
owner's execution prompt. Implemented: all sixteen suites on one branch at `ba3f9719`, extending
the deployed owners (Focus default and selected view controls; operational current rent with
charge evidence; every lease workable with the work record established on the first actual save;
per-field autosave; the staff lane with no forced stages or business approvals; lease-bound
working values with visible differences; operator Sheet row and cell lookup; the reviewed S159
switch value true for candidate and promoted revisions; ordinary-staff supported source updates
with exact confirmation; editable marked messages, as-displayed copy and unsent Gmail drafts,
first-name greetings; the autosaved Status log; whole-app mobile layout and the phone sign-in
repair; actual lease links and account-durable desk preferences; existing internal Spaces open to
ordinary staff with Admin management, Vendor scope, verification restrictions and private records
kept). Merged to main at `8babc814` (PR #126). Tested: the full unit, backend and core E2E gates
on the tree-identical head `0c5391c8` (8,531 unit, 319 backend, 32 core E2E; docs/facts.md), exact
main CI 37105832848, a fresh-context review with five repairs on 2026-10-03, the production reconciliation oracle under the `s156-staff-lane` row contract,
and fail-first logs for each slice outside Git. Released on 2026-10-03 by run `47fabb7c` at
`e106a88a`, after run `a83ed59b` stopped at candidate assurance on the release canary's Full view
contract (corrected in PR #128). Live-verified: the release assurance (13 routes, 312 records
reconciled under the `s156-staff-lane` contract), eleven independent readbacks and a read-only
production Focus check on three lease workspaces. Unverified: human verdicts (NOT RUN, no human
observer), a physical phone sign-in, and the optional same-tab redirect, which needs owner step A7.

## Verified corrective review

Five confirmed adversarial findings are repaired and verified deployed: lifecycle uncertainty, policy calendar validation/presentation, source-upload hygiene, vulnerable production dependencies and return-navigation transport. All repairs passed focused regressions, full application verification, exact main CI and cumulative release gates. Independent source/runtime readbacks and all six guarded remote product checks passed. The same runner performed the authorized repairs; this is not an independent second-review signoff. See [the adversary review](evidence/adversary-review-2026-09-29.md).

## Delivered batch

Run `47fabb7c` delivered the S152–S167 program, run `3a32f7a2` the S113 approval-read fix, run
`0eb2cfeb` batch 004's corrective repair, runs `98f7e743` and `729d5716` delivered
S108 and batch 004 (S146–S151), and run `ab803f8a`
request 001 and S135–S145 (see Feature intake). Run
`89e38cd9-b6dd-498f-be87-1963e0ed2d03` at `c541db72` delivered the thirteen-feature batch below:

- S128: Historical operating-Sheet pause, superseded by released S159; normal updates retain exact contracts.
- S123: Retain unfinished renewal cycles when source dates change.
- S124: Review move-out notices and prevent non-renewal outreach.
- S134: Show, sort and filter color-coded lifecycle status with text labels.
- S122: Expose all authorized leases and explicit worklist views.
- S125: Review notice timing using an explicitly approved date basis.
- S126: Present dates consistently as month/day/year.
- S127: Explain blockers and focus the next permitted action after a verified save.
- S131: Prepare conditional Rhino-policy support for approved material.
- S129: Prepare governed owner/tenant drafts for real-case review.
- S130: Prepare approved form bytes, comparison, download and exact-output approval.
- S132: Prepare walkthrough preflight, scripts and evidence recording.
- S133: Provide the bounded external maintenance-agent assessment and decision packet.

## Verification

For the thirteen-feature batch, the final application gate passed 7,462 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

## Remaining operational dependencies

External and human holds (Dotloop B-DL1–B-DL3, B-S100, B-MNT1, B-AUTH2, the notice-timing
basis, the release Admin browser sign-in and human verdicts) are listed once, with their exact
owner steps and runner follow-ups, in `docs/open-blockers.md`. Each blocks only its named effect;
none blocks development, tests, merges or releases.
Historical K unit-store target/marker effects remain UNVERIFIED; absent Data Access logs do not
prove zero effects. S121 was excluded.

The permits of runs `ab803f8a`, `98f7e743`, `729d5716`, `0eb2cfeb`, `3a32f7a2`, `47fabb7c`,
`8b7dc3f1`, `5d1b4e3a` and `7753e5f5` are consumed; run `175fee1d` rolled back verified on 2026-10-02 and run `a83ed59b` stopped before
promotion on 2026-10-03, and their permits are archived as superseded. The Awaiting release
queue holds the seven open-item fixes. No original receipt, completed permit or build claim is
reused.
