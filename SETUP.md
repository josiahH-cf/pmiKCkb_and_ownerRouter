# PMI KC setup

Use WSL/Linux in this repository. The installed dependency tree is Linux-targeted; do not run
`npm ci` from Windows against the same checkout.

## Local setup

```bash
npm ci
npm run host:check
npm run dev
```

Local development is launched through the repository wrapper as explicit Demo + Live-read-only.
It may read bounded live data and must refuse every durable write and provider effect. Production
fixtures and product Demo/Test lanes do not exist.

Required non-secret configuration names are documented in `.env.example`. Put local values in
ignored `.env.local`; production deployment values come from ignored
`.env.production.local`. Never commit either file.

## Identity

- Google Cloud CLI and ADC must resolve to a managed `pmikcmetro.com` user.
- Production Cloud Run uses the project runtime service account.
- Firebase users must be verified managed-domain users.
- `GOOGLE_APPLICATION_CREDENTIALS` must remain unset; key files are not supported.

Run:

```bash
npm run preflight:identity
npm run preflight:adc
```

The managed Windows Cloud SDK store is available from WSL through the explicit
`CLOUDSDK_CONFIG` path recorded in `docs/environment-handoff.md`.

## Verification

```bash
bash scripts/verify.sh
npm run test:e2e:core
```

The canonical verifier covers clean install, format, lint, typecheck, unit tests, Firestore Rules,
policy/static gates, and production build. The E2E command is separately bounded.

## Production release

Use `docs/environment-handoff.md`. A release must preserve the reviewed Production+Live descriptor,
managed runtime identity, eleven Spaces, Secret Manager bindings, and closed operating-Sheet write
switch unless the requested slice explicitly changes one of those facts.

Do not run a live RentVine or Sheet write as a setup smoke.
