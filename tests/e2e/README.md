# E2E Flow Tests (mocked auth, no browser)

HTTP-level end-to-end tests that drive a real `next dev` server through `fetch`, using
the local demo auth mode (`LOCAL_DEMO_AUTH=true`) and demo Ask data
(`ASK_DEMO_MODE=true`). The app's critical flows are server-rendered pages plus JSON API
routes, so fetch-level assertions cover sign-in guards, Ask source states and citations,
capture-to-placeholder, the Approval Queue, the process-definition lifecycle, Admin role
gating, and spaces — without a browser binary. Browser/pixel coverage remains optional
and can layer on later via Playwright when a managed browser exists.

## Commands

```bash
npm run test:e2e        # Firestore emulator + dev server; runs every suite
npm run test:e2e:core   # no emulator; Firestore-backed suites self-skip
```

- `scripts/run-e2e-tests.mjs` probes the Firestore emulator first (it needs Java and a
  one-time jar download). When the emulator is unavailable it degrades to the core
  group with a warning; pass `--firestore` to make that fatal in CI.
- `tests/e2e/global-setup.mjs` seeds the emulator with the safe demo records
  (`scripts/demo-firestore.mjs#resetDemoRecords`), spawns `next dev` on
  `localhost:4310` (`E2E_PORT` overrides), warms key routes, and tears the server down
  after the run. Server logs land in `temp/e2e/next-dev.log`.
- Demo auth only exists outside `NODE_ENV=production`, which is why the harness uses the
  dev server; production preflight rejects `LOCAL_DEMO_AUTH=true`.
- Suites authenticate via `POST /api/auth/demo` (optionally `{ "role": "Editor" }` or
  `"Approver"`) and carry the `__session` cookie with
  `tests/e2e/helpers/client.mjs`.
- Suites that need Firestore are wrapped in
  `describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)`; the degraded-mode suite runs
  only without the emulator and locks in graceful unavailable markers.

For live, human-assisted Firebase Google sign-in diagnostics, use the repository smoke
utility instead of adding it to CI:

```bash
npm run smoke:auth-live -- --email=<josiah-pmi-kc-account@pmikcmetro.com> --timeout-ms=90000
```

That command uses installed Chrome or Edge through `playwright-core`, records ignored
artifacts under `temp/live-auth-smoke`, and stops at Google password/MFA/consent
checkpoints unless rerun with `--pause-on-human`.
