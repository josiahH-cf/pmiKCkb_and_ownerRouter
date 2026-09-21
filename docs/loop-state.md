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
CI 35511209348; S126 (F06) `7f0ed865` CI 35512028503; S127 (F07) `52286917` CI 35513295598;
S131 (F11) `59ad9224` CI 35515037772; S129 (F09) `009c4414` CI 35516040981; S130 (F10) `696147f9`
CI 35517371018. Each ran the full local gate on its identical tree (verify.sh, 38 backend files,
policies, build, core E2E 8 passed and 4 skips); browser smokes NOT RUN (rehearsal auth blocked);
human verdict NOT RUN.

S132 (F12, end-to-end walkthrough preparation and meeting evidence) is IMPLEMENTED and CI-GREEN at
`f74468a1` (exact-SHA CI 35519202311), release deferred (billing). Verified: a typed meeting-walkthrough
contract (`lib/lease-renewal/meeting-walkthrough.ts`) projects an effect-free preflight from supplied
evidence only (unsupplied checks Not run, held live steps named, preparation always supported), keeps
the two-case matrix Pending selection until a `private:` storage pointer binds, parses the runbook's
side-by-side script so every bold control is an exact operator-guide control and unknown manual steps
are visible Meeting questions, routes five safe branches to inspection or manual handoff, and keeps an
observation ledger whose unrun steps carry no verdict, whose failed steps name owner and next action,
and whose resumption never resets prior results; the import separates confirmed procedure from open
questions and refuses customer identifiers; the technical result ledger cites existing tests with the
selected-lease and human verdict columns fixed at Not run. The runbook
(`docs/products/renewal-meeting-walkthrough-runbook.md`) is Draft for validation; `npm run
meeting:preflight` reads only git identity, the F08 flag and Dotloop configuration presence. Full local
gate (6919 unit tests in 770 files, 38 backend files, policies, build, core E2E
8 passed and 4 skips). Browser smokes: NOT RUN (rehearsal auth blocked). Human verdict: NOT RUN.

S133 (F13, external maintenance-agent handoff assessment, independent of the bundle) is IMPLEMENTED
and CI-GREEN at `75c06252` (exact-SHA CI 35519982150), release deferred (billing). Verified: a bounded
assessment contract (`lib/maintenance/external-agent-handoff-assessment.ts`) in which a conclusion is
supported only by owner material, vendor primary documentation, an authorized read-only read or
repository code (never a transcript remark), every not-established row names its exact requested input
and owner, external write or event claims stay undemonstrated without primary documentation, unsourced
ownership claims and missing boundaries become decision items, the handoff record keeps an allowlist and
refuses secrets and raw communications by name, identity joins only on stable verified ids or a
confirmed human association, an ambiguous create is never retryable, and every option stays
conditional until its evidence is supported; the tabletop decision packet
(`docs/evidence/s133-external-maintenance-agent-handoff-assessment-2026-09-20.md`) keeps the agent's transcript
label, marks vendor identity, account, access, interfaces and terms Not established with owner and
administrator inputs, inventories the application side from code with the registry keys as committed,
and names the one owner decision. No vendor contacted, no connector, key, identity or Maintenance
change. Full local gate (6944 unit tests in 772 files, 38 backend files,
policies, build, core E2E 8 passed and 4 skips). Browser smokes: NOT RUN (rehearsal auth blocked).
Human verdict: NOT RUN.

Next: S121 when the owner schedules it. Nothing else is queued for building; the Awaiting release
queue below waits on the owner's billing fix (F-BILLING-INCIDENT).

## Phase A reconciliation (2026-09-20)

Verified: both checkouts synced, `npm ci` complete, both ignored env files carrying the 11
Space maps with ASK_DEMO_MODE and LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED false, a passing
baseline gate on the unchanged tree and passing emulator seeds (never production).

Open (surfaced blocker): localhost browser verification needs owner WSL re-enrollment
(`npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com`); `auth:ensure` reports
gcloud and ADC reauth, so the rehearsal server refuses and no compiled `smoke:*-browser` check
can run. Headless gates are the evidence for every feature in this mode.

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
12. S132 (F12) end-to-end walkthrough preparation and meeting evidence: `f74468a1`, CI 35519202311.
13. S133 (F13) external maintenance-agent handoff assessment: `75c06252`, CI 35519982150.

Release resumes only after the owner re-enables billing, and the whole queue ships as ONE candidate:
the watcher releases the newest green main SHA and the queued commits are cumulative, so one Cloud
Build, one candidate, one promotion and one observation replace thirteen cycles. Sequence, exact
commands and failure branches: `docs/release-batch-runbook.md`; readiness check:
`npm run release:batch-preflight`. The watcher is STOPPED. Correction (2026-09-20): the checkpoint
was NOT reset to idle. It holds an unfinished `prepare` at `0bbd95c3` blocked on
`authentication_required`, and the watcher takes its checkpoint's SHA while that checkpoint is
unfinished, so starting as-is would deploy the S128 docs commit alone and leave twelve features
queued. Runbook step 2 archives it with its reason and records the last completed release instead.

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
gate logs under ~/pmi-kc-work/logs/ with the phaseA, s123, s124, s134, s122, s125, s126, s127, s131, s129, s130, s132 and s133 prefixes. The Windows checkout is the watcher source
and the docs editing tree. Credentials and customer evidence stay outside Git.

## Preserved boundaries

Staff-recorded progress remains separate from provider receipts/signatures. Source writes retain exact
preview/confirmation, claims, receipts/readback and correction; operating-Sheet writes are paused
(S128). Messages remain unsent drafts. Completed S97-S100 proofs are not rerun. S106/S34 still needs
actual forms/catalog/mappings, managed Dotloop connection/selection and exact activation gates. Blank
resource inputs remain accepted. S100 resident-draft still needs exact mapped/verified input; S36
remains dependent. The renewal meeting-readiness bundle (S122 to S132 and S134) is fully implemented
and release-deferred; S133 (independent) is implemented and release-deferred; S121 when scheduled.
