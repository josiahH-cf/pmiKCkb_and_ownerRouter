# PMI KC Status

> Current governance note, 2026-06-03: entries before the three-product governance
> realignment are historical. They may mention KB-only scope, separate Owner Router repo
> setup, Bailey Brain, or Dan's AI Assistant. Active routing now lives in `AGENTS.md`,
> `docs/north-star.md`, and `docs/products/`.

## Current Loop State

This log is the append-only history. For the always-current resume pointer (active lane,
next safe slice, blockers, stop-condition state), read `docs/loop-state.md` first. If the
two disagree, this status log wins and `docs/loop-state.md` is corrected.

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

## Four-Workflow Demo Closeout

- Date: 2026-05-29
- Assumed Bailey/Dan approval for sanitized demo messaging and promoted the four
  sanitized call-note templates to approved demo sources while keeping missing legal,
  fee, cadence, exception, and system-of-record details out of final SOP content.
- Expanded local demo mode from Lease Renewals only to four approved workflow slices:
  Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and
  Owner Onboarding.
- Added approved safe demo SOP source files for Maintenance, Move-Out, and Owner
  Onboarding so live retrieval has more than one source per new workflow.
- Uploaded `.txt` copies for the three added workflows to
  `gs://pmikckb-test-lease-renewals-686407/`, created/imported the Agent Search data
  stores `kb-maintenance-work-order-intake-txt`,
  `kb-move-out-deposit-disposition-txt`, and `kb-owner-onboarding-txt`, and seeded
  `sources_meta` for all nine demo source objects as `Approved` / `Low`.
- Added `npm run import:agent-search` for repeatable Cloud Storage content imports and
  hardened the Cloud Run deploy helper for Windows `gcloud.ps1`, multi-Space maps, and
  escaped JSON env values.
- Added an explicit `--skip-allow-unauthenticated` deploy option for projects where
  organization policy rejects `allUsers` invoker bindings, and tightened the
  multi-Space live-cost guard so empty source/data-store maps are still rejected.
- Deployed Cloud Run service `pmi-kc-kb-demo` in `pmikckb-test` at
  <https://pmi-kc-kb-demo-800237451321.us-central1.run.app/sign-in>.
- Cloud setup changes made in the demo project:
  - granted the default compute service account read-only access to the Cloud Run
    source bucket and `roles/run.builder`;
  - deployed runtime as `pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com`;
  - granted that runtime service account `roles/firebaseauth.admin`;
  - disabled Cloud Run invoker IAM checks because org policy rejected `allUsers`;
  - added the Cloud Run hosts to Firebase Auth authorized domains.
- Updated README, setup, implementation, plan, demo, cutover, Google setup, and source
  template docs to reflect the four-workflow local and deployed demo state.

Validation status:

- `npm run check:live-cost -- --allow-multiple-spaces`: passed on 2026-05-29.
- Local live Ask smoke passed for all four workflow Spaces with `ASK_DEMO_MODE=false`.
- `npm run deploy:demo -- --budget-confirmed --allow-multiple-spaces --service-account=pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com`:
  passed on 2026-05-29 after the IAM fixes above.
- Deployed auth smoke passed on 2026-05-29 and reached `/ask`.
- Deployed live Ask smokes passed on 2026-05-29 for Lease Renewals, Maintenance Work
  Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding.
- `npm run demo:reset`: passed on 2026-05-29 and reset four workflow records.
- `npm run smoke:demo-live -- --base-url=http://localhost:3000 --timeout-ms=60000`:
  passed on 2026-05-29 for Ask, all four Space save/revert checks, Approval Queue, and
  Admin.
- Focused checks passed on 2026-05-29: `npm run build`, `npm run typecheck`, and
  `npm test -- tests/unit/live-cost-scripts.test.mjs tests/unit/ask-service.test.ts tests/unit/approval-queue.test.ts`.
- `npm run format:check`: passed on 2026-05-29 after the review/hardening pass.
- `npm run check:live-cost -- --allow-multiple-spaces`: failed as expected against the
  restored local demo environment while `ASK_DEMO_MODE=true`; passed with a temporary
  live-mode override and the current configured source/data-store maps.
- `npm run verify`: passed on 2026-05-29 after the final review/hardening pass.
- `npm run test:firestore`: passed on 2026-05-29.

Open items at that time:

- The unused console-created Markdown data store `kb-lease-renewals_1780046781160`
  still needed deletion confirmation. This is resolved in the following production
  follow-up pass.
- Final production remained out of scope for this demo. The following production
  follow-up pass implements launch skeletons, notification plumbing, and Admin
  observability, while keeping PMI KC-owned production source approval/import and
  Owner Router read-only indexing as open cutover work.

## Production Follow-Up Workflow Pass

- Date: 2026-05-29
- Implemented all launch Space shells and safe launch skeletons for the seven remaining
  writable Spaces: owner renewal outreach, tenant renewal notice, vendor assignment
  handoff, daily inbox triage, Fathom training, escalation rules, and move-in.
- Added all-Space Approval Queue loading, Return-for-revision actions for SOP/template
  items, visible Space change-log history, and Admin observability for Ask volume,
  queue depth, notification failures, source states, top Spaces, open placeholders, and
  setup health.
- Added Gmail send-only approval notification plumbing behind
  `KB_APPROVAL_NOTIFICATIONS_ENABLED=false` by default. The implementation uses only
  the Gmail send scope, logs sent/skipped/failed notification attempts, and keeps KB
  approval notifications internal-only.
- Added transcript-derived safe source starters for the seven remaining launch Spaces,
  plus `docs/source-corpus/demo-live-source-manifest.json` and
  `npm run corpus:plan` to produce `.txt` staging copies, upload commands, import
  commands, and `sources_meta` seed commands.
- Added guarded operational scripts:
  - `npm run seed:launch-skeletons` for idempotent launch skeleton seeding.
  - `npm run delete:agent-search-data-store` for confirmed Agent Search data-store
    deletion with an active-env-map guard.
- Fresh review repair: launch skeleton reset/force-seed paths now clear stale
  approval, review, related-SOP, and resolution fields so a previously approved or
  resolved skeleton returns to a clean placeholder state.
- Seeded the demo Firestore with all 12 Space records and 21 safe launch skeleton
  records. Existing records are skipped by the skeleton seeder unless `--force` is
  used.
- Confirmed the deployed Cloud Run service and local `.env.local` maps referenced
  `kb-lease-renewals-txt`, not `kb-lease-renewals_1780046781160`, then deleted the
  unused console-created Agent Search data store
  `kb-lease-renewals_1780046781160`.
- Updated README, setup, Google setup, implementation, plan, demo show-and-tell, and
  demo source template docs to reflect the new launch skeleton, notification,
  observability, corpus-manifest, and deletion-helper state.

Validation status:

- `npm run corpus:plan -- --write-temp`: passed and generated ignored `.txt` staging
  copies under `temp/source-corpus`.
- `npm run seed:launch-skeletons -- --dry-run`: passed and previewed 21 safe records.
- Focused launch skeleton helper regression test: passed.
- `npm run seed:spaces`: passed against the demo project.
- `npm run seed:launch-skeletons`: passed against the demo project and created 21
  safe launch skeleton records.
- Guarded stale data-store deletion: passed and deleted
  `kb-lease-renewals_1780046781160`.
- Sensitive-pattern scan over `docs/demo-source-templates/`: no actual URLs, emails,
  phone numbers, or dollar amounts found.
- Oversized-file check: no unexpected tracked files over 300 KB outside generated or
  lockfile paths.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 115 tests.
- `npm run build`: passed.
- `npm run test:firestore`: passed with 8 Firestore Security Rules tests.
- `npm run smoke:demo-live -- --base-url=http://localhost:3000 --timeout-ms=90000`:
  passed after starting the local dev server with demo mode enabled; the server was
  stopped afterward.
- `npm run check:live-cost`: passed with explicit `ASK_DEMO_MODE=false`.
- `npm run verify`: passed; it checked formatting, lint, typecheck, 115 tests, Router
  boundary, and build.
- `git diff --check`: passed.

Open items:

- Production source corpus is not complete until PMI KC-owned source locations and
  approved production source files are provided/imported. The manifest is a safe demo
  and staging preparation path, not a substitute for production source approval.
- Gmail approval notifications remain disabled until the sender identity, recipient
  list, and deployed `APP_BASE_URL` are approved and configured.
- The separate Owner Router repo exists locally, but the Owner Router Drive package
  still needs substantive Bailey/Dan content and read-only indexing into the KB Owner
  Email Space before final A-16 verification.

## Demo Done And Production Cutover Readiness Pass

- Date: 2026-05-29
- Added `docs/demo-readiness.md` to define the demo done state separately from
  production completion.
- Added `docs/client-production-cutover.md` as the ordered client-owned rebuild path.
- Added neutral command aliases for reusable setup/deploy flows while preserving demo
  aliases:
  - `npm run firebase:setup`
  - `npm run firebase:setup-auth`
  - `npm run firebase:setup-auth-demo`
  - `npm run deploy`
  - `npm run preflight:production`
- Parameterized `npm run corpus:plan` so generated Agent Search import commands can
  target a client project/location instead of hard-coding `pmikckb-test`.
- Added `docs/source-corpus/client-production-source-manifest.template.json` as a
  placeholder manifest for approved PMI KC-owned sources. It intentionally excludes
  Owner Email, which remains blocked on the separate Owner Router package and
  read-only indexing.
- Added a production cutover preflight that rejects demo project IDs, demo source
  targets, demo auth mode, local demo auth, missing Firebase public config, missing
  `APP_BASE_URL`, and missing source/data-store maps.
- Fresh review repair: production preflight now also rejects mismatched
  GCP/Firebase/public Firebase project IDs and demo-valued Firebase auth domains,
  `APP_BASE_URL`, or Cloud Run service accounts. It also rejects unreplaced
  placeholders and requires a valid HTTPS production `APP_BASE_URL`.
- Updated README, SETUP, Google setup, demo cutover, demo show-and-tell, implementation,
  plan, and source-template docs so demo done and production cutover ready are distinct
  states.

Validation status:

- Focused unit test: `npm test -- tests/unit/live-cost-scripts.test.mjs` passed with
  22 tests, including corpus planner parameterization, client-production manifest
  validation, production preflight checks, mismatched project/demo auth-domain
  rejection, and unreplaced placeholder rejection.
- `npm run preflight:production -- --env-file=temp/production-preflight-ok.env` passed
  against an ignored client-shaped env file.
- `npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --project=pmikc-kb-production --location=us --dry-run`
  passed and generated import commands for `pmikc-kb-production` rather than
  `pmikckb-test`.
- `npm run seed:launch-skeletons -- --dry-run` passed.
- `npm run format:check`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 121 tests.
- `npm run test:firestore`: passed with 8 Firestore Security Rules tests.
- `npm run verify`: passed; it checked formatting, lint, typecheck, 121 tests, Router
  boundary, and build.
- `git diff --check`: passed.

Open items:

- Re-run the documented demo readiness smoke matrix before claiming the demo is done
  for a specific show date.
- Client production still requires PMI KC-owned project/admin/billing access and
  approved production source files; the repo now has a more autonomous runbook, but it
  cannot create or approve those external assets by itself.

## One-Command Local Demo Operator

- Date: 2026-05-29
- Added `npm run demo:operator` and `scripts/demo-operator.ps1` for local demo
  rehearsal, showtime startup, and teardown.
- The operator supports:
  - `TestRun`: host check, demo reset, local dev server start/reuse, local workflow
    smoke, launch skeleton dry-run, and operator link generation.
  - `Showtime`: clean reset, quick local smoke, final reset, and browser launch for
    the local sign-in flow.
  - `Teardown`: demo reset and stop only the dev server started by the operator.
- Updated `docs/demo-readiness.md` and `docs/demo-show-and-tell.md` so the preferred
  tomorrow-demo path is the operator script with local demo sign-in.

Validation status:

- `npm test -- tests/unit/demo-operator.test.mjs`: passed with 7 tests.
- `npm run format:check`: passed after formatting the new operator and tests.
- `npm run typecheck`: passed.
- `npm test`: passed with 128 tests across 23 files.
- `node scripts/demo-operator.mjs --mode=test-run --skip-install --no-open-browser --dry-run`:
  passed and printed the expected command plan.
- `.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall -NoOpenBrowser -DryRun`:
  passed and printed the same plan through the PowerShell wrapper.
- `.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall -NoOpenBrowser`: passed. It
  verified host setup, reset demo records, started/reused the local dev server,
  passed `smoke:demo-live`, dry-ran launch skeleton seeding, and generated
  `temp/demo-operator/demo-links.html`.
- `npm run demo:operator -- --mode=showtime --skip-install --no-open-browser --dry-run`
  and `npm run demo:operator -- --mode=teardown --dry-run`: passed.
- `git diff --check`: passed.

Open items:

- When the presenter is ready, run
  `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall`.
- After the demo, run `.\scripts\demo-operator.ps1 -Mode Teardown`.

## June 2 Demo Readiness Hardening

- Date: 2026-06-02
- Added explicit offline-local demo operator support for the same four-workflow
  screenshare when Google project access or ADC reauth is unavailable.
- The offline path skips Google host checks and Firestore resets, starts the app with
  local demo auth/retrieval, runs `smoke:demo-live` with local fallback assertions, and
  still generates the operator links page.
- Narrowed default fallback/demo reset behavior back to the four approved workflow
  slices. Launch skeletons remain available through `npm run seed:launch-skeletons`
  and are no longer part of default demo reset or fallback Approval Queue.
- Added demo-safe Admin observability fallback so stale Google credentials do not
  surface raw `invalid_grant` messages during screenshare.
- Updated `docs/demo-show-and-tell.md` and `docs/demo-readiness.md` with normal
  API-backed and offline-local runbooks.
- Updated Vitest to `4.1.8` after npm audit reported a critical advisory in the older
  dev dependency.

Validation status:

- `npm run demo:operator -- --mode=test-run --skip-install --offline-local --no-open-browser --timeout-ms=120000`:
  passed; local app started, four-workflow smoke passed with local fallback, launch
  skeleton seed dry-run passed, and operator links were generated.
- `npm run demo:operator -- --mode=teardown --offline-local --no-open-browser`: passed
  and stopped the operator-started dev server.
- `npm test`: passed with 132 tests.
- `npm run test:firestore`: passed with 8 Firestore Security Rules tests.
- `npm run build`: passed.
- `npm audit --json`: passed with 0 vulnerabilities after the Vitest update.
- `bash scripts/verify.sh`: passed after the demo-hardening changes; it reinstalled
  from the lockfile, checked formatting, linted, typechecked, ran 132 tests, passed
  Router boundary verification, and built the app.

Google-backed demo status:

- `npm run host:check`: blocked because `pmikckb-test` is not currently accessible in
  this non-interactive shell. Earlier direct `gcloud` checks reported Google reauth
  failure.
- `npm run demo:reset`: blocked by ADC `invalid_grant` / `invalid_rapt`, so Firestore
  demo resets require Google reauth before the normal API-backed path is used.
- `npm run check:live-cost -- --json`: fails under the current user env because
  `ASK_DEMO_MODE=true`, as intended by the guard.
- Four-workflow live-cost preflight with explicit live-mode overrides passed for Lease
  Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner
  Onboarding.

Next recommended task:

- For today's PMI KC Metro screenshare, use
  `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal` unless Google
  reauth is completed first. If showing the normal API-backed path, refresh `gcloud`
  and Application Default Credentials, then rerun `npm run host:check`,
  `npm run demo:reset`, the normal demo operator, and the live Ask smokes.

## Dan's AI Assistant Demo Segment

