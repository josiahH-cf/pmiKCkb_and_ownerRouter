# PMI KC KB Status

## Initial Scaffold

- Date: 2026-05-27
- Spec source used:
  - `docs/spec.md`
  - `docs/specs/spec-1-technical-spec.md`
  - `docs/specs/spec-2-technical-spec.md`
  - `docs/specs/spec-3-operating-north-star-spec.md`
  - `docs/specs/spec-4-implementation-meta-implementation-spec.md`

## Chosen Stack

- Next.js App Router, React, TypeScript, npm.
- Firestore / Firebase Auth / Vertex AI Search / Gemini / Gmail send-only are the
  target Google-native services.
- The scaffold uses local typed boundaries and avoids live Google SDK wiring until the
  integration milestones.

Why it fits: Spec 1 selects Next.js on Cloud Run, Firestore Native mode, Vertex AI
Search, Gemini, Firebase Auth, Drive folders, and Gmail send-only notifications.

## Files Created Or Moved

- Moved all four original specs into `docs/specs/`.
- Copied Spec 1 into `docs/spec.md`.
- Added KB app scaffold in `app/`, `components/`, `lib/`, and `styles/`.
- Added tests in `tests/`.
- Added validation in `scripts/verify.sh` and `scripts/check-router-boundary.mjs`.
- Added repo docs: `AGENTS.md`, `README.md`, `SETUP.md`, `docs/plan.md`,
  `docs/implement.md`, `docs/engineering.md`, `docs/router-repo.md`.
- Added config: `.codex/config.toml`, `.editorconfig`, `.gitignore`, `.env.example`,
  `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`,
  `eslint.config.mjs`, `vitest.config.ts`, `.github/workflows/ci.yml`,
  `firestore.rules`, `firestore.indexes.json`.

## Validation Status

- Dependency install completed with `npm install`.
- npm audit result: 0 vulnerabilities after pinning dependencies and overriding PostCSS
  to `8.5.10`.
- `bash scripts/verify.sh`: passed on 2026-05-27.
  - Reinstalled from `package-lock.json`.
  - Checked formatting.
  - Ran ESLint.
  - Ran TypeScript.
  - Ran 11 Vitest tests across unit and eval seed coverage.
  - Passed Router boundary verification.
  - Built the Next.js app successfully.
- Local smoke test:
  - `GET http://127.0.0.1:3000/ask`: 200.
  - `POST http://127.0.0.1:3000/api/ask`: returned `No Reliable Source Found`, as
    expected for the empty Phase A scaffold.

## Open Questions

- Brand hex values still need verification against `bluespringspropertymanagementinc.com`.
- Actual GCP project IDs, OAuth client IDs, Drive folder IDs, and Vertex AI Search data
  store IDs are not known.
- E2E tests are documented but inactive until auth/integration mocks are implemented.
- The separate Owner Router repository still needs to be initialized.

## Next Recommended Task

Wire the browser Google sign-in flow and session-cookie creation endpoint for M1.

## M1 Auth Guard Foundation

- Date: 2026-05-27
- Added server-side auth boundary with `AuthenticatedUser`, hosted-domain validation,
  role/capability guards, and test-only resolver injection.
- Protected Ask, Spaces, Approval Queue, Admin, and `/api/ask`; browser pages redirect
  unauthenticated users to `/sign-in`, while API calls return explicit `401` or `403`.
- Added a minimal `/sign-in` placeholder for the current pre-Firebase state.
- Updated local setup notes and `.env.example` with the future session-cookie name.
- Added tests for hosted-domain enforcement, role guard behavior, and Ask API auth
  responses.

Validation status:

- `bash scripts/verify.sh`: passed on 2026-05-27 after a retry; the first attempt hit
  a transient Windows `EPERM` unlink on Next's SWC binary during `npm ci`.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 21 tests.
- `npm run lint`: passed on 2026-05-27.
- `npm run build`: passed on 2026-05-27.
- `npm run verify:router-boundary`: passed on 2026-05-27.

Open items:

- Firebase Auth emulator and browser sign-in flow remain inactive.
- Local browser smoke for protected pages should expect `/sign-in` until live sessions
  exist.

Next recommended task:

Complete the live Firebase Admin session-cookie verification slice for M1. Completed in
the following section.

## M1 Firebase Admin Session Verification

- Date: 2026-05-27
- Added `firebase-admin` and a server-only Firebase Admin boundary that verifies
  session cookies with revocation checks.
- Replaced the placeholder opaque-cookie auth path with Firebase session-cookie
  verification through the existing `getCurrentUser` / `requireUser` guard surface.
- Enforced verified Google email, Google sign-in provider, `ALLOWED_HD`, optional `hd`
  claim consistency, and custom claim `role` values before returning an authenticated
  user.
- Updated `.env.example` and `SETUP.md` with `FIREBASE_PROJECT_ID`, Application Default
  Credentials expectations, and the live `AUTH_SESSION_COOKIE` behavior.
- Added session-cookie tests for valid cookies, invalid/revoked cookies, wrong hosted
  domain, mismatched `hd`, unverified email, non-Google provider, and invalid roles.
- Added an npm `uuid` override to keep the Firebase Admin dependency tree at 0 known
  audit vulnerabilities.

Validation status:

- `npm run format:check`: passed on 2026-05-27 after rerunning outside the Windows
  sandbox.
- `npm run lint`: passed on 2026-05-27.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 29 tests.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.
- `bash scripts/verify.sh`: passed on 2026-05-27 after rerunning outside the Windows
  sandbox; it reinstalled from the lockfile, checked formatting, linted, typechecked,
  ran 29 tests, passed Router boundary verification, and built the app.

Open items:

- Browser Google sign-in still needs to create the Firebase session cookie.
- Firebase Auth emulator coverage remains inactive until the browser sign-in flow is
  implemented.
- Actual GCP/Firebase project IDs and OAuth client IDs are still environment-specific.

Next recommended task:

Wire the browser Google sign-in flow and session-cookie creation endpoint for M1.

## M1 Browser Google Sign-In

- Date: 2026-05-27
- Added the Firebase browser SDK and client-side Google redirect sign-in on `/sign-in`.
- Added `/api/auth/session` to exchange Firebase ID tokens for HTTP-only Firebase
  session cookies and to clear the cookie on sign-out.
- Extended the Firebase Admin boundary to verify ID tokens, create session cookies, and
  apply one shared server-side claim policy for Google provider, verified email,
  `ALLOWED_HD`, hosted-domain consistency, role, and 12-hour absolute auth age.
- Implemented the spec default role for new Firebase users: missing role claims resolve
  to `Editor`, while invalid explicit roles still fail.
- Added a sign-out button to protected app navigation.
- Updated `.env.example`, `SETUP.md`, and `README.md` for Firebase web app config and
  the live browser sign-in path.

Validation status:

- `npm run format:check`: passed on 2026-05-27.
- `npm run lint`: passed on 2026-05-27.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 40 tests.
- `npm run build`: passed on 2026-05-27.
- `bash scripts/verify.sh`: passed on 2026-05-27; it reinstalled from the lockfile,
  checked formatting, linted, typechecked, ran 40 tests, passed Router boundary
  verification, and built the app.
- Local browser smoke on 2026-05-27: `/sign-in` renders the Google sign-in panel, and
  unauthenticated `/ask` redirects to `/sign-in`.

Open items:

- Firebase Auth emulator / Playwright coverage remains inactive until test fixtures are
  added.
- Actual Firebase public web app config, GCP/Firebase project IDs, OAuth clients, Drive
  folders, and Vertex AI Search data store IDs are still environment-specific.

Next recommended task:

