# Environment and release handoff

Updated: 2026-09-29 (UTC). Native run K passed 7,174 unit tests in 795 files, 230 backend tests in 41 files, all required gates and production build hkH9ZkYerS_oUJOH5zk1z.
Objective compiled checks passed on immutable build K: cold notice readiness in 16.563 seconds, a clean desk-warmed read in 16.778 seconds, exact save/readback focus and all 71 guide steps. Actual-source presentation and a separate six-category synthetic presentation passed both themes and 320/640/1360-pixel layouts, with zero overflow plus contrast, keyboard, accessible-tree, forced-colors and page-scale checks. A separate instrumented diagnostic verified all 311 source/cache/projected/rendered records and per-row categories before and after a newer API read, with zero missing records or duplicates. Its API read passed in 17.591 seconds and the desk caught up within its unchanged route deadline. Synthetic presentation establishes component presentation only; it does not establish actual source projection. Earlier failures remain unchanged outside Git. Human screen-reader and desktop full-page zoom verdicts remain NOT RUN.
The thirteen-feature batch remains undeployed. Attended Admin browser enrollment, exact repair-head green CI, fresh prerequisites and preflight GO, one candidate, promotion, observation and independent readbacks remain required. The queue stays intact; no batch release receipt exists.
Final K core E2E passed 31 tests with 18 intentional skips. Its isolated next-dev run preserved all 258 changed source hashes and build K; it is separate from compiled production acceptance.
The last synchronized pre-repair head remains 952c5cd843d14a9f7e2be2bcfa227598f235d059, with CI 36485825488. Its historical GO does not admit this repaired tree. Exact outcomes are in docs/evidence/batch-litmus-audit-2026-09-28.md.

