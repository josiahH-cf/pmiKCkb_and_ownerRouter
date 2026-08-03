# Google Setup Runbook

This runbook captures the external setup needed for live Firebase, Firestore,
Cloud Storage / Drive source locations, Agent Search / Vertex AI Search, Cloud Run,
and Gmail send-only behavior. Keep secrets out of git and store real values in
`.env.local` or Secret Manager.

> **Legacy setup history; do not execute it as current guidance.** Sections below that name
> `pmikckb-test`, its hosted Demo URL, `seed:demo`, or the old `pmi-kc-kb-demo` service preserve the
> retired 2026-05/06 setup record only. Current Production is Live-only on `pmi-kc-app` at
> `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`. Current rehearsal is local with explicit Demo +
> Live-read-only context and no persistence/provider effects; hosted Demo and fixture seeding are
> deferred. Use `docs/environment-handoff.md` and the current cutover section at the end of this
> file for active guidance.

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

### Historical Windows Demo Host Automation (do not execute)

The retired Windows-hosted Demo setup used the following repo command. It is preserved only to
explain the dated evidence and must not be used to recreate that environment:

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

The historical host check verified the same state without creating a project. The retired project
was `pmikckb-test`.

After the host check passes, future agents can try to attach Firebase and register the
demo web app with:

```bash
npm run firebase:setup
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

`npm run seed:demo` creates safe SOP/template/tool/placeholder records for the four
approved demo workflows only when they are missing, so rerunning it does not overwrite
demo edits.

Live Google sign-in is a separate Auth gate for the demo project:

```bash
npm run firebase:setup-auth
```

This command initializes Firebase Auth / Identity Platform, adds local/demo authorized
domains, and enables the Google sign-in provider when OAuth client credentials are
available in ignored `.env.local`.

Use the live auth smoke utility when the visible in-app browser is unreliable:

```bash
npm run smoke:auth-live -- --email=<josiah-pmi-kc-account@pmikcmetro.com> --timeout-ms=90000
```

The utility opens installed Chrome or Edge through Playwright, starts at
`http://localhost:3000/sign-in`, clicks the Google sign-in button, fills or selects the
provided account when possible, and writes screenshots plus an event log under ignored
`temp/live-auth-smoke`. It stops cleanly when Google reaches a human-only checkpoint
such as password, MFA, or consent. To keep the opened browser waiting while a human
finishes that checkpoint, add `--pause-on-human`:

```bash
npm run smoke:auth-live -- --email=<josiah-pmi-kc-account@pmikcmetro.com> --timeout-ms=180000 --pause-on-human
```

The persistent browser profile lives under ignored `temp/live-auth-profile`, so a
successful Google session can be reused by later smoke runs. Set
`PLAYWRIGHT_CHROME_PATH` only if the host uses a non-standard Chrome or Edge install
location.

Historical demo-host state captured before retirement:

- `pmikckb-test` is the active demo project.
- The stray `pmikckb-test-8f927` project was deleted and may remain visible as
  `DELETE_REQUESTED` until Google finishes deletion.
- Billing is linked to `pmikckb-test`.
- Firebase Auth / Identity Platform is initialized.
- Authorized domains are set for `localhost`, `127.0.0.1`,
  `pmikckb-test.firebaseapp.com`, and `pmikckb-test.web.app`.
- Google sign-in provider setup is verified by `npm run firebase:setup-auth`.
- Future auth and automation tests should use Josiah's PMI KC `pmikcmetro.com` account
  once provisioned, with Firebase custom claim `role=Admin`.
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
   `npm run firebase:setup-auth -- --project=<project-id>` adds `localhost`, `127.0.0.1`,
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

Historical Demo values captured before retirement:

- Project: `pmikckb-test`.
- Agent Search location: `us`.
- Data store display name: `KB / Lease Renewals`.
- Data store ID: `kb-lease-renewals-txt`.
- Source prefix: `gs://<bucket-name>/lease-renewals/`.
- Durable seed templates: `docs/demo-source-templates/`.
- Ignored upload workspace: `temp/lease-renewals-drive-seed/`.
- Approved sanitized templates and demo seed sources now exist for Lease Renewals,
  Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding.
  The retired Demo project had all four imported for the multi-Space demonstration.
- Transcript-derived source starters also exist for the remaining writable launch
  Spaces. They should be imported only after approval for demo/production use.
- Template catalog and approval guidance:
  `docs/demo-source-templates/README.md`.