Start M2 by adding Firestore emulator-backed editable-layer boundaries and tests for
SOP/template/tool/placeholder CRUD, change-log creation, and soft delete behavior.

## Post-M1 Review And Repair Pass

- Date: 2026-05-27
- Reviewed the browser sign-in implementation against M1 auth criteria, the session
  policy in `docs/spec.md`, affected setup docs, tests, local browser behavior, secret
  hygiene, and oversized-file risk.
- Fixed `/api/auth/session` bearer-token parsing so normal case-insensitive auth schemes
  and flexible whitespace are accepted instead of only exactly `Bearer <token>`.
- Added regression coverage for flexible bearer parsing.
- Updated `tests/e2e/README.md` so the e2e gap refers to missing Firebase Auth test
  fixtures rather than Firebase Auth generally.

Validation status:

- Focused `auth-session-route` test: passed on 2026-05-27 with 8 tests.
- `bash scripts/verify.sh`: passed on 2026-05-27; it reinstalled from the lockfile,
  checked formatting, linted, typechecked, ran 41 tests, passed Router boundary
  verification, and built the app.
- Local browser smoke on 2026-05-27: `/sign-in` renders, shows the expected missing
  Firebase-config warning in this local environment, and unauthenticated `/ask`
  redirects to `/sign-in`.

Repository status:

- Secret-pattern scan found no committed secret values; matches were only placeholder
  names, auth terminology, or test strings.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.
- Initial integrated commit exists on `main`: `402e795`.

## Required Separate Manual Setup: Live Firebase Auth

- Date: 2026-05-27
- Status: Required manual setup in a separate session before live sign-in can be
  considered done.
- Reason: The code path is implemented and locally verified, but the remaining work
  needs Firebase console, Google Cloud console, OAuth/Identity Platform, Workspace
  domain, and credential access that is not available from the repo.
- Documentation updated: `SETUP.md` now contains an ordered manual setup gate with
  official Firebase/Google source links for registering the web app, enabling Google
  sign-in, adding authorized domains, configuring Application Default Credentials,
  creating session cookies, and assigning custom role claims.
- Sources checked:
  - Firebase Web setup: <https://firebase.google.com/docs/web/setup>
  - Firebase Google sign-in for web:
    <https://firebase.google.com/docs/auth/web/google-signin>
  - Identity Platform Google provider and authorized domains:
    <https://docs.cloud.google.com/identity-platform/docs/web/google>
  - Firebase Admin session cookies:
    <https://firebase.google.com/docs/auth/admin/manage-cookies>
  - Google Cloud Application Default Credentials:
    <https://docs.cloud.google.com/docs/authentication/application-default-credentials>
  - Firebase custom claims:
    <https://firebase.google.com/docs/auth/admin/custom-claims>

Next manual setup actions:

1. Select/create the staging Firebase/GCP project and record its project ID.
2. Register the Firebase Web app and copy its config into `.env.local`.
3. Enable Google as the Auth/Identity Platform provider and add local/staging domains.
4. Configure local ADC or service-account impersonation; do not commit key files.
5. Set `ALLOWED_HD`, `AUTH_SESSION_COOKIE`, `GCP_PROJECT_ID`, and `FIREBASE_PROJECT_ID`.
6. Sign in once, then set the implementer's privileged `role` custom claim from a
   trusted Admin SDK context.
7. Smoke test allowed-domain sign-in, wrong-domain rejection, sign-out, and
   `bash scripts/verify.sh`.

## M2 Firestore Editable API Foundation

- Date: 2026-05-27
- Added Firestore editable-layer schemas, expanded typed records, and a server-only
  repository boundary for SOP, template, tool, and placeholder CRUD.
- Added API routes for Space-scoped SOP/template/placeholder create/list, single-record
  read/update/soft-delete, and tool create/list/read/update/soft-delete.
- Enforced server-side role behavior for editable writes, approval, placeholder
  resolution, Admin-only soft delete, read-only Owner Email Space blocking, duplicate
  active tool names, and change-log creation.
- Added `firebase.json`, `firebase-tools`, `@firebase/rules-unit-testing`,
  `vitest.firestore.config.ts`, and a separate `npm run test:firestore` emulator test
  command.
- Tightened `firestore.rules` so direct client access mirrors the role model and hard
  deletes remain denied.
- Updated `README.md`, `SETUP.md`, and `docs/implement.md` with the emulator test gate.

Validation status:

- `npm run format:check`: passed on 2026-05-27.
- `npm run lint`: passed on 2026-05-27.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 56 tests.
- `npm run build`: passed on 2026-05-27.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.
- `npm run verify:router-boundary`: passed on 2026-05-27.
- `bash scripts/verify.sh`: passed on 2026-05-27; it reinstalled from the lockfile,
  checked formatting, linted, typechecked, ran 56 tests, passed Router boundary
  verification, and built the app.
- `npm run test:firestore`: passed on 2026-05-27 with 6 Firestore Security Rules tests
  after installing a portable Temurin 21 JDK outside the repo and fixing the script to
  use `vitest.firestore.config.ts`.

Open items:

- CRUD UI for Spaces is not implemented yet; M2 currently exposes the server/API
  foundation.
- Firestore space seeding for real project environments still needs a dedicated setup
  step before live editable data entry.

Next recommended task:

Build the Space editing UI on top of the M2 API routes.

## Spec 1 Audit Roadmap And Owner Router Scaffold

- Date: 2026-05-28
- Audited current KB state against Spec 1, Spec 2, Spec 3, and Spec 4.
- Confirmed current KB state is a strong foundation/demo slice, not a completed Spec 1
  launch app.
- Updated `docs/plan.md` with explicit completion status for M0, M1, M2a, and the
  Lease Renewals demo slice, plus new M3a/M3b/M4a/M4b/M5a/M5b milestones.
- Updated `docs/implement.md` and `README.md` so future work starts with M3a live
  retrieval instead of treating demo Ask as launch completion.
- Updated `docs/router-repo.md` with sequencing, scaffold acceptance, and the KB
  read-only linkage step for the Owner Email Space.
