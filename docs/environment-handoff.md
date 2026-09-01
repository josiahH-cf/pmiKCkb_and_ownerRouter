# Environment and release handoff

Updated from live readback and approved target contracts: 2026-09-01.

## Production

| Item                      | Value                                          |
| ------------------------- | ---------------------------------------------- |
| Project                   | `pmi-kc-kb-prod`                               |
| Region                    | `us-central1`                                  |
| Cloud Run service         | `pmi-kc-app`                                   |
| URL                       | `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`   |
| Serving revision          | `pmi-kc-app-rmtiwwud5-993818fec846`            |
| Serving commit            | `796879d6e95834a749b8f11f998ff5c76e6d0459`     |
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
- The S96, S85, S86, and S83 releases used a short-lived ADC token only in a task-specific shell variable passed through
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
candidate's normalized runtime spec to the captured predecessor, allowing only the reviewed image
and `APP_COMMIT_SHA` identity differences; inspect provider-generated per-build provenance metadata
separately. Then:

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

Captured predecessor: `pmi-kc-app-rmtimspsj-ee9bbf50108f` from commit
`72f926d96aead0b5b6826494713203672a18a40a`.

```bash
gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtimspsj-ee9bbf50108f=100 --quiet
```

Forward restoration:

```bash
gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtiwwud5-993818fec846=100 --quiet
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

The S85 release captured `pmi-kc-app-rmtic5vib-8774cfecd0c8`, passed exact-SHA CI run
`33496148515`, proved exact commit/revision and bounded routes on zero-traffic candidate
`pmi-kc-app-rmtiii4il-dcf1708c88b8`, matched the predecessor runtime spec after excluding only image
and `APP_COMMIT_SHA`, promoted only that revision, and passed repeated stable version, theme-markup,
traffic, identity, Space-map, secret-reference, and runtime-state readback. No store, provider,
action-key, client-data, credential, or message effect occurred.

The S86 release captured `pmi-kc-app-rmtiii4il-dcf1708c88b8`, passed focused interaction and S96-
preservation suites, the canonical gate, core E2E, the real Chromium theme/viewport/accessibility
matrix, and exact-SHA CI run `33506372579`. Zero-traffic candidate
`pmi-kc-app-rmtimspsj-ee9bbf50108f` matched exact commit
`72f926d96aead0b5b6826494713203672a18a40a`, bounded routes, and the predecessor runtime spec after
excluding only image and `APP_COMMIT_SHA`; its provider-generated build id/source metadata was
reviewed separately. Only that revision was promoted. Two stable readbacks proved Ready/100%
traffic, exact version, managed identity, Production + Live, eleven matching Space maps, three
expected secret references, allowance 50, closed Sheet/Space write switches, and healthy bounded
routes. No store, provider, action-key, role, permission, client-data, credential, draft, or message
effect occurred.

The S83 release captured `pmi-kc-app-rmtimspsj-ee9bbf50108f`, passed focused access and interaction-
preservation coverage, full unit/Firestore/core-E2E/policy/build gates, and exact-SHA CI run
`33533250900`. One zero-traffic revision failed closed at the platform startup probe and never served
traffic. The clean zero-traffic candidate `pmi-kc-app-rmtiwwud5-993818fec846` then matched exact
commit `796879d6e95834a749b8f11f998ff5c76e6d0459`, bounded routes, and normalized predecessor runtime
configuration after excluding only image and `APP_COMMIT_SHA`; provider-generated build metadata was
reviewed separately. Only that candidate was promoted. Two stable canonical passes and independent
Cloud Run/Firestore readback proved Ready/100% traffic, exact version, managed identity, Production +
Live, eleven matching Space maps, three expected secret references, allowance 50, closed Sheet/Space
write switches, and the reconciled 41-key/seven-open Action Registry mirror. No role, claim, access
request, provider, credential, client-data, draft, or message effect occurred.

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
