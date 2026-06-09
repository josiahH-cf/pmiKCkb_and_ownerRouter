# Engineering Checklist

Use this after client admin access or confirmed non-secret identifiers are available.

## Shared Setup

- Confirm the working branch and preserve existing uncommitted work.
- Before starting new local product work, confirm it still improves production
  readiness, cutover prep, verification, handoff, or a known quality issue.
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
- Seed the Action Registry catalog with `npm run seed:action-registry` (Admin SDK only);
  confirm every entry stays `production_allowed: false` until an approved per-action spec
  changes it.
- Build approved production source manifests from client-provided sources.
- Import sources to Agent Search and seed `sources_meta`.
- Configure `SPACE_DRIVE_FOLDER_IDS`, `SPACE_VERTEX_DATA_STORE_IDS`, and `APP_BASE_URL`.
- Run `npm run preflight:production -- --env-file=.env.production.local`.
- Deploy with `ASK_DEMO_MODE=false` and `LOCAL_DEMO_AUTH=false`.
- Assign Firebase roles from a trusted Admin SDK context.
- Smoke sign-in, Ask, source citation, no-source behavior, editable saves, approvals,
  and Admin observability.

## Lease Renewal Agent

- Do not build external write/send runtime until the product doc has approved source
  systems, permissions, approval model, and acceptance tests.
- Inventory renewal source systems, allowed source documents, trigger events, review
  owners, notification channels, and prohibited write paths.
- Identify which current KB Lease Renewals artifacts can be reused as source material.
- Draft acceptance scenarios before selecting integration architecture.

## Maintenance Work Order Intake

- Treat this as the first executable-write target per `docs/integration-architecture.md`,
  ahead of any Rentvine lease-renewal writeback.
- Inventory the Rentvine work-order fields, statuses, vendor trades, and inspection
  objects the intake will read and create.
- Confirm the LeadSimple Rentvine maintenance sync availability and Operations plan tier,
  and map LeadSimple stages to Rentvine work-order statuses before building.
- Keep QuickBooks downstream: preserve the Rentvine work-order number and property/unit
  context on any accounting artifact, and do not originate workflow there.
- Catalog each action in the Action Registry with documented evidence, readiness,
  preview, and rollback before requesting any executable approval.
- Add tests only after an implementation boundary is approved.

## Gmail Inbox 0

- Treat existing Owner Router/Dan's AI Assistant artifacts as source material to migrate
  or rename, not as final production setup by themselves.
- Start the pilot with Dan's mailbox and the `Waiting on Outside` / `Waiting on Team`
  labels.
- Verify Gmail labels, filters, and historical-scan behavior manually or with approved
  setup scripts only.
- Ensure optional Apps Script remains setup/health-only unless a future approved spec
  expands scope.
- Do not add autonomous send, Gmail draft creation, Gmail read/modify runtime code, or
  system-of-record writes without a new approved spec and tests.
- Test with sanitized, historical-read-only, or client-approved safe threads before
  touching live Dan email.

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
