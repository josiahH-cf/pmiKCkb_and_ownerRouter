# E2E Test Placeholder

Playwright critical-flow tests belong here once Firebase Auth test fixtures, Firestore
emulator data, and Vertex AI Search mocks are wired. The scaffold verifies unit and eval
contracts today; the e2e gap is tracked in `docs/status.md`.

For live, human-assisted Firebase Google sign-in diagnostics, use the repository smoke
utility instead of adding it to CI:

```bash
npm run smoke:auth-live -- --email=<josiah-pmi-kc-account@pmikcmetro.com> --timeout-ms=90000
```

That command uses installed Chrome or Edge through `playwright-core`, records ignored
artifacts under `temp/live-auth-smoke`, and stops at Google password/MFA/consent
checkpoints unless rerun with `--pause-on-human`.
