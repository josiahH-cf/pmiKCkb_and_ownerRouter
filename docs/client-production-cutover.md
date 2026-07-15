# Client production cutover runbook

Updated: 2026-07-15. Target: `pmi-kc-kb-prod`, Cloud Run service `pmi-kc-kb-demo` in
`us-central1`, canonical host
`https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`.

This runbook deploys the stable V1 application with both Live and isolated Test records. It does not
wait for every possible provider integration. A provider without credentials/contracts/mappings is
shown as unavailable; its Test workflow still works in production without contacting it.

Never copy legacy demo Firebase/OAuth/service-account/bucket resources into production. Never put
customer records, Gmail bodies, credentials, setup links, TOTP material, or OAuth tokens in the repo.

## 1. Verify the candidate

Run from the repository root:

```bash
npm install
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:firestore
npm run test:e2e:core
npm run build
npm run verify
```

Known lint warnings or dev-only Moderate audit findings are acceptable only when they match the
documented inventory. A new error, High/Critical finding, runtime-reachable finding, or failed
Live/Test boundary test stops cutover.

The pure cutover rehearsal remains useful and makes no cloud calls:

```bash
npm run cutover:dry-run
npm run cutover:dry-run -- --json
```

It proves command generation and rollback shape; it does not replace deployed application
acceptance.

Keep the required project APIs enabled (the command is intentionally one line because the setup
preflight verifies it against the executable inventory):

```bash
gcloud services enable aiplatform.googleapis.com discoveryengine.googleapis.com storage.googleapis.com firestore.googleapis.com datastore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com monitoring.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com speech.googleapis.com --project=pmi-kc-kb-prod
```

## 2. Refresh managed identity and budget posture

```bash
npm run preflight:adc
npm run check:budget-guard
```

If the ADC check is stale, the owner runs this interactively from Windows PowerShell in the repo:

```powershell
npm run auth:session
```

PowerShell installed inside WSL is `pwsh`; it does not create the Windows executable
`powershell.exe` that the npm script calls. If invoking from WSL, launch the Windows shell explicitly
and run the command in the Windows repository path:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
  -NoProfile -ExecutionPolicy Bypass \
  -Command "Set-Location 'C:\Users\josia\Documents\github-windows\pmiKCkb_and_ownerRouter'; npm run auth:session"
```

Never work around managed-domain reauthentication with a personal Google account.

## 3. Capture rollback before changing anything

```bash
gcloud run services describe pmi-kc-kb-demo \
  --region=us-central1 --project=pmi-kc-kb-prod \
  --format="value(status.traffic[0].revisionName)"
```

Record the exact serving revision in `docs/environment-handoff.md` and `docs/status.md`. Confirm this
rollback command shape before continuing:

```bash
gcloud run services update-traffic pmi-kc-kb-demo \
  --region=us-central1 --project=pmi-kc-kb-prod \
  --to-revisions=<captured-prior-revision>=100
```

Rollback never deletes the Cloud Run service, revision history, source store, customer data, or audit.

## 4. Verify production configuration

Prepare the ignored production file only if it needs to be created/refreshed:

```bash
npm run prepare:production-env -- \
  --app-base-url=https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com
```

The file must keep these fences:

```dotenv
ALLOWED_HD=pmikcmetro.com
ASK_DEMO_MODE=false
LOCAL_DEMO_AUTH=false
GCP_PROJECT_ID=pmi-kc-kb-prod
FIREBASE_PROJECT_ID=pmi-kc-kb-prod
FIRESTORE_DATABASE_ID=(default)
VERTEX_AI_LOCATION=us-central1
VERTEX_SEARCH_LOCATION=us
APP_BASE_URL=https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app
KB_APPROVAL_NOTIFICATIONS_ENABLED=false
```

Keep real secret values out of this file when the deploy can bind Secret Manager directly. Run:

```bash
npm run preflight:production -- --env-file=.env.production.local
```

The preflight must reject legacy/demo project values, local URLs, emulator/demo flags, malformed
cross-project identities, and an incorrect Gmail push audience. A provider intentionally not active
may be absent only when the application represents its dependent actions as unavailable; it must not
silently fall back to fixtures as Live.

## 5. Enable the Vendor authentication prerequisites

Internal staff use managed-domain Google sign-in. Vendors use separate Admin-provisioned
Email/Password plus TOTP.

Add/verify the canonical authorized domain and existing Google provider:

```bash
npm run firebase:setup-auth -- \
  --project=pmi-kc-kb-prod \
  --authorized-domain=pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app
