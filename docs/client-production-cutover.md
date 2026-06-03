# Client Production Cutover Runbook

> Current governance note, 2026-06-03: this is the PMI KC KB production rebuild
> runbook. Cross-product integration and cutover planning for PMI KC KB, Lease Renewal
> Agent, and Gmail Inbox 0 lives in `docs/integration-cutover-plan.md`.

This is the clean PMI KC-owned environment path. Do not copy demo Firestore exports,
demo OAuth clients, demo service accounts, or demo Cloud Storage buckets into
production.

## 1. Confirm Local Readiness

Run from the repo root:

```bash
npm install
npm run host:check
npm run format:check
npm run typecheck
npm test
npm run test:firestore
npm run verify
```

If `host:check` fails on Windows, repair local Google tooling with:

```bash
npm run host:setup -- -ProjectId <client-project-id>
```

## 2. Create The Client Google Environment

Create or select the PMI KC-owned GCP/Firebase project, then set local env values in an
ignored file such as `.env.production.local`:

```dotenv
ALLOWED_HD=pmikcmetro.com
ASK_DEMO_MODE=false
LOCAL_DEMO_AUTH=false
GCP_PROJECT_ID=<client-project-id>
FIREBASE_PROJECT_ID=<client-project-id>
FIRESTORE_DATABASE_ID=(default)
VERTEX_AI_LOCATION=us-central1
VERTEX_SEARCH_LOCATION=us
GEMINI_MODEL_ANSWER=gemini-2.5-flash
GEMINI_MODEL_CLASSIFY=gemini-2.5-flash
NEXT_PUBLIC_FIREBASE_API_KEY=<from-client-firebase-web-app>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<client-project-id>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<client-project-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<from-client-firebase-web-app>
SPACE_DRIVE_FOLDER_IDS={}
SPACE_VERTEX_DATA_STORE_IDS={}
APP_BASE_URL=<deployed-production-url>
KB_APPROVAL_NOTIFICATIONS_ENABLED=false
```

Most repo scripts read process environment variables and ignored `.env.local`; only
commands that explicitly accept `--env-file` read `.env.production.local` directly.
For an unattended cutover, copy the reviewed production values into `.env.local` for
the active session or load them into the shell before running seed/deploy commands.
Keep `.env.production.local` as the reviewed preflight input if you want a separate
handoff file.

Enable required APIs in the client project:

```bash
gcloud services enable aiplatform.googleapis.com discoveryengine.googleapis.com storage.googleapis.com firestore.googleapis.com datastore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com monitoring.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com --project=<client-project-id>
```

Attach Firebase and create/reuse the Firebase Web app:

```bash
npm run firebase:setup -- --project=<client-project-id> --web-app-name="PMI KC KB Production Web"
```

Enable Firebase Auth / Identity Platform Google sign-in:

```bash
npm run firebase:setup-auth -- --project=<client-project-id> --authorized-domain=<production-host>
```

If Google requires console consent, complete the Firebase/Auth console gate once, then
rerun the same command.

## 3. Create Firestore And Seed KB Records

Create Firestore Native mode, deploy rules/indexes, and seed non-secret KB records:

```bash
gcloud firestore databases create --database='(default)' --location=us-central1 --type=firestore-native --project=<client-project-id> --quiet
npm exec firebase -- deploy --only firestore:rules,firestore:indexes --project <client-project-id>
npm run seed:spaces
npm run seed:launch-skeletons -- --dry-run
```

Only omit `--dry-run` after confirming the active project and ADC target are the client
project:

```bash
npm run seed:launch-skeletons
```

Do not run `npm run seed:demo` in client production.

## 4. Prepare Production Sources

Use Cloud Storage `.txt` sources and Agent Search data stores as the default production
path unless Drive service-account retrieval is intentionally revisited.

1. Create one private production source bucket or separate buckets per policy.
2. Grant the Discovery Engine service agent `roles/storage.objectViewer` on the source
   bucket.
3. Copy the manifest template to an ignored working file:

```powershell
New-Item -ItemType Directory -Force -Path temp
Copy-Item docs/source-corpus/client-production-source-manifest.template.json temp/client-production-source-manifest.json
```