- Created the separate sibling repo at
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`.
- Initialized the Router repo with no app runtime and added:
  - Preserved Spec 2, Spec 3, and Spec 4 docs.
  - `AGENTS.md`, `README.md`, `docs/plan.md`, `docs/implement.md`, and
    `docs/status.md`.
  - Six canonical `drive-package/` templates.
  - Owner Router Gem system prompt and fallback prompt pack.
  - Optional Apps Script helpers for labels, sheet headers, and health-check digest.
  - Placeholder Gmail filter export.
  - Acceptance checklist and historical-thread dry-run template.

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 66 tests, passed Router boundary verification,
  and built the app.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- Router scaffold boundary scan: passed on 2026-05-28. No send/draft/API-call patterns
  were present outside preserved specs.

Open items:

- KB M3a remains next: implement live Vertex AI Search retrieval boundary and
  source-metadata filtering.
- KB M3b remains after that: Gemini JSON validation, citation downgrades, Ask logging,
  and Ask-to-placeholder capture.
- The Router repo still needs Bailey/Dan-owned substantive content in the Drive files
  and live Gmail/Drive setup.
- KB A-16 cannot fully pass until the Router Drive folder exists and is indexed
  read-only as the Owner Email Space.

Next recommended task:

Start KB M3a: implement the live Vertex AI Search retrieval boundary and
`sources_meta` filtering while keeping the Lease Renewals demo path available for
show-and-tell.

## Windows Google Host Setup Stabilized

- Date: 2026-05-28
- Supersedes the earlier environment note that `gcloud` was not installed.
- Google Cloud SDK 570.0.0 is installed for `josiah.hunter@cherrybridge.ai`.
- Google Cloud project `pmikckb-test` was created after Terms of Service acceptance.
- Application Default Credentials are present and have quota project `pmikckb-test`.
- Enabled demo APIs include Cloud Resource Manager, Service Usage, Firestore,
  Firebase, Identity Toolkit, Drive, and Gmail.
- Added `scripts/setup-windows-google-dev.ps1` plus package commands:
  - `npm run host:setup`
  - `npm run host:check`
- Persisted user-level project environment variables for restart stability:
  `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`,
  `GCP_PROJECT_ID`, `FIREBASE_PROJECT_ID`, and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- Added a user-local `gcloud.cmd` shim under WindowsApps so new PowerShell sessions can
  resolve `gcloud`.
- Added user-local `java.cmd` and `javac.cmd` shims under WindowsApps and persisted
  `JAVA_HOME` to the installed Temurin 21 JDK so Firebase emulator tests do not depend
  on a shell restart.
- Replaced the raw Firestore emulator test command with
  `scripts/run-firestore-tests.mjs`, which refreshes Windows user/machine PATH before
  launching Firebase.
- Set current-user PowerShell execution policy to `RemoteSigned`.
- Added ignored local `.env.local` with non-secret demo defaults for this host.

Validation status:

- `npm run host:check`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- `npm run verify`: passed on 2026-05-28 after the host setup changes.

Open items:

- Live Firebase web app values are still unknown until Firebase is attached/configured
  for `pmikckb-test`; local demo mode remains usable without those secrets.
- Future agents should run `npm run host:setup` themselves instead of asking the user to
  run PowerShell commands.

## Firebase Setup Gate And API-Backed Space UI

- Date: 2026-05-28
- Added `scripts/setup-firebase-demo.mjs` and `npm run firebase:setup-demo` to attach
  Firebase to `pmikckb-test`, create/reuse the demo Firebase Web app, fetch browser
  config, and update ignored `.env.local`.
- `npm run firebase:setup-demo` currently stops at a Google auth consent gate:
  `projects:addFirebase` returns 403 even though `josiah.hunter@cherrybridge.ai` has
  `roles/owner` on `pmikckb-test`. The command now reports this as a clear human
  unblock instead of a stack trace.
- Updated the Lease Renewals Space detail client to try editable API data first for
  SOPs, templates, placeholders, and tools.
- When editable API calls fail because live Firebase/Firestore is not complete, the
  page falls back to the safe local demo records.
- When API-backed, the page can create safe demo records for empty SOP/template/tool/
  placeholder sections, save SOP edits through `PATCH /api/sops/:id`, approve SOPs
  through the editable API, and resolve placeholders through
  `PATCH /api/placeholders/:id`.

Validation status:

- `npm run firebase:setup-demo`: blocked by Google Firebase auth consent, as expected
  until the human Firebase setup gate is completed.
- `npm run format:check`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 64 tests.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- Local browser smoke: passed on 2026-05-28. Verified local demo sign-in, Lease
  Renewals fallback records, and SOP Save behavior.
- `npm run verify`: passed on 2026-05-28 after stopping the local dev server.

Next recommended task:

Complete the Firebase browser consent/console attachment gate, rerun
`npm run firebase:setup-demo`, then seed live Firestore demo records and smoke the
API-backed Lease Renewals page.

## Firebase And Firestore Demo Setup Finalized

- Date: 2026-05-28
- `npm run firebase:setup-demo` succeeded for `pmikckb-test`.
- Firebase Web app `PMI KC KB Demo Web` exists in `pmikckb-test`, and ignored
  `.env.local` now has the Firebase browser config.
- Firestore Native `(default)` database exists in `pmikckb-test` at `us-central1`.
- Deployed Firestore rules and indexes from this repo to `pmikckb-test`.
- `npm run seed:spaces` seeded all launch Space records into live Firestore.
- Added `scripts/seed-demo-records.mjs` and `npm run seed:demo`.
- `npm run seed:demo` seeded the safe Lease Renewals demo SOP, template, tool, and
  placeholder into live Firestore without overwriting existing records.
- Updated seed scripts to read ignored `.env.local`, so they work from a fresh terminal
  after host restart.
- Note: the separate Firebase-created `pmikckb-test-8f927` project has since been
  deleted and may remain visible as `DELETE_REQUESTED` until Google finishes deletion.

Validation status:

- `npm run host:check`: passed on 2026-05-28.
- `npm run firebase:setup-demo`: passed on 2026-05-28.
- Firestore database check: confirmed `(default)` in `us-central1`.
- API smoke with `__session=local-demo`: returned live Firestore SOP/template/tool/
  placeholder records.
- Browser smoke: passed on 2026-05-28. Verified local demo sign-in, API-connected Lease
  Renewals page, live records, and SOP Save through editable API.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- `npm run verify`: passed on 2026-05-28.

Next recommended task:

Enable and smoke real Firebase Google sign-in for the builder Workspace domain, then
set the first Admin/Approver custom claims.

## Firebase Auth Setup Gate

- Date: 2026-05-28
- Confirmed `pmikckb-test` is the active demo project.
- Deleted the stray `pmikckb-test-8f927` project. Google reports it as
  `DELETE_REQUESTED`, so it can still appear in project lists until deletion finishes.
- Added `npm run firebase:setup-auth` to initialize Firebase Auth / Identity Platform,
  add local/demo authorized domains, and enable Google as a sign-in provider once
  OAuth client credentials exist.
- Added `npm run firebase:set-role -- --email=<user@example.com> --role=Admin` for
  the first elevated Firebase custom claim after real sign-in creates the user.
- Attempted automated Auth initialization for `pmikckb-test`; Google returned
  `BILLING_NOT_ENABLED`, so a human must attach or create billing before the Identity
  Platform admin API can complete setup.
- Attempted Google provider creation before Auth initialization; Google requires a Web
  OAuth client ID and secret for `google.com` provider config.
- Updated setup docs with the billing/OAuth/manual-console gate and the automated
  continuation commands.

Validation status:

- Main project check: `pmikckb-test` is `ACTIVE`.
- Stray project check: `pmikckb-test-8f927` is `DELETE_REQUESTED`.
- Cloud Billing API is enabled on `pmikckb-test`, but no billing account is visible to
  the current Google account.

Next recommended task:

Human attaches or creates billing for `pmikckb-test`, then the agent reruns
`npm run firebase:setup-auth`, performs a real Google sign-in smoke, and assigns the
first Admin claim.

## Firebase Auth Billing Unblocked

- Date: 2026-05-28
- User linked billing for `pmikckb-test`.
- Verified billing is enabled for the project.
- Reran `npm run firebase:setup-auth`; Firebase Auth / Identity Platform initialization
  now succeeds.
- Verified Auth config exists with authorized domains:
  - `127.0.0.1`
  - `localhost`
  - `pmikckb-test.firebaseapp.com`
  - `pmikckb-test.web.app`
- Google provider config for `google.com` is still missing; the admin API returns
  `404` for `defaultSupportedIdpConfigs/google.com`.
- `npm run firebase:setup-auth` now stops at the remaining OAuth/provider gate and asks
  for either Firebase Console Google-provider enablement or
  `FIREBASE_GOOGLE_CLIENT_ID` / `FIREBASE_GOOGLE_CLIENT_SECRET` in ignored `.env.local`.

Next recommended task:

Human enables Google provider in Firebase Console for `pmikckb-test`, then the agent
reruns `npm run firebase:setup-auth`, performs a real Google sign-in smoke, and assigns
the first Admin claim.

## Firebase Google Sign-In Hang Repair

- Date: 2026-05-28
- User enabled the Google provider in Firebase Console.
- `npm run firebase:setup-auth` now passes and verifies:
  - Firebase Auth is initialized.
  - Google sign-in provider is enabled.
  - Authorized domains are `127.0.0.1`, `localhost`,
    `pmikckb-test.firebaseapp.com`, and `pmikckb-test.web.app`.
- First live redirect attempt returned to `/sign-in` but left the UI on
  `Checking session...`; no Firebase user record existed afterward.
- Updated the sign-in component so Firebase auth-state observation starts immediately,
  redirect-result handling has a timeout fallback, and popup sign-in falls back to
  redirect when the browser blocks popups.
- Browser retry reached the Google account chooser and consent screen for
  `josiah.hunter@cherrybridge.ai`.

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run firebase:setup-auth`: passed on 2026-05-28.

