# Loop state

Last updated: 2026-09-20 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Operating mode: LOCAL-ONLY DEVELOPMENT. Production is down and undeployable because billing is
DISABLED on GCP project `pmi-kc-kb-prod` (F-BILLING-INCIDENT, owner action required; the runner
never changes billing). No release, candidate, promotion, observation or traffic change runs until the
owner re-enables billing. Each feature stops at "green tree committed + pushed + exact-SHA CI green"
and joins the Awaiting release queue below. The S128 pause stays in force: the operating-Sheet write
flag is false in both ignored env files and no feature may re-enable it.

S123 (F02, retain unfinished renewals when source dates advance) is IMPLEMENTED and CI-GREEN at
`aa062d8e` (exact-SHA CI 35505452408), release deferred (billing). Verified: the full local gate on the
identical tree (6,775 unit tests in 740 files, 38 backend files including the new emulator cycle-store
case, every policy check, production build, core E2E 8 passed and 4 intentional skips). The recorded
cycle basis is compared with the current provider lease end and surfaced as a source-date change on
the desk row and in the lease workspace; retention, cycle identity and the store were preservation
checks that already held. Browser smokes: NOT RUN (rehearsal server refuses without fresh WSL auth).
Human verdict: NOT RUN, no human observer.

S124 (F03, move-out detection and non-renewal outreach filtering) is IMPLEMENTED and CI-GREEN at
`fc03ec55` plus the test-only fix `3d4a9e23` (exact-SHA CI 35508231675), release deferred (billing). Verified: read-only RentVine discovery
established the exact contract (the documented `GET /leases/statuses` table's isPendingMoveOutStatus
and isCompletedMoveOutStatus flags plus the lease detail's leaseStatusID, noticeDate,
expectedMoveOutDate and moveOutDate; shape and aggregate probes only, kept outside Git); the typed
disposition (initiated, not_initiated, withdrawn, unknown with a bounded reason) rides on every desk
row and the workspace, drives the moveOut desk filter, and blocks a new ordinary renewal draft at the
server preview for a confirmed notice. Full local gate on the identical tree (6,790 unit tests in
742 files, 38 backend files, policies, build, core E2E 8 passed and 4 skips).
Browser smokes: NOT RUN (rehearsal auth blocked). Human verdict: NOT RUN.

Next: S134 (F14, color-coded lease status sorting and filtering), which consumes the S123 cycle state
and the S124 disposition through their typed contracts, never a second provider reader.

## Phase A reconciliation (2026-09-20)

Verified: Windows checkout and native checkout `~/pmi-kc-work/main` synced at `0bbd95c3`; `npm ci`
completed in both trees (WSL); `.env.local` in both trees carries the 11 Space maps, ASK_DEMO_MODE
false and LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED false (the native copy read true and was corrected to
false; the primary copy already read false). Baseline gate on the unchanged tree passed: verify.sh
exit 0 (6,762 unit tests in 738 files, 37 backend files, policies, build) and core E2E exit 0.
Emulator seeds (Firestore 8090 and Auth 9099 only, never production) passed for seed:spaces,
seed:action-registry, seed:process-definitions, seed:notice-rules, seed:launch-skeletons and
seed:demo; seed:source-meta needs a `--source-id` or `--file` input and was skipped. The emulator was
stopped afterwards.

Open (surfaced blocker): localhost browser verification is blocked pending owner WSL re-enrollment.
`npm run auth:ensure` reports gcloud and ADC "Refresh failed (reauth)"; the rehearsal server exits NOT
READY before starting Next, so the compiled `smoke:*-browser` checks cannot run. Owner command in the
WSL repository: `npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com`. Headless
gates (verify.sh, test:firestore, test:e2e:core) are the evidence for this run.

## Awaiting release (built, CI-green, undeployed; intended release order)

1. S128 (F08) pause operating-Sheet writes: code `31bc9072`, docs `0bbd95c3`, CI 35342904192.
   Deploys with the flag false; the watcher rollback guard and flag-false readbacks ship with it.
2. S123 (F02) retain unfinished renewals across date changes: `aa062d8e`, CI 35505452408.
3. S124 (F03) move-out detection and non-renewal outreach filtering: `fc03ec55` plus test fix `3d4a9e23`, CI 35508231675.

Release resumes only after billing is re-enabled: re-enroll WSL auth, start the `PMI KC release
watcher` task (native snap gcloud) or run the release once; the watcher deploys the newest green main
SHA, so the queue above ships as one candidate carrying every queued feature. The wedged S128
checkpoint was reset to idle (backup in the watcher state directory) and the watcher is STOPPED.

## Verified production (last known, not serving while billing is off)

Serving SHA: 79493458f641b9710d8c43467e872aa9acf7948e
Serving revision: pmi-kc-app-rmu4wevd9-d89996133320, 100% traffic (tag cand-rmu4wevd9-d89996133320).
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app (returns 503 while billing is disabled).
Fingerprint: sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568.
Predecessor: pmi-kc-app-rmu4s6qo5-5d81e4f12265 / be023196ef63cd4e48db8230fc8deccaedae95c8.
Exact CI 35173497243 passed; Cloud Build b66de152-035b-47c9-8087-f001fe15d26a succeeded.
Admin passed; Editor not_run under owner policy. Observation: two checkpoints, 372,944 ms / 300,000 ms;
all 311 source/projected/rendered rows matched; monitoring ready, zero 5xx. Readback: canonical and
tagged /api/version, 100% traffic, revision env (production/live, Sheet write-back true, demo false).

## Preserved failed attempts

The failed-attempt receipts, observation reports and terminal checkpoints for the S114-S120 release
cycle remain preserved outside Git in the watcher state directory; none was relabeled as a pass.
Their per-attempt detail is recoverable in Git history at d61eecf3.

## Authentication and watcher

Re-enroll the WSL CLI/ADC for josiah@pmikcmetro.com before any release or browser smoke (observed
longevity under nine hours; owner-only enrollment). Run the native watcher with the snap gcloud on
PATH (/snap/google-cloud-cli/current/bin), never the interop Windows SDK, and never start a competing
watcher; authentication_required pauses only the dependent phase.

## Working checkout and evidence

Native checkout: ~/pmi-kc-work/main, synced from the Windows checkout by git fetch + checkout -B;
gate logs under ~/pmi-kc-work/logs/ with the phaseA, s123 and s124 prefixes. The Windows checkout is the watcher source
and the docs editing tree. Credentials and customer evidence stay outside Git.

## Preserved boundaries

Staff-recorded progress remains separate from provider receipts/signatures. Source writes retain exact
preview/confirmation, claims, receipts/readback and correction; operating-Sheet writes are paused
(S128). Messages remain unsent drafts. Completed S97-S100 proofs are not rerun. S106/S34 still needs
actual forms/catalog/mappings, managed Dotloop connection/selection and exact activation gates. Blank
resource inputs remain accepted. S100 resident-draft still needs exact mapped/verified input; S36
remains dependent. Bundle order after S134: S122, S125, S126, S127, S131, S129, S130, S132;
S133 independent; S121 when scheduled.