- Date: 2026-06-02
- Implemented the approved native-Gmail Owner Router plan in the separate sibling repo
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`.
- Added customer-facing positioning for "Dan's AI Assistant" while preserving Owner
  Router as the implementation/spec name.
- Added demo-safe sanitized owner-email scenarios for Renewal Follow-Up, Maintenance
  Approval, and Accounting / Disbursement.
- Added a Dan's AI Assistant runbook to this KB show-and-tell doc so the segment can be
  shown after the KB workflow without implying the KB app owns Gmail.
- Added an Owner Router artifact verifier that checks the required labels, required
  source-safety language, demo package files, and absence of obvious Apps Script
  send/draft capabilities.
- No KB runtime code, Gmail read/modify/compose scope, Gmail draft creation, Owner
  Router runtime, autonomous send, or external-system write path was added.

Validation status:

- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\scripts\verify-owner-router.ps1`:
  passed.
- `bash scripts/verify.sh`: passed after the Dan's AI Assistant demo docs update. It
  reinstalled from the lockfile, checked formatting, linted, typechecked, ran 132
  tests, passed Router boundary verification, and built the app.
- `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal -NoOpenBrowser -TimeoutMs 120000`:
  passed; the local app is running at `http://localhost:3000/sign-in`, and
  `smoke:demo-live` passed with local fallback.

Next recommended task:

- During the customer show, use the KB local demo first, then show the Dan's AI
  Assistant segment from the sibling Owner Router repo with sanitized scenarios only.

## Customer Close Demo Revamp

- Date: 2026-06-02
- Reworked the demo narrative around the new sales goal: Bailey Brain as the
  source-backed operating layer, with Dan's AI Assistant as the Gmail-native owner-email
  extension.
- Added `docs/customer-close-demo.md` as the concise run order for the screenshare.
- Updated `docs/demo-show-and-tell.md` so Dan's AI Assistant is a core sales segment
  after Approval Queue, not an optional appendix.
- Added explicit transition, sell, and close language focused on reducing context
  rebuild, keeping Gmail native, preserving human send authority, and making Dan's
  preferences reusable through approved documents.
- No runtime behavior, Gmail scope, Gmail draft creation, autonomous send, or
  system-of-record write path was added.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\scripts\verify-owner-router.ps1`:
  passed.

## Three-Product Governance Realignment

- Date: 2026-06-03
- Replaced active KB-only routing with the purchased three-product direction:
  PMI KC KB, Lease Renewal Agent, and Gmail Inbox 0.
- Added the new active governance docs:
  - `docs/north-star.md`
  - `docs/products/README.md`
  - `docs/products/pmi-kc-kb.md`
  - `docs/products/lease-renewal-agent.md`
  - `docs/products/gmail-inbox-zero.md`
  - `docs/integration-cutover-plan.md`
  - `docs/client-checklist.md`
  - `docs/engineering-checklist.md`
  - `docs/ai-execution-workflow.md`
  - `docs/research-backlog.md`
- Updated `AGENTS.md`, `README.md`, `docs/plan.md`, `docs/implement.md`, and
  `docs/engineering.md` so future AI sessions start from the three-lane model.
- Marked old separate Owner Router direction as legacy:
  - moved the full separate-repo plan to
    `docs/legacy/owner-router-separate-repo.md`;
  - kept `docs/router-repo.md` as a superseded stub so old links do not break;
  - marked `docs/router-repo-template/README.md` as legacy.
- Updated active demo/cutover docs so Gmail Inbox 0 is the active client-facing owner
  email lane, while Owner Router/Dan's AI Assistant references are legacy source
  context until naming and artifact migration are approved.
- Added a governance notice to `docs/spec.md`; it remains the KB technical spec, but
  cross-product routing now comes from `docs/north-star.md` and `docs/products/`.
- Updated the Owner Email read-only copy and launch source labels from separate Owner
  Router wording to Gmail Inbox 0 source-package wording.
- Updated `scripts/check-router-boundary.mjs` so the verification guard now enforces
  active Gmail Inbox 0/legacy-boundary docs instead of requiring the retired separate
  Router handoff.
- Added constants for `Lease Renewal Agent` and `Gmail Inbox 0` while preserving
  legacy Owner Router constants used by existing KB references.

Validation status:

- `npm run format:check`: initially failed on new markdown wrapping, then passed after
  formatting the named files.
- `git diff --check`: passed.
- First `bash scripts/verify.sh`: failed at `npm run verify:router-boundary` because
  the old guard still required the separate `pmi-kc-owner-router` handoff in
  `docs/router-repo.md`.
- `npm run verify:router-boundary`: passed after updating the guard.
- Final `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked
  formatting, linted, typechecked, ran 132 tests, passed the updated boundary check,
  and built the app.

Open blockers and client asks:

- PMI KC KB production needs client-owned GCP/Firebase billing/project access,
  authorized domains, role users, approved production source files, source sensitivity
  decisions, source/data-store maps, and a Gmail notification enabled/disabled
  decision.
- Lease Renewal Agent needs v1 scope: trigger model, source systems, allowed actions,
  human review points, required source documents, and acceptance scenarios.
- Gmail Inbox 0 needs v1 setup decisions: final label naming, owner sender rules,
  Dan/Bailey access model, Drive source package, Gemini Gem/prompt-pack availability,
  and safe live-Gmail test approach.
- No raw customer records, live Gmail contents, credentials, ledgers, bank data, SSNs,
  or full lease packets may be committed.

Repository note:

- The worktree already contained uncommitted demo-hardening/runtime changes before this
  pass. They were preserved and not reverted.

Next recommended task:

- Use `docs/client-checklist.md` to collect client answers, then update
  `docs/products/lease-renewal-agent.md`, `docs/products/gmail-inbox-zero.md`, and
  `docs/research-backlog.md` before starting any new runtime product work.

## Three-Product Governance Review And Repair Pass

- Date: 2026-06-03
- Reviewed the three-product governance migration against the pasted plan, active
  routing docs, product-lane docs, cutover docs, status log, and validation guard.
- Confirmed the active docs now route new work through PMI KC KB, Lease Renewal Agent,
  and Gmail Inbox 0, while preserving original specs and marking the old separate
  Owner Router direction as legacy.
- Found and repaired a status-log ordering bug: the new Three-Product Governance
  Realignment section had been inserted inside the older Dan's AI Assistant entry. It
  now appears after the June 2 demo/customer-close entries as the latest active status.
- Fixed stale wording in `docs/integration-cutover-plan.md` that still described
  monorepo governance as a remaining Gmail Inbox 0 blocker after governance had already
  been added.
- Fixed a small no-write wording typo in `docs/products/lease-renewal-agent.md`
  (`Sheet` to `Sheets`).
- Ran stale-context searches for active KB-only/separate-Owner-Router routing language.
  Remaining matches outside preserved specs are historical status text, explicit legacy
  notices, or intentional legacy source-context references.
- Ran an oversized-file check excluding expected generated/dependency files; no
  unexpected tracked or working files over 300 KB were found.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Owner Router Artifact Source Routing

- Date: 2026-06-05
- Audited the local sibling package at
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`.
- Confirmed the package exists locally with the expected Owner Router artifact shape:
  docs, Drive package templates, prompt pack, Gmail filters, Apps Script helpers,
  scripts, and tests.
- Confirmed the sibling repo is outside the current workspace root and has no commits
  yet, so agents cannot assume it is automatically available or remotely handed off.
- Added `docs/legacy/owner-router-artifact-source.md` as the controlled source map for
  when and how Gmail Inbox 0 work may inspect the sibling package.
- Linked that source map from `AGENTS.md`, `README.md`,
  `docs/products/gmail-inbox-zero.md`, `docs/autonomous-agent-runner.md`, and
  `docs/environment-handoff.md`.
- Extended `npm run verify:router-boundary` so the sibling package route and
  source-material-only boundary cannot disappear silently.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- Quality-control check: `AGENTS.md` remains under 150 lines at 102 lines.

- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 132 tests, passed the updated boundary check, and built the
  app.

Remaining risk:

- The worktree still includes earlier uncommitted demo-hardening/runtime changes that
  predate the governance migration. They were not reverted or folded into this review.
- Preserved specs and historical status entries still contain Owner Router language by
  design. Active docs now carry override/legacy notices, but a future human reviewer may
  still choose to do a deeper spec rewrite after the client confirms final Gmail Inbox 0
  naming and label migration.

## Product Definition Gap Plan

- Date: 2026-06-03
- Added `docs/product-definition-gap-plan.md` as the durable explanation of what the
  current three-product plan actually supports, what exists now, and what must be
  decided before runtime work expands.
- Wired the new gap plan into `AGENTS.md` and `docs/implement.md` so future sessions
  use it when scope, product shape, or follow-up questions are part of the task.
- Expanded `docs/client-checklist.md` with concrete product-definition follow-ups for
  KB launch Spaces, Lease Renewal Agent trigger/output shape, and Gmail Inbox 0 label,
  sender, and safe-test decisions.
- Expanded `docs/research-backlog.md` with the missing v1 success statements,
  acceptance questions, first-output decision, and Gmail Inbox 0 naming/migration
  decision.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Product Definition Decisions Round 1

- Date: 2026-06-03
- Captured the user-confirmed roadmap: PMI KC KB production lift and Gmail Inbox 0 Dan
  pilot move in tandem; Lease Renewal is the first full backend automation after KB
  production; Maintenance follows after chatbot/phone alignment; Move-Out follows after
  workflow-run and approval patterns mature.
- Updated active docs so PMI KC KB is now described as both the source-backed app and
  future workflow-control layer. The KB still launches before external write paths are
  added.
- Recorded the first three automation processes: Lease Renewal, Maintenance Work Order
  Intake, and Move-Out + Deposit Disposition, with Owner Onboarding as the fourth/fallback
  workflow.
- Recorded the backend automation model: Users can start workflows, Admins approve by
  default, each write/send/update is individually approved at first, and executed actions
  record approver, change, source facts, before/after values, target system, and
  timestamp.
- Updated Gmail Inbox 0 from owner-email-first to Dan-email-first: the pilot evaluates
  Dan's whole mailbox, starts with `Waiting on Outside` and `Waiting on Team`, suggests
  labels by default, auto-labels only exact or repeated Dan-approved patterns, and keeps
  Dan manual-send for now.
- Recorded the first Gmail Inbox 0 management surface inside the KB app: Admin-only
  labels, rules, approved replies, change history, and Gmail/Gemini health status.
- Updated Lease Renewal direction: a team member starts the workflow, the system should
  anticipate from signed-lease timing, Dan approves owner-facing information and
  communication, and the system may send after approval once a future send/write spec is
  approved.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed after updating the routing guard from the
  retired owner-email-first boundary to the Dan mailbox boundary.

## Admin Role Decision

- Date: 2026-06-03
- Recorded Josiah and Dan as the initial Admins for the KB and Gmail Inbox 0 management
  layer.
- Recorded that Admins may grant the Admin role to additional users they choose.
- Updated the client checklist and research backlog so the remaining user-access
  blocker is the initial User list and any process-specific approvers beyond the Admin
  default.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Initial User Scope Decision

- Date: 2026-06-03
- Recorded that the initial KB/Gmail Inbox 0 launch does not need separate `User`
  accounts beyond Josiah and Dan.
- Kept the `User` role as a future delegation path once Josiah or Dan choose to grant
  broader access.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Approval Notification Decision

- Date: 2026-06-03
- Recorded that Gmail send-only KB approval notifications should be enabled at
  production launch.
- Recorded that approval notifications should be incorporated into the Gmail Inbox 0
  vision so approval work can eventually flow between the KB app and Gmail while
  preserving human approval.
- Updated remaining blockers from "enabled or disabled" to the concrete production
  configuration: sender identity, recipients, Gmail label behavior, and delivery/error
  handling.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Approval Notification Recipients

- Date: 2026-06-03
- Recorded Dan and Josiah as the launch recipients for Gmail send-only KB approval
  notifications.
- Left sender identity, Gmail label behavior, and delivery/error handling as the
  remaining production notification configuration items.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Notification Sender And PMI KC Test Identity

- Date: 2026-06-03
- Recorded that KB approval notifications should use a dedicated `pmikcmetro.com` KB
  automation sender provisioned for the KB, not a personal or consultant email account.
- Recorded that Josiah should use a PMI KC `pmikcmetro.com` email account for future
  auth and automation testing once provisioned.
- Active setup and production docs should not use Josiah's historical Cherrybridge email;
  older status/spec references are historical only.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm test -- tests/unit/live-cost-scripts.test.mjs`: passed.

## KB Automation Sender Address

- Date: 2026-06-03
- Recorded `kb-automation@pmikcmetro.com` as the dedicated sender for KB approval
  notifications.
