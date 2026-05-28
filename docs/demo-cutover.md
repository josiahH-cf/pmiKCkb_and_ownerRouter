# Demo And Client Cutover Model

This repo is built demo-first. The demo environment should prove the PMI KC KB in the
builder's Google Workspace before the app is reconfigured for PMI KC Metro.

## Environments

| Environment         | Purpose                                                      | Hosted domain                  | Data ownership             |
| ------------------- | ------------------------------------------------------------ | ------------------------------ | -------------------------- |
| `local`             | Development with mocks and emulators                         | `ALLOWED_HD` from `.env.local` | Developer machine          |
| `demo`              | Working pilot in the builder's Google Enterprise environment | Builder Workspace domain       | Builder GCP/Firebase/Drive |
| `client-production` | Purchased/client deployment                                  | `pmikcmetro.com`               | PMI KC GCP/Firebase/Drive  |

Do not treat demo data as production data. The production environment is recreated from
configuration and approved seed templates, then filled with client-owned Drive sources.

## Environment-Specific Values

Each environment owns these values:

- `ALLOWED_HD`
- `GCP_PROJECT_ID`
- `FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- OAuth client IDs/secrets
- Cloud Run service URL and custom domain
- Firestore database ID
- Space Drive folder IDs
- Vertex AI Search data store IDs
- Cloud Run service account email
- Gmail sender identity for `KB Approval`
- Secret Manager secret names/versions

Values that must not move from demo to production:

- OAuth client secrets.
- Service account keys or identities.
- Firebase/GCP project IDs.
- Firestore exports, unless explicitly approved.
- Demo-only Drive folders or non-client source files.

Values that may move:

- App code.
- Firestore Security Rules.
- Non-secret seed definitions.
- Eval cases.
- Setup docs.
- Product constants that are already part of the specs.

## Cutover Default

Default to a clean client-production setup:

1. Provision a separate PMI KC GCP/Firebase project.
2. Configure `ALLOWED_HD=pmikcmetro.com`.
3. Register a new Firebase Web app and OAuth client.
4. Create new client-owned Drive folders.
5. Create new Vertex AI Search data stores.
6. Re-seed Spaces from code/config.
7. Add only approved PMI KC source files to Drive.
8. Re-run smoke tests.

Do not migrate demo Firestore content by default. If a demo SOP/template is worth
keeping, copy it intentionally as an approved seed or as a Drive source file.

## Cutover Smoke Test

Before declaring client-production ready:

- Allowed-domain sign-in works for a `pmikcmetro.com` Google account.
- Wrong-domain sign-in is rejected.
- Lease Renewals Space opens and shows seeded records.
- Ask returns one cited `Verified Source` answer from the configured source path or
  demo retrieval mode.
- Ask returns `No Reliable Source Found` for an unsupported question.
- An Editor can save an SOP/template/placeholder change.
- An Editor cannot approve.
- An Approver/Admin can approve or resolve.
- No app code writes to Gmail, Drive, RentVine, LeadSimple, DotLoop, QuickBooks, Boom,
  operational Sheets, or the Owner Router folder beyond explicitly allowed send-only
  notification behavior.

## Current State

The repo currently supports local and demo scaffolding. Live Firebase, Drive, Vertex AI
Search, Cloud Run, and Gmail setup still require external Google configuration. Mock
demo mode remains the default path for unattended local progress until those values are
available.
