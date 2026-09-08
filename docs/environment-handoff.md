# Environment and release handoff

Updated: 2026-09-08. Verified CLI readback reconfirmed traffic, exact revision identities,
Production + Live and the managed runtime identity; both public version endpoints matched.
The same readback verified eleven Spaces, the enabled Sheet switch, false Demo flags, RentVine
and RentCast secret bindings, RentCast selection and allowance 50, and absent Dotloop client
bindings. Fingerprint, authorized domains, monitoring and measured usage retain their 2026-09-06
evidence date; a configured allowance does not establish remaining headroom. Browser ADC enrollment,
fresh-shell and paired post-reboot CLI/ADC refresh, and the app ADC preflight passed on 2026-09-08. No new deployment,
domain mutation or promotion occurred in the readiness run.

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

The active unreleased S98 correction preserves the two open keys and this switch but makes the
normal product path append-only. Its field-update and fixed-row reversal routes must fail before
writer construction; do not describe that behavior as serving until candidate promotion and
readback pass.

## Local host and authentication

- The repository is on the Windows-mounted workspace; Node/npm application commands run through WSL.
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
The installed task runs `release:watch`. Current main `30d2148` lacks the foundation file, so dry-run
and running readbacks refuse with `foundation_not_in_target`; no deployment has occurred.
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
  --budget-confirmed --allow-multiple-spaces
```

The bare `preflight:production` command is not the authoritative release projection: the release
wrapper injects the explicit descriptor and evaluates the exact replacing runtime map. Never bypass
a release-wrapper refusal. If `auth:ensure` reports the gcloud CLI credential stale, run the
enrollment command it names; do not bridge a token by hand.

## Candidate release

```bash
npm run release -- --environment=production --execute \
  --budget-confirmed --allow-multiple-spaces
```

Capture the returned exact candidate revision, candidate tag, candidate origin, and predecessor.
Compare the candidate's normalized runtime spec to the captured predecessor, allowing only reviewed
image and `APP_COMMIT_SHA` identity differences plus any explicitly authorized change. Inspect
provider-generated per-build provenance metadata separately.

Current zero-traffic candidate (deployed 2026-09-06 from commit
`7b3fdadac134550c24b029034753a38f16e4096b`): revision `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, tag
`cand-rmtq71kjl-bff41bbdb5fa`, captured predecessor `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` (still
serving 100%), configuration fingerprint
`sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`. Its anonymous smoke passed (root 307,
sign-in 200, protected 307, version 200 at the exact commit and revision) and its hostname is the only
candidate entry in the authorized sign-in domains. It is not promoted; the S51 candidate assurance
below has not run.

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
and read it back. Two distinct canary profile directories outside the repository must then hold
sessions as the expected Admin and Editor on BOTH the exact candidate origin and the canonical
origin: the receipt run drives the predecessor baseline against the canonical host before the
candidate canaries, and the session cookie is host-only. Enroll each profile once per origin with
`npm run auth:enroll-canary`, then let `npm run auth:ensure -- --need=canary --origins=<canonical>,<candidate> --admin-profile=<path> --editor-profile=<path>`
re-establish both sessions unattended immediately before the receipt run. A managed account with
no role claim is an Editor at the application layer. Copied cookies, guessed/default profiles, and
any password or one-time code typed by the runner are not evidence.

Capture the immutable revision-configuration fingerprint:

```bash
npm run assure:production-observation -- \
  --capture-config-fingerprint --live \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app \
  --expected-revision=<candidate-revision>
```

Choose two new, explicit receipt paths outside the repository. Run the aggregate candidate gate; it
serially runs the exact Admin and Editor canaries, independent Admin source reconciliation, origin/
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
  --editor-profile=<absolute-external-editor-profile> \
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
its exact commit, revision, configuration fingerprint, and 100% traffic, then run the Admin and
Editor canaries against the canonical origin with `--phase=rollback`. That phase alone may select a
workspace through the predecessor's existing `.renewal-lease-link` when the newer
`data-workspace-available` marker does not exist. It still requires exact version/configuration,
both complete role manifests, no browser diagnostic, and ready monitoring. Do not run the
candidate-era semantic reconciliation against a predecessor that does not publish its markers.

## Promotion and observation

Promote only the exact passed candidate. The release command validates the fresh aggregate receipt
and reserves the new promotion-receipt path before traffic changes:

```bash
npm run release -- --environment=production --promote \
  --candidate-revision=<candidate-revision> \
  --candidate-assurance-receipt=<absolute-external-candidate-receipt-path> \
  --promotion-receipt=<new-absolute-external-promotion-receipt-path> \
  --budget-confirmed --allow-multiple-spaces
```

The command reads back exact 100-percent traffic before it durably commits the promotion receipt. If
any post-traffic readback or receipt-persistence step fails, it restores the receipt-bound
predecessor and verifies that restoration before reporting failure.

Run the canonical-origin observation with the bound promotion receipt, fingerprint, managed
operator, and both explicit profiles. The observer rejects caller-supplied predecessor or promotion
time:

```bash
npm run assure:production-observation -- \
  --live --base-url=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app \
  --expected-commit=<exact-sha> --expected-revision=<candidate-revision> \
  --expected-config-fingerprint=<sha256-fingerprint> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app \
  --promotion-receipt=<absolute-external-promotion-receipt-path> \
  --operator-email=<managed-operator@pmikcmetro.com> \
  --admin-profile=<absolute-external-admin-profile> \
  --editor-profile=<absolute-external-editor-profile>
```

The runner executes immediate and end-of-300,000-ms Admin/Editor canaries and reconciliation. It may
wait only through the specified two-minute monitoring-ingestion grace. It emits a bodyless decision
and never changes traffic. A `rollback_required` result requires restoring the exact captured
predecessor, then repeating its recorded `--phase=rollback` Admin/Editor canaries plus exact
commit/revision/configuration, ready monitoring, and 100% stable-traffic readback. Do not claim that
an older predecessor implements the candidate's new Renewal Desk reconciliation schema.

After a passed observation, independently read back traffic, Ready state, service account,
Production + Live descriptor, exact Space maps, expected secret references, allowance 50, current
Sheet/action/runtime state, bounded routes, and `/api/version`. The operating-Sheet switch remains
enabled for S98's two activated keys; the legacy copy-only setting and broad Sheet action remain
absent/closed. Candidate assurance must also prove that normal field update and fixed-row reversal
return the typed provider-capability refusal without constructing a writer, while normal row append
remains behind its exact lease-scoped claim. The Registry must remain 48 keys/16 open unless a
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
- current operating-Sheet action/runtime state: both exact keys and the switch stay on, while the
  hardened route permits normal append only and refuses fixed-row update/delete/restore;
- local/Demo auth false;
- RentCast provider and allowance 50;
- no legacy copy-only Sheet setting; renewal-comp storage unchanged unless separately authorized;
  and
- canonical HTTPS base URL.

A difference requires explicit review; do not let stale local state replace current production
configuration. Documentation-only changes are not deployed.