- Updated active docs and remaining blockers so only Gmail label behavior and
  delivery/error handling remain open for notification setup.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm test -- tests/unit/live-cost-scripts.test.mjs`: passed.

## KB Approval Notification Labeling

- Date: 2026-06-03
- Recorded that KB approval notifications should use a clear approval subject line and
  apply the `KB Approval` Gmail label.
- Updated active docs and remaining blockers so only notification delivery/error
  handling remained open at that point.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Approval Notification Failure Handling

- Date: 2026-06-03
- Recorded that KB approval notification failures should escalate instead of failing
  silently.
- Kept the exact escalation meaning as TBD: channel, owner, retry behavior, and alert
  surface still need definition.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Starter Sources And Chrome Discovery

- Date: 2026-06-03
- Recorded that the Lease Renewals Space can start from a video demo, context from the
  client, and information from the team.
- Marked those as starter materials, not final source-of-truth materials, until they are
  sensitivity-reviewed, placed in a client-owned source location, and Admin-approved.
- Recorded Chrome-based process observation as feasible in principle for discovery when
  explicitly approved, while keeping production browser automation and writes blocked
  until a future approved spec exists.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Walkthrough Mode

- Date: 2026-06-03
- Recorded that the first Lease Renewal discovery pass should use both a recorded
  walkthrough and a live supervised Chrome session.
- Kept Chrome/browser observation scoped to discovery until approved setup, permissions,
  and a later automation spec exist.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Walkthrough Lead

- Date: 2026-06-03
- Recorded two acceptable walkthrough ownership paths: a client-led show-and-tell, or
  the client showing Josiah so he can capture and translate the workflow data.
- Kept captured workflow data subject to sensitivity review, client-owned source
  placement, and Admin approval before it becomes source-of-truth material.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Location Principle

- Date: 2026-06-03
- Recorded that captured Lease Renewal workflow notes should live first in a
  client-accessible source location where PMI KC can add more context.
- Recorded that the location should be chosen to connect to the app's approved
  source-backed retrieval or workflow capability, not treated as a private scratchpad.
- Kept the exact folder, system, or connector as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Default Source Location

- Date: 2026-06-03
- Recorded Google Drive as the default first capture/collaboration location for Lease
  Renewal workflow notes, unless setup identifies a better client-accessible,
  app-connected source.
- Clarified that Drive may be the human collaboration layer even if the approved
  production retrieval/indexing path uses another target.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source-Of-Truth Curation Model

- Date: 2026-06-03
- Recorded that the Lease Renewal Drive/source location should not default to separate
  raw-discovery and approved-source areas.
- Recorded that material in the client-accessible source folder should be treated as
  source-of-truth input and curated frequently.
- Kept the curation workflow as TBD, including AI-assisted update proposals, human
  approval, cadence, and sync into the app's indexed source set.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Folder Edit Access

- Date: 2026-06-03
- Recorded that the whole PMI KC team should be allowed to directly edit the initial
  Lease Renewal source-of-truth folder.
- Kept the exact Workspace group or named-user list as a client setup detail.
- Kept curation, indexing, and automation-use rules separate and still TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal AI-Assisted Source Curation

- Date: 2026-06-03
- Recorded the first curation model for the Lease Renewal source-of-truth folder:
  AI-proposed changes with human review.
- Recorded the goal as continuous documentation improvement, not one-time source
  capture.
- Kept reviewer identity, review cadence, and app-index sync path as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Curation Reviewer

- Date: 2026-06-03
- Recorded Dan as the initial human reviewer for AI-proposed Lease Renewal source
  updates.
- Kept review cadence and app-index sync path as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Curation Cadence

- Date: 2026-06-03
- Recorded that Dan should decide the review cadence for AI-proposed Lease Renewal
  source updates.
- Kept the app-index sync path as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Continuous Source Sync

- Date: 2026-06-03
- Recorded that the app should automatically and continuously read from the
  team-editable source-of-truth folder rather than rely on manual import-on-demand.
- Kept the exact connector or indexing implementation as TBD pending client-owned setup
  validation.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Indexed Source Layer Direction

- Date: 2026-06-03
- Recorded the likely source-sync architecture: the PMI KC Drive source-of-truth folder
  should feed an indexed source layer automatically, rather than relying only on direct
  Drive reads.
- Ran a narrow official Google docs check. Current docs show Drive data federation is
  available but has Workspace/search limitations, while Cloud Storage supports indexed
  ingestion and periodic update options.
- Kept the exact connector/indexing path as a research/setup decision before runtime
  implementation.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal First Indexed-Source Candidate

- Date: 2026-06-03
- Recorded Cloud Storage plus Agent Search periodic ingestion as the first
  indexed-source candidate to test for Lease Renewal source folder updates.
- Kept Drive as the team-facing collaboration folder.
- Left the Drive-to-Cloud-Storage handoff or connector mechanism as a setup/research
  item.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Low-Cost Source Handoff

- Date: 2026-06-03
- Recorded the first Drive-to-Cloud-Storage handoff assumption: use the simplest
  low-cost automation that works for users, copying changes from the team-editable Drive
  source folder into Cloud Storage for indexing.
- Recorded the cost constraint explicitly: cloud costs are pass-through, so minimize
  ongoing services, polling frequency, indexed volume, duplicate stores, and unnecessary
  automation.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Sync Gate

- Date: 2026-06-03
- Recorded that the first copy automation should copy changes from the team-editable
  Drive source folder, rather than wait for Dan's AI-proposed-update review.
- Kept Dan's review as part of curation and continuous documentation improvement, not as
  the first sync gate.
- Recorded that the index/app should handle freshness after the copy.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source File-Type Rule

- Date: 2026-06-03
- Recorded that the first copy path should not restrict the Lease Renewal source folder
  to only Docs, text, or PDF files.
- Recorded that all useful source file types are eligible, subject to sensitivity rules
  and setup validation.
- If a useful file type cannot be indexed directly, the automation should convert,
  summarize, or skip it with a visible reason.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Folder Hygiene

- Date: 2026-06-03
- Recorded that non-sources-of-truth should be moved out of the Lease Renewal source
  folder instead of left for copy or indexing automation to skip.
- Kept the destination for non-source, reference, or archive material as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Non-Source Destination

- Date: 2026-06-03
- Confirmed the destination for non-source, reference, or archive material remains TBD.
- No folder name, owner, or retention rule has been defined yet.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Loosely Editable Process Definitions

- Date: 2026-06-04
- Recorded that the first workflow-management layer should be loosely editable for
  process definitions, including creating new processes and pointing those processes to
  new documentation as discovery matures.
- Kept the distinction between process configuration editability and external
  system-of-record writes. External write/update/send paths still need approved
  process-specific specs, permissions, tests, audit logging, and rollback/error handling.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Process Definition Configuration Batch

- Date: 2026-06-04
- Recorded that the whole team should be able to propose or edit process definitions,
  but those changes must go through approval before becoming active.
- Recorded that the KB should own the first central workflow-run record, with backlinks
  and action records pointing out to external systems. This keeps context in one
  non-technical place and allows separate processes to merge into larger workflows over
  time.
- Set the v1 minimum fields for a startable process definition: process name, short
  outcome, trigger or manual start condition, process owner/default approver,
  source/documentation links, required starting inputs, initial steps, action references
  with execution status, and success/stop/escalation condition.
- Recorded that process definitions may reference future external actions before those
  actions are connected or approved, but those references remain planned/non-executable
  until a future spec approves the integration.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Process Approval And Workflow State Batch

- Date: 2026-06-04
- Recorded that future product-definition question batches should include recommended
  default answers based on context so the client can answer yes or provide targeted
  edits.
- Recorded Dan and Josiah as the default Admin approvers for process-definition changes
  until they delegate approval authority.
- Recorded process definition statuses: `Draft`, `Testing`, `Pending Approval`,
  `Active`, `Needs Revision`, and `Retired`.
- Recorded that Draft or Testing process definitions can be started for clearly marked
  test runs, but Active definitions are required for real operational runs.
- Recorded that future automation steps should show as pending automation. The AI can
  explain how the automation is expected to work, but the action remains non-executable
  until an approved integration spec exists.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Process Testing And Versioning Batch

- Date: 2026-06-04
- Accepted the recommended testing and versioning defaults.
- Recorded that Draft and Testing workflow runs are simulation-only: no external writes,
  no sends, and no live system updates.
- Recorded that every approved process definition should create a versioned Active copy
  with history and rollback.
- Recorded that process activation requires source/documentation links and at least one
  successful test run unless Dan or Josiah explicitly override the gate.
- Recorded that pending future automation steps must show target system, expected action,
  missing permission or connection, and approval owner.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Workflow Run UX And Audit Batch

- Date: 2026-06-04
- Accepted the recommended workflow-run UX and audit defaults.
- Recorded that workflow runs should show a timeline of steps, decisions, approvals,
  comments, and system actions.
- Recorded that each run should show a top human-readable summary with current status,
  next action, blocker, owner, and due date if known.
- Recorded that test runs should be visually separate from real runs and excluded from
  production metrics unless an Admin explicitly includes them.
- Recorded that each AI-generated recommendation should keep source links, confidence,
  and reasoning visible to the reviewer.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Workflow Run Status And Notification Batch

- Date: 2026-06-04
- Accepted workflow run statuses: `Not Started`, `In Progress`, `Waiting on Team`,
  `Waiting on Outside`, `Blocked`, `Ready for Approval`, `Approved`, `Completed`,
  `Cancelled`, and `Failed`.
- Recorded that the workflow run owner should be the final approver, not necessarily the
  person who started the run.
- Recorded that due dates should use the source process due date when one exists;
  otherwise, they default to today.
- Recorded that workflow notifications should fire for `Ready for Approval`, `Blocked`,
  failed automation, and overdue due dates, including internal email notifications.
- Kept the boundary that workflow notification emails are internal and do not authorize
  owner-facing or tenant-facing sends.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Workflow Notification Recipients And Channels Batch

- Date: 2026-06-04
- Accepted the recommended workflow notification recipient and channel defaults.
- Recorded that default internal workflow notifications go to the owner/final approver
  and the person assigned the next action.
- Recorded that the workflow starter receives notifications only when their action is
  needed or when the run completes or fails.
- Recorded that notifications should appear in-app and by internal email at first, with
  other channels future/TBD.
- Recorded that notification email subjects should include product/process name, run
  status, property/context when available, and required action.
- Kept the boundary that these are internal workflow notifications and do not authorize
  owner-facing or tenant-facing sends.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Escalation And Failure Handling Batch

- Date: 2026-06-04
- Accepted the recommended escalation and failure-handling defaults.
- Recorded that a failed automation marks the run `Failed` only when the failure blocks
  the run; otherwise, the failed step is marked `Failed` and the run moves to `Blocked`.
- Recorded that failed internal notifications create an in-app alert and retry email
  once.
- Recorded that if the retry fails, escalation goes to Dan/Josiah Admins in-app and by
  email.
- Recorded that external action failures preserve attempted payload, error message,
  target system, timestamp, and retry status in the audit trail.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## External Action Approval Batch

- Date: 2026-06-04
- Accepted the recommended external-action approval defaults.
- Recorded that each external action type must be individually approved before it becomes
  executable.
- Recorded that approval is scoped by target system and action type, not blanket system
  access.
- Recorded that first executable external actions still require per-run human approval
  even after the action type is approved.
- Recorded that planned actions should remain visible while non-executable so the team
  can refine workflows before integrations are live.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## External Action Readiness Batch

- Date: 2026-06-04
- Accepted the recommended external-action readiness defaults.
- Recorded external action readiness states: `Planned`, `Needs Connection`,
  `Needs Permission`, `Ready for Test`, `Approved for Execution`, and `Disabled`.
- Recorded that before execution, the app should show a preview of exactly what will
  change, where it will change, and why.
- Recorded that every executable external action should have a rollback or correction
  note before approval.
- Recorded that Admins can disable any action type immediately without deleting the
  process definition.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal First Actions Batch

- Date: 2026-06-04
- Accepted read/gather actions before write actions as the first Lease Renewal planned
  action sequence.
- Recorded first planned reads: signed lease and lease dates, tenant/property facts,
  owner information, current rent/terms, and renewal timeline.
- Recorded first planned outputs: workflow summary, owner communication draft, internal
  update preview, and approval package.
- Recorded that write/update action design should still be AI-assisted during process
  editing and refinement, including suggestions to add/remove actions, missing-fact
  detection, and explanations of future write/update/send behavior.
- Recorded that deterministic checks should verify API connections are configured and
  healthy for each consumed app before an action can move toward execution.
- Recorded that first executable write/send actions wait until after the read/gather
  flow and approval package are tested.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Read Sources Batch

- Date: 2026-06-04
- Recorded signed lease or lease-term record as the first authoritative renewal trigger
  source, pending client system confirmation.
- Recorded that manual workflow start remains allowed.
- Recorded that imported property, tenant, owner, rent, and lease facts should show
  source, timestamp, and confidence before approval.
- Recorded that conflicting facts across systems block the run until a human chooses the
  correct source.
- Recorded that the app should keep a missing-facts list, let AI suggest where to find
  each missing fact, and include a link to add the missing resource or description
  through the right path, such as in-place process edit or the approved Drive/source
  folder.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Missing Facts And Source Updates Batch

- Date: 2026-06-04
- Accepted the recommended missing-facts/source-update defaults.
- Recorded that missing-fact links should offer two first actions: `Add process note`
  and `Add source document`.
- Recorded that `Add process note` creates a proposed process-definition or source
  update that requires approval before becoming active.
- Recorded that `Add source document` points to the approved Drive/source folder and
  relies on the approved source sync/indexing path.
- Recorded that once a missing fact is filled, the run should re-check only affected
  facts and steps instead of restarting the whole run.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Fact Confidence And Approval Batch

- Date: 2026-06-04
- Accepted the recommended imported-fact confidence and approval defaults.
- Recorded imported fact confidence levels: `Verified`, `Likely`, `Needs Review`, and
  `Conflict`.
- Recorded that only `Verified` facts can flow into owner-facing drafts without a visible
  warning.
- Recorded that `Likely` facts can be used in internal summaries, but must be reviewed
  before approval.
- Recorded that `Conflict` facts block owner-facing drafts and executable actions until
  resolved.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Conflict Resolution Batch

- Date: 2026-06-04
- Accepted the recommended conflict-resolution defaults.
- Recorded that conflict resolution requires a human to pick the winning source or enter
  a corrected value.
- Recorded that each resolution saves who resolved it, why, source chosen or corrected
  value, and timestamp.
- Recorded that a corrected value creates a proposed source or process update so the
  same conflict is less likely next time.
- Recorded that legal, financial, or notice-timing conflicts require Dan/Josiah Admin
  approval even if another user proposes the resolution.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Owner Communication Drafts Batch

- Date: 2026-06-04
- Recorded that facts must be both `Verified` and approved before they can flow into
  owner-facing drafts without a visible warning.
- Recorded that owner-facing drafts should always show traceable links, sources, and
  supporting facts so the process can be improved.
- Recorded that Dan can edit any generated or prepared document because he has Admin
  authority.
- Recorded that human send authority remains preserved: Dan approves and sends first,
  and later send automation can be layered only after testing and a future approved spec.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Package Batch

- Date: 2026-06-04
- Recorded that approval packages should include workflow summary, the relevant
  draft/output/action being automated, verified fact list, unresolved warnings, planned
  internal updates, pending automation notes, and send/update preview.
- Recorded that Dan approval covers the owner communication and facts used by it.
- Recorded that external writes can also be approved from the package when explicitly
  included as separate action approvals, but owner communication approval does not
  silently approve unrelated external writes.
- Recorded that internal update previews remain separately approvable by action through
  an obvious, low-friction approval queue designed for client and staff review.
- Recorded that approval package history preserves every revision Dan reviewed.
- Recorded correction-style rollback where APIs allow it: store the previous entry and
  re-enter that previous value through the API, rather than treating rollback as a
  universal true revert.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue UX Batch

- Date: 2026-06-04
- Recorded that approval queue items should be grouped by audience: Dan/Admin decisions,
  team follow-up, outside waiting, and failed/blocked automation.
- Recorded that each approval item should show plain-English action, risk level, source
  evidence, affected system, before/after preview, and required approver.
- Recorded queue actions: `Approve`, `Return for Revision`, `Assign`, `Snooze`,
  `Disable Action`, and `Open Run`.
- Recorded that all clarification, next steps, errors, and messaging should assume
  non-technical, new users who do not understand automation internals.
- Recorded that high-risk items use a simple confirm popup before approval, while
  low-risk internal updates can be one-click after review.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Risk Levels Batch

- Date: 2026-06-04
- Accepted the recommended approval queue risk defaults.
- Recorded risk levels: `Low`, `Medium`, `High`, and `Blocked`.
- Recorded `High` as owner/tenant-facing, legal/financial/timing impact, or external
  system write.
- Recorded `Medium` as internal process/state update or fact correction that affects a
  workflow but not an external system.
- Recorded `Low` as internal note, assignment, snooze, or non-executable process
  cleanup.
- Recorded `Blocked` as unable to proceed until a missing fact, conflict, connection,
  permission, or approver issue is resolved.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Filters And Views Batch

- Date: 2026-06-04
- Accepted the recommended approval queue filters and view defaults.
- Recorded that the default approval queue view should put `Ready for Approval`,
  `Blocked`, `Failed`, and overdue items first.
- Recorded queue filters: process, owner/final approver, assignee, risk level, status,
  due date, and audience group.
- Recorded that staff view should hide technical details by default and show what
  happened, why it matters, and what to do next.
- Recorded that Admin view should allow expansion into technical details, source
  evidence, API/connection status, and audit trail.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Item Lifecycle Batch

- Date: 2026-06-04
- Accepted the recommended approval queue item lifecycle defaults.
- Recorded that each approval queue item should have one current assignee and one
  required approver.
- Recorded that `Return for Revision` should require a plain-English reason and send the
  item back to the creator or last editor.
- Recorded that `Snooze` should require a date and reason, then automatically return the
  item to the active queue on that date or if risk/status changes.
- Recorded that `Disable Action` should be Admin-only, require a reason, and preserve the
  disabled action in history.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Creation And Cleanup Batch

- Date: 2026-06-04
- Accepted the recommended approval queue creation and cleanup defaults.
- Recorded that queue items should be created from approval packages,
  process-definition changes, failed/blocked automation, external-action readiness, and
  source/fact conflicts.
- Recorded that duplicate items for the same run/action should merge into one open item
  with history instead of creating multiple tasks.
- Recorded that if the underlying fact, draft, action, or preview changes, the queue
  item should refresh and preserve the prior version in history.
- Recorded that a queue item should close automatically when approved, completed,
  cancelled, disabled, or when the blocker is resolved and no approval remains.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Notifications And Reminders Batch

- Date: 2026-06-04
- Recorded that approval queue notifications should appear in the app console when an
  item is created, assigned, returned for revision, unsnoozed, blocked, unblocked,
  overdue, or closed.
- Recorded that these queue events should not all send email by default; email delivery
  can be configured separately.
- Recorded that queue notifications should go to the current assignee and required
  approver, while creators/editors are notified only when their action is needed or their
  item closes.
- Recorded that reminders should start as a single console notification, with no default
  24-hour follow-up or Admin escalation sequence unless configured later.
- Recorded that notifications should include the plain-English action needed, due date,
  risk level, affected process/run, and a direct link to the queue item.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Email Configuration Batch

- Date: 2026-06-04
- Accepted the recommended approval queue email-configuration defaults.
- Recorded that queue email delivery should be off by default and configurable by Admins
  per event type and recipient role.
- Recorded that email settings should show event type, enabled state, recipient roles,
  trigger condition, frequency/cooldown, subject preview, and last send/error status.
- Recorded that email should never replace console notifications; the app console
  remains the default source of truth.
- Recorded that email delivery failure should not block the queue item, but should create
  an Admin-visible health warning and audit entry.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Admin Health Batch

- Date: 2026-06-04
- Accepted the recommended approval queue Admin-health defaults.
- Recorded that Admin health should show queue email status, failed delivery count, last
  failure, disabled event types, stale overdue count, and blocked item count.
- Recorded health states: `Healthy`, `Needs Attention`, and `Action Required`.
- Recorded that `Action Required` means something is broken or blocking work, such as
  failed notification delivery, disconnected email config, or unresolved blocked
  high-risk items.
- Recorded that Admins should be able to open health details directly into affected queue
  items, email settings, or audit records.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Simple Audit And History Batch

- Date: 2026-06-04
- Accepted the audit/history direction with the simplicity caveat that the queue should
  avoid many options, toggles, or separate audit modes.
- Recorded the simpler alternative: one automatic append-only Activity log per queue
  item.
- Recorded that meaningful queue state changes capture actor, timestamp, action,
  previous state, new state, reason when supplied or required, and source trigger.
- Recorded that staff see plain-English Activity summaries only when action-relevant,
  while Admins can expand the same feed for full audit fields.
- Recorded that prior versions are preserved automatically for approval-critical facts,
  drafts, previews, notification settings, and disabled actions.
- Recorded that corrections create new entries instead of editing or deleting old ones,
  and low-level system entries can collapse by default to reduce clutter.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Simplicity Guardrails Batch

- Date: 2026-06-04
- Accepted the recommended simplicity guardrails.
- Recorded that Approval Queue v1 should avoid extra user-facing toggles, per-user
  customization, and complex settings unless they solve an observed workflow problem.
- Recorded that normal users should see only the core queue actions and one plain
  `Activity` view, while Admin-only details and settings live behind obvious Admin
  surfaces.
- Recorded that AI and automation should rely on a small fixed set of structured fields,
  not many optional UI settings.
- Recorded that any new setting requires an owner, plain-English default, disable path,
  and test coverage before it is added.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Fixed Fields Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue fixed-field defaults.
- Recorded v1 queue item fields: process/run, item type/source trigger, status, risk,
  audience group, assignee, required approver, due date, action needed, affected
  system/action, direct link, created timestamp, and updated timestamp.
- Recorded that evidence and details should attach through source links, previews, and
  the `Activity` log instead of extra toggles or custom fields.
- Recorded that AI-readable queue state should come from the fixed fields plus
  `Activity`, not user-specific settings.
- Recorded that v1 should not support custom queue fields; any new field must go through
  the new-setting guardrail.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue MVP Screen Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue MVP screen defaults.
- Recorded that v1 should use one main queue table/list plus a right-side or modal detail
  view, not multiple queue dashboards.
- Recorded that the list should show only status, risk, action needed, process/run,
  assignee, required approver, due date, and a direct link or open action.
- Recorded that the detail view should show summary, evidence links/previews, available
  actions, and `Activity`.
- Recorded that Admin-only health and settings should be reachable from a simple Admin
  area, not mixed into every normal queue item.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Mobile And Responsiveness Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue mobile and responsiveness defaults.
- Recorded that mobile v1 should use the same queue list and detail view, with rows or
  cards stacked for readability instead of a separate mobile workflow.
- Recorded that mobile list items should show only status, risk, action needed, due date,
  and open action; other fixed fields can appear in detail.
- Recorded that primary actions should remain visible in the detail view without
  requiring users to understand Admin settings.
- Recorded that desktop and mobile should use the same fixed fields and `Activity` source
  so AI and automation see one queue model.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Empty And Error States Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue empty and error state defaults.
- Recorded that an empty queue should say nothing is currently waiting for review and
  should not show fake/demo queue items.
- Recorded that loading and error states should use plain-English messages with one
  obvious retry or open action.
- Recorded that missing evidence, permissions, or connections should create or route to a
  `Blocked` queue item instead of appearing as a vague broken screen.
- Recorded that production queue views should never show demo/test items unless the run
  is clearly marked as a test/demo run.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Permissions And One-Pass Defaults

- Date: 2026-06-04
- Accepted the recommended Approval Queue permission defaults.
- Recorded that normal users can view assigned/relevant queue items, open details, take
  assigned actions, add comments/reasons, and return assigned items for revision.
- Recorded that Admins can view all queue items, approve high-risk items, disable
  actions, manage email settings, view health, and expand full Activity/audit details.
- Recorded that users cannot approve their own proposed process/source/fact change unless
  they are Admin and explicitly acting as approver.
- Recorded that permission errors should explain the missing role/action and route to a
  safe next step.
- Added inferred one-pass defaults: changed closed items create new linked items and
  direct queue links stay stable.
- Updated bulk-action default after user correction: v1 includes bulk approve, bulk
  disable, bulk execute, bulk assign, and bulk snooze for selected visible items, with
  per-item permission/risk/readiness enforcement and Activity records.
- Added inferred one-pass defaults for missing assignee/approver: route to `Blocked` and
  Admin triage instead of guessing.
- Added inferred one-pass AI defaults: AI can suggest assignee, approver, risk, status,
  and action-needed values from fixed fields/source evidence/Activity, but cannot
  approve, disable, close, execute, override permissions, or make suggestions effective
  outside the normal queue action path.
- Added inferred one-pass comment defaults: comments/reasons are Activity entries and do
  not directly mutate facts, drafts, process definitions, sources, or external actions.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Bulk Correction And Open Question Answers

- Date: 2026-06-04
- Corrected the prior inferred default: Approval Queue v1 should include bulk approve,
  bulk disable, bulk execute, bulk assign, and bulk snooze for selected visible items.
- Recorded bulk-action guardrails: respect each selected item's permissions, risk,
  required approver, and readiness; show a plain-English preview; require confirmation;
  skip or block ineligible items with a clear reason; and write per-item Activity.
- Recorded that bulk execute does not bypass external-action approval,
  owner/tenant-facing send authority, or high-risk confirmation.
- Recorded open-question answers: client systems remain TBD and will be scoped with the
  client; delegated approvers beyond Dan/Josiah remain TBD but should be easy to manage
  through an Admin console; Activity/audit retention and export should follow standard
  SaaS audit best practices unless client/legal policy overrides.
- Recorded configured queue email recipients as assigned and/or Admin-selected.
- Recorded unresolved important `Blocked` or overdue item escalation as portal
  notification and email notification for now.
- Recorded Maintenance and Move-Out tools, services, systems, triggers, and connections
  as TBD until scoped with the client.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Review Repair Pass

- Date: 2026-06-04
- Reviewed the recent Approval Queue documentation from a fresh-context/falsification
  stance for contradictions, stale defaults, and downstream alignment issues.
- Fixed approval-queue email wording so routine queue-event email remains off by default
  and Admin-configurable, while unresolved important `Blocked` or overdue escalation is
  explicitly the built-in portal-plus-email exception.
- Confirmed old no-bulk default wording was removed from the affected active docs and
  v1 bulk actions are now documented with selected-item guardrails.
- Confirmed remaining TBDs are client-scoped implementation questions rather than
  unresolved Approval Queue product-definition blockers.
- Confirmed the status entry for this repair pass is at the end of the status log and
  does not split an older validation section.
- Ran file-size and diff-size quality checks on the affected docs. No affected doc is
  unexpectedly oversized; `docs/status.md` is large because it is the running historical
  project log, and `docs/product-definition-gap-plan.md` remains an untracked new doc
  until intentionally added.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 133 tests, passed the router boundary check, and built the
  app.

## Autonomous Feature-Cycle Prompt Pack

- Date: 2026-06-05
- Added an outside-agent prompt pack for implementing the production autonomous
  feature-cycle scaffold.
- Defined the desired "let's plan the next feature run cycle" loop: context intake,
  decision-complete planning packet, batched planning questions, safe unattended local
  build, verification, commit queue, and one end-of-run user review point.
- Added explicit approval gates for cloud/API costs, key creation, deployment, live
  imports, Gmail access, client-environment changes, sends, and external system writes.
- Added supporting scaffold, runbook, and handoff-template docs in `docs/agent-runner/`.
- Routed active AI workflow and implementation docs to the new prompt pack without
  changing product scope or authorizing runtime/client-environment work.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Autonomous Production Runner Scaffold

- Date: 2026-06-05
- Promoted the autonomous feature-cycle prompt pack into active production routing with
  `docs/autonomous-agent-runner.md`.
- Added `CLAUDE.md` as a compatibility pointer to `AGENTS.md`; Git symlink support is
  disabled in this checkout, so the compatibility surface is a short redirect file
  instead of a tracked symlink.
- Added a durable packet template and `docs/temp/` policy for disposable planning
  packets, draft communications, and scratch meta-prompts.
- Updated active routing in `AGENTS.md`, `README.md`, `docs/ai-execution-workflow.md`,
  and `docs/implement.md` so future agents start from the durable runner rather than
  the seed prompt pack.
- Added a concrete client ask for production/staging secret ownership and a research
  item for non-secret environment handoff records.
- Extended `npm run verify:router-boundary` so the durable runner, packet template,
  temp-folder policy, `CLAUDE.md` pointer, and active routing cannot be dropped
  silently.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Autonomous Runner Review Repair Pass

- Date: 2026-06-05
- Reviewed the autonomous production runner scaffold from a fresh-context/falsification
  stance for stale routes, misplaced status entries, inaccurate validation claims,
  ignored temp artifacts, and downstream documentation drift.
- Fixed the misplaced `Autonomous Production Runner Scaffold` status entry so it now
  appears after the prompt-pack entry instead of splitting an older status entry.
- Aligned `CLAUDE.md` wording so it is consistently described as a short pointer rather
  than a duplicate rule file.
- Confirmed `docs/temp/README.md` is trackable while generated scratch packets under
  `docs/temp/` remain ignored.
- Confirmed active routing points to `docs/autonomous-agent-runner.md` and the prompt
  pack is marked as scaffold source material only.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- Quality-control check: `AGENTS.md` remains under 150 lines; the largest changed doc is
  `docs/status.md`, which is expected because it is the running historical log.

## Autonomous Runner Handoff Alignment

- Date: 2026-06-05
- Added `docs/environment-handoff.md` as the central non-secret registry for
  environment IDs, setup state, key/secret ownership, manual setup, verification
  evidence, and handoff readiness.
- Linked environment handoff guidance from `AGENTS.md`, `README.md`,
  `docs/implement.md`, and `docs/client-checklist.md`.
- Strengthened `docs/autonomous-agent-runner.md` with end-state-first planning,
  explicit planning-vs-implementation behavior, environment handoff updates, and commit
  queue expectations.
- Expanded the feature-cycle packet template with end-state, backward dependencies,
  environment/secret impact, manual setup, final user verification, and commit-queue
  fields.
- Expanded `CLAUDE.md` just enough to route Claude-style sessions to the same
  autonomous runner trigger without duplicating durable rules.
- Fixed active product-lane routing so Gmail Inbox 0 is consistently Dan-email-first,
  not owner-email-first.
- Extended `npm run verify:router-boundary` to guard the environment handoff doc,
  Claude route, Dan-email-first wording, and stronger runner sections.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue v1 Backend Data Foundation

- Date: 2026-06-05
- Product lane: PMI KC KB workflow-control layer.
- First code cycle after the recent documentation run. The Approval Queue v1 product
  definition was decision-complete in `docs/product-definition-gap-plan.md` and
  `docs/plan.md` but had no implementation; the live `/approval-queue` page still only
  reviews SOP/Template/Placeholder content. This cycle builds the backend data
  foundation. No UI, notifications, bulk actions, or workflow-run/process-definition
  machinery yet; those are deferred to later cycles.
- Added Approval Queue v1 record types and enums to `lib/firestore/types.ts`:
  `ApprovalQueueItemRecord`, `ApprovalQueueActivityRecord`, `QueueItemStatus`,
  `QueueRiskLevel`, `QueueAudienceGroup`, `QueueItemType`, `QueueActivityAction`, and the
  `QueueProcessRunRef` stub (runs/process definitions are not built yet, so a queue item
  references its run by `{ id, label }`).
- Added Zod input schemas to `lib/firestore/schemas.ts`:
  `CreateApprovalQueueItemInputSchema` and `TransitionApprovalQueueItemInputSchema`. Risk
  is classified deterministically by the repository from explicit signals, never passed
  in, so a caller cannot self-assign a lower risk level.
- Added the repository boundary `lib/firestore/approval-queue.ts`, mirroring
  `lib/firestore/editable.ts` (transactions, server timestamps, `uuidv7`, role gating via
  `can()`):
  - `classifyQueueRisk` (external write / owner-tenant-facing / legal-financial-timing →
    `High`; internal workflow update → `Medium`; note/assign/snooze/cleanup → `Low`;
    blocking issue or missing assignee/approver → `Blocked`).
  - `createApprovalQueueItem` with missing-assignee-or-approver → `Blocked`,
    duplicate-merge by `source_trigger_key` (refresh the open item with a prior-version
    snapshot instead of creating a second), and closed-item relink
    (`supersedes_item_id` / `superseded_by_item_id`) instead of reopening a closed item.
  - `transitionApprovalQueueItem` single guarded entry point for `approve`, `return`,
    `assign`, `snooze`, `disable`, `close`: high-risk approve requires the `approve`
    capability; disable is Admin-only; self-approval is blocked (a non-Admin cannot
    approve their own item, and only the required approver or an Admin can approve);
    return/snooze/disable require a reason; snooze requires a date; terminal items reject
    further transitions.
  - `listApprovalQueue` (default ordering: Ready for Approval, Blocked, Failed, then
    overdue first, then due date; fixed filters) and `listApprovalQueueActivity`
    (append-only feed). The list fetches and filters in memory, like `listTools`, so no
    new composite indexes are required and `firestore.indexes.json` is unchanged.
  - Every meaningful change appends an immutable Activity entry (actor, action, previous
    and new state, reason, source trigger, and a prior-version snapshot on refresh).
- Reused existing `can()` capabilities (`edit`, `read`, `approve`, `manageAdmin`); no new
  capability was added to `lib/auth/roles.ts`.
- Added `firestore.rules` match blocks for `approval_queue_items` and
  `approval_queue_activity`: read for editor-or-better, all client writes denied (writes
  flow through the Admin SDK boundary), Activity append-only.
- Inferred implementation detail flagged for confirmation: the concrete `QueueItemStatus`
  enum (`Ready for Approval`, `Blocked`, `Snoozed`, `Returned`, `Approved`, `Completed`,
  `Cancelled`, `Disabled`, `Failed`, `Closed`) is consistent with the locked lifecycle
  language in `docs/plan.md` but is not an explicit enum there. Adjust before the UI
  cycle builds on it if different names are preferred.

Validation status:

- `npm run format:check`: passed on 2026-06-05.
- `npm run lint`: passed on 2026-06-05.
- `npm run typecheck`: passed on 2026-06-05.
- `npm test`: passed on 2026-06-05 with 151 tests (18 new approval-queue-foundation
  unit tests).
- `npm run test:firestore`: passed on 2026-06-05 with 12 Firestore Security Rules tests
  (4 new). Fixed a test-isolation bug: the new emulator test uses a distinct `projectId`
  so vitest's parallel test files do not clear each other's seeded data on the shared
  emulator.
- `npm run verify:router-boundary`: passed on 2026-06-05.
- `bash scripts/verify.sh`: passed on 2026-06-05.

Open items:

- No UI surface yet; the queue model is backend-only. The next cycle builds the queue
  list/detail UI on top of this boundary.
- Notifications, email configuration, Admin health, and bulk actions remain deferred.
- Workflow-run and process-definition machinery is still a stub reference.

Next recommended task:

Build the Approval Queue v1 UI (list + detail view, empty/error states) on top of the
new repository boundary, then wire the existing demo `/approval-queue` page to the new
model.

## Approval Queue v1 UI Feature Cycle

- Date: 2026-06-05
- Product lane: PMI KC KB workflow-control layer.
- Replaced the old SOP/template/placeholder Approval Queue demo surface with a v1
  queue screen backed by `approval_queue_items` and `approval_queue_activity`.
- Added `/api/approval-queue` list and `/api/approval-queue/:itemId` detail/transition
  routes. Queue creation remains internal; no public POST route was added.
- Added fixed filters for process/run, status, risk, audience group, assignee, required
  approver, and due date.
- Added one list/detail screen with status/risk fields, action-needed summary,
  direct-link Open Run action, available single-item actions, and Activity history.
- Enforced queue visibility in the repository, API path, and Firestore rules: Admins can
  see all queue records; non-Admins see only items where they are assignee or required
  approver.
- Tightened queue transitions: Approve requires `Ready for Approval`; assignment is
  Admin-only for this cycle; Disable remains Admin-only; return/snooze still require
  plain-English reasons.
- Removed the silent fake queue fallback. If Firestore is unavailable, the page now
  shows a plain unavailable state. Demo/test queue rows are real seeded queue records
  with `Demo/Test` process labels.
- Extended safe demo reset data to seed real Approval Queue v1 items and Activity
  entries, and updated the live demo smoke script and demo walkthrough for the new
  queue behavior.

Validation status:

- `npm test -- approval-queue`: passed with 30 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 161 tests.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed; it reinstalled dependencies, checked formatting,
  linted, typechecked, ran 161 tests, passed the router boundary check, and built the
  app.
- Local browser check: `/approval-queue` rendered after local demo sign-in and showed
  the new filter shell plus the production-safe Firestore-unavailable state. Browser
  screenshot capture through the in-app browser plugin timed out twice; no queue action
  was clicked because that would write through the connected queue API if demo Firestore
  credentials were available.

Open items:

- Bulk actions, queue notifications, email configuration, Admin health, workflow-run
  runtime, and process-definition runtime remain deferred.
- Demo reset/live smoke against the demo Firebase project remains approval-gated because
  it writes demo Firestore records.
- A connected demo/prod environment should seed real queue records before user-facing
  queue action smoke testing.

Next recommended task:

Build the next Approval Queue v1 slice: either bulk-action support with per-item
guardrails or the Admin health/notification configuration surface, after choosing the
next scope.

## Approval Queue v1 UI Review Repair Pass

- Date: 2026-06-05
- Reviewed the new Approval Queue v1 UI/API/demo changes from a fresh-context
  falsification stance against the locked feature-cycle plan, active product docs,
  active KB spec, demo scripts, and queue tests.
- Fixed a client-side recovery bug: the queue page no longer stays permanently in the
  initial Firestore-unavailable state after a successful client retry.
- Fixed demo seed/reset schema drift: demo `approval_queue_items` and
  `approval_queue_activity` records no longer write generic `change_log` rows, and demo
  Activity reset records avoid `updated_at` to stay closer to the append-only Activity
  model.
- Updated the one-time demo seed command to honor the same queue metadata flags as the
  reset command.
- Aligned `docs/spec.md`, `docs/demo-show-and-tell.md`, and `scripts/demo-operator.mjs`
  with the v1 queue model instead of the retired SOP/template/placeholder fallback
  queue.
- Added unit coverage for the queue demo seed/reset metadata.
- Quality-control check: no stale references to the deleted `ApprovalQueueDemo` or
  local demo queue fallback remain. The largest touched code file is the self-contained
  queue UI component; it is sizeable but isolated. `docs/status.md` remains the largest
  file because it is the running historical log.

Validation status:

- `npm test -- approval-queue live-cost-scripts`: passed with 55 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm test`: passed with 162 tests.
- `npm run verify:router-boundary`: passed.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed after retry. The first attempt hit a Windows `EPERM`
  unlink on Next's SWC binary while a local dev-server/browser-inspection process was
  still being released; the retry completed dependency install, format, lint,
  typecheck, unit tests, router-boundary verification, and production build.

