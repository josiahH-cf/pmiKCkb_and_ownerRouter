# PMI KC current status

Last updated: 2026-10-02 (UTC).

## Serving release

Run `729d5716-bc5e-4e61-9932-c9107d1954f2` released batch 004's S149–S151 (three queued items) at `1402e51b4828d407f990a675f16e6a7ba47afb7b` / `pmi-kc-app-rmuq2qvcc-8074bfd97707` with 100% production traffic.
Interim run `98f7e743-7345-4b74-a6a8-675fe9fac31f` released S108 and S146–S148 earlier the same day at `2b53c5d5` /
`pmi-kc-app-rmupw50tc-8189b32d3395` by owner direction, so batch 004 shipped in two candidates.
Exact [CI 36929714817](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36929714817) passed.
Run `0aa79bfe` first carried the same code at `19d4590a`; its observation could not finish inside the 420 s evidence deadline, so it rolled back (verified, no downtime).
The gate on PR head `d5b6967b` (the release head adds only that rollback record) passed 7,887 unit tests, four existing skips and all 273 backend tests.
One application build `a3736e14-99d5-428f-bc0c-74673f48cdc1` succeeded at 2026-10-01T22:09:48.058Z.
Candidate receipt issued 2026-10-01T22:14:46.913Z; promotion verified 2026-10-01T22:15:27.458Z.
Observation passed two checkpoints in 419,630 ms against the required 300,000 ms. All 312
source/projected/rendered records matched with zero discrepancies, candidate 5xx or unresolved live effects.
Eleven independent readback sections matched, last at 2026-10-01T22:22:18Z. The owner's bounded live check
passed on the exact serving revision: 4 of at most five questions answered and saved to history with 4 model calls; history reopened in a fresh browser context, then save, pin, unpin and one structured rerun with zero model calls; zero business writes and 0 guard refusals.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=false are verified.
Tag `cand-rmuq2qvcc-8074bfd97707`; fingerprint `sha256:56315f7704e0ef637f1ffd2c490d610a11a048e864241d319b824f39c572adf9`.
No business mutation was used as proof. Failed attempts remain failed in their preserved evidence.
Editor browser coverage remains `not_run` under the approved Admin-only contract.

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
ledger.

## Verified corrective review

Five confirmed adversarial findings are repaired and verified deployed: lifecycle uncertainty, policy calendar validation/presentation, source-upload hygiene, vulnerable production dependencies and return-navigation transport. All repairs passed focused regressions, full application verification, exact main CI and cumulative release gates. Independent source/runtime readbacks and all six guarded remote product checks passed. The same runner performed the authorized repairs; this is not an independent second-review signoff. See [the adversary review](evidence/adversary-review-2026-09-29.md).

## Delivered batch

Runs `98f7e743` and `729d5716` delivered S108 and batch 004 (S146–S151), and run `ab803f8a`
request 001 and S135–S145 (see Feature intake). Run
`89e38cd9-b6dd-498f-be87-1963e0ed2d03` at `c541db72` delivered the thirteen-feature batch below:

- S128: Pause operating-Sheet writes while retaining reads and app-owned work.
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

The permits of runs `ab803f8a`, `98f7e743` and `729d5716` are consumed. Run `175fee1d` rolled back
verified on 2026-10-02 (promotion routing skew; see docs/loop-state.md) and its permit is archived
as superseded; the Awaiting release queue holds batch 004's corrective repair (S147 read order,
S151 smoke) for its replacement run. No original receipt, completed permit or build claim is
reused.