Open item:

- Google consent screen is awaiting a human click on `Allow` before Firebase can create
  the first real user. After that, rerun
  `npm run firebase:set-role -- --email=josiah.hunter@cherrybridge.ai --role=Admin`,
  then sign out and sign back in to refresh the Admin claim.

## Firebase Google Redirect-Only Sign-In

- Date: 2026-05-28
- User reported the sign-in page still appeared hung after clicking Google sign-in.
- Browser diagnostics showed the page stuck at `Opening Google...`, not waiting on the
  server and not showing a Google network timeout.
- Updated the sign-in button to use Firebase redirect sign-in directly instead of
  trying popup sign-in first. The previous popup-first path could stall in the in-app
  browser before handing off to Google.
- Kept the redirect-result timeout/idle fallback from the prior repair so returning to
  `/sign-in` cannot leave the page permanently disabled.
- Browser retry reached Google's account chooser for `josiah.hunter@cherrybridge.ai`
  within a few seconds.

Next recommended task:

Human selects `josiah.hunter@cherrybridge.ai` in Google, clicks `Allow` on the consent
screen, then the agent sets the first Admin claim and smokes `/ask` as a real Firebase
session.

## Firebase Localhost Redirect Repair

- Date: 2026-05-28
- User still saw `Google sign-in did not open` from the visible in-app browser.
- Firebase did not create a user record for `josiah.hunter@cherrybridge.ai`, and the
  app server showed no `/api/auth/session` POST, so the failure was before the app's
  session-cookie exchange.
- Browser automation confirmed the same sign-in button opens Google from
  `http://localhost:3000/sign-in`.
- Added a local sign-in page redirect from `http://127.0.0.1:<port>/sign-in` to
  `http://localhost:<port>/sign-in` so the Firebase Google handoff uses the standard
  localhost origin.
- Verified `http://127.0.0.1:3000/sign-in` redirects to `http://localhost:3000/sign-in`.
- Verified the Google button on `localhost` reaches Google's account chooser.

Next recommended task:

Continue the live sign-in from the visible Google account chooser, allow consent, then
set the first Admin claim.

## Live Auth Smoke Utility

- Date: 2026-05-28
- Added `npm run smoke:auth-live` using `playwright-core` and an installed Chrome or
  Edge executable, so future agents can diagnose real Firebase Google sign-in without
  depending on the in-app browser.
- The utility starts from `http://localhost:3000/sign-in`, clicks Google sign-in,
  fills or selects the provided account when possible, records console/page/network
  events, and writes screenshots plus `events.json` under ignored
  `temp/live-auth-smoke`.
- The utility uses a persistent ignored profile at `temp/live-auth-profile`, allowing a
  completed Google session to be reused by later smoke runs on the same host.
- It intentionally stops at human-only Google checkpoints such as password, MFA, and
  consent unless run with `--pause-on-human`.
- Tightened the utility to recognize Google password screens even when Google keeps an
  account-chooser URL, click the signed-in account row, and fail paused runs that time
  out before returning to the app.
- Updated `docs/google-setup.md` and `tests/e2e/README.md` to make this a documented
  diagnostic smoke, not a CI e2e test.

Validation status:

- `npm run smoke:auth-live` with `--email=josiah.hunter@cherrybridge.ai` and
  `--timeout-ms=90000`: passed on 2026-05-28 by reaching Google and stopping cleanly
  at the human password/MFA checkpoint.
- `npm run smoke:auth-live` with `--email=josiah.hunter@cherrybridge.ai`,
  `--timeout-ms=120000`, and `--pause-on-human`: passed on 2026-05-28 by reaching
  `/ask` with the refreshed Google session.
- `npm run firebase:set-role -- --email=josiah.hunter@cherrybridge.ai --role=Admin`:
  passed on 2026-05-28.
- Admin route smoke with the persistent browser profile: passed on 2026-05-28 by
  reaching `http://localhost:3000/admin`.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 64 tests.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28.

Next recommended task:

Continue from the working real Firebase Admin session and smoke the API-backed demo
flows against live Firestore.

## Live Firestore Demo Workflow Smoke

- Date: 2026-05-28
- Smoked the real Firebase Admin session against the local app and live `pmikckb-test`
  Firestore records using the persistent Chrome profile.
- Found and fixed an Approval Queue gap: the page was reading static demo records and
  its buttons only changed browser state.
- Approval Queue now loads live Lease Renewals SOP/template/placeholder records through
  the editable Firestore repository, falls back to demo records when live loading is
  unavailable, and calls the existing editable API routes to approve SOPs/templates or
  resolve placeholders.
- Extracted `lib/approval/queue.ts` and added unit coverage for live queue mapping and
  demo fallback.

Validation status:

- Signed-in browser smoke: passed on 2026-05-28. Verified Ask returns a `Verified
Source` Lease Renewals answer with the demo citation, Lease Renewals Space reports
  `Editable API connected.`, SOP Save writes through the editable API and was reverted,
  Approval Queue reports `Editable API connected.`, and `/admin` loads for the Firebase
  Admin user.
- Approval Queue approve/resolve API smoke: passed on 2026-05-28 during the first live
  run. The seeded in-review SOP/template and open placeholder were approved/resolved
  through the editable API; later runs correctly showed no in-review queue items.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 66 tests.
- `npm run verify`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.

Next recommended task:

Merge the working Firestore persistence branch, then start the next branch for either a
repeatable live workflow smoke script or the next demo feature gap.

## Demo Show-And-Tell Runbook

- Date: 2026-05-28
- Added `npm run demo:reset` to restore the safe Lease Renewals demo records to
  show-ready state: SOP/template `In Review`, placeholder `Open`, safe SOP/template/
  tool/placeholder content present, approval/resolution fields cleared.
- Added `npm run smoke:demo-live` to run the full signed-in live workflow smoke against
  the local app and demo Firestore project. The smoke resets demo records before and
  after it runs.
- Added `docs/demo-show-and-tell.md` with exact terminal commands, localhost links,
  sign-in guidance, the front-to-back demo workflow, demo language, troubleshooting,
  and demo readiness gaps.
- Updated `README.md`, `SETUP.md`, and `AGENTS.md` to route future sessions to the
  show-and-tell runbook.

Validation status:

- `npm run demo:reset`: passed on 2026-05-28 against `pmikckb-test`.
- `npm run smoke:demo-live`: passed on 2026-05-28 after starting the local dev server.
- `npm run verify`: passed on 2026-05-28 after stopping the hidden dev server that was
  holding Next's Windows SWC binary.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.

Next recommended task:

Review the show-and-tell wording once as the presenter, then decide whether the next
branch should add a deployed demo URL or live Vertex/Gemini retrieval.

## Demo Cutover Working Branch

- Date: 2026-05-28
- Branch: `codex/demo-cutover-working-app` merged to `main` through PR #1:
  <https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/1>.
- Checkpointed and pushed the current M2 API foundation from `main` before starting
  new demo/cutover work.
- Added durable docs for the demo-first path:
  - `docs/demo-cutover.md`
  - `docs/demo-slice.md`
  - `docs/google-setup.md`