Production readback still names `79493458f641b9710d8c43467e872aa9acf7948e` /
`pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic. Canonical and tagged /api/version returned
HTTP 200 and exact identity; sign-in returned HTTP 200. Fresh revision configuration yields
`sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568`.
Authorized domains contain exactly one candidate entry for the serving S120 release plus canonical.
The serving Sheet write-back flag is true; S128 is staged false in both ignored env files in both
checkouts and is not deployed. Approved CLI/ADC refresh passed on 2026-09-29. Admin browser
authentication remains UNVERIFIED: after the earlier navigation timeouts, a guarded check reached
a genuine Google challenge and the attended enrollment window closed before verification.
The independent Google-provider read at 2026-09-29T03:03:37.930Z returned HTTP 200,
the expected Identity Platform resource and enabled=true, with zero mutations.
CLI/ADC refresh passed again at approximately 04:58 UTC, but the enrollment record still names
2026-09-28T20:56:36.677Z. It exceeds the seven-hour release-start budget; fresh attended WSL
enrollment is required in addition to Admin browser sign-in.

Historical S120 receipts were re-read: candidate issued 2026-09-17T02:27:49.328Z (Admin passed,
Editor not_run); promotion started 02:28:00.680Z and verified 02:28:06.952Z; observation generated
02:34:13.624Z, passed with two checkpoints in 372,944 ms. Recorded completion is 02:34:15Z.
These outcomes verify S120, not the queued batch. Receipts and failed attempts stay unchanged outside
Git under `/home/josiah/.local/state/pmi-kc-release`.

Billing enabled and unchanged 25 USD alert, 100 USD project hard stop, 100 USD account backstop,
ACTIVE Node.js 22 guardrail cap 100, hard-stop Pub/Sub and both alerts with two channels were read
back. No budget, billing, identity or security setting changed. Session longevity remains unverified
at 24 hours; an earlier session expired under nine hours.

## Production

| Item                      | Value                                           |
| ------------------------- | ----------------------------------------------- |
| Project                   | `pmi-kc-kb-prod`                                |
| Region                    | `us-central1`                                   |
| Cloud Run service         | `pmi-kc-app`                                    |
| URL                       | `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`    |
| Serving revision          | `pmi-kc-app-rmu4wevd9-d89996133320`             |
| Serving commit            | `79493458f641b9710d8c43467e872aa9acf7948e`      |
| Traffic                   | 100%                                            |
| Descriptor                | Production + Live                               |
| Runtime identity          | project-managed PMI KC runtime service account  |
| Spaces                    | 11                                              |
| Sheet write-back          | true for exact normal append/field updates      |
| Legacy copy-only Sheet id | not configured                                  |
| RentCast                  | selected; allowance 50                          |
| Action Registry           | 48 exact keys; 16 open and 32 closed            |
| Retired broad action ids  | non-executable; only exact proven keys are open |
| Demo flags                | false                                           |

Secret names are bound through Secret Manager. Values never belong in this file.

Serving S113 supports normal append and owner-approved field updates: fresh server-resolved
identity/type/value, exact confirmation, one-attempt claim, receipt/readback and separately
confirmed current-state correction. Row deletion and historical restore remain unavailable.

## Local host and authentication

- The repository is on the Windows-mounted workspace; Node/npm application commands run through WSL.
- September 10 rehearsal uses the existing Node 22.23.2 runtime and native Linux Cloud SDK
  (`/snap/google-cloud-cli/current/bin`) ahead of the inherited Windows-mounted SDK path. The same
  approved WSL CLI/ADC store passes refresh; fresh Sheet timing improves from 13.135 to 2.298 seconds.
  Mounted-filesystem cold route startup is separate from ready-process browser acceptance. No source
  cache, browser deadline, account, credential store or production configuration is changed.
- Keep `GOOGLE_APPLICATION_CREDENTIALS` unset. Service-account keys cannot be created for this
  project (org policy) and every preflight refuses them.
- `.gcloudignore` inherits `.gitignore` and excludes `.claude/`, `output/`, and local env files
  from source uploads.
- Only `josiah@pmikcmetro.com` is approved for unattended local work on this WSL host. Reuse its
  WSL credential store and ignored provider configuration; never substitute another identity,
  impersonation, key file, credential override or Windows store.
- `npm run preflight:adc` delegates to the same approved identity/store assessment and emits no
  provider error body; it cannot probe an unverified ADC identity.
- `npm run auth:status` inspects only. Unprobed freshness is unverified. `npm run auth:ensure`
  verifies identity/store before ordinary Google-library refresh. Current approved CLI/ADC probes
  passed on 2026-09-29; browser authentication remains unverified after an observed Google challenge.
  The owner must complete attended enrollment; the runner never answers the challenge. Historical enrollment and reboot
  proofs do not establish the current browser session. A transient identity lookup receives one
  bounded retry; an unavailable lookup remains blocked without directing unnecessary reenrollment.
- `auth:session`, `auth:enroll` and `auth:enroll:wsl` enroll CLI and ADC in WSL. The PowerShell
  compatibility script delegates to WSL. The owner applies the account-scoped Cloud session-policy
  exception and runs `npm run auth:session` in the WSL repository. Enrollment verifies Google identity
  once and writes a local binding beside ADC because gcloud leaves its account field empty.
- Manual enrollment announces its checks before printing Google's link. Keep the same command running,
  open only its new link, and enter that link's code only at Google's terminal prompt. A cancelled
  or failed attempt requires a fresh link/code pair; an old code cannot finish a restarted command.
  Background checks have no terminal input, and a failed login stops without binding or retrying.
- `npm run auth:session -- --browser` uses Google's browser callback instead of copying a code.
  Browser-control enrollment completed successfully on 2026-09-08. The required 24-hour elapsed-session
  proof remains open; the owner-controlled session-policy exception was not changed by the runner.
- The runner never changes that policy or enters a password, code, passkey or CAPTCHA. When Google
  needs a person, the dependent phase pauses with one recovery command; independent work continues.
- Browser assurance reuses the existing owner Admin profile outside Git on both exact origins.
  Editor browser coverage is not_run under the September 10 owner amendment; backend Editor checks remain.
  Enroll through `npm run auth:enroll-canary`; unattended checks use `auth:ensure -- --need=canary`.
  The shared Linux browser resolver selects the installed executable, reused by the assurance harness.
  Never copy a personal profile or infer a role from cookies. Dedicated verification accounts retain
  server-side business-effect refusal. The owner retains ordinary Admin authority; assurance uses
  the guarded read-only browser, including state-changing GET refusals.
- A successful attended browser enrollment writes an opaque local marker. After a challenge the
  watcher waits for that marker to change before another browser auth probe; it cannot loop login.

September 15 automatic `auth:session -- --browser` renewal reused the approved account's existing
browser session and restored its ADC identity binding. CLI/ADC readiness and enrolled Admin browser
authentication on both origins passed. No password/code/passkey/CAPTCHA was entered; no policy,
identity or permission scope changed.

### Local release watcher

At 2026-09-29T02:31:17Z eleven release entry files matched both checkouts, zero watchers were found,
`release-permit.json` was absent and the checkpoint was complete S120 without in-flight work. The
temporary installation hold was released; the kernel lock read free and direct admission still
refused. The scheduled task remains Ready and unchanged. Recheck all state before admission. A preexisting watcher
PID 382 started stale S128-only build `57f23335-8f8b-490e-b18e-5d6d4b1db564` at 20:58:24.661Z.
It was stopped and the build read CANCELLED at 21:01:53.995Z; candidate
`pmi-kc-app-rmu82xj2c-fa2fae08b587` is absent and traffic unchanged. The exact checkpoint was
archived with a reason outside Git, and the active checkpoint names the last completed S120 release.
Missing permission blocks forward release even after the installation lock is released. The launcher
checks admission before starting the watcher; the watcher checks it before polling CI or auth; direct
forward-mutation entry points require a real inherited kernel lock, exact run/SHA/revision checkpoint and
admitted permission. Follow `docs/release-batch-runbook.md`; a stopped process alone is not the hold.

`scripts/install-release-watcher.ps1` owns the existing limited interactive-user task
`PMI KC release watcher`. `-CheckOnly` inspects its logon/catch-up/one-instance contract without
reinstalling. The hidden launcher is `scripts/run-release-watcher.ps1`; non-secret host logs remain
under `%LOCALAPPDATA%/PMI-KC/release-watcher`. WSL checkpoints and locks stay outside Git under
`~/.local/state/pmi-kc-release`. The watcher must run with the native WSL runtime:
`/snap/google-cloud-cli/current/bin` and Node 22.23.2 ahead of the inherited Windows-mounted Cloud
SDK path. Through the interop path each gcloud read takes 26-44 s (1-2 s natively), which stalled
the S114 post-promotion observer for its whole 420,000 ms window on 2026-09-16 and forced a verified
rollback; the launcher now prepends that runtime. Historical S114 authentication expiry held recovery
until attended enrollment; the later S115 client-lifecycle and canary-settling fixes remain in the
code. Those earlier recovery results do not verify the current batch or permit another launch.
The task launch writes `status.log`/`errors.log`;
native launches write `native-status-<tag>.log`/`native-errors-<tag>.log`. The historical
S115 logs are not current release evidence. Start the batch only through the runbook's
`release-control.mjs --admit-and-watch`: it collects fresh prerequisites and admits the prepared
exact run under the same lock handed to the watcher. Do not substitute a lock-free check followed by
a separate launch. Scheduled retries cannot create another application build for that run.

Set MONITORING_OPERATOR_EMAIL in ignored .env.local to the existing verified managed alert
recipient. It is independent of the approved CLI/ADC login. Missing, non-managed or conflicting
configuration refuses the watcher; it never rewrites the cloud channel to match a development login.
The existing channel and recipient passed the historical 2026-09-08 monitoring readback.
A future promotion still requires fresh monitoring READY for its exact release.

`npm run release:watch:dry-run` is inspection only. The actual batch requires a prepared exact-SHA
permit, fresh preflight GO for all thirteen suites and atomic admission under the release lock.
The watcher checks the current green `main` SHA against that permit; it cannot advance to another
head under the same permission. An unfinished checkpoint still pins its exact SHA and must be
reconciled through the runbook before a new run. Never replace a failed checkpoint or dispatch claim
to obtain another build.
The last successful serialized release completed exact SHA `79493458f641b9710d8c43467e872aa9acf7948e`, CI 35173497243, revision `pmi-kc-app-rmu4wevd9-d89996133320` (S120, first attempt; no retries, 2026-09-17).
The earlier Feature 2 attempt promoted `4e1a4a061cd8b49ef57e910831f6515c57e0089c` / `pmi-kc-app-rmu1zycgi-d28f58f32910`,
then verified rollback to Feature 1 after a missing observation report and `checkpoint_schedule_invalid`.
Its terminalFailure / rolled_back_verified checkpoint is preserved outside Git. The missing-report
rollback repair is merged. Feature 3 superseded its unpromoted candidate only after unchanged predecessor
traffic/version readback; the corrected independent reader and fresh release are complete. The watcher is configured for the native
checkout with both reviewed ignored env files. Feature 4's first release failed observation and verified rollback restored Feature 3.
The owner-directed resumed release of `2bf21ff` then passed full assurance, promotion and observation;
Feature 5 completed through PR #90, then Feature 6 through PR #91; each completed its own
production observation before advancing. All six requested standalone feature cycles are complete.
The active checkpoint now names the completed S120 release; the watcher is stopped under the
current batch hold. The prior description of an active watcher is not a current authorization to start.
Earlier failed reports,
receipts and terminal checkpoints retain their actual outcomes, including the 919a2ae rollback.
Only exact-main-SHA green push CI permits an isolated runtime/served-asset release; documentation-only
commits do not deploy. Fresh candidate receipts, exact promotion and 300,000 ms observation remain
mandatory on future releases. Durable rollback intent precedes traffic mutation; lost responses
require actual readback and restart recovery cannot overwrite unrelated traffic.

## Local rehearsal

Node tooling runs in WSL. The tested alternate runtime is Linux Node 22.23.2 at
`/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin`. Exact ordinary invocation:

```bash
export PATH=/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:$PATH
VITEST_MAX_WORKERS=2 npm run dev
```

The fallback tested was `npm run dev -- --webpack`. Both were tested with a scratch network refusal
for authenticated external sources before unattended authentication was recovered. The original
ArrayBuffer failure was not reproduced in that constrained run; neither invocation is claimed as a
verified workaround with live data. Webpack additionally hit cold-route compilation timeouts.
The final Dashboard smoke selects the installed Linux browser explicitly with
`DESK_BROWSER_EXECUTABLE=/home/josiah/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
the Windows browser fallback cannot use a Linux remote-debugging pipe. This does not enroll or
change a managed canary profile.
Use the required two-worker ceiling for Vitest and complete scratch logs without piping through tail.
Local Demo + Live-read-only refuses business/provider effects, including app-owned progress.
The owner-approved G2 exception permits only lease-bound version/hash/time approval-invalidation
metadata during authenticated source reads; it creates no workflow milestone, reviewed history or draft.
Do not manufacture source data or bypass identity policy to make a browser smoke pass.