- Source corpus manifest: `docs/source-corpus/demo-live-source-manifest.json`.

Known working `pmikckb-test` smoke values from 2026-05-29:

- Source prefix: `gs://pmikckb-test-lease-renewals-686407/lease-renewals/`.
- Data store ID: `kb-lease-renewals-txt`.
- Additional demo data stores:
  - `kb-maintenance-work-order-intake-txt`
  - `kb-move-out-deposit-disposition-txt`
  - `kb-owner-onboarding-txt`
- Imported docs:
  - `01-lease-renewals-demo-sop-source.txt`
  - `02-owner-renewal-follow-up-demo-template.txt`
  - `03-lease-renewals-sanitized-call-notes.txt`
- The unused console-created data store `kb-lease-renewals_1780046781160` was deleted
  on 2026-05-29 after confirming local and deployed environment maps did not reference
  it.

Use the manifest helper to stage `.txt` upload copies and print exact upload/import/
metadata commands:

```bash
npm run corpus:plan -- --write-temp
```

For client production, pass explicit project/location values and use a copied
production manifest:

```bash
npm run corpus:plan -- --manifest=temp/client-production-source-manifest.json --project=<client-project-id> --location=us --dry-run
```

Use the guarded deletion helper for stale Agent Search data stores. It refuses to
delete a store that appears in `SPACE_VERTEX_DATA_STORE_IDS` and requires an explicit
confirmation flag for live deletion:

```bash
npm run delete:agent-search-data-store -- --project=pmikckb-test --location=us --data-store=kb-lease-renewals_1780046781160 --dry-run
npm run delete:agent-search-data-store -- --project=pmikckb-test --location=us --data-store=kb-lease-renewals_1780046781160 --confirm-delete=kb-lease-renewals_1780046781160
```

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

The original Google Drive folder can still be used as a human staging folder. For Lease
Renewal discovery, the default first capture/collaboration location is a PMI KC-accessible
Google Drive folder unless setup identifies a better client-accessible, app-connected
source. Do not create the live Ask data store from Drive for this phase unless the Drive
connector path is intentionally revisited. Current Google docs for Workspace data stores
say service-account search is not supported, and the user hit a Google Console OAuth
error while creating the Drive connector.

For the Lease Renewal discovery folder, do not create a raw/approved split by default.
Treat material in the client-accessible folder as source-of-truth input, then curate it
frequently. The curation workflow should use AI-proposed documentation updates, human
review by Dan, and continuous documentation improvement. Dan decides the review cadence;
the intended behavior is automatic continuous app reads from the source, not manual
import-on-demand and not gated on Dan approval. The connector/indexing implementation is
still TBD and must be validated against the client-owned source location.

Research note, 2026-06-03: the likely path is Drive as the team collaboration folder
feeding an indexed source layer automatically. Google documents two relevant options:
Drive data federation, which searches Drive without copying data into the Agent Search
index, and Cloud Storage ingestion, which can create an indexed data store and has a
periodic ingestion option. Direct Drive federation has setup and search limitations, so
do not assume it is the production path until tested in the client-owned Workspace.
The first indexed-source candidate to test is Cloud Storage plus Agent Search periodic
ingestion, with a Drive-to-Cloud-Storage handoff or connector step still to be defined.
Assume the first handoff test is the simplest low-cost automation that works for users:
copy changes from the team-editable Drive source folder into Cloud Storage for indexing,
then let the index/app handle freshness. Because cloud costs are pass-through, keep the
test small and avoid unnecessary always-on services, frequent polling, large indexed
corpora, duplicate data stores, or extra automation.

Do not start with a Docs/text/PDF-only source rule. The Lease Renewal source folder may
contain all useful file types. During setup, identify which useful file types can be
indexed directly and which need conversion or summary into a supported indexed form. If
a useful file cannot be safely converted, skip it with a visible reason rather than
silently dropping it. If a file is not source-of-truth material, move it out of the
source folder instead of relying on the copy or indexing path to ignore it. The
destination for non-source, reference, or archive material is TBD.

Grant the whole PMI KC team direct edit access to the initial Lease Renewal
source-of-truth folder. The exact group or named-user list still needs to come from the
client's Workspace setup.

### Sanitizing Raw Call Context

Raw local transcripts and call notes must not be uploaded directly or committed to the
repo. Before creating any `.txt` source for Agent Search:

- remove owner names, tenant names, applicant names, property addresses, phone numbers,
  email addresses, private Fathom links, and private vendor contact details;
