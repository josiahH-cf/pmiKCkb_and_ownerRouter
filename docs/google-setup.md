# Google Setup Runbook

This runbook captures the external setup needed for live Firebase, Firestore, Drive,
Vertex AI Search, Cloud Run, and Gmail send-only behavior. Keep secrets out of git and
store real values in `.env.local` or Secret Manager.

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

Current demo-host state:

- `pmikckb-test` is the active demo project.
- The stray `pmikckb-test-8f927` project was deleted and may remain visible as
  `DELETE_REQUESTED` until Google finishes deletion.
- Auth setup is blocked until a human attaches or creates a Google Cloud billing
  account for `pmikckb-test`.
- After billing is attached, create a Google Auth Platform Web OAuth client if one does
  not already exist. Add the Firebase handler redirect URI:
  `https://pmikckb-test.firebaseapp.com/__/auth/handler`.
- Store that OAuth client ID and client secret in ignored `.env.local` as
  `FIREBASE_GOOGLE_CLIENT_ID` and `FIREBASE_GOOGLE_CLIENT_SECRET`, then rerun
  `npm run firebase:setup-auth`.

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

1. Open Google Cloud Console for `pmikckb-test` and attach/create billing.
2. Open Firebase Console > Authentication > Sign-in method.
3. Enable Google as a provider.
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

## Drive And Vertex AI Search

For the first demo, create one Drive folder for `KB / Lease Renewals`. Prefer a shared
drive or domain-owned folder so the future service identity and Vertex connector can
access it predictably.

Record:

- Drive folder ID.
- Vertex AI Search data store ID.
- Display name.
- Environment (`demo` or `client-production`).

Vertex AI Search Google Drive connector caveats to verify before relying on live
retrieval:

- The Cloud Console user must be tied to the Workspace whose Drive data is connected.
- Documents must be accessible in the domain, ideally through shared drives or
  domain-owned files.
- Workspace smart features may need to be enabled.
- Specific shared drives/folders can be selected.
- File size and indexing limits apply.

Official reference:
<https://docs.cloud.google.com/generative-ai-app-builder/docs/create-data-store-es>.

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
- Drive folder ID for `KB / Lease Renewals`.
- Vertex AI Search data store ID for Lease Renewals.
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