- Split M2 planning into M2a API foundation, M2b Space UI, and M2c environment
  seeding.
- Added typed server config parsing and environment maps for Space Drive folders and
  Vertex data stores.
- Added local demo auth, guarded so it is disabled in production.
- Added a Lease Renewals demo Ask flow that returns a cited `Verified Source` answer
  for renewal questions and `No Reliable Source Found` for unsupported questions.
- Added a Lease Renewals Space detail page with local demo SOP/template/tool/placeholder
  state.
- Added a local demo Approval Queue with role-gated approve/resolve buttons.
- Added an idempotent Space seeding script:
  - `npm run seed:spaces`

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 64 tests.
- `npm run verify:router-boundary`: passed on 2026-05-28.
- `npm run build`: passed on 2026-05-28.
- `bash scripts/verify.sh`: passed on 2026-05-28.
- Local browser smoke with `LOCAL_DEMO_AUTH=true` and `ASK_DEMO_MODE=true`: passed on
  2026-05-28. Verified local demo sign-in, Ask verified answer with citation, Lease
  Renewals detail page, and Approval Queue.
- `npm run test:firestore`: still blocked because `java` is not on PATH.

Environment notes:

- GitHub CLI is authenticated as `josiahH-cf`.
- `gcloud` is not installed.
- A Temurin JDK install was attempted through `winget`, but the installer did not make
  `java` available before the shell command timed out. One `msiexec` process remained
  owned by the OS installer service and may require a restart or manual installer
  cleanup.

Next recommended task:

Finish local Java setup, run `npm run test:firestore`, then start the next branch for
real Firestore-backed Lease Renewals UI persistence where Google/Firebase config is
available.

## M2 Review And Repair Pass

- Date: 2026-05-27
- Installed a portable Temurin 21 JDK outside the repo so Firestore emulator tests can
  run locally. User-level `JAVA_HOME` and `Path` were updated; existing terminals may
  need restart before plain `java -version` works.
- Found and fixed the emulator test command: the normal Vitest config intentionally
  excludes `tests/firestore`, so `npm run test:firestore` now uses
  `vitest.firestore.config.ts`.
- Added explicit update-resource guards in `firestore.rules` while reviewing negative
  write paths.
- Confirmed the recent change remains KB-only, with no Owner Router runtime code or
  external system write paths.
- Secret-pattern scan found no committed secret values in repo files.
- Oversized-file check found only `package-lock.json` above 300 KB, expected after
  adding Firebase emulator tooling.

Validation status:

- `bash scripts/verify.sh`: passed on 2026-05-27 after the repair pass; it reinstalled
  from the lockfile, checked formatting, linted, typechecked, ran 56 tests, passed
  Router boundary verification, and built the app.
- `npm run test:firestore`: passed on 2026-05-27 with 6 Firestore Security Rules tests.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.

Open items:

- `npm run test:firestore` may require a new terminal session before it sees the
  user-level Java PATH update without setting `JAVA_HOME` manually.
- CRUD UI and Firestore Space seeding remain the next implementation work.

Next recommended task:

Build the Space editing UI on top of the M2 API routes.

## M3a Live Retrieval Boundary Foundation

- Date: 2026-05-28
- Added the official `@google-cloud/discoveryengine` client dependency.
- Replaced the retrieval stub with a Vertex AI Search / Discovery Engine boundary that:
  - resolves configured Space targets from `SPACE_DRIVE_FOLDER_IDS` and
    `SPACE_VERTEX_DATA_STORE_IDS`;
  - supports Space-scoped retrieval and all-configured-Space retrieval;
  - calls the Search API with `autoPaginate: false`;
  - normalizes Drive search results into KB citations;
  - filters unusable results through Firestore `sources_meta`, excluding `Deprecated`
    sources and `High` sensitivity sources;
  - applies the configured grounding confidence threshold before results reach Ask.
- Wired non-demo Ask mode through live retrieval first. Zero usable retrieval results
  return `No Reliable Source Found` without any model call.
- Added explicit `RetrievalSetupError` handling in `/api/ask` so missing project,
  Drive folder, or Vertex data store config returns an Admin/setup `503` instead of
  silently falling back.
- Kept `ASK_DEMO_MODE=true` bypassing live retrieval so the Lease Renewals
  show-and-tell path remains stable.
- Added unit coverage for retrieval config validation, request construction, result
  normalization, source-meta filtering, demo-mode bypass, no-source behavior, and Ask
  setup errors.

Validation status:

- Focused retrieval/Ask route tests: passed on 2026-05-28 with 14 tests.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 74 tests.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 74 tests, passed Router boundary verification,
  and built the app.

Open items:

- Live Vertex AI Search has not been smoked against a real data store because
  Drive folder IDs, Vertex data store IDs, and `sources_meta` records are not yet
  configured for the demo project.
- M3b remains unimplemented: Gemini strict JSON generation, citation downgrade after
  model output, Ask logging, and Ask-to-placeholder capture.

Next recommended task:

Create or connect the Lease Renewals Drive folder and Vertex AI Search data store,
seed matching `sources_meta`, set the Space config maps, and smoke one real retrieval
query before starting M3b.

## M3b Gemini Answer Contract And Ask Capture Foundation

- Date: 2026-05-28
- Added the current Google Gen AI SDK (`@google/genai`) for Vertex/Gemini answer
  generation. Avoided the deprecated `@google-cloud/vertexai` package.
- Added a Gemini answer boundary that:
  - sends a strict JSON response schema;
  - retries once after malformed JSON;
  - validates generated answer shape with Zod;
  - preserves the server-classified source state instead of allowing Gemini to upgrade
    it;
  - prepends `Draft — Review before sending` when Gemini returns a draft without the
    required banner.
- Wired live Ask mode through retrieval, Gemini generation, citation canonicalization,
  and final downgrade to `No Reliable Source Found` when Gemini cites no grounded
  source.
- Added review-only Ask responses for `Bailey Placeholder` and `Conflict Found` states
  so the KB does not generate a confident answer for open gaps or conflicting sources.
- Added Firestore `ask_logs` persistence for live Ask responses.
- Added `/api/ask/capture` and an Ask UI capture action for `Partial Source`,
  `Bailey Placeholder`, and `No Reliable Source Found` results. Capture creates an
  owned placeholder through the existing editable API boundary.
- Added `npm run smoke:ask-live`, a direct local API smoke for the live Ask path once
  the app is running with `ASK_DEMO_MODE=false` and real Drive/Vertex config.
- Extended the 50-case eval test so every seed case executes through the Ask service
  contract, not only the seed-file shape checks.

Validation status:

- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 86 tests.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run build`: passed on 2026-05-28 after rerunning sequentially. An earlier
  parallel run raced with `npm run verify`, which reinstalls dependencies and
  temporarily removed Next's Windows SWC binary during build.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 86 tests, passed Router boundary verification,
  and built the app.
- Local browser smoke: passed on 2026-05-28. Verified local demo sign-in, an
  unsupported Ask question returning `No Reliable Source Found`, and the Ask capture
  panel rendering without creating a placeholder.

Open items:

- Live Ask has not yet been smoked against a real Vertex AI Search data store because
  the Lease Renewals Drive folder ID, data store ID, and `sources_meta` records are
  still not configured.
- Live browser smoke was not run for this pass because the live Drive/Vertex setup is
  still missing; demo browser smoke remains covered by `npm run smoke:demo-live`.

Next recommended task:

Configure the Lease Renewals Drive/Vertex setup and run `npm run smoke:ask-live` with
`ASK_DEMO_MODE=false`.

## Review And Repair Pass For M3a/M3b

- Date: 2026-05-28
- Reviewed the M3a/M3b branch as a fresh verification pass against the spec, docs, API
  boundaries, Firestore rules, and PR state.
- Fixed duplicate `id="space"` controls in the Ask UI after adding the main Space
  selector and capture-task Space selector.
- Tightened `firestore.rules` so clients cannot directly create `ask_logs`; live Ask
  logs are server-written through the Admin SDK boundary.
- Added Firestore rules coverage for blocked direct Ask-log writes.
- Clarified the Gemini prompt so Approved sources are final while Unreviewed and
  Transcript-derived sources remain partial/review-required.
- Updated `AGENTS.md` with `npm run smoke:ask-live`.
- Updated `SETUP.md` so local/demo Ask behavior no longer implies every missing live
  setup returns only `No Reliable Source Found`; live missing setup now returns explicit
  setup errors.

Validation status:

- GitHub PR #2 CI `verify`: passed on 2026-05-28.
- Oversized file check: only `package-lock.json` is over 300 KB, expected for npm
  dependency lockfiles.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 86 tests.
- `npm run test:firestore`: passed on 2026-05-28 with 7 Firestore Security Rules
  tests.
- `npm run build`: passed on 2026-05-28.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 86 tests, passed Router boundary verification,
  and built the app.
- Local browser smoke: passed on 2026-05-28. Verified local demo sign-in,
  no-source Ask, capture panel rendering, Space selector behavior, and no duplicate DOM
  IDs on the Ask page.

Open items:

- Live Ask still needs real Lease Renewals Drive/Vertex configuration and
  `npm run smoke:ask-live` with `ASK_DEMO_MODE=false`.

Next recommended task:

Merge PR #2, sync local `main`, start a fresh branch, then configure the Lease
Renewals Drive/Vertex setup for live Ask smoke.

## Under-$10 Live Ask And Demo Deploy Helpers

- Date: 2026-05-28
- Added cost-guarded helper scripts for the next setup phase:
  - `npm run check:live-cost` blocks live smoke/deploy unless Ask is non-demo,
    `gemini-2.5-flash` is selected, and only the `lease-renewals` Space is configured.
  - `npm run seed:source-meta` upserts `sources_meta` entries from source IDs,
    Google Drive file URLs, or Cloud Storage `gs://` object URIs.
  - `npm run deploy:demo` deploys the demo to Cloud Run only when
    `--budget-confirmed` is supplied, with scale-to-zero settings and a one-instance
    cap.
- Extended `npm run smoke:ask-live` with `--browser-session` so deployed Cloud Run
  smoke can reuse the signed-in browser profile instead of enabling local demo auth.
- Updated `.env.example`, `AGENTS.md`, `README.md`, `docs/implement.md`, and
  `docs/google-setup.md` with the cheap live path, command list, console links, and
  user-owned setup steps.
- Kept this phase scoped to one Lease Renewals data store. No Owner Router runtime,
  Gmail notification path, production cutover, all-Space indexing, or custom domain
  mapping was added.

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- Focused tests: `npm test -- tests/unit/live-cost-scripts.test.mjs` passed on
  2026-05-28 with 5 tests.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 91 tests.
- Dry-run `npm run check:live-cost`: passed on 2026-05-28 with a mocked one-Space
  Flash config.
- Dry-run `npm run seed:source-meta`: passed on 2026-05-28 and normalized a Google
  Docs URL into a Drive file ID.
- Dry-run `npm run deploy:demo -- --budget-confirmed`: passed on 2026-05-28 and
  produced a scale-to-zero Cloud Run command.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 7 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 91 tests, passed Router boundary verification,
  and built the app.

Open items:

- A human still needs to complete the linked Google Console tasks in
  `docs/google-setup.md`: budget alert, Drive folder/source docs, Vertex AI Search
  data store, service-account/IAM review, and Firebase authorized domain after deploy.
- Live Ask and deployed Cloud Run smoke have not been run because the real Drive folder
  ID, Vertex data store ID, source file IDs, and Cloud Run URL do not exist in the repo.

Next recommended task:

Complete the user-owned console setup in `docs/google-setup.md`, populate ignored
`.env.local` with the one-Space Lease Renewals IDs, then run `npm run check:live-cost`,
`npm run seed:source-meta`, local `npm run smoke:ask-live`, `npm run deploy:demo`, and
deployed `npm run smoke:ask-live -- --browser-session`.

## Live Setup Follow-Up: APIs, Search Location, And Seed Docs

- Date: 2026-05-28
- Confirmed the `$10` budget alert exists per user report.
- Enabled the missing APIs needed for the cheap live/deploy path in `pmikckb-test`:
  `aiplatform.googleapis.com`, `run.googleapis.com`, `cloudbuild.googleapis.com`,
  `artifactregistry.googleapis.com`, `iam.googleapis.com`, and
  `iamcredentials.googleapis.com`.
- Verified the full required API set is now enabled for the current cheap path,
  including Discovery Engine / Vertex AI Search, Drive, Firestore, Firebase /
  Identity Platform, Cloud Billing, Service Usage, Logging, and Monitoring.
- Verified `pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com` has the intended
  runtime roles: `roles/aiplatform.user`, `roles/datastore.user`, and
  `roles/discoveryengine.user`.
- Split Gemini and Vertex AI Search locations in config:
  - `VERTEX_AI_LOCATION=us-central1` for Gemini.
  - `VERTEX_SEARCH_LOCATION=us` for Agent Search / Vertex AI Search data stores.
- Updated setup docs with exact API names, exact Lease Renewals Drive folder ID,
  recommended data store name/id, and the current Google Workspace data-store caveat
  that service-account search is not supported for Workspace data stores.
- Created ignored local seed docs under `temp/lease-renewals-drive-seed/` for user
  upload to the Lease Renewals Drive folder. These are safe demo docs, not real call
  transcripts.

Validation status:

- API enablement: succeeded on 2026-05-28.
- IAM verification for `pmikckb-test-svc`: passed on 2026-05-28.
- `npm run format:check`: passed on 2026-05-28.
- Focused tests for config/search/deploy helpers: passed on 2026-05-28 with 29 tests.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 91 tests.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 7 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 91 tests, passed Router boundary verification,
  and built the app.
- Dry-run `npm run check:live-cost`: passed on 2026-05-28 with a mocked one-Space
  Flash config.
- Dry-run `npm run deploy:demo -- --budget-confirmed`: passed on 2026-05-28 and
  included `VERTEX_SEARCH_LOCATION=us`.

Open items:

- The user hit a Google console OAuth error while creating the Google Drive data store:
  `Access blocked: Authorization Error`, `Client missing a project id`, `invalid_client`.
- The original call/transcript files referenced by `docs/spec.md`
  (`pmi_-_call_1.md`, `pmi_-_call_2.md`, `transcript_analysis.md`) are not present in
  the local repos found under `C:\Users\josia\Documents\github-windows`.
- Because Google docs currently say service-account credentials cannot search Google
  Workspace data stores, a Drive-backed data store may not work with the current
  server-side retrieval boundary. If the data store can be created but live Ask returns
  403, use a Cloud Storage data store for the cheap demo smoke or implement user OAuth
  retrieval before accepting the Drive-backed path.

Next recommended task:

Upload the two safe seed docs from `temp/lease-renewals-drive-seed/` plus one
sanitized real Lease Renewals call transcript or notes file, retry data-store creation
from the exact project-scoped console link, then provide the data store ID and Drive
file IDs for `npm run seed:source-meta` and live smoke.

## Cloud Storage Data Store Route

- Date: 2026-05-29
- Switched the cheap live Ask setup path from a Drive-backed data store to a
  Cloud Storage-backed Agent Search data store after the Drive connector OAuth error
  and the documented Workspace service-account search limitation.