4. Replace every `<client-source-bucket>`, source path, `data_store_id`, and approval
   status with approved PMI KC source details. Leave a Space out of the manifest until
   an approved source exists.
5. Run a dry plan:

```bash
npm run corpus:plan -- --manifest=temp/client-production-source-manifest.json --project=<client-project-id> --location=us --dry-run
```

6. After human source approval, create `.txt` staging copies and review the printed
   upload/import/metadata commands:

```bash
npm run corpus:plan -- --manifest=temp/client-production-source-manifest.json --project=<client-project-id> --location=us --write-temp
```

7. Upload the generated `.txt` copies, import them into Agent Search, and seed
   `sources_meta` using the printed commands.

Never upload or commit raw `docs/context_and_calls/` material. Production sources must
be approved, client-safe summaries or approved client-owned operating documents.

## 5. Configure Production Environment Maps

After source prefixes and data stores exist, update the production env file:

```dotenv
SPACE_DRIVE_FOLDER_IDS={"lease-renewals":"gs://<client-source-bucket>/lease-renewals/"}
SPACE_VERTEX_DATA_STORE_IDS={"lease-renewals":"kb-lease-renewals-txt"}
```

Use one map entry per approved production Space. Leave unapproved Spaces as launch
skeletons until source material exists.

Run the production preflight:

```bash
npm run preflight:production -- --env-file=.env.production.local
```

The preflight must pass before deploy. It rejects demo project IDs, demo buckets,
unreplaced placeholders, non-HTTPS or local `APP_BASE_URL`, `ASK_DEMO_MODE=true`,
`LOCAL_DEMO_AUTH=true`, missing source/data-store maps, missing `APP_BASE_URL`, and
missing Firebase public config.

## 6. Deploy Cloud Run

Create or choose the runtime service account, then grant only the roles needed by the
KB runtime:

- `roles/datastore.user`
- `roles/discoveryengine.user`
- `roles/aiplatform.user`
- Gmail send-only authority only if approval notifications are enabled

Deploy with production flags:

```bash
npm run deploy -- --project=<client-project-id> --service=pmi-kc-kb --region=us-central1 --search-location=us --budget-confirmed --allow-multiple-spaces --service-account=<runtime-service-account-email>
```

Add the generated Cloud Run host or custom production domain to Firebase Auth
authorized domains:

```bash
npm run firebase:setup-auth -- --project=<client-project-id> --authorized-domain=<production-host>
```

Set `APP_BASE_URL` to the final deployed URL and rerun:

```bash
npm run preflight:production -- --env-file=.env.production.local
```

## 7. Assign Roles And Smoke Production

After the first allowed-domain user signs in, assign roles from a trusted Admin SDK
context:

```bash
npm run firebase:set-role -- --email=<admin@pmikcmetro.com> --role=Admin
npm run firebase:set-role -- --email=<approver@pmikcmetro.com> --role=Approver
```

Production smoke checklist:

- Allowed-domain sign-in reaches `/ask`.
- Wrong-domain sign-in is rejected.
- Admin page opens for the Admin account.
- At least one approved Space opens and shows seeded records.
- Ask returns a cited `Verified Source` answer from an approved production source.
- Ask returns `No Reliable Source Found` for an unsupported question.
- Editor can save an editable record but cannot approve.
- Approver/Admin can approve, return, or resolve queue items.
- The app does not write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets,
  Gmail inboxes, Drive folders, or Gmail Inbox 0/legacy Owner Router source artifacts.

## Production Blockers

Production cannot be declared complete until:

- PMI KC-approved production source files are uploaded/imported and seeded in
  `sources_meta`.
- The source/data-store maps point only at client-owned resources.
- Gmail notification sender and recipients are approved, or notifications remain
  disabled by explicit decision.
- Gmail Inbox 0 source package exists, with any reused legacy Owner Router artifacts
  renamed or clearly mapped, and is indexed read-only by the KB Owner Email Space for
  final owner-email verification.
- Final smoke results and any exceptions are recorded in `docs/status.md`.
