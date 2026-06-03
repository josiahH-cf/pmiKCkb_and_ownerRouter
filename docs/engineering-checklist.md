# Engineering Checklist

Use this after client admin access or confirmed non-secret identifiers are available.

## Shared Setup

- Confirm the working branch and preserve existing uncommitted work.
- Run the repo validation baseline:

```bash
npm install
npm run format:check
npm run typecheck
npm test
```

- Keep real secrets in `.env.local`, Secret Manager, or the active shell only.
- Record decisions and blockers in `docs/status.md`.

## PMI KC KB

- Verify the PMI KC-owned GCP/Firebase project and billing.
- Enable required Google APIs in the client project.
- Configure Firebase web app values and authorized production domains.
- Deploy Firestore rules and indexes.
- Seed Spaces and launch skeletons only after project confirmation.
- Build approved production source manifests from client-provided sources.
- Import sources to Agent Search and seed `sources_meta`.
- Configure `SPACE_DRIVE_FOLDER_IDS`, `SPACE_VERTEX_DATA_STORE_IDS`, and `APP_BASE_URL`.
- Run `npm run preflight:production -- --env-file=.env.production.local`.
- Deploy with `ASK_DEMO_MODE=false` and `LOCAL_DEMO_AUTH=false`.
- Assign Firebase roles from a trusted Admin SDK context.
- Smoke sign-in, Ask, source citation, no-source behavior, editable saves, approvals,
  and Admin observability.

## Lease Renewal Agent

- Do not build runtime until the product doc has approved v1 scope.
- Inventory renewal source systems, allowed source documents, trigger events, review
  owners, notification channels, and prohibited write paths.
- Identify which current KB Lease Renewals artifacts can be reused as source material.
- Draft acceptance scenarios before selecting runtime architecture.
- Add tests only after an implementation boundary is approved.

## Gmail Inbox 0

- Treat existing Owner Router/Dan's AI Assistant artifacts as source material to migrate
  or rename, not as final production setup by themselves.
- Confirm the nine existing owner-email state labels still fit the Gmail Inbox 0 v1
  owner-email-first scope.
- Verify Gmail labels and filters manually or with approved setup scripts only.
- Ensure optional Apps Script remains setup/health-only unless a future approved spec
  expands scope.
- Do not add autonomous send, Gmail draft creation, Gmail read/modify runtime code, or
  system-of-record writes without a new approved spec and tests.
- Test with sanitized or client-approved safe threads before touching live owner email.

## Final Verification

Run the smallest relevant checks while working, then before handoff run:

```bash
npm run format:check
npm run typecheck
npm test
bash scripts/verify.sh
```

Run `npm run test:firestore` whenever Firestore rules or persistence behavior changes
and Java is available.