- Updated retrieval citation normalization so `gs://` results are shown as
  `https://storage.cloud.google.com/...` browser links while still using the Agent
  Search document ID as the source key.
- Updated `npm run seed:source-meta` so `--source-id=gs://...` accepts a Cloud
  Storage object URI and derives the same deterministic raw-content document ID that
  Agent Search documents for Cloud Storage content imports.
- Added a reusable sanitized call-notes template at
  `docs/demo-source-templates/lease-renewals-sanitized-call-notes.md` so the demo can
  include real process context without committing sensitive source material.
- Updated `docs/google-setup.md`, `docs/implement.md`, `.env.example`, and
  `README.md` for the Cloud Storage source-prefix workflow.

Validation status:

- Focused retrieval/script tests passed on 2026-05-29 with 11 tests.
- `npm run format:check`: passed on 2026-05-29.
- `npm run lint`: passed on 2026-05-29.
- `npm run typecheck`: passed on 2026-05-29.
- `npm test`: passed on 2026-05-29 with 93 tests.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 93 tests, passed Router boundary verification,
  and built the app.
- `npm run test:firestore`: passed on 2026-05-29 with 7 Firestore Security Rules
  tests.

Open items:

- A human still needs to add one sanitized Lease Renewals call transcript or notes
  file before the demo can prove actual call-derived context.
- A human still needs to create the Cloud Storage-backed Agent Search data store and
  provide the bucket name if the agent cannot run authenticated `gcloud` commands.

Next recommended task:

Run the exact Cloud Storage setup workflow in `docs/google-setup.md`, seed
`sources_meta` using the uploaded `gs://` source URIs, then run local live Ask smoke.

## Cloud Storage Live Ask Smoke

- Date: 2026-05-29
- Completed Google auth reauthentication for local CLI and Application Default
  Credentials.
- Created source bucket `gs://pmikckb-test-lease-renewals-686407` and uploaded the
  safe Lease Renewals demo sources.
- Confirmed the console-created Markdown data store
  `kb-lease-renewals_1780046781160` did not index documents for the smoke path.
- Corrected the source format to supported `.txt` Cloud Storage content files and
  granted the Discovery Engine service agent read-only access to the source bucket.
- Created working standard-edition data store `kb-lease-renewals-txt` and imported
  2 of 2 text documents.
- Updated `.env.local` to use:
  - `ASK_DEMO_MODE=false`
  - `GEMINI_MODEL_ANSWER=gemini-2.5-flash`
  - `SPACE_DRIVE_FOLDER_IDS={"lease-renewals":"gs://pmikckb-test-lease-renewals-686407/lease-renewals/"}`
  - `SPACE_VERTEX_DATA_STORE_IDS={"lease-renewals":"kb-lease-renewals-txt"}`
- Seeded `sources_meta` for both imported `.txt` Cloud Storage objects.
- Removed the standard-edition blocker by dropping the Enterprise-only extractive
  answer request from the Vertex AI Search query and using snippets only.
- Updated `docs/google-setup.md` so future setup uses supported `.txt` uploads, the
  service-agent bucket grant, and the working data-store ID pattern.

Validation status:

- Corrected TXT import completed with `successCount=2` and `totalCount=2` on
  2026-05-29.
- `npm run check:live-cost`: passed on 2026-05-29 for one Lease Renewals space using
  `gemini-2.5-flash`.
- Focused retrieval test passed on 2026-05-29 with 5 tests.
- `npm run typecheck`: passed on 2026-05-29.
- `npm run smoke:ask-live -- --timeout-ms=90000`: passed on 2026-05-29 against
  `http://localhost:3000`.

Open items:

- The sanitized real call-notes file still matches the blank template and was not
  uploaded. The live smoke currently proves safe seed sources only, not call-derived
  client context.
- The console-created `kb-lease-renewals_1780046781160` data store can be deleted
  later to avoid confusion after confirming no dependency points to it.

Next recommended task:

Add sanitized real Lease Renewals call notes, upload/import the `.txt` copy, seed its
`sources_meta` record as `Transcript-derived`, then deploy the cheap Cloud Run demo if
the local result is acceptable.

## Fresh Review And Documentation Alignment

- Date: 2026-05-29
- Reviewed the live Ask / Cloud Storage work as a fresh-context verification pass.
- Found and fixed stale wording in active docs and scripts that still implied the
  cheap live path was Drive/Vertex-only after the working path moved to Cloud Storage
  plus Agent Search.
- Added tracked safe demo source templates under `docs/demo-source-templates/` so a
  future clone is not dependent on ignored `temp/` files for the live Ask smoke setup.
- Updated `docs/google-setup.md` with the known working `pmikckb-test` bucket and
  data-store values, supported `.txt` upload flow, the Discovery Engine service-agent
  bucket read grant, and troubleshooting for empty/stuck imports.
- Updated `SETUP.md`, `README.md`, `docs/plan.md`, `docs/implement.md`, and
  `docs/demo-show-and-tell.md` so the current next task is sanitized real call notes
  and cheap Cloud Run deploy, not first-time live retrieval setup.
- Updated source metadata seeding to prefer `--source-id` while keeping legacy
  `--drive-file-id` accepted.
- Updated user-facing setup errors and smoke failures to say source target / Agent
  Search instead of Drive folder / Drive-Vertex when the value may be a Cloud Storage
  prefix.

Validation status:

- Official Google documentation was rechecked on 2026-05-29 for Cloud Storage
  unstructured file support and `roles/storage.objectViewer` bucket access.
- Focused tests passed on 2026-05-29 with 22 tests across retrieval, live-cost/source
  scripts, and Ask service setup-error behavior.
- `npm run format:check`: passed on 2026-05-29.
- `npm run lint`: passed on 2026-05-29.
- `npm run typecheck`: passed on 2026-05-29.
- `npm test`: passed on 2026-05-29 with 94 tests.
- `npm run build`: passed on 2026-05-29.
- `npm run test:firestore`: passed on 2026-05-29 with 7 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 94 tests, passed Router boundary verification,
  and built the app.
- `git diff --check`: passed on 2026-05-29.
- Quality-control review found no unexpectedly large code file changes; the largest
  new tracked content is documentation and safe demo source templates.

Open items:

- The safe seed live Ask smoke is complete, but sanitized real Lease Renewals call
  notes are still needed before treating the demo as call-context-backed.
- The unused console-created Markdown data store `kb-lease-renewals_1780046781160`
  should be deleted later after confirming the app and docs continue to point at
  `kb-lease-renewals-txt`.

Next recommended task:

Add sanitized Lease Renewals call notes, upload/import the `.txt` copy into
`kb-lease-renewals-txt`, seed `sources_meta` with `approval_status=Transcript-derived`,
rerun live Ask smoke, then deploy the cheap Cloud Run demo.

## Transcript-Backed Demo Planning And Source Templates

- Date: 2026-05-29
- Reviewed local raw call/context material under `docs/context_and_calls/` against
  current repo docs, demo runbooks, Google setup docs, and source templates.
- Confirmed the raw call folder contains sensitive and noisy local review material,
  including participant names, owner/applicant examples, dollar amounts, Fathom links,
  and bank/screening-adjacent details. It is now ignored by git and Prettier so it can
  remain local without breaking `npm run format:check` or being accidentally tracked.
- Converted the blank Lease Renewals sanitized call-notes template into a
  transcript-derived, review-required source summary with role-only facts and explicit
  placeholder triggers.
- Added sanitized transcript-derived source templates for three supported future demo
  candidates:
  - Maintenance Work Order Intake / vendor assignment.
  - Move-Out + Deposit Disposition.
  - Owner Onboarding.