Remaining risk:

- Component-level React coverage now exists for critical bulk queue flows as of the
  later risk-reduction pass, but broader queue component coverage is still intentionally
  limited.

## Approval Queue Bulk Actions Feature Cycle

- Date: 2026-06-05
- Product lane: PMI KC KB workflow-control layer.
- Added production-ready local bulk actions for Approval Queue v1 without authorizing
  cloud setup, Gmail access, deploys, live imports, keys, client-environment writes, or
  external-system writes.
- Added `POST /api/approval-queue/bulk` plus bulk input validation for action,
  selected item IDs, reasons, snooze dates, assignment fields, and explicit High-risk
  confirmation.
- Added repository-level bulk transition handling with per-item `updated`, `skipped`,
  or `failed` results and summary counts. Visible ineligible items receive a small
  `skipped` Activity entry; hidden or unauthorized item IDs return a generic skipped
  result without leaking item details or writing Activity.
- Tightened single-item and bulk High-risk approval so the server requires
  `confirm_high_risk: true`; the browser sends that flag only after the user accepts
  the confirmation prompt.
- Implemented bulk `execute` as a guarded skip until approved executable
  external-action runtime exists. Current bulk execute results clearly state that no
  external write was attempted.
- Updated `/approval-queue` with select-visible, row checkboxes, bulk action controls,
  action-specific fields, preview counts, High-risk preview text, and per-item bulk
  results while preserving the one-list/detail screen model.