- remove rent amounts, ledger amounts, bank details, payment examples tied to people,
  SSNs, screening details, Plaid/Boom raw data, and full lease packet details;
- summarize by role and workflow step instead of quoting sensitive call passages;
- mark the source as `Source status: Approved` and `Sensitivity: Low` only after the
  sanitized demo messaging has Bailey/Dan approval;
- seed `sources_meta` with `--approval-status=Approved --sensitivity=Low`;
- keep legal deadlines, fees, notice wording, approval thresholds, and exception rules
  out of final SOP content unless those details are explicitly documented in an
  approved source.

The raw review folder `docs/context_and_calls/` is intentionally ignored by git and
Prettier. Use it only as local source material for sanitized summaries.

## Historical Under-$10 Live Ask And Demo Deploy (superseded 2026-07-29)

This section records the earlier `pmikckb-test` setup shape; it is not the current production cost
or deploy authority. Before any current cost-bearing deployment, S52 must hold a reviewed non-null
production monthly ceiling and alert threshold, auth and the full local gate must be green, and the
routine deploy follows D05 with prior-revision capture, smoke, and rollback evidence. An unset S52
ceiling parks the deployment while local/app-plane work continues.

Cost guardrails:

- Project: `pmikckb-test`.
- Cloud Run / Gemini region: `us-central1`.
- Vertex AI Search location: `us`.
- Cloud Run service: `pmi-kc-kb-demo`.
- Model: `gemini-2.5-flash`.
- Vertex AI Search pricing model: General pricing only, not Configurable pricing.
- Scope: exactly one Space, `lease-renewals`, unless explicitly running the approved
  four-workflow demo with `--allow-multiple-spaces`.
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

Historical/user-owned console tasks:

1. Do not create a new `$10` budget from this historical instruction. When S52's measured baseline
   and owner-selected values exist, create or update the project-scoped budget and matching
   guardrail value from the S52 lockstep runbook:
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

5. Add the approved sanitized Lease Renewals call-notes source:

```powershell
Copy-Item "docs\demo-source-templates\lease-renewals-sanitized-call-notes.md" "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.md"
# Review the copied file and remove any non-demo-safe details before upload.
notepad "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.md"
Copy-Item "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.md" "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.txt"
gcloud storage cp "temp\lease-renewals-drive-seed\03-lease-renewals-sanitized-call-notes.txt" "gs://$env:BUCKET_NAME/lease-renewals/"
```

Four-workflow live demo expansion can use the other approved sanitized templates in
`docs/demo-source-templates/`, but do not import them into the default one-Space cheap
smoke until separate source prefixes, data stores, source metadata, and cost checks are
intentionally added.

For all launch Space source starters, prefer the manifest workflow:

```bash
npm run corpus:plan -- --write-temp
```

Review the generated plan before uploading or importing. Do not upload raw transcript
files from `docs/context_and_calls/`.

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
npm run check:live-cost -- --allow-multiple-spaces
npm run seed:source-meta -- --source-id=gs://<bucket-name>/lease-renewals/01-lease-renewals-demo-sop-source.txt
npm run seed:source-meta -- --source-id=gs://<bucket-name>/lease-renewals/02-owner-renewal-follow-up-demo-template.txt
npm run seed:source-meta -- --source-id=gs://<bucket-name>/lease-renewals/03-lease-renewals-sanitized-call-notes.txt --approval-status=Approved --sensitivity=Low
npm run import:agent-search -- --project=pmikckb-test --location=us --data-store=kb-lease-renewals-txt --source-id=gs://<bucket-name>/lease-renewals/01-lease-renewals-demo-sop-source.txt --source-id=gs://<bucket-name>/lease-renewals/02-owner-renewal-follow-up-demo-template.txt --source-id=gs://<bucket-name>/lease-renewals/03-lease-renewals-sanitized-call-notes.txt
npm run smoke:ask-live
npm run deploy:demo -- --budget-confirmed --allow-multiple-spaces --service-account=<service-account-email>
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
that value automatically. The current demo URL is
<https://pmi-kc-kb-demo-800237451321.us-central1.run.app/sign-in>.

For this demo project, Cloud Run source deploy required:

- `roles/storage.objectViewer` for
  `800237451321-compute@developer.gserviceaccount.com` on
  `gs://run-sources-pmikckb-test-us-central1`;
- `roles/run.builder` for
  `800237451321-compute@developer.gserviceaccount.com`;
