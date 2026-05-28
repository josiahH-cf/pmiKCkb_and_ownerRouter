# PMI KC KB Setup

This is the repo-local setup guide for the KB scaffold. The full production runbook is
in `docs/spec.md` Appendix B.

For the current demo-first path, read:

- `docs/demo-show-and-tell.md` for exact local demo commands and the client walkthrough.
- `docs/demo-slice.md` for the first working Lease Renewals demo.
- `docs/demo-cutover.md` for the demo-to-client environment model.
- `docs/google-setup.md` for live Google/Firebase/Drive/Vertex/Gmail setup.

On this Windows demo host, future agents should use the repo command below to repair
or verify Google tooling, project selection, ADC quota project, user environment
variables, and PowerShell script permissions without asking the user to run shell
commands:

```bash
npm run host:setup
```

For a non-creating verification pass:

```bash
npm run host:check
```

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

The scaffold runs without live Google services in demo mode. With `ASK_DEMO_MODE=true`,
Ask returns the safe Lease Renewals demo response. With `ASK_DEMO_MODE=false`, live Ask
requires the Drive/Vertex configuration; missing setup returns an explicit setup error
instead of falling back to a generic answer.

Protected app pages require the server auth guard. Unauthenticated browser visits
redirect to `/sign-in`, where the Firebase browser SDK signs in with Google and
exchanges the ID token for an HTTP-only server session cookie.

Firebase Admin ID-token and session-cookie verification uses Application Default
Credentials in local and deployed environments. Set `GCP_PROJECT_ID` or
`FIREBASE_PROJECT_ID`, set the `NEXT_PUBLIC_FIREBASE_*` browser values from the
Firebase web app config, keep `AUTH_SESSION_COOKIE=__session` unless the cookie name
changes, and do not commit service-account keys.

## Firestore Emulator Tests

M2 adds Firestore Security Rules tests behind a separate command:

```bash
npm run test:firestore
```

This command starts the local Firestore emulator through `firebase-tools`, then runs
`tests/firestore/**/*.test.ts`. The Firebase Local Emulator Suite requires Java JDK 11+
on PATH; without Java, the command fails before tests start. Source:
<https://firebase.google.com/docs/emulator-suite/install_and_configure>.

On Windows, this command runs through `scripts/run-firestore-tests.mjs`, which refreshes
the user and machine PATH before starting Firebase so emulator tests do not depend on a
terminal restart after Java installation.

## Manual Setup Gate: Live Firebase Auth

This is a required separate setup session. It cannot be completed from repo code alone
because it needs access to the Firebase console, Google Cloud console, OAuth/Identity
Platform settings, and the target Google Workspace domain. Complete this before treating
live sign-in or auth e2e coverage as done.

The sequence below is based on the official Firebase and Google Cloud setup docs:

1. Create or select the staging Firebase/Google Cloud project. If using an existing
   Google Cloud project, add Firebase to that project from the Firebase console. Record
   the immutable project ID for `GCP_PROJECT_ID`, `FIREBASE_PROJECT_ID`, and
   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
   - Source: <https://firebase.google.com/docs/web/setup>
2. Register a Firebase Web app in that Firebase project. Copy the Firebase config
   object values into `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - Source: <https://firebase.google.com/docs/web/setup>
3. Attach billing if setup is being automated through the Identity Platform admin API.
   Without billing, that API returns `BILLING_NOT_ENABLED`.
4. Enable Google as the Firebase Auth / Identity Platform provider. Configure the
   Google Web Client ID and secret or consent screen if the console prompts for them.
   Add the Firebase handler redirect URI:
   `https://<project-id>.firebaseapp.com/__/auth/handler`. Add the app domains under
   authorized domains: local development, staging, and later production. Do not add
   `localhost` to production projects unless Google guidance for that project
   explicitly requires it.
   - Sources:
     - <https://docs.cloud.google.com/identity-platform/docs/web/google>
     - <https://firebase.google.com/docs/auth/web/google-signin>
5. Configure local server credentials for the Firebase Admin SDK. Prefer Application
   Default Credentials for local setup, such as `gcloud auth application-default login`
   or service-account impersonation. In deployed Cloud Run, use the attached service
   account. Do not commit service-account key files.
   - Source: <https://docs.cloud.google.com/docs/authentication/application-default-credentials>
6. Set the required local auth environment values in `.env.local`:
   - `ALLOWED_HD=pmikcmetro.com` for production, or the approved test Workspace domain
     for staging.
   - `AUTH_SESSION_COOKIE=__session` unless intentionally changed.
   - `GCP_PROJECT_ID` and `FIREBASE_PROJECT_ID` matching the selected project.
   - `FIREBASE_GOOGLE_CLIENT_ID` and `FIREBASE_GOOGLE_CLIENT_SECRET` when using
     `npm run firebase:setup-auth` to enable the provider.
7. Create the first elevated role after the implementer signs in once. The app defaults
   missing role claims to `Editor`; `Approver` and `Admin` require privileged custom
   claims, for example `{ "role": "Admin" }`, set with the Firebase Admin SDK from a
   trusted backend/admin script. Custom claims must not be set by client-side code.
   - Source: <https://firebase.google.com/docs/auth/admin/custom-claims>
   - Repo helper: `npm run firebase:set-role -- --email=<user@example.com> --role=Admin`
8. Smoke test the live setup:
   - Restart `npm run dev` after changing `.env.local`.
   - Visit `/sign-in`, sign in with an allowed-domain Google account, and confirm the
     app lands on `/ask`.
   - Confirm a wrong-domain account is rejected.
   - Use Sign out and confirm `/ask` redirects back to `/sign-in`.
   - Run `bash scripts/verify.sh`.

## Verify

```bash
bash scripts/verify.sh
```

The verifier installs from `package-lock.json`, checks formatting, lints, typechecks,
runs tests, verifies the Router boundary, and builds the app.

`bash scripts/verify.sh` does not start the Firestore emulator. Run
`npm run test:firestore` separately when Java is available.

## Google Setup Milestone

When integration work begins, use `docs/google-setup.md` as the detailed runbook.
The high-level order is:

1. Create staging and production GCP projects.
2. Enable Vertex AI, Discovery Engine, Firestore, Cloud Run, Identity Platform, Gmail
   API, Drive API, Secret Manager, Cloud Logging.
3. Complete the Manual Setup Gate above for Firebase Auth / Identity Platform.
4. Complete the live sign-in smoke test from the Manual Setup Gate.
5. Create Firestore Native mode in `us-central1`.
6. Configure one Drive folder and one Vertex AI Search data store per KB Space.
7. Grant the KB service identity `drive.readonly` on KB folders and the Owner Router
   folder only.
8. Grant Gmail send-only authority for `KB Approval` notifications.

Do not grant Gmail read, Gmail modify, Gmail compose, Drive write, or system-of-record
write scopes.

For the current `pmikckb-test` demo host, Firebase and Firestore setup can be repaired
or completed with:

```bash
npm run host:setup
npm run firebase:setup-demo
npm run seed:spaces
npm run seed:demo
npm run demo:reset
```