- Updated the client production cutover runbook so "cutover to the main app" means the
  gated production path: local readiness, production preflight, explicit deploy/client
  approval, role assignment, and post-deploy smoke. Production bulk smoke must use real
  or explicitly approved test queue items, not demo queue seeding.
- Added a scratch feature-cycle packet at
  `docs/temp/approval-queue-bulk-actions-cycle.md`; it remains an ignored disposable
  planning artifact per the `docs/temp/` policy.

Validation status:

- `npm test -- approval-queue`: passed with 41 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 173 tests.
- `npm run verify:router-boundary`: passed.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 173 tests, passed the router-boundary check, and built the
  app including `POST /api/approval-queue/bulk`.
- Local browser smoke: passed against a temporary local Firestore emulator seeded with
  demo queue records. Verified `/approval-queue` rendered, bulk selection worked, the
  50-item request-limit copy was visible, guarded execute copy was visible, and the
  mobile viewport had no horizontal overflow. The in-app browser could not reach the
  local server from its environment, so the smoke used a local headless browser.
- Local browser check: passed against a local Firestore emulator with temporary queue
  records. Verified `/approval-queue` rendered the bulk panel and queue rows, select
  visible selected three items, the preview showed two ready/one skipped plus one
  High-risk confirmation note, `Execute` showed the guarded v1 copy, and bulk execute
  returned `0 updated, 3 skipped, 0 failed` with "No external write was attempted."
- Browser screenshot capture timed out once after the successful execute check, so the
  final browser evidence is DOM/text verification rather than an attached screenshot.

Remaining risk:

- Component-level React coverage now exists for the critical bulk queue flows. Broader
  queue component coverage remains intentionally limited to keep this pass focused.
- Bulk execute is intentionally non-executable until workflow-run and external-action
  runtime records are built behind a future approved spec.

## Approval Queue Bulk Actions Review Repair Pass

- Date: 2026-06-05
- Reviewed the bulk-actions implementation from a fresh-context falsification stance
  against the feature-cycle plan, active product/cutover docs, route/API tests,
  repository tests, client queue screen, and smoke-script call paths.
- Fixed a UI/server contract gap: the browser now caps bulk selection and submit at
  the 50 visible-item request limit that the server schema already enforces.
- Fixed downstream documentation drift: active planning docs now include bulk return
  alongside approve, disable, execute, assign, and snooze; the production smoke
  checklist no longer uses the stale "resolve queue items" wording.
- Confirmed no script or app path directly calls High-risk single-item approve without
  the explicit confirmation flag; direct approve calls found during review are tests or
  the updated queue UI path.

Validation status:

- `npm test -- approval-queue`: passed with 41 focused queue tests.
- `npm run format:check`: passed after formatting the touched queue component.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `npm test`: passed with 173 tests.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 173 tests, passed the router-boundary check, and built the
  app including `POST /api/approval-queue/bulk`.

## Approval Queue UI Risk Reduction Pass

- Date: 2026-06-05
- Reduced the remaining queue UI risk by splitting the oversized
  `ApprovalQueue.tsx` screen into a state/API shell, focused filter/bulk/list/detail
  panels, and a small queue model/helper module.
- Added a React DOM test harness for the Approval Queue bulk UI with jsdom and Testing
  Library. New tests cover the 50-item select-visible cap, guarded execute copy,
  High-risk bulk confirmation payloads, and cancelled High-risk confirmation.
- Quality-control check: no approval UI source file is now over 522 lines; the prior
  monolithic queue component was 1170 lines.

Validation status:

- `npm test -- approval-queue`: passed with 44 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 176 tests.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 176 tests, passed the router-boundary check, and built the
  app including `POST /api/approval-queue/bulk`.
- Local browser smoke: passed after the refactor against a temporary local Firestore
  emulator seeded with demo queue records. Verified `/approval-queue` rendered, bulk
  selection worked, the 50-item request-limit copy was visible, guarded execute copy
  was visible, and the mobile viewport had no horizontal overflow.

## Approval Queue Notifications And Admin Health Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the next local Approval Queue v1 slice for console notifications, Admin email
  settings, and notification health without authorizing Gmail sends, cloud setup,
  deploys, imports, keys, client-environment writes, or external-system writes.
- Added typed queue notification, email-setting, and health records:
  `ApprovalQueueNotificationRecord`, `ApprovalQueueEmailSettingRecord`, and
  `ApprovalQueueNotificationHealth`, plus schemas for queue notification events,
  email-setting event types, recipient roles, and Admin setting updates.
- Added `lib/firestore/approval-queue-notifications.ts` as the server-side boundary for:
  - creating in-app notification records when queue Activity creates product-relevant
    events (`created`, `assigned`, `returned_for_revision`, `blocked`, `unblocked`, and
    `closed`);
  - listing recipient-visible console notifications;
  - reading default email settings where routine email is off and blocked/overdue
    escalation is the built-in email exception;
  - Admin-only email-setting updates;
  - Admin health classification using `Healthy`, `Needs Attention`, and
    `Action Required`.
- Wired queue create/transition/bulk transition Activity writes to create console
  notification records in the same Firestore transaction. Skipped/refreshed/snoozed
  Activity remains non-notifying for now; scheduled overdue/unsnoozed execution remains
  future work.
- Added API routes:
  - `GET /api/approval-queue/notifications`
  - `GET /api/approval-queue/health`
  - `GET /api/approval-queue/email-settings`
  - `PATCH /api/approval-queue/email-settings/:settingId`
- Added an Admin page Approval Queue Health and Queue Email Settings panel. The panel
  shows health summary, setup fallback copy, default settings, event trigger text,
  subject previews, no-repeat cooldowns, and Admin controls for email enablement and
  recipient roles. Console notifications remain the source of truth regardless of email
  settings.
- Extended Firestore rules so `approval_queue_notifications` are readable only by the
  notification recipient or Admin, `approval_queue_email_settings` are Admin-readable
  only, and both collections deny direct client writes.
- No Gmail send path was added for v1 queue notifications in this cycle. Existing legacy
  editable-content Gmail notifications are unchanged.

Validation status:

- `npm test -- approval-queue-notifications-v1 approval-queue-notification-routes`:
  passed with 13 focused tests.
- `npm test -- approval-queue`: passed with 57 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 189 tests.
- `npm run test:firestore`: passed with 17 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 189 tests, passed the router-boundary check, and built the app
  including the new Approval Queue notification/settings/health API routes.
- Local browser check: passed on `/admin` after local demo sign-in. Verified the
  Approval Queue Health panel, Queue Email Settings panel, blocked/overdue escalation
  default, fallback health copy when Firestore health is unavailable, and no horizontal
  overflow at a 390px mobile viewport.

Open items:

- The app now stores console notification records, but there is not yet a user-facing
  notification inbox/badge or read/unread interaction outside the Admin settings panel.
- Email delivery/retry/escalation execution for queue notifications remains unbuilt and
  must stay gated until sender, recipient, Gmail setup, and production environment
  ownership are approved.
- Scheduled overdue and unsnoozed notification generation remains future workflow-run or
  job-runner work.

Next recommended task:

Surface Approval Queue console notifications in the app shell or queue screen, with a
small read/unread interaction, before adding any email-delivery worker.

## Approval Queue Header Notifications Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Implemented the recommended next iteration from the prior plan: a global app-shell
  notification dropdown for the current user's unread Approval Queue console
  notifications, with mark-on-open behavior.
- Added current-user-only notification listing for the header while preserving Admin's
  broader server-side ability to inspect notification records when explicitly requested.
- Added `PATCH /api/approval-queue/notifications/:notificationId` with the narrow
  `mark_read` action. Only the notification recipient can mark that notification read.
- Updated `/approval-queue` so notification links can land on a specific queue item with
  `?item_id=<queueItemId>` and preselect that item in the detail panel.
- Added `NotificationMenu` to the app shell. It fetches up to five unread current-user
  notifications, shows a compact badge, opens a dropdown with plain-English notification
  details, marks a notification read before navigating to the queue item, and degrades to
  a clear unavailable message when local Firestore is not connected.
- No email-delivery worker, Gmail send, cloud setup, deploy, import, key creation,
  client-environment change, or external-system write was added.

Validation status:

- `npm test -- approval-queue-notifications-v1 approval-queue-notification-routes
notification-menu-component approval-queue-component`: passed with 23 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 196 tests.
- `npm run test:firestore`: passed with 17 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed on retry. The first attempt hit a Windows `EPERM`
  unlink on Next's SWC binary while the local dev/browser smoke process was still
  releasing the file; the retry reinstalled dependencies, checked formatting, linted,
  typechecked, ran 196 tests, passed router-boundary verification, and built the app
  including `PATCH /api/approval-queue/notifications/:notificationId`.
- Local browser check: passed on `/ask` after local demo sign-in. Verified the
  Notifications button renders in the header, the dropdown opens, the unavailable state
  is readable when Firestore notifications are unavailable locally, the Open Approval
  Queue link remains present, and the mobile viewport has no horizontal overflow.

Open items:

- Live unread notification rendering should be smoke-tested against connected demo or
  staging Firestore records when credentials are available.
- Scheduled overdue and unsnoozed notification generation remains future workflow-run or
  job-runner work.
- Queue notification email delivery/retry/escalation remains gated on approved sender,
  recipients, Gmail setup, and production environment ownership.

Next recommended task:

Build the scheduled overdue/unsnoozed queue notification generator as a dry-run-capable
local job, still without sending email.

## Approval Queue Scheduled Notifications Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the scheduled Approval Queue console-notification generator as a local
  dry-run-first job.
- Added a server-only scheduler boundary for:
  - due snoozed items where `snooze_until <= referenceDate`;
  - active overdue items where `due_date < referenceDate`;
  - deterministic notification IDs keyed by event, item, recipient, and the trigger
    date.
- Unsnoozed items move to `Ready for Approval` unless their risk is `Blocked` or
  required ownership is missing, in which case they move to `Blocked`. The write path
  clears `snooze_until`, appends one `unsnoozed` Activity entry, and creates recipient
  console notifications.
- Overdue generation creates console notifications only. It does not change queue
  status and does not write Activity. Overdue notifications dedupe by due date so the
  job does not create a repeating daily reminder by default.
- Added `npm run queue:notifications` using a dev-only `tsx` runner. The command
  defaults to dry-run and requires `--write` before any Firestore write. It supports
  `--date=YYYY-MM-DD` and `--json`.
- Added focused unit coverage for dry-run immutability, unsnooze writes, Activity
  creation, idempotency, overdue filtering, no-recipient skips, blocked routing, CLI
  parsing, and safe text output.
- No Gmail send, Gmail read/modify, Cloud Scheduler setup, deploy, import, key
  creation, client-environment write, or external-system write was added or run.