The current local repair rehearsal passed eight compiled smokes: navbar, dashboard-assistant,
renewal-desk, renewal-guide-controls, maintenance-blockers, maintenance-intake, theme and Work.
Local notice/draft controls also passed. Final rebuilt G4/G5 controls passed on build
`pAKd_VsJI8vmZvjAv6Lgu`, with zero forwarded business writes; the complete native gate passed.
Core E2E startup is being diagnosed and retains a separate verdict. In-memory synthetic transport checks establish local control
behavior only; they do not establish production writes, real-form accuracy or provider acceptance.
The mounted filesystem's slow cold startup is separate from ready-process browser acceptance.
No source-freshness limit or browser deadline was relaxed. Private captures remain outside Git.

## Preflight

```bash
npm run preflight:identity
npm run preflight:adc
npm run release -- --environment=production --plan-only \
  --operator-email=josiah@pmikcmetro.com \
  --monitoring-operator-email=josiah+alerts@pmikcmetro.com \
  --admin-profile=/home/josiah/pmi-assurance/owner-admin \
  --budget-confirmed --allow-multiple-spaces
```

The bare `preflight:production` command is not the authoritative release projection: the release
wrapper injects the explicit descriptor and evaluates the exact replacing runtime map. Never bypass
a release-wrapper refusal. If `auth:ensure` reports the gcloud CLI credential stale, run the
enrollment command it names; do not bridge a token by hand.

