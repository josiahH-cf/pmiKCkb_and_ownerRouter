# Environment and release handoff

Updated from live readback and approved target contracts: 2026-09-01.

## Production

| Item                      | Value                                          |
| ------------------------- | ---------------------------------------------- |
| Project                   | `pmi-kc-kb-prod`                               |
| Region                    | `us-central1`                                  |
| Cloud Run service         | `pmi-kc-app`                                   |
| URL                       | `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`   |
| Serving revision          | `pmi-kc-app-rmtic5vib-8774cfecd0c8`            |
| Serving commit            | `fb32194b5a15be11fd1e7e2dff7192d62dd947fc`     |
| Traffic                   | 100%                                           |
| Descriptor                | Production + Live                              |
| Runtime identity          | project-managed PMI KC runtime service account |
| Spaces                    | 11                                             |
| Sheet write-back          | false                                          |
| Legacy copy-only Sheet id | not configured                                 |
| RentCast                  | selected; allowance 50                         |
| S30 RentVine action       | non-executable                                 |
| Demo flags                | false                                          |

Secret names are bound through Secret Manager. Values never belong in this file.

## Local host and authentication

- The repository is on the Windows-mounted workspace; Node/npm application commands run through WSL.
- Keep `GOOGLE_APPLICATION_CREDENTIALS` unset.
- `.gcloudignore` inherits `.gitignore` and excludes `.claude/`, `output/`, and local env files
  from source uploads.
- On 2026-09-01 identity preflight resolved gcloud and fresh ADC to the managed
  `josiah@pmikcmetro.com` account. The default gcloud refresh credential still fails non-interactively.
- The S96 release used a short-lived ADC token only in a task-specific shell variable passed through
  `CLOUDSDK_AUTH_ACCESS_TOKEN`. It was neither printed nor written. This established bridge is usable
  only after fresh ADC and exact managed-principal readback; otherwise a person must reauthenticate.
  Authentication dialogs must never be automated.
- The Windows Cloud SDK profile at `/mnt/c/Users/josia/AppData/Roaming/gcloud` had no active account
  when last inspected. Do not mutate authentication merely to satisfy a local label; use managed
  identity and read back the selected principal before a cloud mutation.

## Preflight

```bash
npm run preflight:identity
npm run preflight:adc
npm run release -- --environment=production --plan-only --budget-confirmed --allow-multiple-spaces
```

The bare `preflight:production` command is not the authoritative release projection: the release
wrapper injects the explicit descriptor and evaluates the exact replacing runtime map. Never bypass a
release-wrapper refusal. If default gcloud refresh is stale but ADC is fresh and read back as the
managed account, use only the non-persistent token bridge above. Never print or persist an access
token.

## Release

```bash
npm run release -- --environment=production --execute \
  --budget-confirmed --allow-multiple-spaces
```

Smoke the returned tag URL with exact tag, service, revision, and 40-character commit. Compare the
candidate's normalized configuration to the captured predecessor, allowing only the reviewed image
and `APP_COMMIT_SHA` identity differences. Then:

```bash
npm run release -- --environment=production --promote \
  --candidate-revision=<exact> --budget-confirmed --allow-multiple-spaces
```

After promotion, read back traffic, Ready state, service account, Production+Live descriptor, exact
Space maps, expected secret references, allowance 50, the suite-owned Sheet/action/runtime state,
bounded routes, and `/api/version`. Before S98 activation, Sheet writeback remains false. S98 removes
the legacy copy-only setting and may enable only the exact operating actions after its temporary-row
proof. S97/S99/S100 releases read back every named exact key and confirm every broad/unlisted key
remains closed. S36 additionally proves its temporary store/object absent, eleven predecessor stores
unchanged, and its runtime flag false at closeout.

## Current rollback

Captured predecessor: `pmi-kc-app-rmtg73suu-fe8734d35330` from commit
`1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c`.

```bash
gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtg73suu-fe8734d35330=100 --quiet
```

Forward restoration:

```bash
gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtic5vib-8774cfecd0c8=100 --quiet
```

The 2026-08-27 rehearsal switched the predecessor to 100%:
`pmi-kc-app-rmtafuqbg-4e2e4ffe0f48` passed exact version and bounded-route smoke, then
`pmi-kc-app-rmtbh280n-61b78ef991cc` was restored and passed the same smoke again. Verified release
lineage then included S77 revision `pmi-kc-app-rmtep3ke9-9d3ecafb0c2e` from commit
`2d7903d42dce9dbfad49338b959e467f6c333ccc`, S59 revision
`pmi-kc-app-rmtew9a2z-46a2353b6491` from commit
`64031f8ee028f09930660060c8f5f627ca5ccde1`, and S80 revision
`pmi-kc-app-rmtf01asj-4b3665ad072f` from commit
`d2dfbcc2a865af1f92103083c2a49714c2dc3977`. These identities are retained as verified provenance,
not current traffic instructions.

The S30 release did not repeat that traffic movement; it captured its immediate predecessor, proved
normalized candidate/predecessor parity, promoted the exact candidate, and
passed stable smoke/readback. No client-data or provider effect occurred.

The S96 release captured `pmi-kc-app-rmtg73suu-fe8734d35330`, proved exact commit/revision and
bounded routes on zero-traffic candidate `pmi-kc-app-rmtic5vib-8774cfecd0c8`, matched normalized
runtime configuration, promoted only that revision, and passed stable traffic/configuration/action
readback. Production had no connector records; no credential, vault, provider, or client-data effect
occurred.

## Configuration invariants

A routine release preserves:

- Production + Live;
- managed runtime service account;
- eleven Space maps;
- existing Secret Manager bindings;
- current operating-Sheet action/runtime state (false until the S98 activation gate changes and
  reads it back);
- local/Demo auth false;
- RentCast provider and allowance 50;
- no legacy copy-only Sheet setting after S98; renewal-comp storage unchanged unless separately
  authorized; and
- canonical HTTPS base URL.

A difference requires explicit review; do not let stale local state replace current production
configuration. Documentation-only changes are not deployed.
