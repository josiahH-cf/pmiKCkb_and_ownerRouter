# Google Setup Runbook

This runbook captures the external setup needed for live Firebase, Firestore,
Cloud Storage / Drive source locations, Agent Search / Vertex AI Search, Cloud Run,
and Gmail send-only behavior. Keep secrets out of git and store real values in
`.env.local` or Secret Manager.

## Local Prerequisites

Required:

- Node.js 20.19+.
- npm 10+.
- Bash for `scripts/verify.sh`.
- Java JDK 11+ for Firestore emulator tests.

Verify:

```bash
node --version
npm --version
java -version
```

### Windows Demo Host Automation

On the current Windows demo host, future agents should run the repo command instead of
asking the user to run PowerShell manually:

```bash
npm run host:setup
```

This command uses `scripts/setup-windows-google-dev.ps1` to:

- make `gcloud` discoverable after restarts through the user PATH and a WindowsApps
  shim;
- make Java discoverable for Firebase emulator tests through `JAVA_HOME`, user PATH,
  and WindowsApps `java`/`javac` shims;
- persist `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`,
  `GCP_PROJECT_ID`, and `FIREBASE_PROJECT_ID`;
- set the active gcloud project and Application Default Credentials quota project;
- set current-user PowerShell execution policy to `RemoteSigned`;
- enable the common demo APIs when `-EnableApis` is used.

Use `npm run host:check` to verify the same host state without creating a project. The
known demo project on this host is `pmikckb-test`.

After the host check passes, future agents can try to attach Firebase and register the
demo web app with:

```bash
npm run firebase:setup-demo
```

This command uses the Firebase Management REST API, creates/reuses the Firebase Web
app, and writes the browser config into ignored `.env.local` when Google allows the
operation. If it reports that Firebase project attachment is blocked by Google auth
consent, a human must complete the Firebase browser consent/setup once in the same
Google account or attach Firebase to `pmikckb-test` in the Firebase Console. Then rerun
the same command.

After Firebase is attached, create the Firestore database, deploy rules, and seed demo
content:

```bash
gcloud firestore databases create --database='(default)' --location=us-central1 --type=firestore-native --project=pmikckb-test --quiet
npm exec firebase -- deploy --only firestore:rules,firestore:indexes --project pmikckb-test
npm run seed:spaces
npm run seed:demo
```

`npm run seed:demo` creates safe Lease Renewals SOP/template/tool/placeholder records
only when they are missing, so rerunning it does not overwrite demo edits.

Live Google sign-in is a separate Auth gate:

```bash
npm run firebase:setup-auth
```

This command initializes Firebase Auth / Identity Platform, adds local/demo authorized
domains, and enables the Google sign-in provider when OAuth client credentials are
available in ignored `.env.local`.

Use the live auth smoke utility when the visible in-app browser is unreliable:

```bash
npm run smoke:auth-live -- --email=josiah.hunter@cherrybridge.ai --timeout-ms=90000
```

The utility opens installed Chrome or Edge through Playwright, starts at
`http://localhost:3000/sign-in`, clicks the Google sign-in button, fills or selects the
provided account when possible, and writes screenshots plus an event log under ignored
`temp/live-auth-smoke`. It stops cleanly when Google reaches a human-only checkpoint
such as password, MFA, or consent. To keep the opened browser waiting while a human
finishes that checkpoint, add `--pause-on-human`:

```bash
npm run smoke:auth-live -- --email=josiah.hunter@cherrybridge.ai --timeout-ms=180000 --pause-on-human
```

The persistent browser profile lives under ignored `temp/live-auth-profile`, so a
successful Google session can be reused by later smoke runs. Set
`PLAYWRIGHT_CHROME_PATH` only if the host uses a non-standard Chrome or Edge install
location.

Current demo-host state:

- `pmikckb-test` is the active demo project.
- The stray `pmikckb-test-8f927` project was deleted and may remain visible as
  `DELETE_REQUESTED` until Google finishes deletion.