- `roles/firebaseauth.admin` for
  `pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com`;
- disabling the Cloud Run invoker IAM check on `pmi-kc-kb-demo`, because the
  organization policy rejected an `allUsers` invoker binding;
- adding both Cloud Run hosts to Firebase Auth authorized domains with
  `npm run firebase:setup-auth -- --authorized-domain=<host>`.

If `--allow-unauthenticated` fails because org policy blocks `allUsers`, redeploy with
`npm run deploy:demo -- --budget-confirmed --allow-multiple-spaces --skip-allow-unauthenticated --service-account=<service-account-email>`,
then run:

```bash
gcloud run services update pmi-kc-kb-demo --project=pmikckb-test --region=us-central1 --no-invoker-iam-check --quiet
```

For the approved four-workflow live demo, use one Cloud Storage prefix and one Agent
Search data store per Space, then run cost/deploy checks with
`--allow-multiple-spaces`. Example local maps:

```dotenv
SPACE_DRIVE_FOLDER_IDS={"lease-renewals":"gs://<bucket-name>/lease-renewals/","maintenance-work-order-intake":"gs://<bucket-name>/maintenance-work-order-intake/","move-out-deposit-disposition":"gs://<bucket-name>/move-out-deposit-disposition/","owner-onboarding":"gs://<bucket-name>/owner-onboarding/"}
SPACE_VERTEX_DATA_STORE_IDS={"lease-renewals":"kb-lease-renewals-txt","maintenance-work-order-intake":"kb-maintenance-work-order-intake-txt","move-out-deposit-disposition":"kb-move-out-deposit-disposition-txt","owner-onboarding":"kb-owner-onboarding-txt"}
```

The `SPACE_DRIVE_FOLDER_IDS` values above are KB-source corpus locations (Cloud Storage prefixes).
They are NOT the maintenance photo upload folder — that is a separate Drive folder id set via
`MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` (see `.env.example` and the cutover runbook). Do not put a `gs://`
prefix in `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID`; the Drive upload needs a real Drive folder id.

Create/import additional data stores with `npm run import:agent-search -- --create-data-store`
only after uploading approved `.txt` sources and confirming the budget guardrail.

## Historical Gmail Send-Only Notifications (retired)

The former `KB_APPROVAL_NOTIFICATIONS_ENABLED` / `kb-automation@pmikcmetro.com` send-only design is
hard-disabled and must not be configured. Current staff Gmail transport uses the exact DWD
`gmail.readonly`, `gmail.compose`, `gmail.labels`, and `gmail.modify` scope set behind workflow,
role, artifact, exact-confirmation, and per-action gates. Generic compose/send remains closed, and
renewal and maintenance initiation create an unsent Gmail draft for a human to send.

## Human-Provided Values

No hosted Demo project, Firebase app, domain, or fixture-seeder value is requested. Production's
project, Firebase app, canonical domain, source bucket, and Agent Search store are recorded in
`docs/environment-handoff.md`. Supply only the exact feature-scoped provider/source inputs listed in
`docs/client-checklist.md`, and put secret values directly in Secret Manager rather than chat or git.

## Client Cutover

The dated `docs/client-production-cutover.md` is preserved evidence of the pre-S40 Live+Test
cutover; it is not the current authoritative command sequence. The S55/S56 cutover completed on
2026-08-03: `pmi-kc-app` serves the Live-only Production application, `pmi-kc-kb-demo` is absent,
and local is the explicit effect-fenced rehearsal surface.

1. Run the full local gate, managed-auth preflights, current S52 readback, and prior-revision capture.
2. Confirm the production release's `--plan-only` output merged `ENVIRONMENT_KIND=production`,
   `DATA_CONTEXT=live`, and the canonical `pmi-kc-app` URL from `.env.production.local`.
3. Isolate any `lib/auth/**` or `firestore.rules` change as D12-protected work for owner review.
4. Deploy a named candidate at zero traffic, verify its explicit Production descriptor and
   authenticated smoke, then promote that exact revision deliberately.
5. Rehearse rollback to the captured predecessor and restore forward before any retirement step.
   The current predecessor is recorded in `F-CURRENT-SERVING-CHECKPOINT-2026-08-03`.

Do not use the legacy wrapper's immediate 100% promotion as a current cutover path, and never copy
invented/test data, OAuth clients, service accounts, storage, Auth projects, or knowledge corpora
into Production.