```

Enable Email/Password once in Firebase Console:

1. Security → Authentication → Sign-in method.
2. Open Email/Password, enable Email/Password, and save.
3. Do not add app self-registration. Vendor identities remain Admin-provisioned.

Enable project-level TOTP with a safe adjacent interval of `1` after managed reauthentication:

```bash
PROJECT_ID=pmi-kc-kb-prod
ACCESS_TOKEN="$(gcloud auth print-access-token)"
curl -X PATCH \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=mfa" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  -d '{"mfa":{"providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":1}}]}}'
```

The Test Vendor flow now needs no external invitation provider or OAuth: Admin provisioning returns the
password-setup link once, the Test operator completes password/TOTP, and the mailbox remains app-only.
Live Vendor OAuth/vault is activated later for each real routable Vendor.

## 6. Deploy Firestore rules and the application

Deploy reviewed rules. Composite indexes that are not required by a selected production query remain
absent; native TTL and a cleanup scheduler are not part of this command and are not V1 gates.

```bash
npm exec firebase -- deploy --only firestore:rules \
  --project pmi-kc-kb-prod
```

If a production query later reports a required declared composite index, review that query and deploy
indexes separately:

```bash
npm exec firebase -- deploy --only firestore:indexes --project pmi-kc-kb-prod
```

Inspect the code-only Cloud Run command without changing traffic:

```bash
npm run deploy -- --project=pmi-kc-kb-prod --service=pmi-kc-kb-demo \
  --region=us-central1 --search-location=us --budget-confirmed \
  --allow-multiple-spaces \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com \
  --dry-run
```

Then deploy:

```bash
npm run deploy -- --project=pmi-kc-kb-prod --service=pmi-kc-kb-demo \
  --region=us-central1 --search-location=us --budget-confirmed \
  --allow-multiple-spaces \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com
