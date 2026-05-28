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