Validation status:

- `npm test -- approval-queue-scheduled-notifications`: passed with 9 focused tests.
- `npm run queue:notifications -- --help`: passed.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 205 tests.
- `npm run test:firestore`: passed with 17 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed on retry. The first attempt hit the known Windows
  `EPERM` unlink on Next's SWC binary during dependency reinstall, before checks ran.
  The retry reinstalled dependencies, checked formatting, linted, typechecked, ran 205
  tests, passed router-boundary verification, and built the app.

Open items:

- `--write` has not been run against connected demo, staging, or production Firestore;
  that still requires explicit approval for the exact target environment.
- Cloud Scheduler or any recurring hosted execution remains unbuilt and gated.
- Queue notification email delivery, retry, and escalation execution remains gated on
  approved sender, recipients, Gmail setup, and production environment ownership.

Next recommended task:

After the target Firestore environment is approved, run
`npm run queue:notifications -- --dry-run --date=<YYYY-MM-DD> --json` against that
environment and review the planned item IDs before any approved `--write` run.

## Client Unblock Communications Sent

- Date: 2026-06-06
- Product lanes: PMI KC KB, Lease Renewal Agent, and Gmail Inbox 0.
- Two outbound communications are now the active client-side unblock thread. The tone is
  pragmatic and lightweight: the demo app is working, the next step is migration and
  process discovery, budget should stay tightly controlled, and Dan/team are being
  asked for concrete access/process answers instead of broad technical work.
- Communication 1 asked Dan for:
  - a card on file in Google Cloud billing, with a stated $10 budget guardrail and no
    spend without approval;
  - one full Lease Renewal walkthrough, preferably Wednesday, June 17, 2026, 9:30-10:15
    AM, with fallback windows Wednesday morning, Thursday, June 18, 2026, 11:00 AM-4:00
    PM, or before 9:00 AM either day.
- Communication 2 told Dan a simple tool access spreadsheet would be added to Google
  Drive and asked for each tool's access type, location, and notes. Starting tools:
  RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Sheets including which sheets,
  and any missing tools.
- Communication 2 also sent default assumptions for Dan to correct:
  - approval emails can come from `kb-automation@pmikcmetro.com`;
  - launch approval is Dan and Josiah only for now;
  - the Gmail helper starts with a few safe test threads before anything touches the
    live inbox;
  - signed leases and lease end dates still need a source location answer.
- The stated target is a working Lease Renewal process prototype by July 3, 2026,
  provided the needed access and walkthrough answers arrive.

Current blockers awaiting Dan/team reply:

- Google Cloud billing card and any explicit approval for cost-bearing migration steps.
- Lease Renewal walkthrough and source notes.
- Tool access spreadsheet for RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google
  Sheets, and any missing systems.
- Signed lease / lease-end-date source location.
- Gmail Inbox 0 safe test-thread protocol confirmation.
- Approval sender and launch approver defaults, unless Dan confirms or corrects them.

Work that can continue while waiting:

- Keep the KB demo/runtime verification path green.
- Continue local Approval Queue, workflow-control, process-definition, Admin health,
  dry-run, and preflight improvements that do not touch client resources.
- Continue Lease Renewal discovery/modeling: workflow-run shape, process-definition
  model, acceptance scenarios, read/gather fact model, and non-executable fixtures.
- Continue Gmail Inbox 0 planning, legacy artifact mining, safe-thread scenario design,
  label/rule/prompt modeling, and management-page planning without live Gmail access.
- Prepare tool-access templates and integration capability classification locally.

Stop conditions remain:

- No Google Cloud billing/cost action, production setup, deploy, live source import,
  Gmail read/modify/draft/send, API-key use, client Drive write, or
  RentVine/LeadSimple/DotLoop/QuickBooks/Boom/Sheets write until the user says the
  relevant Dan/team reply has unblocked that exact action.

Docs updated for future agents:

- `docs/client-checklist.md`: current outbound asks and verification after unblock.
- `docs/research-backlog.md`: asked/awaiting-reply statuses.
- `docs/environment-handoff.md`: non-secret setup gates.
- `docs/implement.md` and `docs/ai-execution-workflow.md`: safe local parallel work
  while waiting on client replies.
- `AGENTS.md`: route-table pointer for client unblock state.

## Workflow Foundation Dev Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the first local workflow-control foundation for editable process definitions
  and simulation-only workflow runs.
- Added server-side Firestore records for process definitions, immutable active
  versions, workflow runs, and append-only workflow-run timeline entries.
- Added process-definition APIs for list/create/read/update, Approval Queue-backed
  submission, Admin activation, and simulation test-run start.
- Added workflow-run APIs for detail, timeline, and simulation test-run completion or
  failure.
- Added `/processes`, `/processes/[definitionId]`, and `/workflow-runs/[runId]` UI
  surfaces. The UI uses UID fields for owner/approver entry for now, creates no seeded
  demo workflow records, and exposes no execute/send/external-write controls.
- Process-definition submission creates or refreshes one `ProcessDefinitionChange`
  Approval Queue item. Admin activation requires source links and an approved queue
  item; a successful simulation test run is required unless an Admin supplies an
  override reason.
- Test runs created by this cycle are always `is_test_run: true`, `simulation_only:
true`, and excluded from production metrics by default.
- Firestore rules allow signed-in app users to read workflow records but deny direct
  client writes to workflow collections.
- No Lease Renewal runtime integration, Gmail access, email delivery worker, Cloud
  Scheduler setup, deploy, import, key creation, client-environment change, client Drive
  write, live client data handling, or external-system write was added or run.

Validation status:

- `npm test -- workflow`: passed with 17 focused workflow tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 222 tests.
- `npm run test:firestore`: passed with 20 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed on retry. The first attempt stopped at
  `docs/status.md` formatting after dependency install; the retry reinstalled
  dependencies, checked formatting, linted, typechecked, ran 222 tests, passed
  router-boundary verification, and built the app including the new process/workflow
  routes.
- Local browser smoke: passed on `/processes` after starting the dev server. Verified
  the process-definition list/create panels render, the production-safe empty/unavailable
  local Firestore state is visible, there are no browser console errors, and the desktop
  viewport has no horizontal overflow.

Open items:

- The workflow UI intentionally uses UID entry fields; human-friendly user pickers remain
  a future Admin/user-management improvement.
- Real operational workflow runs, executable external actions, Lease Renewal runtime
  fact gathering, production metrics, and workflow notification/email behavior remain
  future gated work.
- Client production setup, live source imports, Gmail setup, and system-of-record
  integrations remain blocked on the active Dan/team asks.

Next recommended task:

Build the next local workflow-control slice: process-definition approval return/revision
handling and a simple read-only process/run index for recent simulation runs, still
without external writes or client-resource access.

## Workflow Return/Revision Dev Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the next local workflow-control slice for process-definition return/revision
  handling and recent simulation-run visibility.
- Added workflow-specific Approval Queue sync outside the generic queue repository.
  Returning a `ProcessDefinitionChange` queue item now moves the linked process
  definition to `Needs Revision`, keeps the pending queue backlink, and leaves Admin
  activation as a separate gated action.
- Updated returned-item resubmission behavior so the same nonterminal returned queue
  item refreshes back to `Ready for Approval` when ownership is complete, or `Blocked`
  when ownership is missing. Approved/closed queue items still create successor items
  instead of being reopened.
- Extended workflow-run listing with local options for `definitionId`, `simulationOnly`,
  and `limit`.
- Added a read-only Recent Simulation Runs panel to `/processes`, showing simulation
  test runs with status, due date, owner, direct run link, and explicit non-production
  marking.
- No cloud setup, Gmail access, deploy, client-resource change, client data handling,
  external send, or system-of-record write was added or run.

Validation status:

- `npm test -- workflow approval-queue`: passed with 95 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 229 tests.
- `npm run test:firestore`: passed with 20 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `git diff --check`: passed.
- `npm run build`: passed.
- `bash scripts/verify.sh`: passed on final retry. Two earlier attempts hit the known
  Windows `EPERM` unlink on Next's SWC binary during dependency reinstall; dependencies
  were restored with `npm install` before retrying.
- Local browser smoke: passed against a temporary local Firestore emulator seeded with
  one returned process definition and one simulation run. Verified `/processes` shows
  the Recent Simulation Runs panel, the returned detail page shows `Needs Revision`,
  the Approval Queue backlink, Save/Submit controls, and recent test run, and the
  mobile 390px viewport has no horizontal overflow. Browser screenshot capture timed
  out in the in-app browser runtime, so the smoke used DOM and console checks.

Open items:

- Screenshot capture through the in-app browser timed out during this smoke run, though
  DOM, console, and overflow checks passed.
- Real operational workflow runs, executable external actions, workflow-run
  notifications, production metrics, and Lease Renewal runtime fact gathering remain
  future gated work.
- Client production setup, live source imports, Gmail setup, and system-of-record
  integrations remain blocked on the active Dan/team asks.

Next recommended task:

Build the next local workflow-control slice: add a small process-definition Activity or
revision-history view that surfaces linked Approval Queue return reasons on the process
detail page, still without external writes or client-resource access.

## Migration-Readiness Stop Guardrail Context Update

- Date: 2026-06-06
- Product lanes: PMI KC KB, Lease Renewal Agent, and Gmail Inbox 0.
- Added a local-development exhaustion gate to the active agent loop. Future feature
  cycles must now prove that the proposed local work improves production readiness,
  migration/cutover prep, verification quality, handoff, or a known quality issue.
- Clarified that safe local work is still encouraged when it is readiness work:
  regression fixes, docs/status/client asks, source manifest templates, preflight and
  dry-run checks, cutover runbooks, acceptance scenarios, tests, and environment
  handoff evidence.
- Clarified the stop point: once local verification is green, cutover/preflight inputs
  are prepared or blocked only on client-owned values, and the remaining work is client
  migration, approved production setup, source approval, or real product decisions,
  future agents should stop adding speculative local product surface.
- Deferred local feature loops now include workflow-control slices, Approval Queue
  expansion, Lease Renewal runtime, Gmail runtime, and demo-only complexity unless the
  active docs show a direct cutover, acceptance, or quality reason.
- Added the guardrail across the active routing, runner, packet template, implementation
  runbook, AI workflow, phase plan, KB product lane, environment handoff, client
  checklist, research backlog, cross-product cutover plan, client production cutover
  runbook, engineering checklist, and product-lane README.
- No cloud setup, Gmail access, deploy, client-resource change, client data handling,
  external send, live import, or system-of-record write was added or run.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm test -- workflow approval-queue`: passed with 95 focused tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 229 tests.
- `npm run test:firestore`: passed with 20 Firestore Security Rules tests.
- `bash scripts/verify.sh`: passed, including production build.

Next recommended task:

Before starting another local workflow-control or Approval Queue slice, run the
migration-readiness stop gate. If the only remaining blockers are Dan/team replies,
client-owned production setup, approved sources, or migration/cutover approval, stop
local feature expansion and prepare the client unblock/cutover handoff instead.

## Autonomous Loop Hardening And Loop-State Capture

- Date: 2026-06-08
- Product lanes: PMI KC KB (workflow/runner governance); cross-product loop process.
- Reworked the unattended feature loop from a single-slice runner into a multi-slice loop
  with a first-class verification-and-falsification phase, explicit stop-and-reset
  conditions, and durable single-read resume state.
- `docs/autonomous-agent-runner.md`: replaced the thin Verification section with a
  Verification And Falsification phase (plain-English explanation, verify-then-falsify,
  explicit risk list, repair, doc alignment); added a Multi-Slice Continuation Loop, a
  Stop And Reset Conditions section (approval gate, migration readiness, quality
  degrading, uncertainty too high, context reset, no safe slice), and a Loop State
  Capture section; made the context-intake order canonical with `docs/loop-state.md`
  first; and clarified the plan-vs-run trigger to remove re-prompting.
- Added `docs/loop-state.md` as the always-current single-read resume artifact, seeded
  with the real current state (migration-ready but client-blocked, active lane, next safe
  slice candidates, blockers, stop-condition state). Added a Current Loop State pointer to
  the top of this status log and registered the file in `npm run verify:router-boundary`.
- Added `scripts/check-falsification-preflight.mjs` and `npm run verify:falsification`: a
  git-aware, read-only preflight that scans only committable files (tracked plus
  untracked-not-ignored, respecting `.gitignore`) for secret patterns, oversized files,
  invalid JSON, and broken internal doc links, with an informational large-diff warning.
  Chained it into `scripts/verify.sh` and added
  `tests/unit/falsification-preflight.test.mjs`.
- Extended `docs/autonomous-feature-cycle-packet-template.md` with a falsification
  checklist, slice-continuation decision, stop-and-reset check, next-slice candidate, and
  loop-state snapshot fields.
- Reconciled the divergent context-intake orders and the plan-vs-run trigger across
  `docs/implement.md`, `docs/ai-execution-workflow.md`, and `CLAUDE.md`, and relabeled
  `docs/agent-runner/README.md` as a historical scaffold rather than active guidance.
- Updated `AGENTS.md` route table, project map, commands, and documentation rules for the
  loop-state artifact and the falsification preflight; `AGENTS.md` remains under 150
  lines.
- Security: the newly added `docs/client_docs/` tool-access spreadsheet contained live
  RentVine API credentials in a notes cell and was untracked but not ignored. Added
  `docs/client_docs/` to `.gitignore` so client spreadsheets, ledgers, invoices, and any
  secrets stay local and cannot be committed. No secret values were committed.

Validation status:

- `npm run format:check`: passed on 2026-06-08.
- `npm run lint`: passed on 2026-06-08.
- `npm run typecheck`: passed on 2026-06-08.
- `npm test`: passed on 2026-06-08 with 243 tests.
- `npm run verify:router-boundary`: passed on 2026-06-08 (now also requires
  `docs/loop-state.md`).
- `npm run verify:falsification`: passed on 2026-06-08 across 246 committable files.
- `npm run build`: passed on 2026-06-08.
- `git diff --check`: passed on 2026-06-08.
- `bash scripts/verify.sh` and `npm run test:firestore` were not re-run this pass; every
  step verify.sh chains except `npm ci` was run individually, and no Firestore rules or
  persistence behavior changed.

Security follow-up for the client:

- Rotate the RentVine API key and secret that were shared in the tool-access spreadsheet,
  and keep tool-access answers as non-secret references only.

Next recommended task:

Honor the migration-readiness stop gate recorded in `docs/loop-state.md`: the remaining
blockers are client-owned, so prepare the client unblock / cutover handoff or reconcile
the newly arrived tool-access answers (non-secret references only) rather than expanding
local product surface. Run `npm run verify:falsification` as part of verification on the
next cycle.

## Integration Architecture Ratified And Action Registry Foundation

- Date: 2026-06-08
- Trigger: verified deep-research review of the tool stack (Rentvine, LeadSimple, Dotloop,
  QuickBooks, Boom, Google Sheets). The research did not contradict governance; it added
  decision-grade specificity that the docs lacked.
- Preserved the verified findings and sources in
  `docs/research/integration-capability-2026-06.md` (durable, out of `docs/temp/`).
- Added `docs/integration-architecture.md`: tool-role map, event model, build order,
  lease-renewal and maintenance process chains, the Action Registry model, the
  vendor-confirmation matrix, and the source-normalization requirement.
- Encoded downstream effects across governance and pipeline docs: `docs/north-star.md`,
  `docs/products/README.md`, `docs/products/pmi-kc-kb.md`,
  `docs/products/lease-renewal-agent.md`, `docs/plan.md`, `docs/engineering.md`,
  `docs/engineering-checklist.md`, `AGENTS.md`, `docs/integration-cutover-plan.md`,
  `docs/environment-handoff.md`, `docs/ai-execution-workflow.md`, `docs/implement.md`,
  `docs/autonomous-agent-runner.md`, and `docs/research-backlog.md`.
- Key decisions recorded: Maintenance Work Order Intake is the first executable-write
  target; the Rentvine lease-renewal writeback is undocumented and stays gated;
  Google Sheets is an exception/control surface, not a primary source of truth.
- Built the metadata-only Action Registry foundation: `ACTION_TARGET_SYSTEMS`,
  `ACTION_EVENT_MODES`, and `ACTION_EVIDENCE_STATUSES` constants; `ActionRegistryRecord`
  type and Zod schema with a `production_allowed` governance refine; read-only repository
  `lib/firestore/action-registry.ts`; typed seed catalog; `scripts/seed-action-registry.ts`
  with `npm run seed:action-registry`; server-write-only `action_registry` Firestore rule;
  and unit, repository, and rules tests. Every seeded entry is `production_allowed: false`,
  so the no-system-of-record-writes boundary is unchanged.

Next recommended task:

Continue honoring the migration-readiness stop gate: the integration architecture is now
ratified in docs and the Action Registry catalog exists as metadata only. Remaining
external-integration progress is client- and vendor-confirmation-blocked (tool-access
spreadsheet completion, QuickBooks access, Rentvine renewal-write confirmation, RentVine
key rotation). Prefer client unblock / cutover handoff over new local product surface.

## Client Unblock / Tool-Access Reconciliation

- Date: 2026-06-09
- Product lanes: PMI KC KB cutover, Lease Renewal Agent discovery, Gmail Inbox 0
  governance.
- Reconciled the ignored returned tool-access spreadsheet into tracked non-secret docs.
  `docs/client-checklist.md`, `docs/research-backlog.md`, and
  `docs/environment-handoff.md` now mark tool access as partially received.
- Non-secret access status recorded: RentVine has both access/API location; LeadSimple,
  DotLoop, Boom, and Google Sheets have admin/location answers; QuickBooks is blank;
  Google Sheets exact in-scope sheets still need confirmation.
- Added RentVine credential rotation as an explicit client ask because a credential was
  present in ignored spreadsheet notes. No credential value was copied into tracked docs.
- Created an ignored local follow-up draft at
  `docs/temp/2026-06-09-tool-access-follow-up.md`; it was not sent.
- No code/runtime behavior, cloud setup, billing action, Gmail access, credential use,
  client Drive write, deploy, source import, email send, or external-system write was
  performed.

Validation status:

- `npm run format:check`: passed after Prettier normalized the edited Markdown tables.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm run verify:falsification`: passed across 254 committable files.

