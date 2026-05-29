# PMI KC KB Plan

## Product Summary

PMI KC KB is a standalone internal web app for source-backed operational Q&A, editable
SOPs, placeholders, tool/template directories, and approval workflows. It is separate
from the Owner Router, which remains Gmail/Drive-native in its own repository.

## Goals

- Restrict access to approved Google Workspace users.
- Return cited answers only when grounding supports them.
- Return `No Reliable Source Found` when sources are weak.
- Preserve editable SOPs, templates, tools, placeholders, change logs, and source
  metadata in Firestore.
- Index one Drive folder per Space through Vertex AI Search.
- Send internal `KB Approval` notifications only.
- Keep no-write boundaries for all external systems and the Owner Router folder.

## Non-Goals

- No Owner Router implementation in this repo.
- No autonomous send.
- No Gmail content ingestion.
- No Gmail draft creation.
- No writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, operational Sheets, or
  the Owner Router Drive folder.
- No multi-tenant app.

## Current Audit Snapshot

Status after the 2026-05-29 live Ask smoke:

- M0, M1, and M2a are complete for the KB scaffold.
- A demo M2b/M2c slice is working for Lease Renewals with real Firebase Auth, live
  demo Firestore records, editable APIs, Approval Queue actions, and reset/smoke
  scripts.
- M3a/M3b code foundations are implemented: live retrieval boundary, source metadata
  filtering, Gemini JSON validation, citation downgrade, Ask logging, Ask capture, and
  eval execution through the Ask service.
- Spec 1 is not launch-complete yet. A cheap Lease Renewals live Ask smoke works
  through Cloud Storage and Agent Search, but it currently uses safe seed docs rather
  than sanitized client call context. Only Lease Renewals has the full editable Space
  UI, and production source corpus / Gmail notification / Admin observability work
  remains.
- `npm run verify` and `npm run test:firestore` pass on the current host.
- The Owner Router remains correctly outside this runtime. Its separate repo must be
  initialized before final KB acceptance test A-16 can pass.

## Milestones

### M0 - Scaffold (complete)

Acceptance criteria:

- Specs preserved under `docs/specs/`.
- KB spec copied to `docs/spec.md`.
- Next.js app builds locally.
- Unit/eval tests pass.
- `scripts/verify.sh` passes.
- Owner Router repo plan exists without Router runtime code.

Validation:

```bash
bash scripts/verify.sh
```

### M1 - Auth And Roles (complete)

Acceptance criteria:

- Google sign-in is wired through Firebase Auth / Identity Platform.
- `ALLOWED_HD` is enforced server-side.
- Editor, Approver, and Admin roles are represented in custom claims and route guards.
- Editor cannot approve content.

Validation:

```bash
npm run typecheck
npm test
npm run build
```

### M2 - Firestore Editable Layer (partly complete)

M2 is split so future work does not confuse the API foundation with a usable editing
experience.

#### M2a - Editable API Foundation (complete)

Acceptance criteria:

- Collections match the spec data model.
- SOP/template/tool/placeholder CRUD uses server-side permission checks.
- Change-log entries are created for mutations.
- Soft delete is the only delete path.

Validation:

```bash
npm test
npm run typecheck
```

#### M2b - Editable Space UI (Lease Renewals complete; all-Space UI remains)

Acceptance criteria:

- Lease Renewals has a Space detail page backed by the editable API routes.
- Users can view SOPs, templates, tools, and placeholders for the Space.
- Editors can create or update editable records.
- Read-only Spaces do not expose edit controls.
- The same editable experience works for every writable launch Space.
- The Owner Email Space remains read-only and points to the Owner Router source docs.
- Space pages show change-log history for saves, approvals, and placeholder resolution.

Validation:

```bash
npm test
npm run build
```

#### M2c - Environment Seeding (demo complete; production seeding remains)

Acceptance criteria:

- Spaces can be seeded idempotently from environment-safe config.
- The Lease Renewals demo records can be created without secrets or client data.
- Demo seed data is clearly separated from production/client content.
- Production seed paths create all 12 launch Spaces without demo records or client
  secrets.

Validation:

```bash
npm test
npm run typecheck
```

### M3 - Retrieval And Ask

#### M3a - Live Retrieval Boundary (code complete; cheap live smoke passed)

Acceptance criteria:

- Vertex AI Search is called through a boundary module.
- Zero grounding documents returns `No Reliable Source Found` without a model call.
- Retrieval can search a specific Space or all configured Spaces.
- Deprecated and high-sensitivity sources are excluded using `sources_meta`.
- Missing source targets or Agent Search data store IDs produce explicit Admin/setup
  errors.

Validation:

```bash
npm test
npm run build
```

#### M3b - Gemini Answer Contract And Capture Tasks (code complete)

