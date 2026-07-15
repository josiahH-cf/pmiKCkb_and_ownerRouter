# V1 dependency disposition

Date: 2026-07-15. State: **accepted for V1 with a bounded engineering follow-up**.

## Current audit evidence

- A fresh `npm audit --json` reports **3 Moderate, 0 High, 0 Critical, and 0 Low**
  findings. The non-zero command exit is expected while those Moderate findings remain.
- All three rows are the same development-tool chain:
  `firebase-tools` → `@google-cloud/pubsub` → `@opentelemetry/core@1.30.1`, affected by
  `GHSA-8988-4f7v-96qf`.
- `npm ls --omit=dev @opentelemetry/core @google-cloud/pubsub firebase-tools --depth=4`
  is empty. The affected packages are not in the production dependency tree or application
  runtime bundle.
- No High or Critical issue is being waived.

## V1 disposition

The three Moderate findings do **not** block V1 application readiness or deployment. They are
reachable through local/deployment tooling only, not through a signed-in application request.
The safe default is to retain the current Firebase CLI line and avoid a forced downgrade solely
to make the audit count zero.

Recheck this disposition on **2026-08-15**, on the next current-line `firebase-tools` update, or
immediately if any of these conditions changes:

- a High or Critical finding appears;
- the affected chain enters `npm ls --omit=dev`;
- the finding becomes remotely reachable through the application runtime; or
- upstream publishes a compatible current-line fix.

The engineering owner records the recheck in `docs/status.md`. A separate named risk-acceptance
signature is not a V1 gate.

## Verification commands

```bash
npm audit --json
npm ls --omit=dev @opentelemetry/core @google-cloud/pubsub firebase-tools --depth=4
```

If a compatible current-line remediation becomes available, update without `--force`, then rerun
the unit, emulator, build, and deployment-tool checks. If a High/Critical or runtime-reachable issue
appears, stop deployment until it is remediated or the affected feature is removed from the release.
