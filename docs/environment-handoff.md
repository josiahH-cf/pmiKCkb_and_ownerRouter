# Environment and release handoff

Updated: 2026-09-10. Approved WSL CLI/ADC refresh passed this run. This does not establish the
24-hour elapsed-session proof or managed browser assurance. Canonical still serves the predecessor;
the previous readiness candidate remains unpromoted. The active S113 working tree is uncommitted.
Current release gates and exact observations are recorded in docs/loop-state.md and docs/facts.md.

## Production

| Item                      | Value                                           |
| ------------------------- | ----------------------------------------------- |
| Project                   | `pmi-kc-kb-prod`                                |
| Region                    | `us-central1`                                   |
| Cloud Run service         | `pmi-kc-app`                                    |
| URL                       | `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`    |
| Serving revision          | `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`             |
| Serving commit            | `d243911cb20ffb01773072c0e27c723648eeea34`      |
| Traffic                   | 100%                                            |
| Descriptor                | Production + Live                               |
| Runtime identity          | project-managed PMI KC runtime service account  |
| Spaces                    | 11                                              |
| Sheet write-back          | true for two exact S98 keys (serving baseline)  |
| Legacy copy-only Sheet id | not configured                                  |
| RentCast                  | selected; allowance 50                          |
| Action Registry           | 48 exact keys; 16 open and 32 closed            |
| Retired broad action ids  | non-executable; only exact proven keys are open |
| Demo flags                | false                                           |

Secret names are bound through Secret Manager. Values never belong in this file.

The older deployed candidate preserves the two keys and switch while refusing normal field updates.
The local S113 implementation replaces that refusal under the owner's explicit contract: fresh
server-resolved identity/type/value, exact confirmation, one-attempt claim, receipt/readback and
separately confirmed current-state correction. Row deletion and historical restore remain unavailable.
These S113 changes are not serving until their release gates pass.

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
  verifies identity/store before ordinary Google-library refresh. Browser enrollment verified the
  owner identity and bound the exact WSL ADC file. Fresh-shell and paired post-reboot CLI/ADC and app
  ADC preflights are READY using the unchanged enrollment. A transient identity lookup receives one
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
- Browser assurance reuses two existing managed profiles outside Git, each on both exact origins.
  Enroll through `npm run auth:enroll-canary`; unattended checks use `auth:ensure -- --need=canary`.
  The shared Linux browser resolver selects the installed executable, reused by the assurance harness.
  Never copy a personal profile or infer a role from cookies. Verification accounts retain displayed
  roles, but server boundaries refuse business effects. Authentication, logout and genuine reads work.
- A successful attended browser enrollment writes an opaque local marker. After a challenge the
  watcher waits for that marker to change before another browser auth probe; it cannot loop login.

### Local release watcher

`scripts/install-release-watcher.ps1` installs and reads back the limited interactive-user task
`PMI KC release watcher`. The logon trigger, catch-up and one-instance policy passed readback. After
an unexplained Windows launcher exit left an idle Linux watcher alive, the exact process was stopped
without a release checkpoint and the task restarted at 2026-09-08T16:41:36Z. Readback confirms a
running launcher and one Linux watcher; live automatic release acceptance remains pending.
`-CheckOnly` inspects without reinstalling. The hidden launcher is
`scripts/run-release-watcher.ps1`; its non-secret logs are under `%LOCALAPPDATA%/PMI-KC/release-watcher`.
WSL checkpoints and serialized locks live under `~/.local/state/pmi-kc-release`, outside Git.

Set MONITORING_OPERATOR_EMAIL in ignored .env.local to the existing verified managed alert
recipient. It is independent of the approved CLI/ADC login. Missing, non-managed or conflicting
configuration refuses the watcher; it never rewrites the cloud channel to match a development login.
The existing channel was read back and its recipient preserved on 2026-09-08; monitoring is READY.

Use `npm run release:watch:dry-run` to inspect one pass or `release:watch:once` for one actual pass.
The installed task runs `release:watch`. Pushed implementation 6e77d18f6d9916ba94078550d4b5ba73751e86c8
passed exact-SHA CI run 34262698002. The watcher accepted it, completed isolated preparation, captured
the serving predecessor and deployed pmi-kc-app-rmtt039q1-c1463245a94c. September 9 public version
readback confirms its exact identity. The checkpoint is in assurance, blocked on authentication.
Only exact-main-SHA green push CI permits an isolated runtime/served-asset release. Documentation-only
commits do not deploy. Candidate readbacks, domain replacement, fresh assurance receipt, exact
promotion and 300,000 ms observation remain gates. Durable rollback intent is stored before traffic
mutation; lost responses are read back and restart recovery cannot overwrite unrelated traffic.

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
Local Demo + Live-read-only refuses every persistence/provider effect, including app-owned progress.
Do not manufacture source data or bypass identity policy to make a browser smoke pass.