## Candidate release

Use the ordered admission and watcher procedure in `docs/release-batch-runbook.md`. The local
implementation requires the exact admitted run and actual inherited lock for every mutation-capable
entry. Standalone execute/promote commands are not a substitute for that procedure. Before the one
application Cloud Build, prepare and verify the paused recovery baseline described below. Its
zero-traffic predecessor clone uses the captured image digests and does not require another build.

Capture the returned exact candidate revision, candidate tag, candidate origin, and predecessor.
Compare the candidate's normalized runtime spec to the captured predecessor, allowing only reviewed
image and `APP_COMMIT_SHA` identity differences plus the explicitly authorized Sheet pause. Inspect
provider-generated per-build provenance metadata separately.

The historical S120 candidate is now serving: `79493458f641b9710d8c43467e872aa9acf7948e` / `pmi-kc-app-rmu4wevd9-d89996133320`, tag `cand-rmu4wevd9-d89996133320`.
Captured predecessor is `pmi-kc-app-rmu4s6qo5-5d81e4f12265`. Fingerprint `sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568`.
Exact S120 candidate and canonical versions, traffic and configuration passed its release readbacks.
The read-only diagnostic below remains part of the watcher's candidate gate.

Run the anonymous, GET-only candidate smoke before any authenticated browser check:

```bash
npm run smoke:release-candidate -- \
  --base-url=<candidate-origin> --expected-tag=<candidate-tag> \
  --expected-service=pmi-kc-app --expected-revision=<candidate-revision> \
  --expected-commit=<exact-40-character-sha>
```

Do not promote until the anonymous smoke and the complete S51 candidate assurance below pass.

## S51 candidate and post-promotion assurance

Run these gates only after the remediation commit is clean, pushed, and green at its exact SHA,
and the runbook admits that exact batch. The watcher binds the candidate domain step to its exact
candidate and verifies the resulting authorized-domain list. The owner's September 10 direction accepts the existing
`josiah@pmikcmetro.com` Admin profile on both the candidate and canonical origins. The enrolled
profile is `/home/josiah/pmi-assurance/owner-admin`, outside the repository. Re-establish its
session with `npm run auth:ensure -- --need=canary --origins=<canonical>,<candidate> --admin-profile=/home/josiah/pmi-assurance/owner-admin --admin-email=josiah@pmikcmetro.com`.
Historical version-4 candidate/promotion receipts retain `browserPolicy=owner-admin-2026-09-10`,
their original identity proof and Editor `not_run`; they are never rewritten for the new run.
The repaired batch uses version-5 candidate/promotion receipts that additionally bind the exact run
and immutable supplemental recovery-receipt hash. Candidate and recovery assurance retain the same
Admin-only policy and Editor `not_run`. Admin access does not prove Editor
restrictions; backend role tests remain required. No role, claim or canary business-refusal identity
changes. Copied cookies, guessed profiles and runner-entered security challenges remain forbidden.

The watcher supplies only the three existing reviewed RentVine source settings to source-reading
assurance subprocesses, rejecting missing or conflicting values. Identity/store overrides are never
imported from the ignored provider file. Independent Sheet reconciliation requires a complete
RentVine identity read and accepts only unambiguous one-to-one candidate associations; it invents
no link or write authority. A pending server render may be reloaded read-only up to twelve times
within the existing page deadline; freshness, completeness and all other diagnostic gates remain.

Capture the immutable revision-configuration fingerprint:

```bash
npm run assure:production-observation -- \
  --capture-config-fingerprint --live \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app \
  --expected-revision=<candidate-revision>
```