- Billing is linked to `pmikckb-test`.
- Firebase Auth / Identity Platform is initialized.
- Authorized domains are set for `localhost`, `127.0.0.1`,
  `pmikckb-test.firebaseapp.com`, and `pmikckb-test.web.app`.
- Google sign-in provider setup is verified by `npm run firebase:setup-auth`.
- Live Google sign-in for `josiah.hunter@cherrybridge.ai` has been smoked through the
  Playwright utility, and that user has the Firebase custom claim `role=Admin`.
- If the persistent browser profile expires or Google asks for fresh verification, use
  the `--pause-on-human` smoke command above, complete the Google screen in the opened
  browser, then let the script confirm whether the app reaches `/ask`.

If `java -version` fails, install Temurin 21 JDK on Windows:

```powershell
winget install EclipseAdoptium.Temurin.21.JDK --accept-package-agreements --accept-source-agreements
```

Restart the terminal after installing Java. Firebase documents that the Cloud Firestore
emulator is Java-based:
<https://firebase.google.com/docs/emulator-suite/install_and_configure>.

## Firebase Auth / Identity Platform

1. Create or select the demo Firebase/GCP project.
2. Register a Firebase Web app and copy the browser config values into `.env.local`.
3. Attach billing when using the Identity Platform admin API for automated setup.
4. Create or reuse a Web OAuth client for Google sign-in. The Firebase Auth redirect
   URI is `https://<project-id>.firebaseapp.com/__/auth/handler`.
5. Enable Google sign-in for Firebase Auth / Identity Platform.
6. Add authorized domains for local development and demo deployment.
   `npm run firebase:setup-auth` adds `localhost`, `127.0.0.1`,
   `<project-id>.firebaseapp.com`, and `<project-id>.web.app`.
7. Set `ALLOWED_HD` to the demo Workspace domain.
8. Configure server credentials through Application Default Credentials locally and an
   attached service account in Cloud Run.
9. After the first sign-in, set privileged role custom claims from a trusted Admin SDK
   context:

```bash
npm run firebase:set-role -- --email=<user@example.com> --role=Admin
```

Sign out and sign back in after setting the claim so Firebase issues a refreshed token.

Manual console fallback:

1. Open Firebase Console > Authentication > Sign-in method for `pmikckb-test`.
2. Enable Google as a provider.
3. If prompted for OAuth credentials, create/select a Web OAuth client in Google Auth
   Platform with redirect URI `https://pmikckb-test.firebaseapp.com/__/auth/handler`.
4. Confirm authorized domains include `localhost`, `127.0.0.1`,
   `pmikckb-test.firebaseapp.com`, and `pmikckb-test.web.app`.
5. Set `ALLOWED_HD` to the demo Workspace domain.
6. Tell the agent when billing/Auth are active so it can rerun
   `npm run firebase:setup-auth` and smoke real sign-in.

Official references:

- Firebase Web setup: <https://firebase.google.com/docs/web/setup>
- Firebase Google sign-in: <https://firebase.google.com/docs/auth/web/google-signin>
- Identity Platform Google provider:
  <https://docs.cloud.google.com/identity-platform/docs/web/google>
- Identity Platform Auth initialization:
  <https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.identityPlatform/initializeAuth>
- Identity Platform provider config API:
  <https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs>
- Firebase session cookies:
  <https://firebase.google.com/docs/auth/admin/manage-cookies>
- Firebase custom claims:
  <https://firebase.google.com/docs/auth/admin/custom-claims>
- Application Default Credentials:
  <https://docs.cloud.google.com/docs/authentication/application-default-credentials>

## Firestore

Create Firestore in Native mode for each environment. Deploy `firestore.rules` after
review:

```bash
npm exec firebase -- deploy --only firestore:rules --project <project-id>
```

Run emulator rules tests locally after Java is available:

```bash
npm run test:firestore
```

## Source Docs And Agent Search

For the first live Ask smoke, use a Cloud Storage-backed Agent Search data store. This
avoids the Google Drive connector OAuth setup path and works with the server-side
service account retrieval boundary already implemented in the KB.

Record:

- Cloud Storage bucket name and source prefix.
- Agent Search data store ID.
- Display name.
- Environment (`demo` or `client-production`).

Current demo values:

- Project: `pmikckb-test`.
- Agent Search location: `us`.
- Data store display name: `KB / Lease Renewals`.
- Data store ID: `kb-lease-renewals-txt`.
- Source prefix: `gs://<bucket-name>/lease-renewals/`.
- Durable seed templates: `docs/demo-source-templates/`.
- Ignored upload workspace: `temp/lease-renewals-drive-seed/`.

Known working `pmikckb-test` smoke values from 2026-05-29:

- Source prefix: `gs://pmikckb-test-lease-renewals-686407/lease-renewals/`.
- Data store ID: `kb-lease-renewals-txt`.
- Imported docs:
  - `01-lease-renewals-demo-sop-source.txt`
  - `02-owner-renewal-follow-up-demo-template.txt`
- Unused data store to delete later after confirming no dependency points to it:
  `kb-lease-renewals_1780046781160`.

Use raw Cloud Storage content import for the cheap smoke. Google documents that
Cloud Storage unstructured content imports auto-generate a stable document ID from the
first 128 bits of the SHA-256 hash of the `gs://` URI. `npm run seed:source-meta`
accepts the same `gs://` URI and writes the matching metadata record. Upload the
demo seed docs as `.txt` files for this route; Markdown files are useful locally, but
they are not part of the supported raw unstructured Cloud Storage import set.

Official references, verified on 2026-05-29:

- Agent Search Cloud Storage data-store creation:
  <https://docs.cloud.google.com/generative-ai-app-builder/docs/create-data-store-es#import-cloud-storage>
- Agent Search data preparation:
  <https://docs.cloud.google.com/generative-ai-app-builder/docs/prepare-data#cloud-storage-unstructured>
- Agent Search locations:
  <https://docs.cloud.google.com/generative-ai-app-builder/docs/locations>
- Cloud Storage bucket creation:
  <https://docs.cloud.google.com/storage/docs/creating-buckets>
- Cloud Storage object uploads:
  <https://docs.cloud.google.com/storage/docs/uploading-objects>
- Cloud Storage IAM roles:
  <https://docs.cloud.google.com/storage/docs/access-control/iam-roles>

The original Google Drive folder can still be used as a human staging folder, but do
not create the live Ask data store from Drive for this phase. Current Google docs for
Workspace data stores say service-account search is not supported, and the user hit a
Google Console OAuth error while creating the Drive connector.

## Under-$10 Live Ask And Demo Deploy

Use this path before any all-Space indexing or production deployment. The goal is one
real Lease Renewals Ask answer and one cheap Cloud Run demo URL.

Cost guardrails:

- Project: `pmikckb-test`.
- Cloud Run / Gemini region: `us-central1`.
- Vertex AI Search location: `us`.
- Cloud Run service: `pmi-kc-kb-demo`.
- Model: `gemini-2.5-flash`.
- Vertex AI Search pricing model: General pricing only, not Configurable pricing.
- Scope: exactly one Space, `lease-renewals`.
- Source corpus: 2-3 safe Cloud Storage docs, well below 10 GiB indexed raw data.
- Cloud Run: generated URL only, `min-instances=0`, `max-instances=1`, no custom
  domain yet.
- Do not enable Advanced Generative Answers.

Current pricing references:

- Vertex AI Search pricing:
  <https://cloud.google.com/generative-ai-app-builder/pricing>
- Vertex AI Gemini pricing:
  <https://cloud.google.com/vertex-ai/generative-ai/pricing>
- Firestore free quota: <https://firebase.google.com/docs/firestore/pricing>
- Cloud Run pricing: <https://cloud.google.com/run/pricing>
- Google Cloud budgets:
  <https://docs.cloud.google.com/billing/docs/how-to/budgets>

User-owned console tasks:

1. Create a `$10` project-scoped budget alert for `pmikckb-test`:
   <https://console.cloud.google.com/billing/budgets?project=pmikckb-test>