Remaining blockers:

- Google Cloud billing card and explicit approval for any cost-bearing migration step.
- Lease Renewal walkthrough and signed lease / lease-end-date source location.
- QuickBooks access status/location.
- Exact Google Sheets scope and owner.
- RentVine credential rotation and future vendor confirmation for undocumented renewal
  writeback.
- Gmail Inbox 0 safe test-thread protocol, approval sender, and launch approver
  confirmations.

Next recommended task:

Continue the client unblock / cutover handoff track. Do not expand local product surface
unless a new client answer, approved migration step, production smoke result, regression,
or accepted product decision creates a specific readiness need.

## Source-Corpus Readiness Dry-Run Hardening

- Date: 2026-06-11
- Product lanes: PMI KC KB cutover readiness; cross-product away-mode quality hardening.
- Added production-readiness output to `npm run corpus:plan`. The generated plan now
  includes `readiness.ok`, `readiness.blockers`, `readiness.warnings`, and summary counts
  for entries, Spaces, data stores, approval statuses, and sensitivities.
- The readiness pass flags unreplaced placeholders, non-`Approved` source metadata,
  `High` sensitivity entries, raw `docs/context_and_calls/` source paths, duplicate Cloud
  Storage URIs, and duplicate derived Agent Search document IDs before any upload/import
  command is used.
- Updated `docs/client-production-cutover.md`, `docs/implement.md`, and
  `docs/demo-source-templates/README.md` so operators know the production manifest
  template is expected to report blockers until placeholders are replaced and sources are
  approved, and that staging-copy creation/upload/import/metadata seeding waits for
  `readiness.ok === true`.
- No cloud setup, billing action, Gmail access, credential use, client-resource change,
  deploy, source import, email send, or external-system write was performed.

Validation status:

- `npm run check:budget-guard`: passed; demo posture, away mode active, $10 cap.
- `npm test -- live-cost-scripts`: passed with 26 focused script tests.
- `npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --project=pmikc-kb-production --location=us --dry-run`:
  passed as a local dry-run and printed expected readiness blockers for template
  placeholders and `Unreviewed` source metadata.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 280 tests.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm run verify:falsification`: passed across 259 committable files.
- `npm run test:firestore`: passed with 23 Firestore Security Rules tests.
- `npm run build`: passed.

Stop condition:

- Away mode remains active. After this bounded dry-run tooling slice, no further
  decision-free local work is selected. Continue only for a concrete regression,
  test/preflight gap, or docs/handoff inconsistency; otherwise wait for return/client
  unblock and resume cutover from `docs/client-checklist.md`.

## Main Consolidation

- Date: 2026-06-11
- By explicit user request, fast-forwarded `main` from `a329069` to `b652073` and pushed
  `origin/main` so the source-corpus readiness dry-run hardening slice is available from
  the default branch for the next run.
- Away Mode remains active for cost/cloud/Gmail/external actions; this entry records only
  the repository consolidation.

Validation status:

- Pre-merge verification for `b652073` is recorded in the previous status entry.
- Post-merge ref check confirmed `main`, `origin/main`,
  `work/yolo-20260609-015747`, and `origin/work/yolo-20260609-015747` all pointed at
  `b652073` before this doc-only state update.

## Remote Away Mode Autonomy Widened

- Date: 2026-06-11
- Trigger: user clarified that future large-model runs should be able to do significant
  work while the owner is remote, including migration/setup through APIs, and should be
  restricted primarily by breaking-change risk and cost risk.
- Replaced the old local-only Away Mode posture with Remote Away Mode in
  `docs/away-mode.md`. Future agents are now authorized to keep running product,
  migration, and API/setup work when it is reversible, non-breaking, budget-guarded, and
  documented.
- Hard stops remain: unmanaged or unbounded cost, cap increases, Pro model use,
  autonomous sends/live notifications, destructive or hard-to-rollback changes, secrets
  or raw client/customer/Gmail data exposure, and unapproved system-of-record writes.
- Updated `AGENTS.md`, `docs/autonomous-agent-runner.md`,
  `docs/budget-and-cost-policy.md`, `docs/ai-execution-workflow.md`,
  `docs/implement.md`, `docs/environment-handoff.md`, and `docs/loop-state.md` so future
  sessions do not stop merely because the owner is remote.
- Updated `scripts/check-budget-guard.mjs`: Away Mode now allows
  `--allow-multiple-spaces` for bounded migration/setup with a warning, while still
  refusing `--allow-pro` and `--allow-notifications`.
- Made the next large-run queue explicit in `docs/loop-state.md`, sized for a
  large-context/long-running model: production-lift setup automation, cutover/migration
  pipeline, app-owned environment migration, production e2e hardening, a preview-first KB
  Admin migration console, non-executable Lease Renewal Agent foundation, non-live or
  safe-thread Gmail Inbox 0 foundation, and integration readiness expansion.
- No cloud setup, billing action, Gmail access, credential use, client-resource change,
  deploy, source import, email send, or external-system write was performed.

Validation status:

- `npm run check:budget-guard`: passed; demo posture, Remote Away Mode active, $10 cap.
- `npm test -- budget-guard`: passed with 15 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 282 tests.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm run verify:falsification`: passed across 259 committable files.

## Mocked-Auth E2E Flow Harness (2026-06-11)

Built the browserless end-to-end flow harness queued as remote-run item 4 (production
hardening and e2e coverage), executed remotely under Remote Away Mode:

- Added `npm run test:e2e` / `npm run test:e2e:core` driven by
  `scripts/run-e2e-tests.mjs`: probes the Firestore emulator (Java + one-time jar) and
  degrades to the Firestore-free core group with a warning when unavailable
  (`--firestore` makes that fatal, `--no-firestore` skips the emulator).
- `tests/e2e/global-setup.mjs` seeds the emulator via the existing
  `scripts/demo-firestore.mjs#resetDemoRecords`, boots `next dev` on `localhost:4310`
  with `LOCAL_DEMO_AUTH=true ASK_DEMO_MODE=true`, warms routes, and tears down the
  process tree; `tests/e2e/helpers/client.mjs` is a cookie-jar fetch client with
  `redirect: "manual"` so guard redirects are assertable.
- Coverage (7 suites, 33 tests): sign-in guard redirects and role gating (Editor blocked
  from `/admin` and manageAdmin APIs, Admin allowed), Ask Verified Source answer with
  citations plus No Reliable Source Found and Zod 400 paths, spaces list/detail/
  read-only/404, graceful degradation markers without Firestore, capture-to-placeholder,
  Approval Queue list/filter/detail/high-risk confirmation/approve/bulk snooze/bulk
  execute block, and the full process-definition lifecycle (create → submit → queue item
  → simulation test run → approve → activate, including Editor 403 and premature-activate
  409 paths).
- Extended local demo auth so e2e can mint role-scoped sessions: `POST /api/auth/demo`
  accepts an optional `{ "role": "Editor" | "Approver" | "Admin" }`; cookie value
  `local-demo:<Role>` (plain `local-demo` stays Admin). Still gated by
  `isLocalDemoAuthEnabled()` (off in production; production preflight rejects it).
- `npm test` keeps excluding `tests/e2e/**`; e2e is not wired into `scripts/verify.sh`
  to keep it fast. Rewrote `tests/e2e/README.md` for the new harness and added the
  commands to `AGENTS.md`.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation status:

- `npm run test:e2e`: passed (31 tests, 2 degraded-mode tests correctly skipped) with
  the Firestore emulator.
- `npm run test:e2e:core`: passed (16 tests including degraded-mode markers).
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: passed with 288 tests (auth-session demo-role coverage added).
- `npm run verify:falsification`: passed across 271 committable files.
- `npm run verify:router-boundary`: passed.

## Cutover Tooling Batch: seed idempotency, GCP preflight, cutover report (2026-06-11)

Executed remote-run queue items 1-3 as local dry-run tooling in three slices under
Remote Away Mode (no credentials exist in the remote container, so live API reads stay
owner-side):

- `seed:spaces` idempotency (queue item 3): restructured `scripts/seed-spaces.mjs` from
  import-time side effects to the exported parse/build/seed pattern used by
  `seed-launch-skeletons.mjs`. Reruns now skip existing space documents, `--force`
  updates them while preserving the original `created_at` (previously reruns clobbered
  it), and `--dry-run` prints the exact records. Runbook §3 documents the behavior and
  rollback (delete the seeded `spaces/<id>` docs).
- `npm run preflight:gcp` (queue item 1): credential-less plan mode prints the full
  converge plan — the 18 required APIs (doc-sync-tested against the runbook §2 enable
  command), Firebase setup commands, Firestore create/rules-deploy commands, and the
  budget posture via the budget guard. `--live` adds read-only verification of enabled
  APIs, Firestore database mode, and the Firebase project through
  `google-auth-library` when Application Default Credentials exist, degrading every
  section to a structured blocker otherwise. `--json` emits the
  `{ok, blockers, warnings}` readiness report. Referenced from runbook §2 and
  `docs/environment-handoff.md`.
- `npm run cutover:report` (queue item 2): a single dry-run command composes the GCP
  setup plan, production env preflight, budget posture, source-corpus readiness
  (manifest optional; the template correctly reports placeholder/approval blockers),
  the deploy command preview, an ordered five-step rollback plan (Cloud Run → Agent
  Search data stores → staging uploads → seeded metadata → rules), and the runbook §7
  production smoke checklist as structured data with a doc-sync test. Blockers
  aggregate with section prefixes into one `readiness` object; the runbook now requires
  `readiness.ok === true` before deploy and gained a Rollback section.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or
  external-system action was performed. All new commands are dry-run/read-only.

Validation status (end of run):

- `bash scripts/verify.sh`: passed (format, lint, typecheck, 318 unit tests across 42
  files, router boundary, falsification across 276 committable files, build).
- `npm run test:firestore`: passed (23 rules tests).
- `npm run test:e2e`: passed (31 tests, 2 degraded-mode tests correctly skipped with
  the emulator present).
- `npm run check:budget-guard`: passed (demo posture, away mode active, $10 cap).
- Real dry-runs: `npm run preflight:gcp` (plan + live-degradation), `npm run
seed:spaces -- --dry-run`, and `npm run cutover:report` against the production
  manifest template (expected blockers printed for placeholders/unreviewed sources and
  missing client env values).

## Integration Readiness Expansion: preview schemas, health checks, mocked connectors (2026-06-12)

Executed remote-run queue item 8 under Remote Away Mode as metadata/mocked-only work (no
external write path was added; every Action Registry entry remains
`production_allowed: false`):

- Structured preview payload schemas: added an optional `preview_payload_schema` field
  (snake_case field descriptors with string/number/boolean/date/enum/reference types and
  per-field source systems) to the Action Registry schema, types, and record builder, as
  the machine-readable companion to `preview_schema_note`. The pure validator
  `lib/integrations/preview-payload.ts` enforces that a preview payload contains exactly
  the declared fields — required present, values typed, no undeclared keys.
- Per-system health-check contracts: `lib/integrations/health-checks.ts` defines seven
  deterministic contracts (Rentvine, LeadSimple, Dotloop, QuickBooks, Boom vendor-packet-
  dependent, Google Sheets, Gmail) with ordered config/auth/probe/rate-limit steps.
  `runHealthCheck` has no default transport and throws without an injected one, so the
  module can never perform a live call; a test locks this in.
- Catalog expansion 9 → 14 entries: wired `connection_health_check_ref` on all entries;
  added structured preview schemas to the maintenance-chain entries; added doc-grounded
  `rentvine.lease.read`, `rentvine.work_order.read` (read-only, Documented),
  `leadsimple.task.create` (Vendor-Confirmation-Required, Operations plan), and the
  Gmail Inbox 0 pair `gmail.label.apply` / `gmail.draft.create` (both `Planned` until
  the client approves the Gmail access model; additive labels and unsent drafts only).
  Added `"Gmail"` to `ACTION_TARGET_SYSTEMS`. Move-Out + Deposit Disposition actions
  were deliberately not added (research backlog still marks triggers/approvers/systems
  TBD). The Gmail metadata avoids the forbidden runtime scope literals so the router-
  boundary guard still blocks real Gmail runtime code.
- Mocked connector tests: `tests/helpers/mock-connectors.ts` simulates the documented
  maintenance work-order chain (create → LeadSimple stages → status sync → QuickBooks
  bill draft preserving the work-order number → Sheets audit row) entirely in memory,
  validating every mock write against the matching entry's `preview_payload_schema`.
- Docs: `docs/integration-architecture.md` gained the `preview_payload_schema` field row,
  a Connection health-check contracts subsection, and a catalog-coverage note.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation (slice boundary): `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test` (339 tests, 44 files), `npm run test:firestore` (23 rules tests),
`npm run verify:falsification` (281 committable files), `npm run verify:router-boundary`,
`npm run check:budget-guard` (demo posture, away mode active, $10 cap), and
`npx tsx scripts/seed-action-registry.ts --dry-run --json` (14 entries validated, all
production_allowed=false, no writes) all passed.

## KB Admin Migration Console (2026-06-12)

Executed remote-run queue item 5 under Remote Away Mode: a read-only, preview-first
Admin page at `/admin/migration` (linked from `/admin`) that mirrors
`npm run cutover:report` in-app. No cloud call is made from the page; in dev/demo it
honestly shows the production blockers that remain.

- `lib/admin/migration-readiness.ts` composes the same pure readiness functions the
  cutover tooling uses — GCP/Firebase/Firestore converge plan (plan mode only),
  production env preflight against the current process env, source-corpus readiness from
  the tracked production manifest template, budget/away-mode posture via the budget
  guard, Action Registry readiness (counts by readiness/evidence, gated entries, and a
  governance assertion that raises a blocker if any record is ever
  `production_allowed=true`), and Approval Queue notification posture. Every section
  degrades gracefully (per-section try/catch with a plain-English note); the Action
  Registry section falls back to the static seed catalog without Firestore. Blockers
  roll up with section prefixes, and `gcp:`/`env:`/`corpus:` blockers are labeled
  "owner-side action required" because they need credentials, billing, real project ids,
  or a reviewed manifest.