The watcher chooses new explicit receipt paths outside Git and runs the aggregate candidate gate:
complete Admin canary, independent Admin source reconciliation, origin/traffic/configuration binding,
the prepared recovery receipt and monitoring readback. Promotion does not accept independently run
diagnostics as a substitute for the exact aggregate receipt. Receipts and terminal checkpoints are
immutable evidence; failed or interrupted attempts remain exactly as recorded.

The canary/reconciliation browser starts offline with service workers blocked, installs its
GET/HEAD-only firewall, then connects. It must use the exact candidate revision's bound Sheet
configuration and fail closed on mutation, identity drift, partial reads, or source/application
disagreement.

The monitoring setup generator is print-only. This release task authorizes no monitoring, budget,
guardrail or security-setting repair. If the exact managed S51 resource set is absent or differs,
hold the dependent phase and report the readback; do not apply generated setup commands.
The operator address is `josiah+alerts@pmikcmetro.com`,
which is the address the managed channel actually carries; passing any other internal address reports
a channel definition mismatch. Do not wait on an email-channel verification step: the provider owns
`verificationStatus` (it is settable only through `notificationChannels.verify`, never by patch) and
returns it absent when the channel type needs no verification, which is what the managed email
channel reads back; the verifier refuses only `UNVERIFIED` or an unrecognized status.

```bash
npm run monitoring:plan -- \
  --operator-email=<managed-operator@pmikcmetro.com> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app

npm run monitoring:verify -- \
  --live --operator-email=<managed-operator@pmikcmetro.com> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app
```

`monitoring:verify` must report `READY` for the exact policy/metric set and one enabled internal
notification channel before promotion. The verifier refuses a channel the provider reports as
`UNVERIFIED`, which is its documented non-functioning state.

The fresh-setup plan refuses while any managed S51 resource already exists, so a partial set needs a
reviewed in-place repair to the committed definitions rather than a rerun of setup.

Before the application build, the watcher captures the still-serving predecessor's exact commit,
revision, complete reviewed configuration, resolved container image digests and 100% traffic in an
immutable original baseline. Because that predecessor has Sheet writes enabled, the shared recovery
module prepares one zero-traffic clone from that predecessor configuration, changing only the revision
identity and Sheet=false. It does not use the current service template or build a new predecessor image.
Ready state, exact configuration/digests, version, tagged Admin assurance, monitoring and unchanged
original traffic must pass before a separate immutable supplemental recovery receipt is issued.

Recovery Admin assurance uses `--phase=rollback`; only that phase may select a workspace through the
predecessor's existing `.renewal-lease-link` when newer semantic markers are absent. Exact version,
configuration, the complete Admin route manifest, diagnostics and monitoring remain required.
Candidate-era semantic reconciliation cannot be imposed on a predecessor without those markers.
This recovery implementation and its failure paths pass local tests; the current batch's real
zero-traffic clone, recovery receipts and cloud readbacks are NOT RUN.

## Promotion and observation

Promotion runs only inside the admitted watcher's exact promotion checkpoint. Immediately before
its durable one-attempt claim, the release command revalidates kernel lock/admission, fresh candidate
assurance, the still-serving original's 100% traffic/configuration and the prepared paused target's
Ready state, digests, configuration and receipt. It reads back exact candidate 100% traffic before
committing the version-5 promotion receipt. No caller may substitute another predecessor, recovery
target, fingerprint or run identity.

Post-traffic promotion failure and observer rollback now use the same receipt-bound recovery
executor. A globally shared durable claim precedes the one traffic request. Lost replies and restart
reconcile that exact target and retained operation; they cannot dispatch another target or retry an
ambiguous traffic change. Recovery succeeds only after exact target traffic/version/configuration,
Sheet=false, Admin assurance and monitoring pass. Authentication failure preserves the recovery
intent for the owner's attended enrollment. Held or expired forward permission does not revoke
already-authorized exact receipt-bound recovery, but actual kernel lock and phase proof remain required.

The watcher runs canonical observation with the bound promotion receipt, fingerprint, managed
operator and explicit Admin profile. The observer rejects caller-supplied predecessor or promotion
time. The current batch's promotion and observation remain NOT RUN.

