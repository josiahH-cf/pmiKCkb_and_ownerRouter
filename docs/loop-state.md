# Loop state

Last updated: 2026-09-20 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Operating mode: LOCAL-ONLY DEVELOPMENT. Production is down and undeployable because billing is
DISABLED on GCP project `pmi-kc-kb-prod` (F-BILLING-INCIDENT, owner action required; the runner
never changes billing). No release, candidate, promotion, observation or traffic change runs until the
owner re-enables billing. Each feature stops at "green tree committed + pushed + exact-SHA CI green"
and joins the Awaiting release queue below. The S128 pause stays in force: the operating-Sheet write
flag is false in both ignored env files and no feature may re-enable it.

Delivered in this mode (each IMPLEMENTED and CI-GREEN, release deferred; detail in docs/facts.md):
S123 (F02) `aa062d8e` CI 35505452408; S124 (F03) `fc03ec55` plus test fix `3d4a9e23` CI 35508231675;
S134 (F14) `136826cc` CI 35508545796; S122 (F01) `39a7f929` CI 35509588537; S125 (F04) `41d6e00c`
CI 35511209348; S126 (F06) `7f0ed865` CI 35512028503; S127 (F07) `52286917` CI 35513295598.
Each ran the full local
gate on its identical tree (verify.sh, 38 backend files, policies, build, core E2E 8 passed and 4
skips); browser smokes NOT RUN (rehearsal auth blocked); human verdict NOT RUN.

S131 (F11, Rhino-policy conditional logic, ready for approved material upload) is IMPLEMENTED and
CI-GREEN at `59ad9224` (exact-SHA CI 35515037772), release deferred (billing). Verified: one typed policy
projection (`lib/lease-renewal/policy-content.ts`) reads applicability as Unknown, Applicable, Not
applicable or Needs review from the staff follow-up (a task, never coverage), the legacy Sheet column
(evidence only) and an approved material version's declarative rule over verified facts; with no
approved material every lease reads Pending approved policy material with the exact missing items and
unrelated renewals are never gated; a bounded schema and a versioned store keep upload, approval and
use separate; output slots substitute only verified facts and never invent wording. Full local gate
(6866 unit tests in 759 files, 38 backend files, policies, build, core E2E
8 passed and 4 skips). Browser smokes: NOT RUN (rehearsal auth blocked). Human verdict: NOT RUN.

S129 (F09, owner and tenant draft workflows: technical readiness for meeting validation) is
IMPLEMENTED and CI-GREEN at `009c4414` (exact-SHA CI 35516040981), release deferred (billing). Verified:
an evidence matrix ties each step of the owner and tenant draft path to its current control,
owning service and deterministic check (asserted to exist); the one demonstrated gap, the S131
policy gate being client-only, is closed by projecting the same gate on the server and refusing a
direct draft at the preview boundary beside the existing content, review, signature, template,
recipient and move-out refusals; a read-only meeting preflight lists source freshness, inputs,
sender, signature, recipients, template, permitted action, Gmail destination and open attempts with
fallbacks, proceeds without Gmail and keeps the three human observations Pending meeting. Full local
gate (6874 unit tests in 762 files, 38 backend files, policies, build, core
E2E 8 passed and 4 skips). Browser smokes: NOT RUN (rehearsal auth blocked). Human verdict: NOT RUN.

S130 (F10, seven-template intake and Dotloop prefill readiness) is IMPLEMENTED and CI-GREEN at
`696147f9` (exact-SHA CI 35517371018), release deferred (billing). Verified: a seven-family intake manifest
(one entry per family, honestly Pending materials) receives files only through the trusted publication
path bound by id and content hash and classifies bytes as data (fillable, static, provider-native only
when staff record a template reference, or unsupported); a reviewed version-bound field and signer map
refuses renamed required fields, wrong signer roles and template conflicts; the worksheet repeats one
known value per party and per animal and stays Preview only; the fill boundary yields comparable
provider-native values and a manual Dotloop handoff for PDFs (machine autofill unavailable, never
completed); approval projects the exact version into the S66 catalog and replacement rewrites it; the
receipt-time and meeting checkpoints advance only on recorded evidence. Full local gate
(6891 unit tests in 767 files, 38 backend files, policies, build, core E2E
8 passed and 4 skips). Browser smokes: NOT RUN (rehearsal auth blocked). Human verdict: NOT RUN.

Next: S132 (F12, end-to-end walkthrough preparation and meeting evidence), per its specification.

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
4. S134 (F14) color-coded lease status with matching sorting and filters: `136826cc`, CI 35508545796.
5. S122 (F01) all-lease visibility and explicit worklist views: `39a7f929`, CI 35509588537.
6. S125 (F04) thirty-day notice timing review with an explicit date basis: `41d6e00c`, CI 35511209348.
7. S126 (F06) consistent month/day/year date presentation: `7f0ed865`, CI 35512028503.
8. S127 (F07) clear blockers and exact next-action guidance: `52286917`, CI 35513295598.
9. S131 (F11) Rhino-policy conditional logic, ready for approved material upload: `59ad9224`, CI 35515037772.
10. S129 (F09) owner and tenant draft workflows, technical readiness for meeting validation: `009c4414`, CI 35516040981.
11. S130 (F10) seven-template intake and Dotloop prefill readiness: `696147f9`, CI 35517371018.

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
gate logs under ~/pmi-kc-work/logs/ with the phaseA, s123, s124, s134, s122, s125, s126, s127, s131, s129 and s130 prefixes. The Windows checkout is the watcher source
and the docs editing tree. Credentials and customer evidence stay outside Git.

## Preserved boundaries

Staff-recorded progress remains separate from provider receipts/signatures. Source writes retain exact
preview/confirmation, claims, receipts/readback and correction; operating-Sheet writes are paused
(S128). Messages remain unsent drafts. Completed S97-S100 proofs are not rerun. S106/S34 still needs
actual forms/catalog/mappings, managed Dotloop connection/selection and exact activation gates. Blank
resource inputs remain accepted. S100 resident-draft still needs exact mapped/verified input; S36
remains dependent. Bundle order: S132 is the last bundle feature;
S133 independent; S121 when scheduled.
