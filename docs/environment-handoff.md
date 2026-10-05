# Environment and release handoff

Updated 2026-10-05 (UTC).

The owner’s 2026-09-29 batch-scoped completion authorization is recorded in AGENTS.md. It permits
necessary Cloud Build/Cloud Run actions, diagnosed and verified repairs, resumes/replacements,
promotion, receipt-bound rollback and documentation closure through verified deployment of all
thirteen features. It supersedes per-attempt approval counts while retaining every technical and
safety gate. No source, checkpoint or receipt from a failed attempt may be rewritten as success.

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
Run `47fabb7c-b26b-4032-b993-f6bc49c66abd` released the S152–S167 program at `e106a88a50d541b4a012111019b09c2183f6ce20` on 2026-10-03; run `8b7dc3f1-4c5b-482a-94ca-26985150c68d` released batch 005 and run `5d1b4e3a-ef6d-4354-aef1-e9952dd28687` its first verification repairs on 2026-10-05; all remain carried.

The final application gate passed 7,462 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

## Verified corrective review

Five confirmed adversarial findings are repaired and verified deployed: lifecycle uncertainty, policy calendar validation/presentation, source-upload hygiene, vulnerable production dependencies and return-navigation transport. All repairs passed focused regressions, full application verification, exact main CI and cumulative release gates. Independent source/runtime readbacks and all six guarded remote product checks passed. The same runner performed the authorized repairs; this is not an independent second-review signoff. See [the adversary review](evidence/adversary-review-2026-09-29.md).

## Production

| Item                      | Value                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Project                   | `pmi-kc-kb-prod`                                                                   |
| Region                    | `us-central1`                                                                      |
| Cloud Run service         | `pmi-kc-app`                                                                       |
| URL                       | `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`                                       |
| Serving revision          | `pmi-kc-app-rmuv84r3a-f9fac2efc1af`                                                |
| Serving commit            | `b2308bc506132853ebd54e4ba0678abbf853fce0`                                         |
| Traffic                   | 100%                                                                               |
| Descriptor                | Production + Live                                                                  |
| Runtime identity          | project-managed PMI KC runtime service account                                     |
| Spaces                    | 11                                                                                 |
| Sheet write-back          | true on the serving revision (reviewed S159 value); the recovery target keeps true |
| Legacy copy-only Sheet id | not configured                                                                     |
| RentCast                  | selected; allowance 50                                                             |
| Action Registry           | 48 exact keys; 16 open and 32 closed                                               |
| Retired broad action ids  | non-executable; only exact proven keys are open                                    |
| Demo flags                | false                                                                              |

Secret names are bound through Secret Manager. Values never belong in this file.

S113's normal append/field-update implementations remain deployed with fresh server-resolved
target/value checks, exact confirmation, one-attempt claims, receipt/readback and separately
confirmed correction. S128 currently pauses all operating-Sheet mutation dispatch, including
append, updates and corrections. The queued S152–S167 release (S159) resumes the existing normal
append and recognized-field updates: candidate and promoted revisions read the reviewed switch
value true and the recovery target keeps the predecessor's actual value. Row deletion and
historical restore remain unavailable.
The optional build-time key `NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST` (bare canonical host)
enables the same-tab sign-in redirect on phones and in-app browsers (S165); set it only after the
owner adds the canonical `/__/auth/handler` redirect URI (owner step A7), never before.

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
  passed after fresh enrollment on 2026-09-29; headed Admin enrollment verified at 09:34:11.947Z.
  The owner completed the attended step; the runner never answers the challenge. Historical enrollment and reboot
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

The September 30 operational-maintenance correction uses fresh approved CLI/ADC token probes,
not a fixed enrollment-age budget. A fresh WSL `auth:ensure -- --unattended` check verified both
CLI and ADC token refresh under `josiah@pmikcmetro.com` after an earlier failed probe; no new
identity or policy was used. If Google requires interactive reauthentication later, the owner completes it;
the watcher waits on one exact pre-dispatch auth checkpoint and re-probes after local enrollment
changes. Permission denial, unknown probe failure and in-flight cloud ambiguity retain separate
holds. The Cloud Run service's managed runtime identity is independent of this local store.
A fresh read-only service describe confirmed the documented serving revision still has 100% traffic;
it did not reverify product routes or every environment setting.

### Local release watcher