The runner executes immediate and end-of-300,000-ms Admin canaries and reconciliation. It may
wait only through the specified two-minute monitoring-ingestion grace. It emits a bodyless decision
and never changes traffic in observation mode. A `rollback_required` result invokes the shared
recovery flow under the watcher lock. Its durable target is the supplemental receipt's paused
revision and fingerprint; it never verifies a replacement against the original enabled revision's
identity. Do not claim that an older predecessor implements the candidate's new Renewal Desk
reconciliation schema.

After a passed observation, independently read back traffic, Ready state, service account,
Production + Live descriptor, exact Space maps, expected secret references, allowance 50, current
Sheet/action/runtime state, bounded routes, and `/api/version`. The batch requires the operating-Sheet
switch explicitly false; both exact Registry keys retain their authority but cannot override the
pause. The legacy copy-only setting and broad Sheet action remain absent/closed. S113 replaces the older candidate's blanket normal-field refusal: normal field updates
require the exact current proposal, Admin confirmation, claim and receipt/readback. Row deletion and
historical fixed-row reversal remain refused; normal append keeps its exact lease-scoped claim.
Read-only managed canaries must not perform a source write to demonstrate these paths; route/store
acceptance and actual operational receipts remain distinct evidence. The Registry remains 48 keys/16 open unless a
separately authorized exact-key activation passed its own gates.

## Current rollback

Captured predecessor: `pmi-kc-app-rmu4s6qo5-5d81e4f12265` from commit
`be023196ef63cd4e48db8230fc8deccaedae95c8` belongs to the completed S120 release.
A future batch would capture currently serving `pmi-kc-app-rmu4wevd9-d89996133320` /
`79493458f641b9710d8c43467e872aa9acf7948e` as its predecessor. That revision reads Sheet writes
true, so a bare traffic restoration would violate S128.

Forward restoration and rollback use the implemented shared pause-preserving recovery contract,
exact receipt binding and configuration/traffic/browser readbacks. Local failure, restart and
process-ownership tests passed. Actual cloud recovery preparation and any required recovery remain
release gates; local tests do not establish a verified production rollback. No historical receipt
may be changed to make a new revision or fingerprint match. No rollback rehearsal was run in this task.

Historical recovery coordinates remain provenance only. The prior S113 release captured
`pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` / `d243911cb20ffb01773072c0e27c723648eeea34`;
that release had captured `pmi-kc-app-rmtkgn08q-db89a37c43dc`.
The 2026-08-27 rollback rehearsal moved 100% traffic to predecessor
`pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, then restored `pmi-kc-app-rmtbh280n-61b78ef991cc`.
Those preserved outcomes were not rerun and do not authorize a Sheet-enabled rollback now.

## Configuration invariants

A routine release preserves:

- Production + Live;
- managed runtime service account;
- eleven Space maps;
- existing Secret Manager bindings, including the S82 `RENEWAL_DESK_PARTY_FILTER_KEY` reference;
- operating-Sheet exact keys remain unchanged; the S128 batch explicitly sets the switch false
  and requires every candidate, promoted revision and rollback target to preserve the pause.
  Fixed-row deletion and historical restore remain refused;
- local/Demo auth false;
- RentCast provider and allowance 50;
- no legacy copy-only Sheet setting; renewal-comp storage unchanged unless separately authorized;
  and
- canonical HTTPS base URL.

A difference requires explicit review; do not let stale local state replace current production
configuration. Documentation-only changes are not deployed.

### Historical live rehearsal result — 2026-09-10

All seven applicable native Node 22 compiled browser checks passed for that historical tree. The
R29 full-cohort desk passed sorting/filtering, inspection-only refusal, active dashboard/sections, term parity, exact
return/Back, keyboard/targets and narrow/zoom layout budgets. The guide passes all 42 semantic
steps. Independent page reads now run in parallel with their existing source/failure contracts;
fragment history restores the dashboard. Source freshness and every deadline remain unchanged.
B-REH1 closed for that historical local acceptance. Current batch local rehearsal evidence is stated
above; final rebuilt controls passed, while exact-SHA candidate assurance remains a separate gate.