The 2026-09-07 verification used native WSL storage for a byte-identical manifest/lockfile install
and the Firestore emulator tests. Turbopack refused the external dependency symlink, so the original
mounted Linux installation was restored. No package version, bundler configuration, or assertion
was changed. B-GOLD1 subsequently closed after live source readback and the owner's explicit
approval of one expected-label correction. All source values and assertions are preserved. Native
and direct checks use the same excluded capture directory. Corrected full units pass 6,360 tests
with four skipped; 168 Firestore tests and production build pass. The native helper no longer
imports .env.local into test configuration. See the bodyless readiness review for check outcomes.

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

```bash
npm run release -- --environment=production --execute \
  --operator-email=josiah@pmikcmetro.com \
  --monitoring-operator-email=josiah+alerts@pmikcmetro.com \
  --admin-profile=/home/josiah/pmi-assurance/owner-admin \
  --budget-confirmed --allow-multiple-spaces
```

Capture the returned exact candidate revision, candidate tag, candidate origin, and predecessor.
Compare the candidate's normalized runtime spec to the captured predecessor, allowing only reviewed
image and `APP_COMMIT_SHA` identity differences plus any explicitly authorized change. Inspect
provider-generated per-build provenance metadata separately.

Current candidate public version (reread 2026-09-09) is commit
6e77d18f6d9916ba94078550d4b5ba73751e86c8, revision pmi-kc-app-rmtt039q1-c1463245a94c,
tag cand-rmtt039q1-c1463245a94c. Captured predecessor pmi-kc-app-rmtkmhj1z-8855e4c6dbfb
still answers canonical. Watcher completed smoke, fingerprint and domains before assurance.
Fingerprint: sha256:8810a5f8d31b6b1bb698f0e3cad9a361556c5abd4a57ae00b673dd4e099e016f.
It is blocked authentication_required after managed_browser_enrollment_required. Numeric traffic
and current domain enumeration were not independently reread today. Do not promote without the
exact receipt and remaining release gates.

Run the anonymous, GET-only candidate smoke before any authenticated browser check:

```bash
npm run smoke:release-candidate -- \
  --base-url=<candidate-origin> --expected-tag=<candidate-tag> \
  --expected-service=pmi-kc-app --expected-revision=<candidate-revision> \
  --expected-commit=<exact-40-character-sha>
```

Do not promote until the anonymous smoke and the complete S51 candidate assurance below pass.

## S51 candidate and post-promotion assurance

Run these gates only after the remediation commit is clean, pushed, and green at its exact SHA. Add
the exact candidate hostname to Firebase authorized domains through a reviewed managed cloud change
and read it back. The owner's September 10 direction accepts the existing
`josiah@pmikcmetro.com` Admin profile on both the candidate and canonical origins. The enrolled
profile is `/home/josiah/pmi-assurance/owner-admin`, outside the repository. Re-establish its
session with `npm run auth:ensure -- --need=canary --origins=<canonical>,<candidate> --admin-profile=/home/josiah/pmi-assurance/owner-admin --admin-email=josiah@pmikcmetro.com`.
Version 3 candidate/promotion receipts bind `browserPolicy=owner-admin-2026-09-10`; the candidate
and predecessor baseline explicitly record Editor `not_run`. Admin access does not prove Editor
restrictions; backend role tests remain required. No role, claim or canary business-refusal identity
changes. Copied cookies, guessed profiles and runner-entered security challenges remain forbidden.

Capture the immutable revision-configuration fingerprint:

```bash
npm run assure:production-observation -- \
  --capture-config-fingerprint --live \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app \
  --expected-revision=<candidate-revision>
```

Choose two new, explicit receipt paths outside the repository. Run the aggregate candidate gate; it
serially runs the complete Admin canary, independent Admin source reconciliation, origin/
traffic/configuration binding, predecessor recovery baseline, and monitoring readback. Production
promotion does not accept independently run diagnostic commands as a substitute for this receipt:

```bash
npm run assure:production-observation -- \
  --prepare-candidate-receipt --live \
  --base-url=<candidate-origin> \
  --expected-commit=<exact-sha> --expected-revision=<candidate-revision> \
  --expected-config-fingerprint=<sha256-fingerprint> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app \
  --operator-email=<managed-operator@pmikcmetro.com> \
  --admin-profile=<absolute-external-admin-profile> \
  --candidate-assurance-receipt=<new-absolute-external-candidate-receipt-path>
```

The canary/reconciliation browser starts offline with service workers blocked, installs its
GET/HEAD-only firewall, then connects. It must use the exact candidate revision's bound Sheet
configuration and fail closed on mutation, identity drift, partial reads, or source/application
disagreement.

The monitoring setup generator is print-only. If the exact managed S51 resource set is absent,
render its fully targeted plan, review every emitted mutation and rollback command, run the approved
commands, and then use the read-only verifier. The operator address is `josiah+alerts@pmikcmetro.com`,
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

Before promotion, establish the versioned recovery baseline on the still-serving predecessor. Read
its exact commit, revision, configuration fingerprint, and 100% traffic, then run the Admin
canary against the canonical origin with `--phase=rollback`. That phase alone may select a
workspace through the predecessor's existing `.renewal-lease-link` when the newer
`data-workspace-available` marker does not exist. It still requires exact version/configuration,
the complete Admin route manifest, no browser diagnostic, and ready monitoring. Do not run the
candidate-era semantic reconciliation against a predecessor that does not publish its markers.

