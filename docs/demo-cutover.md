# Demo And Client Cutover Model

> Current governance note, 2026-06-03: this file is mainly the PMI KC KB environment
> cutover model. Cross-product cutover across KB, Lease Renewal Agent, and Gmail Inbox 0
> lives in `docs/integration-cutover-plan.md`.

This repo is built demo-first. The demo environment should prove the PMI KC KB in the
builder's Google Workspace before the app is reconfigured for PMI KC Metro.

## Environments

| Environment         | Purpose                                                      | Hosted domain                  | Data ownership             |
| ------------------- | ------------------------------------------------------------ | ------------------------------ | -------------------------- |
| `local`             | Development with mocks and emulators                         | `ALLOWED_HD` from `.env.local` | Developer machine          |
| `demo`              | Working pilot in the builder's Google Enterprise environment | Builder Workspace domain       | Builder GCP/Firebase/Drive |
| `client-production` | Purchased/client deployment                                  | `pmikcmetro.com`               | PMI KC GCP/Firebase/Drive  |

Do not treat demo data as production data. The production environment is recreated from
configuration and approved seed templates, then filled with client-owned source
locations. Use `docs/client-production-cutover.md` for the executable client rebuild
runbook.

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
- Space source targets, such as Drive folder IDs or Cloud Storage `gs://` prefixes
- Agent Search / Vertex AI Search data store IDs
- Cloud Run service account email
- `kb-automation@pmikcmetro.com` sender for `KB Approval`
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
4. Create new client-owned source locations. Cloud Storage `.txt` prefixes are the
   default path unless Drive retrieval is intentionally revisited.
5. Create client-owned Agent Search data stores.
6. Re-seed Spaces from code/config.
7. Add only approved PMI KC source files to the configured source locations.
8. Re-run smoke tests.

Do not migrate demo Firestore content by default. If a demo SOP/template is worth
keeping, copy it intentionally as an approved seed or as a Drive source file.

## Cutover Smoke Test

Before declaring client-production ready:

- Allowed-domain sign-in works for a `pmikcmetro.com` Google account.
- Wrong-domain sign-in is rejected.
- The approved demo Spaces open and show seeded records.
- Ask returns one cited `Verified Source` answer from the configured source path or
  demo retrieval mode.
- Ask returns `No Reliable Source Found` for an unsupported question.
- A User can save or suggest an SOP/template/placeholder change.
- A User cannot approve.
- An Admin can approve or resolve.
- No app code writes to Gmail, Drive, RentVine, LeadSimple, DotLoop, QuickBooks, Boom,
  operational Sheets, or Gmail Inbox 0 source folders beyond explicitly allowed
  send-only notification behavior.

## Current State

The repo currently supports local and demo scaffolding plus a documented
client-production rebuild path. Live Firebase, source locations, Agent Search, Cloud
Run, and Gmail setup still require external Google configuration for a client-owned
production environment. The current demo host has a four-workflow live Ask path through
Cloud Storage `.txt` sources and Agent Search for Lease Renewals, Maintenance Work
Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding. Mock demo mode
remains the safest unattended walkthrough for local show-and-tell resets.

Before any production deploy, run:

```bash
npm run preflight:production -- --env-file=.env.production.local
```