```

Record commit, Cloud Build ID, new revision, 100% traffic result, and captured prior revision. Rerun
the production preflight after `APP_BASE_URL` or any identity/resource binding changes.

## 7. Seed application records safely

The existing spaces/process definitions/Action Registry may be seeded idempotently after confirming
the active project and managed ADC:

```bash
npm run seed:spaces -- --dry-run
npm run seed:spaces
npm run seed:action-registry
npm run seed:process-definitions
npm run seed:notice-rules
```

Do **not** run `npm run seed:demo` in production. Production Test data is created through the signed-in
Test workspace controls so every record receives `data_mode=test`, a visible Test label, actor/reason,
and an app audit trail.

Use the canonical records only:

- unit `unit:test-maple-204` — `TEST — 204 Maple Court Unit 2`;
- Vendor `vendor:test-summit-plumbing` — `Summit Plumbing Test Vendor`;
- Vendor address `service@summit-plumbing.example.invalid`.

## 8. Deployed application acceptance

Perform the detailed desktop/phone run in
`docs/v1-tab-browser-acceptance-plan-2026-07-14.md`. At minimum:

- allowed-domain internal sign-in succeeds and wrong-domain sign-in fails;
- Admin and scoped Editor authorization behaves correctly;
- Console renders Live and Test panels together; unavailable providers never use fixture fallback;
- Spaces/Ask returns a cited approved-source answer and `No Reliable Source Found` when unsupported;
- Approval Queue, Workflow Communications, Connections, Notifications, and Admin have no dead ends;
- canonical Maintenance Test intake → ticket → assignment → status/activity/notes/receipts → Done
  persists to Firestore with zero provider calls;
- canonical Test Vendor completes password setup and TOTP, sees only the assigned Test ticket, uses the
  app-only Test mailbox, then loses access after deassign/disable;
- each Test receipt states `provider_contacted=false` and `live_proof_eligible=false`;
- any enabled Live write shows exact action/target/material values, requires human confirmation, and
  produces a bodyless receipt/readback; and
- rollback to the captured prior revision is rehearsed, followed by an intentional return to the
  candidate if the candidate is healthy.

No acceptance step sends to Dan, a tenant, owner, or third party unless that exact Live action and
target were explicitly selected and confirmed. No autonomous/scheduled/bulk/model-triggered send is
permitted.

Production smoke checklist:

- Allowed-domain sign-in reaches `/ask`.
- Wrong-domain sign-in is rejected.
- Admin page opens for the Admin account.
- At least one approved Space opens and shows seeded records.
- Ask returns a cited `Verified Source` answer from an approved production source.
- Ask returns `No Reliable Source Found` for an unsupported question.
- User can save or suggest editable records but cannot approve.
- Admin can approve, return, assign, snooze, and disable eligible queue items.
- Admin can run Approval Queue bulk actions against real or explicitly approved test queue items,
  with per-item skipped reasons visible. Do not seed demo queue records in production just to test
  this path.
- Console shows separate Live and visibly labeled Test records; Test never falls back into Live or
  counts as Live evidence.
- The canonical Maintenance Test journey persists intake, assignment, status, activity, notes,
  simulated receipts, and Done with zero external-provider calls.
- The canonical Test Vendor completes password setup and TOTP, sees only its assigned Test ticket,
  uses the app-only Test mailbox, and loses access after deassignment or disable.
- Every enabled Live write names the exact action, target, and material values; requires the permitted
  human confirmation; emits a bodyless receipt and readback; and an unavailable action makes no
  provider call.

## 9. Optional content and provider activation

Additional source ingestion and external integrations happen independently after the stable app is
available.

For source additions, use an ignored copy of the manifest and dry-run first:

```powershell
New-Item -ItemType Directory -Force -Path temp
Copy-Item docs/source-corpus/client-production-source-manifest.template.json temp/client-production-source-manifest.json
```

```bash
npm run corpus:plan -- \
  --manifest=temp/client-production-source-manifest.json \
  --project=pmi-kc-kb-prod --location=us --dry-run
```

Import only approved, client-safe source copies. Existing sources remain usable and missing sources
produce visible uncertainty.

For providers, activate one exact action using
`docs/v1-client-unblock-checklist-2026-07-14.md`: configure its contract/credential/mapping, verify
health, run one bounded human-confirmed proof, capture bodyless readback and correction, then mark that
action enabled. Missing inputs close only that action.

## Retention safe default

Keep legal holds authoritative and run bounded cleanup manually with limit `500` and a unique run ID.
Capture counts only. A failed run resumes with a new run after reconciliation; it never overwrites the
prior audit. Native TTL, extra composite indexes, and scheduling can be added later as operational
optimizations when actual volume/query evidence warrants them.

## Rollback

1. Close the affected exact Action Registry entry; close the whole Test executor for a mode-isolation
   defect.
2. Preserve execution/audit and reconcile any ambiguous external result; never blind-retry.
3. Revoke the affected OAuth/session/credential/watch when relevant.
4. Route 100% traffic to the captured prior revision with `gcloud run services update-traffic`.
5. Restore reviewed prior rules/configuration/Registry/policy versions.
6. Verify sign-in, Live/Test isolation, no-source behavior, Vendor assignment denial, and provider
   unavailable state. Record the incident/result in `docs/status.md`.

## Genuine production blockers

Only these conditions stop the dependent cutover step:

- managed-domain interactive reauthentication is required;
- Firebase Email/Password, TOTP, or the authorized domain is not configured for Vendor/sign-in smoke;
- candidate verification, Firestore rules deploy, Cloud Run deploy, signed-in Test workflows, or
  rollback rehearsal fails; or
- an enabled Live action lacks its real credential/contract/mapping or fails its bounded proof.

Additional client sources, inactive future providers, named acceptance signatures, native TTL,
unused composite indexes, scheduler activation, and the three documented Moderate dev-only findings
do not block the stable working-app V1 release.