Acceptance criteria:

- Gemini output is schema-validated.
- Invalid citations are stripped.
- If all citations are stripped, the answer is downgraded to
  `No Reliable Source Found`.
- Ask logs persist source state, citations, draft, and feedback.
- Partial/no-source answers can create owned placeholders from Ask.
- The 50-case eval set executes against the Ask service, not only the seed file shape.

Validation:

```bash
npm test
npm run build
```

### M4 - Spaces And Approval Queue

#### M4a - All-Space Editing

Acceptance criteria:

- All 12 launch Spaces exist, including read-only Owner Email.
- SOP inline edit, template edit, tool links, placeholder creation, and change-log
  display work across all writable Spaces.
- The Owner Email Space cannot be edited from the KB and renders its Router source
  pointers as read-only.

Validation:

```bash
npm test
npm run build
```

#### M4b - Approval Queue And Notifications

Acceptance criteria:

- Approval Queue loads in-review SOPs/templates and filled placeholders across all
  Spaces.
- Queue is visible to all signed-in users and actionable only by Approvers.
- Approve, reject/return, and resolve actions write change-log entries with actor,
  timestamp, and note.
- `KB Approval` notification template sends via Gmail send-only scope only.
- No Gmail read, modify, or compose scope is introduced.

Validation:

```bash
npm test
npm run build
```

### M5 - Acceptance And Deployment

#### M5a - Admin, Observability, And Staging

Acceptance criteria:

- Brand tokens are verified against the brand site.
- Cloud Run deployment is documented and repeatable.
- Admin dashboard shows indexing status, Ask counts, open-placeholder counts by owner,
  Approval Queue depth by type, and setup health.
- Staging runs with production-like demo flags disabled unless explicitly set for a
  show-and-tell.

Validation:

```bash
bash scripts/verify.sh
```

#### M5b - Final Acceptance And Cutover

Acceptance criteria:

- Eval set has at least 50 cases and runs in CI with zero hallucination-rule failures.
- Playwright critical flows pass with mocked auth/session fixtures.
- All A-1 through A-17 acceptance criteria are testable.
- A-16 passes after the separate Owner Router repo/folder exists and is indexed
  read-only as the Owner Email Space.
- Usability tasks are completed by Chastity, Estelle, and Shane.
- Production cutover uses a clean PMI KC-owned GCP/Firebase/Drive setup, not copied
  demo Firestore data.

Validation:

```bash
bash scripts/verify.sh
```

## Parallel Spec 2 Track

Spec 2 is implemented in a separate repository named `pmi-kc-owner-router`. It should
start after M3a live retrieval groundwork is underway, and it must be ready before M5b
because KB acceptance criterion A-16 depends on Router source docs being indexed.

Acceptance criteria:

- Separate repo exists outside this KB runtime.
- Spec 2, Spec 3, and Spec 4 are preserved in that repo.
- Six canonical Drive file templates exist.
- Nine exact `Owner Router / *` labels are documented.
- Prompt pack or Gem system prompt uses `Needs Verification: <fact>` and
  `Draft — Review before sending` verbatim.
- Optional Apps Script is scoped to label creation, sheet headers, and health digest;
  it cannot send, mutate existing thread labels, or write outside the Router folder.
- Router acceptance checklist and historical-thread dry-run templates exist.
- KB gets read-only access to `Owner Router - PMI KC Metro`; Router does not call KB.

Validation:

```bash
npm run verify:router-boundary
```

## Risks And Unknowns

- Brand token hex values still need verification against the live brand site.
- Live Agent Search and Gemini adapters have been smoked against a cheap Lease
  Renewals Cloud Storage data store with `ASK_DEMO_MODE=false`; call-derived client
  context is still missing.
- E2E tests are documented but not active until mocked auth/session fixtures exist.
- Production source locations, Agent Search data store IDs, OAuth clients, and GCP
  projects are not known yet.
- Owner Router must be initialized in a separate repo before the read-only Owner Email
  Space can be fully verified.
- `npm run test:firestore` requires Java JDK 11+ on PATH; this host currently has a
  working setup path via `npm run host:check`.

## Recommended Development Sequence

1. Keep `npm run verify` and `npm run test:firestore` green.
2. Add sanitized Lease Renewals call notes to the cheap Cloud Storage source corpus,
   import the `.txt` copy, seed `sources_meta`, and rerun `npm run smoke:ask-live`.
3. Start the separate `pmi-kc-owner-router` repo so Router source docs exist before
   final KB A-16 verification.
4. Complete M4a/M4b: all-Space editing, all-Space Approval Queue, change logs, and
   Gmail send-only approval notifications.
5. Complete M5a/M5b: Admin observability, brand verification, mocked-auth Playwright
   e2e, staging Cloud Run, usability tests, and production cutover.
