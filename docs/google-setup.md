# Google and Firebase operations

Updated: 2026-09-02.

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

The operating renewal Sheet is a read source and exact human-confirmed write target. Its production
write switch is on only for the activated S98 keys
`google_sheets.renewal_checklist.row_append` and
`google_sheets.renewal_checklist.field_update`; the broad compatibility key remains closed. S98's
bounded proof completed against one temporary real source-backed row in the operating table. That
row was read back, separately deleted through its receipt-bound inverse, and proven absent. Do not
rerun the proof or create a substitute proof row. The active unreleased hardened product route uses
this scope only for normal server-derived append; field update and fixed-row delete/restore refuse
before writer construction until a stable provider seam exists. DWD identifiers are non-secret;
customer Sheet contents and values are sensitive and never enter Git/logs. The legacy copy-only
configuration has been removed and is not a fallback.

## Gmail

DWD/provider scopes do not grant generic product behavior. Product execution still requires the exact
Action Registry key, actor authorization, source context, and confirmation. Client notices remain
draft-only. S100 chat sync is active; its resident-reply draft key remains closed pending the one
mapped synchronized resident message with a verified email required by that suite.