Run `7753e5f5-2325-4b19-b83d-dc3475d71b0b` completed exact `b2308bc506132853ebd54e4ba0678abbf853fce0`. Its permit is consumed and checkpoint
complete. The watcher exited; supplemental profile/lock ownership was released after verified
cleanup. Failed runs and every original report/claim remain outside Git with their actual verdicts.
The existing scheduled task remains unchanged; a consumed or missing permit cannot dispatch
forward work. A stopped process alone is never proof of a durable release hold.

Every mutation-capable entry requires actual inherited kernel-lock ownership, the exact
run/SHA/revision checkpoint and admitted permission. Follow the ordered batch runbook. No direct
standalone command or historical successful receipt substitutes for admission.

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
permit, fresh preflight GO for every queued item and atomic admission under the release lock.
The watcher checks the current green `main` SHA against that permit; it cannot advance to another
head under the same permission. An unfinished checkpoint still pins its exact SHA and must be
reconciled through the runbook before a new run. Never replace a failed checkpoint or dispatch claim
to obtain another build.
The last successful serialized release is the batch 005 follow-up run `7753e5f5-2325-4b19-b83d-dc3475d71b0b`,
exact `b2308bc506132853ebd54e4ba0678abbf853fce0` / `pmi-kc-app-rmuv84r3a-f9fac2efc1af`. Recovery preparation, the one application build, candidate smoke,
configuration/domains, Admin assurance, reconciliation, promotion and observation passed.
Earlier failures and their diagnosed repairs retain their actual outcomes in the shared batch
audit and immutable external receipts. Historical rollback and superseded candidates are not
receipts for this completed run.

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

An earlier local repair rehearsal passed eight compiled smokes: navbar, dashboard-assistant,
renewal-desk, renewal-guide-controls, maintenance-blockers, maintenance-intake, theme and Work.
Local notice/draft controls also passed. Final rebuilt G4/G5 controls passed on build
`pAKd_VsJI8vmZvjAv6Lgu`, with zero forwarded business writes; the complete native gate passed.
The new run L build and core E2E passed as recorded above. Its frozen compiled cold/desk-warmed notice
checks and separate cohort diagnostic passed; older controls/presentation retain their exact-build scopes.
In-memory synthetic transport checks establish local control
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
application Cloud Build, prepare and verify the recovery baseline described below. Its
zero-traffic predecessor clone uses the captured image digests and does not require another build.

Capture the returned exact candidate revision, candidate tag, candidate origin, and predecessor.
Compare the candidate's normalized runtime spec to the captured predecessor, allowing only reviewed
image and `APP_COMMIT_SHA` identity differences plus the reviewed operating-Sheet switch value. Inspect
provider-generated per-build provenance metadata separately.

The serving candidate is `df772b30c60043d5fe4c57ff2275990d18a535b3` / `pmi-kc-app-rmur4a2vc-185ba8b9f3b8`, tag `cand-rmur4a2vc-185ba8b9f3b8`.
Fingerprint: `sha256:1e4fbc10f3abad951f40b37b07d47d526f67e30334ac237d148b0e7c63a7a6e2`. Its captured predecessor is `pmi-kc-app-recovery-175fee1d276c4e6f`, the run-bound recovery clone of
batch 004's release (`1402e51b`) that served after run `175fee1d`'s verified rollback;
the run-bound paused recovery clone is described below.
Exact candidate/canonical identity, all candidate gates, promotion and final readbacks passed.

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
immutable original baseline. The shared recovery module prepares one zero-traffic clone from that predecessor configuration,
changing only revision identity and keeping the predecessor's actual Sheet switch value. The current predecessor reads false. It does not use the current service template or build a new predecessor image.
Ready state, exact configuration/digests, version, tagged Admin assurance, monitoring and unchanged
original traffic must pass before a separate immutable supplemental recovery receipt is issued.

Zero-traffic target assurance uses `--phase=recovery_preparation`; canonical predecessor capture
and actual canonical rollback use `--phase=rollback`. Both phases may select a workspace through
the predecessor's existing `.renewal-lease-link` when newer semantic markers are absent. Exact
version/configuration, the complete Admin route manifest, diagnostics and monitoring remain
required. Candidate-era semantic reconciliation cannot be imposed on a predecessor without those
markers. The first run's 09:47:29.810Z supplemental receipt is historical d63f evidence only.
The completed run's clone `pmi-kc-app-recovery-47fabb7cb26b4032` passed preparation; receipt
`55c77605-9945-4617-bfab-c160d6ff366a` issued at 2026-10-03T18:09:15.101Z.
No traffic recovery occurred; prepared recovery is not a rollback verdict.

## Promotion and observation

