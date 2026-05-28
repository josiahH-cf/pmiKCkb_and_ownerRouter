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

## Milestones

### M0 - Scaffold

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

### M1 - Auth And Roles

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

### M2 - Firestore Editable Layer

M2 is split so future work does not confuse the API foundation with a usable editing
experience.

#### M2a - Editable API Foundation

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

#### M2b - Editable Space UI

Acceptance criteria:

- Lease Renewals has a Space detail page backed by the editable API routes.
- Users can view SOPs, templates, tools, and placeholders for the Space.
- Editors can create or update editable records.
- Read-only Spaces do not expose edit controls.

Validation:

```bash
npm test
npm run build
```

#### M2c - Environment Seeding

Acceptance criteria:

- Spaces can be seeded idempotently from environment-safe config.
- The Lease Renewals demo records can be created without secrets or client data.
- Demo seed data is clearly separated from production/client content.

Validation:

```bash
npm test
npm run typecheck
```

### M3 - Retrieval And Ask

Acceptance criteria:

- Vertex AI Search is called through a boundary module.
- Zero grounding documents returns `No Reliable Source Found` without a model call.
- Gemini output is schema-validated.
- Invalid citations are stripped.
- Ask logs persist source state, citations, draft, and feedback.

Validation:

```bash
npm test
npm run build
```

### M4 - Spaces And Approval Queue

Acceptance criteria:

- All 12 launch Spaces exist, including read-only Owner Email.
- SOP inline edit and approval flow work.
- Approval queue is visible to all signed-in users and actionable only by Approvers.
- `KB Approval` notification template sends via Gmail send-only scope.

Validation:

```bash
npm test
npm run build
```

### M5 - Acceptance And Deployment

Acceptance criteria:

- Eval set has at least 50 cases and runs in CI.
- Playwright critical flows pass once auth mocks are present.
- Brand tokens are verified against the brand site.
- Cloud Run deployment is documented and repeatable.
- All A-1 through A-17 acceptance criteria are testable.

Validation:

```bash
bash scripts/verify.sh
```

## Risks And Unknowns

- Brand token hex values still need verification against the live brand site.
- Google service client dependencies are deferred until integration work starts.
- E2E tests are documented but not active until auth and integration mocks exist.
- Actual Drive folder IDs, Vertex data store IDs, OAuth clients, and GCP projects are
  not known yet.
- Owner Router must be initialized in a separate repo before the read-only Owner Email
  Space can be fully verified.
- `npm run test:firestore` requires Java JDK 11+ on PATH.

## Recommended Development Sequence

1. Keep the scaffold green.
2. Add Firebase Auth and role guards.
3. Add Firestore emulator tests and data access boundaries.
4. Define the demo/cutover model and first Lease Renewals demo slice.
5. Build the Space editing UI and seeding path for Lease Renewals.
6. Wire retrieval first with local mock responses, then Vertex AI Search.
7. Add Gemini prompt and JSON validation tests.
8. Build the Approval Queue UI.
9. Add Gmail send-only notification integration.
10. Add Playwright e2e tests.
11. Provision staging Cloud Run and run the acceptance gates.