2. Confirm required APIs are enabled for the Cloud Storage data-store route:
   - `aiplatform.googleapis.com` — Vertex AI Gemini model calls.
   - `discoveryengine.googleapis.com` — Agent Search data store and retrieval.
   - `storage.googleapis.com` — Cloud Storage source bucket and source docs.
   - `run.googleapis.com` — Cloud Run demo service.
   - `cloudbuild.googleapis.com` — source-based Cloud Run build.
   - `artifactregistry.googleapis.com` — Cloud Run build image storage.
   - `firestore.googleapis.com` and `datastore.googleapis.com` — Firestore Native.
   - `firebase.googleapis.com`, `identitytoolkit.googleapis.com`, and
     `securetoken.googleapis.com` — Firebase Auth / Identity Platform.
   - `iam.googleapis.com` and `iamcredentials.googleapis.com` — service account and
     token operations.
   - `cloudresourcemanager.googleapis.com`, `serviceusage.googleapis.com`, and
     `cloudbilling.googleapis.com` — project/API/billing administration.
   - `logging.googleapis.com` and `monitoring.googleapis.com` — deployed service
     diagnostics.
     <https://console.cloud.google.com/apis/library?project=pmikckb-test>
   - `drive.googleapis.com` is not required for the Cloud Storage-backed smoke; enable
     it only if you also use the Drive folder as a human staging area.
3. From the repo root in PowerShell, authenticate and create a small private source
   bucket:

```powershell
gcloud auth login
gcloud auth application-default login
gcloud config set project pmikckb-test

$env:PROJECT_ID="pmikckb-test"
$env:BUCKET_NAME="pmikckb-test-lease-renewals-$((Get-Random -Minimum 100000 -Maximum 999999))"
$env:PROJECT_NUMBER="800237451321"

gcloud services enable aiplatform.googleapis.com discoveryengine.googleapis.com storage.googleapis.com firestore.googleapis.com datastore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com monitoring.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com --project=$env:PROJECT_ID

gcloud storage buckets create "gs://$env:BUCKET_NAME" --project=$env:PROJECT_ID --location=US --default-storage-class=STANDARD --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://$env:BUCKET_NAME" --member="serviceAccount:service-$env:PROJECT_NUMBER@gcp-sa-discoveryengine.iam.gserviceaccount.com" --role=roles/storage.objectViewer --project=$env:PROJECT_ID
```

4. Upload the safe seed docs:

```powershell
New-Item -ItemType Directory -Force -Path "temp\lease-renewals-drive-seed"
Copy-Item "docs\demo-source-templates\lease-renewals-demo-sop-source.md" "temp\lease-renewals-drive-seed\01-lease-renewals-demo-sop-source.txt"
Copy-Item "docs\demo-source-templates\owner-renewal-follow-up-demo-template.md" "temp\lease-renewals-drive-seed\02-owner-renewal-follow-up-demo-template.txt"
gcloud storage cp "temp\lease-renewals-drive-seed\01-lease-renewals-demo-sop-source.txt" "gs://$env:BUCKET_NAME/lease-renewals/"
gcloud storage cp "temp\lease-renewals-drive-seed\02-owner-renewal-follow-up-demo-template.txt" "gs://$env:BUCKET_NAME/lease-renewals/"
```

5. Add one sanitized real Lease Renewals call transcript or notes file when available:

```powershell
Copy-Item "docs\demo-source-templates\lease-renewals-sanitized-call-notes.md" "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.md"
notepad "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.md"
Copy-Item "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.md" "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.txt"
gcloud storage cp "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.txt" "gs://$env:BUCKET_NAME/lease-renewals/"
```