## Promotion and observation

Promote only the exact passed candidate. The release command validates the fresh aggregate receipt
and reserves the new promotion-receipt path before traffic changes:

```bash
npm run release -- --environment=production --promote \
  --candidate-revision=<candidate-revision> \
  --candidate-assurance-receipt=<absolute-external-candidate-receipt-path> \
  --promotion-receipt=<new-absolute-external-promotion-receipt-path> \
  --operator-email=josiah@pmikcmetro.com \
  --monitoring-operator-email=josiah+alerts@pmikcmetro.com \
  --admin-profile=/home/josiah/pmi-assurance/owner-admin \
  --budget-confirmed --allow-multiple-spaces
```

The command reads back exact 100-percent traffic before it durably commits the promotion receipt. If
any post-traffic readback or receipt-persistence step fails, it restores the receipt-bound
predecessor and verifies that restoration before reporting failure.

Run the canonical-origin observation with the bound promotion receipt, fingerprint, managed
operator, and the explicit Admin profile. The observer rejects caller-supplied predecessor or promotion
time:

```bash
npm run assure:production-observation -- \
  --live --base-url=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app \
  --expected-commit=<exact-sha> --expected-revision=<candidate-revision> \
  --expected-config-fingerprint=<sha256-fingerprint> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app \
  --promotion-receipt=<absolute-external-promotion-receipt-path> \
  --operator-email=<managed-operator@pmikcmetro.com> \
  --admin-profile=/home/josiah/pmi-assurance/owner-admin
```

The runner executes immediate and end-of-300,000-ms Admin canaries and reconciliation. It may
wait only through the specified two-minute monitoring-ingestion grace. It emits a bodyless decision
and never changes traffic. A `rollback_required` result requires restoring the exact captured
predecessor, then repeating its recorded `--phase=rollback` Admin canaries plus exact
commit/revision/configuration, ready monitoring, and 100% stable-traffic readback. Do not claim that
an older predecessor implements the candidate's new Renewal Desk reconciliation schema.

After a passed observation, independently read back traffic, Ready state, service account,
Production + Live descriptor, exact Space maps, expected secret references, allowance 50, current
Sheet/action/runtime state, bounded routes, and `/api/version`. The operating-Sheet switch remains
enabled for S98's two activated keys; the legacy copy-only setting and broad Sheet action remain
absent/closed. S113 replaces the older candidate's blanket normal-field refusal: normal field updates
require the exact current proposal, Admin confirmation, claim and receipt/readback. Row deletion and
historical fixed-row reversal remain refused; normal append keeps its exact lease-scoped claim.
Read-only managed canaries must not perform a source write to demonstrate these paths; route/store
acceptance and actual operational receipts remain distinct evidence. The Registry remains 48 keys/16 open unless a
separately authorized exact-key activation passed its own gates.

## Current rollback

Captured predecessor: `pmi-kc-app-rmtkgn08q-db89a37c43dc` from commit
`e69e913acaf1d507f1b228d2064138a6a55e8629`.

```bash
gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtkgn08q-db89a37c43dc=100 --quiet
```

Forward restoration to the current serving revision:

```bash
gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtkmhj1z-8855e4c6dbfb=100 --quiet
```

The 2026-08-27 rollback rehearsal moved 100% traffic to predecessor
`pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, passed exact version and bounded-route smoke, restored the
then-current `pmi-kc-app-rmtbh280n-61b78ef991cc`, and passed the same smoke again. Later suite and
release lineage remains recoverable from Git and release receipts; it is provenance, not current
traffic instruction.

## Configuration invariants

A routine release preserves:

- Production + Live;
- managed runtime service account;
- eleven Space maps;
- existing Secret Manager bindings, including the S82 `RENEWAL_DESK_PARTY_FILTER_KEY` reference;
- current operating-Sheet action/runtime state: both exact keys and the switch stay on. The S113
  release carries the explicitly approved normal field-update contract and preserves append;
  fixed-row deletion and historical restore remain refused;
- local/Demo auth false;
- RentCast provider and allowance 50;
- no legacy copy-only Sheet setting; renewal-comp storage unchanged unless separately authorized;
  and
- canonical HTTPS base URL.

A difference requires explicit review; do not let stale local state replace current production
configuration. Documentation-only changes are not deployed.

### Current live rehearsal result — 2026-09-10

All seven applicable native Node 22 compiled browser checks pass. The final R29 full-cohort desk
passes sorting/filtering, inspection-only refusal, active dashboard/sections, term parity, exact
return/Back, keyboard/targets and narrow/zoom layout budgets. The guide passes all 42 semantic
steps. Independent page reads now run in parallel with their existing source/failure contracts;
fragment history restores the dashboard. Source freshness and every deadline remain unchanged.
B-REH1 is closed for local acceptance. Exact-SHA candidate assurance remains a separate release gate.