- The TypeScript page reuses the `.mjs` script logic through hand-written sibling
  `.d.mts` declarations (no config churn); every call passes explicit
  `process.cwd()`-rooted arguments because the scripts' own defaults resolve paths from
  `import.meta.url`, which mis-resolves after bundling.
- Refactor for bundle safety: extracted the pure `cloudStorageContentDocumentId` into
  `scripts/source-doc-id.mjs` and the pure manifest validation/readiness functions into
  `scripts/source-corpus-readiness.mjs` (re-exported by `scripts/source-corpus-manifest.mjs`
  so the CLI and its tests are unchanged). This keeps firebase-admin and the CLI's
  dynamic file operations out of the page bundle; the production build is warning-free.
- Tests: `tests/unit/migration-readiness.test.ts` (10 tests, including a real-deps smoke
  test that locks the `.d.mts` declarations against drift) and
  `tests/e2e/admin-migration.e2e.test.mjs` (guard redirects for signed-out/Editor, Admin
  renders all panels with the production_allowed=false assertion line, /admin links to
  the console, and the no-Firestore degraded mode shows the seed-catalog fallback note).
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation (slice boundary): `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test` (349 tests, 45 files), `npm run build` (warning-free, `/admin/migration`
present), `npm run test:e2e:core` (21 passed, 17 emulator-dependent skipped), and
`npm run test:e2e` (35 passed, 3 degraded-mode correctly skipped with the emulator) all
passed. Full `bash scripts/verify.sh` and `npm run test:firestore` results are recorded
in the end-of-run entry below.

## End-Of-Run Validation: queue items 8 + 5 (2026-06-12)

- `bash scripts/verify.sh`: passed (format, lint, typecheck, 349 unit tests across 45
  files, router boundary, falsification across 292 committable files, warning-free
  build with `/admin/migration` present).
- `npm run test:firestore`: passed (23 rules tests).
- `npm run test:e2e:core`: passed (21 tests, 17 emulator-dependent skipped).
- `npm run test:e2e`: passed (35 tests, 3 degraded-mode tests correctly skipped with
  the emulator present).
- `npm run check:budget-guard`: passed (demo posture, away mode active, $10 cap).
- `npx tsx scripts/seed-action-registry.ts --dry-run --json`: 14 entries validated, all
  production_allowed=false, no writes.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or
  external-system action was performed during this run.

## Lease Renewal Agent Non-Executable Foundation (2026-06-12)

Executed the decision-free half of remote-run queue item 6 under Remote Away Mode,
staying strictly inside the product doc's "AI Can Do Now" list and its "Do Not Build
Yet" boundary (no runtime trigger, queue, agent, or API integration; nothing
executable):

- Shared vocabulary (`lib/lease-renewal/constants.ts`): the doc-confirmed fact-confidence
  states (Verified/Likely/Needs Review/Conflict), the verified eight-stage renewal model
  (candidate detection → closeout), the initial planned reads, and the planned outputs,
  locked by tests so they cannot drift from `docs/products/lease-renewal-agent.md`.
- Fact-confidence gates (`lib/lease-renewal/facts.ts`): a pure, non-executable
  `evaluateRenewalFactGates` encoding the doc's deterministic rules — only Verified and
  approved facts flow into owner-facing drafts without a visible warning, Likely/Needs
  Review facts route to review, Conflict facts block, and a missing-facts list is kept
  against the planned read set.
- Process-definition template (`lib/lease-renewal/process-template.ts`):
  `buildLeaseRenewalProcessTemplate` converts the confirmed target workflow shape into
  the v1 minimum process-definition fields (one step per verified stage, doc-grounded
  trigger/outcome/success/stop/escalation conditions). Every action reference is derived
  from the Action Registry seed catalog, so target systems, readiness, and rollback
  notes cannot drift from governed metadata; the Rentvine renewal writeback stays a
  Planned pending-future-automation step with its vendor-confirmation gap visible.
- Source inventory template
  (`docs/source-corpus/lease-renewal-source-inventory.template.json`): the renewal
  document kinds named in the product doc's discovery list (signed lease/lease-term
  record, tenant/property facts, rent/terms, timing/fee policy, tenant-notice and legal
  language, owner communication templates, workflow notes) with TBD locations as
  placeholders for the client walkthrough.
- Acceptance scenarios (`tests/unit/lease-renewal-foundation.test.ts`, 11 tests): the
  template parses and is created as Draft through the existing workflow machinery, a
  simulation-only test run starts (is_test_run/simulation_only true, excluded from
  production metrics) and completes, the definition submits into Pending Approval, and
  the fact-confidence gates behave per the doc.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed. No new runtime surface: no page, API route, trigger, or
  connector was added.

Validation (slice boundary): recorded in the end-of-run entry below.

## End-Of-Run Validation: lease renewal foundation slice (2026-06-12)

- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: 360 tests across 46 files, all passed.
- `npm run verify:falsification`: passed across 297 committable files.
- `npm run verify:router-boundary`: passed.
- `npm run check:budget-guard`: passed (demo posture, away mode active, $10 cap).
- `npm run build`: passed, warning-free.
- `npm run test:firestore`: passed (4 rules-test files via the emulator).
- `npm run test:e2e:core`: passed (21 tests, 17 emulator-dependent skipped).
- No cloud, Gmail, credential, deploy, import, send, client-resource, or
  external-system action was performed.

## Gmail Inbox 0 Non-Live Foundation + Management Page v1 (2026-06-12)

Executed the non-live half of remote-run queue item 7 under Remote Away Mode, staying
inside the product doc's safety boundaries (no autonomous send, no Gmail draft creation,
no Gmail read/modify runtime code):

- Shared vocabulary (`lib/gmail-inbox-zero/constants.ts`): the doc-confirmed base and
  target label sets (Waiting on Outside / Waiting on Team / Dan Decision / Draft Ready),
  rollout phases (Shadow → Suggest → Drafts), rule/reply lifecycle statuses
  (Proposed/Approved/Retired), and the default hard-exclusion categories (Owner money,
  Legal/notices, Tenant disputes — label only, never draft), all test-locked.
- Label-rule model and triage gates (`lib/gmail-inbox-zero/rules.ts`): pure
  `evaluateInboxTriage` encoding the governance rules — only Admin-approved rules
  participate, auto-labeling only for exact matches past the Shadow phase (Shadow
  classifies and applies nothing), pattern rules stay suggestion-only — plus
  `proposeRuleChangeFromFeedback`, which turns Dan's label corrections into Proposed
  rule changes that require Admin approval (nothing self-modifies).
- Draft-text gates (`lib/gmail-inbox-zero/drafts.ts`): pure `buildReplyDraft` that only
  accepts Approved reply templates, always prepends the `Draft — Review before sending`
  banner, marks missing facts with the `Needs Verification: <fact>` placeholder, and
  refuses hard-excluded categories. Text composition only; no Gmail draft is created
  and no send capability exists.
- Management page v1 (`app/admin/gmail-inbox-zero/page.tsx`, linked from `/admin`): the
  doc-mandated minimal Admin-only management page, read-only — health/status bar with an
  honest "Not connected" Gmail status and Gemini posture, the label set, rollout phases,
  rules/approved-replies/history sections with production-safe empty states. No Gmail
  call, no new Firestore collection, no mutation surface. Editing/persistence waits for
  the approval-queue integration spec.
- Deliberately not built: legacy Owner Router artifact mining (the sibling repo is
  absent from this container), any users.watch/history ingestion, the Workspace Add-on
  card, back-labeling, and live Gemini evaluation — all client-gated.
- Updated `docs/products/gmail-inbox-zero.md` Current State to note the built non-live
  foundation and management page v1.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
(372 tests / 47 files), `npm run verify:falsification` (303 committable files),
`npm run verify:router-boundary`, `npm run check:budget-guard` (demo posture, away mode
active, $10 cap), `npm run build` (warning-free, `/admin/gmail-inbox-zero` present),
`npm run test:e2e:core` (25 passed, 17 emulator-dependent skipped), `npm run test:e2e`
(39 passed, 3 degraded-mode correctly skipped), and `npm run test:firestore` (23 rules
tests) all passed.

## Source Drop Zone Setup, Drive Metadata Check, And Away Mode Return (2026-06-15)

- Reauthenticated local Google access as `josiah@pmikcmetro.com` with Drive access.
- Created the Google Drive source drop zone `PMI KC - Source Drop Zone` and subfolders
  for Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition,
  Owner Onboarding, Gmail Inbox 0, unsure items, and old/reference-only material.
- Shared the top folder with `dan@pmikcmetro.com` as an editor; subfolders inherit access.
- Verified metadata-only visibility for the Drive home. Visible shared Sheets include
  `Tenant Move In/Out/Renewal Checklist`, `24/25/26 Rents Received 2`, and
  `2026 Invoices`; exact in-scope Sheets still need Dan/Josiah confirmation before any
  app use.
- Updated `docs/environment-handoff.md` with the non-secret folder and visible-sheet
  pointers.
- Marked Remote Away Mode inactive because the owner is back in active coordination.
  Updated `AGENTS.md`, `docs/away-mode.md`, `docs/loop-state.md`, and
  `docs/client-checklist.md` so future agents do not treat the exhausted remote-run
  queue as standing approval for speculative live/setup work.
- No sheet contents, raw client records, credentials, deploys, imports, sends, or
  external-system writes were performed.

Validation: `npm run format:check`, `npm run check:budget-guard` (demo posture, away mode
inactive, $10 cap), `npm test -- budget-guard` (15 tests), `npm run verify:falsification`
(303 committable files), and `git diff --check` all passed.

## GCP Billing Unblock — Cutover Resume + Verification Baseline (2026-06-19)

- The PM provisioned Google Cloud billing: account `01A5A3-65CA5A-614D45`, org
  `584930494337`, budget id `82962d7e-b340-4253-8348-38caff16e88a`. This flips the #1 client
  blocker (Google Cloud billing card). Recorded the non-secret identifiers in
  `docs/environment-handoff.md` and `docs/loop-state.md`. The assistant took no
  console/billing action — that stays user-owned (Hard Stop).
- Decisions (this session): migration targets a PMI KC-owned production project (cutover
  track, no demo artifacts copied); keep the durable ~$10 unattended-spend guard with the PM
  budget as the outer GCP-enforced alert; today's demo = cheap-live Ask (<$10) on the existing
  `pmikckb-test` project. Decision-complete packet:
  `docs/temp/2026-06-19-gcp-billing-unblock-cutover-resume.md`.
- Billing unblocks the infrastructure half of cutover (live preflight, API enablement,
  Firestore/Cloud Run setup, the cheap-live demo). It does NOT unblock cutover completion
  (needs approved client sources) or any cost step (each needs explicit approval + budget
  guard).
- Read-only verification baseline on the owner Windows host: `npm run check:budget-guard`
  PASS (demo posture, away mode inactive, $10 cap); `npm run verify:falsification` PASS (303
  files); `npm test` 370/372 PASS. The two failures are environment-coupled, not regressions
  (the modules last changed 2026-06-12, the green era):
  - `tests/unit/cutover-report.test.mjs > aggregates blockers across sections with prefixes`:
    `readProductionPreflightEnv` reads the host's on-disk `.env.local`
    (`GCP_PROJECT_ID=pmikckb-test`), so a project resolves and the expected `gcp:` "no
    project" blocker is absent. Confirmed the failure persists with shell env cleared because
    the value comes from `.env.local` on disk.
  - `tests/unit/migration-readiness.test.ts > computes real plan/preflight/corpus/budget`:
    5s default timeout on cold dynamic import of the real Google SDK modules; passes at
    `--testTimeout=30000` (~16s observed; vitest reported ~56s aggregate import).
  - Flagged a follow-up to make both tests hermetic (skip on-disk `.env.local` in the unit
    test; add an explicit timeout to the real-deps smoke).
- `npm run host:check`: gcloud SDK present but `pmikckb-test` not accessible →
  `gcloud auth login` + `gcloud auth application-default login` required before any live/demo
  run. `npm run check:live-cost -- --allow-multiple-spaces` correctly gates (ambient
  `ASK_DEMO_MODE=true`).
- Remaining user-owned gates: gcloud/ADC auth; create/select + link a PMI KC production
  project and a $10 budget alert on it; confirm the PM budget amount/thresholds; explicit
  per-step spend approval for the cheap-live demo and each production cost step.

Validation: `npm run check:budget-guard` (demo posture, away mode inactive, $10 cap) and
`npm run verify:falsification` (303 committable files) passed; `npm test` 370/372 passed with
2 environment-coupled failures documented above. Docs-only slice; no full
`bash scripts/verify.sh` run, and no cloud/billing/ADC/deploy/import/send/secret action.

## Account/Org Discovery + Fresh-Project Decision (2026-06-19)

- Authenticated gcloud + ADC as `josiah@pmikcmetro.com` (owner's PMI KC account). Discovery:
  the existing demo stack — project `pmikckb-test`, Cloud Run, Firebase Auth, and the four
  Agent Search data stores — is owned by and auth-locked to the **cherrybridge.ai**
  account/org. The deployed sign-in page enforces `allowedHostedDomain=cherrybridge.ai`, so a
  `pmikcmetro.com` account cannot use it, and `gcloud` denied all access to `pmikckb-test`
  (`USER_PROJECT_DENIED`). `josiah@pmikcmetro.com` has the `pmikcmetro.com` org
  (584930494337 — the same org as the PM's new billing) but zero accessible projects.
- Decision (owner-approved): build a fresh GCP project under the `pmikcmetro.com` org funded
  by the PM billing account `01A5A3-65CA5A-614D45`, per `docs/client-production-cutover.md`
  (no demo artifacts copied). A live <$10 demo can run on the new project using the repo's
  sanitized demo corpus in `docs/demo-source-templates/`, so the demo does not depend on the
  client-source blocker. The owner is creating + billing-linking the project in the console;
  the assistant then runs the gated setup (preflight → APIs → Firebase/Auth → Firestore →
  seed → import → smoke → deploy), each cost step behind explicit `--budget-confirmed` approval.
- No cloud mutation, project creation, billing change, deploy, import, send, or secret action
  was taken by the assistant this slice; gcloud `billing/quota_project` was unset locally
  (it had pointed at the now-inaccessible `pmikckb-test`).

Validation: read-only diagnosis only (`gcloud auth login` / `application-default login`,
`gcloud config list`, `gcloud projects list`, `gcloud organizations list`, and a deployed-URL
HTTP check). No repo code changed; no `npm` verification re-run this slice.

## Fresh Project Created — Billing Link Pending (2026-06-19)

- Owner asked the assistant to provision the new environment. Created GCP project
  `pmi-kc-kb-prod` (number `558870356522`) under the `pmikcmetro.com` org
  (`gcloud projects create ... --organization=584930494337`) and set it as the active gcloud
  project. Project creation is reversible (deletable within 30 days).
- Billing link is blocked: `gcloud billing projects link` returned `IAM_PERMISSION_DENIED`
  (missing `billing.resourceAssociations.create` on `billingAccounts/01A5A3-65CA5A-614D45`);
  `gcloud billing accounts list` shows 0 accounts for `josiah@pmikcmetro.com`. Project
  `billingEnabled=false`. The PM must either link `pmi-kc-kb-prod` to billing
  `01A5A3-65CA5A-614D45` in the console, or grant `josiah@pmikcmetro.com` `roles/billing.user`
  on that billing account; either way also add a $10 project-scoped budget alert.
- Until billing is enabled, the paid APIs (Cloud Run, Vertex AI, Discovery Engine), Firestore
  creation, and deploy cannot proceed. The assistant stopped cleanly at this approval/permission
  gate. No paid API enablement, Firestore, deploy, import, send, or secret action was taken.
