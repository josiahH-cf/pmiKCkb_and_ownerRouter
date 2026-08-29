# Environment and release handoff

Updated from live readback: 2026-08-29.

## Production

| Item              | Value                                          |
| ----------------- | ---------------------------------------------- |
| Project           | `pmi-kc-kb-prod`                               |
| Region            | `us-central1`                                  |
| Cloud Run service | `pmi-kc-app`                                   |
| URL               | `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`   |
| Serving revision  | `pmi-kc-app-rmtep3ke9-9d3ecafb0c2e`            |
| Serving commit    | `2d7903d42dce9dbfad49338b959e467f6c333ccc`     |
| Traffic           | 100%                                           |
| Descriptor        | Production + Live                              |
| Runtime identity  | project-managed PMI KC runtime service account |
| Spaces            | 11                                             |
| Sheet write-back  | false                                          |
| Rehearsal Sheet   | not configured                                 |
| RentCast          | selected; allowance 50                         |
| Demo flags        | false                                          |

Secret names are bound through Secret Manager. Values never belong in this file.

## Local host

- Repository is on the Windows-mounted workspace but dependencies are Linux/WSL.
- Keep `GOOGLE_APPLICATION_CREDENTIALS` unset.
- Managed Windows Cloud SDK config root:
  `/mnt/c/Users/josia/AppData/Roaming/gcloud`
- Run Node/npm commands through WSL.
- Do not commit `.env.local` or `.env.production.local`.

## Preflight

```bash
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud npm run preflight:identity
npm run preflight:adc
npm run release -- --environment=production --plan-only --budget-confirmed --allow-multiple-spaces
```

The bare `preflight:production` command is not the authoritative release projection: the release
wrapper injects the explicit descriptor and evaluates the exact replacing runtime map. Never bypass
a release-wrapper refusal.

## Release

```bash
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud \
  npm run release -- --environment=production --execute \
  --budget-confirmed --allow-multiple-spaces
```

Smoke the returned tag URL with exact tag, service, revision, and 40-character commit. Then:

```bash
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud \
  npm run release -- --environment=production --promote \
  --candidate-revision=<exact> --budget-confirmed --allow-multiple-spaces
```

## Current rollback

Captured predecessor: `pmi-kc-app-rmtbh280n-61b78ef991cc` from commit
`6aea639728efcad70e3e601e7a031c2b35722e08`.

```bash
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud \
  gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtbh280n-61b78ef991cc=100 --quiet
```

Forward restoration:

```bash
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud \
  gcloud run services update-traffic pmi-kc-app \
  --project=pmi-kc-kb-prod --region=us-central1 \
  --to-revisions=pmi-kc-app-rmtep3ke9-9d3ecafb0c2e=100 --quiet
```

The 2026-08-27 rehearsal switched the predecessor to 100%
(`pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`), read it back, and passed root, sign-in, Admin, and exact
version smoke. It restored the then-current
`pmi-kc-app-rmtbh280n-61b78ef991cc` revision and passed the same smoke again. The 2026-08-29 S77
release captured that restored revision as its immediate rollback target. No client-data or provider
effect occurred.

## Configuration invariants

A routine release preserves:

- Production + Live;
- managed runtime service account;
- eleven Space maps;
- existing Secret Manager bindings;
- operating Sheet write-back false;
- local/Demo auth false;
- RentCast provider and allowance;
- canonical HTTPS base URL.

A difference requires explicit review; do not let a stale local env replace current production config.
