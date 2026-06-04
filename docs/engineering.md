# Engineering Guidance

## Active Product Boundaries

- PMI KC KB is the only current web app runtime in this repo.
- PMI KC KB is also the future workflow-control surface for approved backend
  automations.
- Lease Renewal Agent is the first backend automation target after KB production, but
  integration architecture and write permissions are not approved yet.
- Gmail Inbox 0 is Dan-email-first and Gmail-native for v1; it supersedes the
  client-facing Owner Router/Dan's AI Assistant naming and starts with Dan's mailbox.
- Older KB-only and separate-Owner-Router repository instructions are legacy unless
  preserved in `docs/north-star.md` or a product lane doc as a safety boundary.

## Current KB Stack

- Next.js App Router, React, TypeScript, npm.
- Firestore Native mode for editable KB data.
- Vertex AI Search for source-backed retrieval.
- Vertex AI Gemini for grounded answers and drafts.
- Firebase Auth / Identity Platform with Google hosted-domain enforcement.
- Gmail API send-only for internal `KB Approval` notifications.
- Cloud Run for deployment.

## Current KB Architecture Boundaries

- `app/` owns routes and API entry points.
- `components/` owns presentational UI.
- `lib/auth/` owns roles and permission checks.
- `lib/retrieval/` owns Vertex AI Search boundaries.
- `lib/llm/` owns prompt assembly and model contracts.
- `lib/citations/` owns citation validation.
- `lib/firestore/` owns KB data model types and data access.

## Testing Expectations

- Unit tests for source state, citation filtering, prompt contracts, role permissions,
  Firestore validators, and cutover guards.
- Integration tests for API routes, Firestore rules, and retrieval adapters when
  services are wired.
- Eval tests must preserve hallucination and citation behavior.
- Playwright e2e tests are added when auth and external-service mocks exist.
- Lease Renewal Agent and Gmail Inbox 0 tests should be added only after implementation
  scope exists.

## Security And Secrets

- Store no secrets in git.
- Put local names in `.env.example`; put real values in `.env.local`, Secret Manager,
  or the active shell.
- Avoid service account keys; prefer workload identity or impersonation.
- Exclude high-sensitivity source material from retrieval.
- Do not log PII, raw owner/tenant financial facts, live Gmail contents, or LLM prompt
  payloads containing sensitive data.
- Do not add autonomous send.
- Do not add system-of-record writes without a future approved product spec, explicit
  approval flow, audit record, tests, and rollback/error handling.

## Product Constants

Do not rename casually:

- `PMI KC KB`
- `Lease Renewal Agent`
- `Gmail Inbox 0`
- `Owner Router` as legacy/internal source context only
- `Admin`
- `User`
- `Draft — Review before sending`
- `Needs Verification: <fact>`
- `No Reliable Source Found`
- `KB Approval`

## Definition Of Done

- The change maps to `docs/north-star.md`, `docs/plan.md`, and the relevant product doc.
- Tests cover behavior or the gap is documented.
- Relevant verification passes.
- `docs/status.md` is current.
- Legacy context is updated or retired when direction changes.
