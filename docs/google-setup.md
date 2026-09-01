# Google and Firebase operations

Updated: 2026-08-31.

The production project, Firebase application, Firestore, Cloud Run service, managed runtime identity,
APIs, Secret Manager bindings, and budget controls already exist. This is an operations checklist,
not a project-creation guide.

## Identity checks

```bash
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud gcloud config get-value account
CLOUDSDK_CONFIG=/mnt/c/Users/josia/AppData/Roaming/gcloud gcloud config get-value project
npm run preflight:identity
npm run preflight:adc
```

Expected identity is managed `pmikcmetro.com`; expected project is `pmi-kc-kb-prod`. Do not print
tokens or use a personal account/key file.

## Firebase

Google sign-in and the production Cloud Run host are configured. Role changes use trusted Admin
tooling and require a fresh sign-in before claims are treated as current. Vendor identities remain
separate from internal staff.

## Cloud Run

Use the release wrapper in `docs/environment-handoff.md`. Preserve Production+Live, eleven Spaces,
runtime service account, secrets, and write gates. Never use old demo-service commands.

## Sheets and Drive

The operating renewal Sheet is currently a read source and its write switch remains off. S98 owns
the approved transition to exact row append and supported-field update; its proof uses one temporary
real source-backed row in the operating table, not a copy. The row is visibly and machine-marked,
excluded from projections, read back, separately deleted, and proven absent before closeout. DWD
identifiers are non-secret; customer Sheet contents and proof values are sensitive and never enter
Git/logs. The legacy copy-only configuration is removed by S98 rather than used as a fallback.

## Gmail

DWD/provider scopes do not grant generic product behavior. Product execution still requires the exact
Action Registry key, actor authorization, source context, and confirmation. Client notices remain
draft-only.
