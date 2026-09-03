# Environment and release handoff

Updated from live readback and approved target contracts: 2026-09-02.

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
- Keep `GOOGLE_APPLICATION_CREDENTIALS` unset.
- `.gcloudignore` inherits `.gitignore` and excludes `.claude/`, `output/`, and local env files
  from source uploads.
- Current preflight finds fresh Application Default Credentials for the managed
  `josiah@pmikcmetro.com` account. The default gcloud refresh credential remains stale and cannot
  refresh non-interactively.
- For gcloud commands, the established bridge obtains the fresh ADC token in process and passes it
  only through a task-specific `CLOUDSDK_AUTH_ACCESS_TOKEN` environment value. It must never print,
  log, or persist the token. Re-run both identity preflights immediately before cloud work and refuse
  unless the selected principal is the exact managed account.
- Never automate an authentication dialog, password, or MFA challenge. If ADC is not fresh or the
  managed principal cannot be read back, a person must reauthenticate.
- Browser assurance uses two explicit persistent profile directories outside the repository, one
  for the expected managed Admin and one for the expected managed Editor. Never guess or copy a
  default/personal profile or infer a role from a cookie.

## Preflight

```bash
npm run preflight:identity
npm run preflight:adc
npm run release -- --environment=production --plan-only \
  --budget-confirmed --allow-multiple-spaces
```

The bare `preflight:production` command is not the authoritative release projection: the release
wrapper injects the explicit descriptor and evaluates the exact replacing runtime map. Never bypass
a release-wrapper refusal. If default gcloud refresh is stale but ADC is fresh and read back as the
managed account, use only the non-persistent token bridge above.

## Candidate release

```bash
npm run release -- --environment=production --execute \
  --budget-confirmed --allow-multiple-spaces
```

Capture the returned exact candidate revision, candidate tag, candidate origin, and predecessor.
Compare the candidate's normalized runtime spec to the captured predecessor, allowing only reviewed
image and `APP_COMMIT_SHA` identity differences plus any explicitly authorized change. Inspect
provider-generated per-build provenance metadata separately.

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
and read it back. Two distinct browser-profile directories outside the repository must then be
authenticated on that exact origin as the expected Admin and Editor; canonical-host-only sessions,
copied cookies, guessed/default profiles, and automated password/MFA are not evidence.

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
commands, complete the internal email-channel verification, and then use the read-only verifier:

```bash
npm run monitoring:plan -- \
  --operator-email=<managed-operator@pmikcmetro.com> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app

npm run monitoring:verify -- \
  --live --operator-email=<managed-operator@pmikcmetro.com> \
  --project=pmi-kc-kb-prod --region=us-central1 --service=pmi-kc-app
```

`monitoring:verify` must report the exact policy/metric set and one enabled, verified internal
notification channel before promotion.

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