6. Create one Agent Search data store from Cloud Storage:
   <https://console.cloud.google.com/gen-app-builder/data-stores?project=pmikckb-test>
   - Data source: Cloud Storage.
   - Import mode: One-time ingestion if the UI asks.
   - Source selector: Folder.
   - Source path: `gs://<bucket-name>/lease-renewals/`.
   - Data kind: Unstructured documents.
   - Location: `us`.
   - Display name: `KB / Lease Renewals`.
   - Data store ID: `kb-lease-renewals-txt`.
   - Document processing options: leave defaults for text docs; do not enable
     OCR or layout parser for the cheap smoke.
   - Advanced / Enterprise / configurable pricing features: leave off unless explicitly
     required by the console.
   - Finish with Create, then wait for Activity to show `Import completed`.
   - If import stays empty or never completes, verify the uploaded objects are `.txt`
     or another supported unstructured format, and verify the bucket IAM policy grants
     `roles/storage.objectViewer` to
     `service-<project-number>@gcp-sa-discoveryengine.iam.gserviceaccount.com`.
7. Create or confirm a Cloud Run runtime service account if you do not want to use the
   default compute identity:
   <https://console.cloud.google.com/iam-admin/serviceaccounts?project=pmikckb-test>
8. Grant the Cloud Run runtime identity only the roles needed for this smoke:
   `roles/datastore.user`, `roles/discoveryengine.user`, and `roles/aiplatform.user`.
   Review IAM here:
   <https://console.cloud.google.com/iam-admin/iam?project=pmikckb-test>
9. After deploy, add the generated Cloud Run host to Firebase Authentication authorized
   domains:
   <https://console.firebase.google.com/project/pmikckb-test/authentication/settings>

Agent-run commands after the user-owned setup is complete:

```bash
npm run check:live-cost
npm run seed:source-meta -- --source-id=gs://<bucket-name>/lease-renewals/01-lease-renewals-demo-sop-source.txt
npm run seed:source-meta -- --source-id=gs://<bucket-name>/lease-renewals/02-owner-renewal-follow-up-demo-template.txt
npm run seed:source-meta -- --source-id=gs://<bucket-name>/lease-renewals/03-lease-renewals-sanitized-call-notes.txt --approval-status=Transcript-derived --sensitivity=Low
npm run smoke:ask-live
npm run deploy:demo -- --budget-confirmed --service-account=<service-account-email>
npm run smoke:auth-live -- --base-url=<cloud-run-url> --pause-on-human
npm run smoke:ask-live -- --base-url=<cloud-run-url> --browser-session
```

For local live smoke, `.env.local` should keep the scope narrow:

```dotenv
ASK_DEMO_MODE=false
LOCAL_DEMO_AUTH=true
GEMINI_MODEL_ANSWER=gemini-2.5-flash
VERTEX_AI_LOCATION=us-central1
VERTEX_SEARCH_LOCATION=us
SPACE_DRIVE_FOLDER_IDS={"lease-renewals":"gs://<bucket-name>/lease-renewals/"}
SPACE_VERTEX_DATA_STORE_IDS={"lease-renewals":"kb-lease-renewals-txt"}
```

The deployed Cloud Run service must use `LOCAL_DEMO_AUTH=false`; the deploy helper sets
that value automatically.

## Gmail Send-Only Notifications

Defer Gmail notifications until the Approval Queue is real. When added, use only:

```text
https://www.googleapis.com/auth/gmail.send
```

Do not grant Gmail read, modify, compose, insert, labels, or full mail scopes to this
app for v1. Gmail's scope docs list `gmail.send` as send-only:
<https://developers.google.com/workspace/gmail/api/auth/scopes>.

## Human-Provided Values

Provide these values to unblock live setup, without posting secrets into chat:

- Demo Workspace domain.
- Demo GCP/Firebase project ID.
- Firebase Web app config.
- Confirmation that Google sign-in is enabled.
- Authorized local/demo domains.
- Cloud Storage bucket/source prefix for `KB / Lease Renewals`.
- Agent Search data store ID for Lease Renewals.
- Later only: Gmail sender identity for `KB Approval`.

## Client Cutover

At purchase/cutover:

1. Repeat setup in the PMI KC-owned GCP/Firebase project.
2. Set `ALLOWED_HD=pmikcmetro.com`.
3. Register a new Firebase Web app and OAuth client.
4. Create client-owned Drive folders.
5. Create client-owned Vertex AI Search data stores.
6. Re-seed Spaces from the repo.
7. Re-run the smoke test in `docs/demo-cutover.md`.