Promotion runs only inside the admitted watcher's exact promotion checkpoint. Immediately before
its durable one-attempt claim, the release command revalidates kernel lock/admission, fresh candidate
assurance, the still-serving original's 100% traffic/configuration and the prepared recovery target's
Ready state, digests, configuration and receipt. It reads back exact candidate 100% traffic before
committing the version-5 promotion receipt. No caller may substitute another predecessor, recovery
target, fingerprint or run identity.

Post-traffic promotion failure and observer rollback now use the same receipt-bound recovery
executor. A globally shared durable claim precedes the one traffic request. Lost replies and restart
reconcile that exact target and retained operation; they cannot dispatch another target or retry an
ambiguous traffic change. Recovery succeeds only after exact target traffic/version/configuration,
the recorded predecessor Sheet switch value, Admin assurance and monitoring pass. Authentication failure preserves the recovery
intent for the owner's attended enrollment. Held or expired forward permission does not revoke
already-authorized exact receipt-bound recovery, but actual kernel lock and phase proof remain required.

The watcher runs canonical observation with the bound promotion receipt, fingerprint, managed
operator and explicit Admin profile. The observer rejects caller-supplied predecessor or promotion
time. This batch's promotion verified at 2026-10-02T15:48:53.296Z; its observation passed
with two checkpoints in 396,284 ms.

The runner executes immediate and end-of-300,000-ms Admin canaries and reconciliation. It may
wait only through the specified two-minute monitoring-ingestion grace. It emits a bodyless decision
and never changes traffic in observation mode. A `rollback_required` result invokes the shared
recovery flow under the watcher lock. Its durable target is the supplemental receipt's prepared
revision and fingerprint; it never verifies a replacement against another revision's
identity. Do not claim that an older predecessor implements the candidate's new Renewal Desk
reconciliation schema.

After a passed observation, independently read back traffic, Ready state, service account,
Production + Live descriptor, exact Space maps, expected secret references, allowance 50, current
Sheet/action/runtime state, bounded routes, and `/api/version`. The readback expects the reviewed
switch value (false on the serving S128 revision; S159: true on the queued candidate and promoted
revisions); both exact Registry keys retain their authority and never override a false switch. The legacy copy-only setting and broad Sheet action remain absent/closed. S113 replaces the older candidate's blanket normal-field refusal: normal field updates
require the exact current proposal, the confirming staff member's exact confirmation (Admin on the
serving revision; Editor once S152–S167 is released), claim and receipt/readback. Row deletion and
historical fixed-row reversal remain refused; normal append keeps its exact lease-scoped claim.
Read-only managed canaries must not perform a source write to demonstrate these paths; route/store
acceptance and actual operational receipts remain distinct evidence. The Registry remains 48 keys/16 open unless a
separately authorized exact-key activation passed its own gates.

## Current rollback

Captured predecessor: `pmi-kc-app-rmuv5c6eu-e3c268629df8` from commit
`9e76c14f5238f22be9ddecbffed149eee3db6d38`. This predecessor reads Sheet=true; the supplemental receipt
below is the current rollback authority.

The verified run-bound recovery target is `pmi-kc-app-recovery-7753e5f523254b19`,
fingerprint `sha256:fc957ab056651096ce32dbb333075d46b4f208c9564659dd3a6efadafc14c10d`, with Sheet=true. Receipt
`c20682b1-13bb-4fa9-aebb-2d81fb4b5cce` issued at 2026-10-05T12:36:17.090Z; reference hash
`sha256:e09ff997a705dde2b27bc15e082bb2fb211fa815ebffd8f5ce7c37a4aef01f06`. The receipt binds original image/configuration, the
predecessor's actual Sheet switch value, target identity and preparation assurance to run `7753e5f5-2325-4b19-b83d-dc3475d71b0b`.
Forward restoration and rollback require fresh actual state and the exact receipt-bound
contract. Runs 7753e5f5, 5d1b4e3a, 8b7dc3f1 and 47fabb7c needed no traffic rollback and run a83ed59b never changed
traffic; runs 175fee1d and 0aa79bfe each rolled back
verified to its run-bound recovery target. A receipt never transfers to
another run. Recovery targets prepared before the S152–S167 release read Sheet=false and are not
current restoration targets.

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
- operating-Sheet exact keys remain unchanged; the serving S128 batch sets the switch false, and
  the queued S159 release sets it true on candidate and promoted revisions from the one reviewed
  constant while the rollback target keeps the predecessor's actual value. Fixed-row deletion and
  historical restore remain refused;
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