- Updated demo and setup docs so the current truth is explicit: the cheap live Ask path
  works through Cloud Storage `.txt` sources and Agent Search, while call-context-backed
  live Ask still requires reviewing the sanitized template, uploading/importing the
  `.txt` copy, seeding `sources_meta`, and rerunning live smoke.
- Updated active next-step wording in `README.md`, `docs/plan.md`, and
  `docs/implement.md` from "add sanitized notes" to the remaining upload/import/seed
  work.

Validation status:

- `npm run format:check`: passed on 2026-05-29.
- No code or test files changed, so focused tests and `npm run typecheck` were not
  required for this documentation-only pass.

Open items:

- The sanitized Lease Renewals `.txt` copy still needs to be uploaded/imported into
  `kb-lease-renewals-txt`, seeded in `sources_meta` as `Transcript-derived`, and smoked
  with `npm run smoke:ask-live`.
- Maintenance, Move-Out, and Owner Onboarding are strong future demo candidates, but
  they need separate source prefixes/data stores and approval before being treated as
  final SOP content.
- Bailey/Dan still need to confirm legal notice wording, fee details, approval
  thresholds, exception handling, and any tenant/owner-facing template language before
  those details can become approved sources.

Next recommended task:

Review the sanitized Lease Renewals call-notes template, upload/import its `.txt` copy
into `kb-lease-renewals-txt`, seed `sources_meta` with
`approval_status=Transcript-derived`, rerun `npm run check:live-cost` and
`npm run smoke:ask-live`, then deploy the cheap Cloud Run demo if the live answer is
acceptable.

## Fresh Review And Repair: Transcript Template Alignment

- Date: 2026-05-29
- Performed an outside-style verification pass over the recent transcript-backed demo
  documentation work, current branch state, and affected runbooks.
- Fetched `origin` and moved the work off `main` onto
  `codex/review-demo-docs-call-context`; local HEAD and `origin/main` were aligned
  before the branch was created.
- Confirmed no remote merge was needed because the branch base and `origin/main` had
  zero ahead/behind commits after fetch.
- Falsified the new templates for obvious leakage patterns and did not find emails,
  phone numbers, dollar amounts, Fathom links, named owners/applicants, bank examples,
  or private payment identifiers in `docs/demo-source-templates/`.
- Fixed a terminology ambiguity in the template source context by changing participant
  role labels from `owner` to `company owner`, so demo readers do not confuse Dan with
  a property owner in workflow examples.
- Tightened `docs/demo-cutover.md` wording from Drive-specific setup to source target
  / Agent Search setup for the current Cloud Storage-backed live Ask path.
- Clarified `.gitignore` grouping so `docs/context_and_calls/` is recognized as raw
  review context, not a tracked source folder.

Validation status:

- `npm run format:check`: passed on 2026-05-29.
- `git diff --check`: passed on 2026-05-29.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 94 tests, passed Router boundary verification,
  and built the app.
- Quality-control scan: `docs/context_and_calls/` is ignored by git; new demo source
  templates are small Markdown files; no unexpected tracked file over 300 KB was found
  other than the existing `package-lock.json`.

Open items:

- Same as above: the sanitized Lease Renewals `.txt` still needs upload/import,
  `sources_meta` seeding, and live Ask smoke before the demo is call-context-backed.

## Robust First-Pass Demo Source Expansion

- Date: 2026-05-29
- Strengthened the transcript-derived demo source templates so they can stand alone as
  first-pass handoff artifacts for a client demo without pretending to be approved
  SOPs.
- Added workflow value, first-pass handoff flow, safe-answer boundaries, refusal
  boundaries, Bailey/Dan review questions, placeholder triggers, and stronger demo Ask
  questions to:
  - Lease Renewals.
  - Maintenance Work Order Intake.
  - Move-Out + Deposit Disposition.
  - Owner Onboarding.
- Added `docs/demo-source-templates/README.md` to catalog which templates belong in
  the current Lease Renewals live Ask corpus and which are future demo candidates.
- Updated `docs/demo-show-and-tell.md`, `docs/demo-slice.md`, `docs/google-setup.md`,
  and `README.md` so the new templates are discoverable and the current one-Space live
  Ask boundary remains clear.
- Rechecked the new demo source templates for obvious sensitive-data patterns; the only
  match was the intended warning text about private Fathom links, not an actual link.
- Replaced remaining active demo/cutover wording that implied Drive-only or
  Vertex-only setup with source location / Agent Search wording where appropriate.

Validation status:

- `npm run format:check`: passed on 2026-05-29.
- `git diff --check`: passed on 2026-05-29.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 94 tests, passed Router boundary verification,
  and built the app.
- Sensitive-pattern scan over `docs/demo-source-templates/` found no actual URLs,
  emails, phone numbers, named owner/applicant examples, bank/payment identifiers, or
  dollar amounts in the source templates. The only match was intentional safety
  language referencing `under-$10` demo scope.

Open items:

- Transcript-derived templates still require Bailey/Dan approval before they can become
  final SOP content.
- Only Lease Renewals is ready for the current cheap live Ask import path. The other
  templates need separate source targets, data stores, demo records, and cost checks
  before live demo use.

## Transcript-Backed Live Ask Repair And Hardening

- Date: 2026-05-29
- Refreshed the Lease Renewals transcript-derived source so Agent Search sees workflow
  facts before sanitization guardrail text. The first live smoke had retrieved the
  right document but did not produce a cited Ask answer reliably.
- Uploaded the refreshed `.txt` copy to
  `gs://pmikckb-test-lease-renewals-686407/lease-renewals/03-lease-renewals-sanitized-call-notes.txt`.
- Imported that object into Agent Search data store `kb-lease-renewals-txt`; the import
  operation completed with `successCount=1` and `totalCount=1`.
- Re-seeded `sources_meta` for document ID `9de7f0d4bd8630e7a73f3cddbe752289` with
  `approval_status=Transcript-derived` and `sensitivity=Low`.
- Confirmed direct Agent Search now returns the transcript-derived source as the top
  result for "When do we contact the owner versus the tenant during a renewal?"
- Hardened the live answer contract so Gemini is instructed to use `Partial Source`
  when excerpts support a cautious answer, never put the draft banner in the answer
  field, and never invent escalation-owner role titles.
- Hardened the Ask service response boundary to strip draft banners out of the answer,
  fall back to known escalation labels only, and normalize draft banner spacing.
- Updated active README, implementation, plan, demo-slice, and show-and-tell docs so
  they no longer say the Lease Renewals transcript-derived source still needs to be
  uploaded/imported/smoked.

Validation status:

- Focused unit tests passed on 2026-05-29 with 17 tests across Ask service and Gemini
  answer-contract behavior.
- `npm run format:check`: passed on 2026-05-29.
- `npm run typecheck`: passed on 2026-05-29.
- `git diff --check`: passed on 2026-05-29.
- `npm run smoke:ask-live -- --question="When do we contact the owner versus the tenant during a renewal?" --timeout-ms=120000`
  passed on 2026-05-29 against the local app with `ASK_DEMO_MODE=false`.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 98 tests, passed Router boundary verification,
  and built the app.
- Quality-control scan: changed files are small documentation/code/test edits; demo
  source templates remain under 8 KB each; sensitive-pattern scan found only intentional
  safety wording around routing rules and under-$10 demo scope, not customer URLs,
  emails, phone numbers, account identifiers, SSNs, or real dollar amounts.

Open items:

- Transcript-derived Lease Renewals content is useful for demo grounding, but remains
  review-required until Bailey/Dan approve final SOP wording.
- Maintenance, Move-Out, and Owner Onboarding templates remain future demo candidates;
  they are not imported into the one-Space live corpus.
- The cheap Cloud Run demo has not been deployed in this pass.
