# Engineering Guidance

## Stack

- Next.js App Router, React, TypeScript, npm.
- Firestore Native mode for editable KB data.
- Vertex AI Search for source-backed retrieval.
- Vertex AI Gemini for grounded answers and drafts.
- Firebase Auth / Identity Platform with Google hosted-domain enforcement.
- Gmail API send-only for internal `KB Approval` notifications.
- Cloud Run for deployment.

## Architecture Boundaries

- `app/` owns routes and API entry points.
- `components/` owns presentational UI.
- `lib/auth/` owns roles and permission checks.
- `lib/retrieval/` owns Vertex AI Search boundaries.
- `lib/llm/` owns prompt assembly and model contracts.
- `lib/citations/` owns citation validation.
- `lib/firestore/` owns KB data model types and future data access.

## Testing Expectations

- Unit tests for source state, citation filtering, prompt contracts, role permissions,
  and Firestore validators.
- Integration tests for API routes, Firestore rules, and retrieval adapters once
  services are wired.
- Eval tests must include at least 50 question/expected-state cases.
- Playwright e2e tests are added when auth and external-service mocks exist.

## Security And Secrets

- Store no secrets in git.
- Put local names in `.env.example`; put real values in `.env.local`.
- Use Secret Manager in deployed environments.
- Avoid service account keys; prefer workload identity.
- Exclude high-sensitivity source material from retrieval.
- Do not log PII, raw owner/tenant financial facts, or LLM prompt payloads containing
  sensitive data.

## Product Constants

Do not rename:

- `PMI KC KB`
- `Owner Router`
- `Owner Router - PMI KC Metro`
- `Draft — Review before sending`
- `Needs Verification: <fact>`
- `KB Approval`

## Definition Of Done

- The change maps to the specs and current milestone.
- Tests cover behavior or the gap is documented.
- `bash scripts/verify.sh` passes.
- `docs/status.md` is current.
- The Owner Router remains separate.
