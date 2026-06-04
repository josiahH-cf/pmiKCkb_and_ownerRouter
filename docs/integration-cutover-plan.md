# Integration And Cutover Plan

This is the cross-product cutover plan for PMI KC KB, Lease Renewal Agent, and Gmail
Inbox 0. It is intentionally more current than older KB-only demo docs.

## Phase Gates

| Phase                                  | Goal                                                     | AI/engineering can do                                                              | Client/human must provide                                                   | Exit gate                                                               |
| -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0. Governance alignment                | Make the repo route to the three purchased products.     | Update routing docs, product docs, blockers, and status.                           | Confirm product names and high-level scope.                                 | `AGENTS.md`, `docs/products/`, plan, workflow, and status are aligned.  |
| 1. Discovery                           | Identify facts, systems, users, and success criteria.    | Prepare interview questions, source inventory templates, and gap log.              | Answer product questions and name owners for each system.                   | All critical unknowns are either answered or listed as blockers.        |
| 2. Access and accounts                 | Establish admin paths without secrets in git.            | Prepare env templates, preflight scripts, and least-privilege role checklist.      | Grant Workspace, GCP/Firebase, Drive, Gmail, and test-account access.       | Admin access works and is recorded without credentials.                 |
| 3. Integration capability verification | Prove each intended integration can be used safely.      | Run non-destructive API checks and smoke tests.                                    | Approve scopes, senders, test data, and sandbox accounts.                   | Each integration is verified, rejected, or moved to research backlog.   |
| 4. Source inventory                    | Identify approved source material and sensitivity.       | Build manifests and source-state records.                                          | Provide approved docs, folders, owners, and sensitivity decisions.          | Each active source has owner, state, location, and allowed use.         |
| 5. Security model                      | Define permissions by product and role.                  | Document role mappings, no-write boundaries, and audit points.                     | Approve user list, send authority, Drive access, and operational ownership. | Role matrix is approved and testable.                                   |
| 6. Environment setup                   | Build demo/staging/production separation.                | Configure env files, deploy scripts, Firebase/Auth, Firestore, and retrieval maps. | Provide client-owned project, billing, domains, and authorized users.       | Preflight passes against client-owned settings.                         |
| 7. Product build planning              | Convert requirements into buildable tickets.             | Create acceptance criteria, tests, and blocked/unblocked work queues.              | Confirm what belongs in v1 for each product.                                | No runtime work begins without a product-lane acceptance gate.          |
| 8. Migration and cutover prep          | Prepare approved data and operating procedure migration. | Plan imports, dry-runs, source metadata, and rollback.                             | Approve final source set and operating calendar.                            | Dry-run import and smoke plan pass.                                     |
| 9. Acceptance and training             | Prove the products with real users.                      | Run test matrix, capture issues, update docs.                                      | Dan, Bailey, and named operators complete acceptance tasks.                 | User acceptance and security gates pass.                                |
| 10. Production cutover and monitoring  | Launch with support and rollback.                        | Deploy, smoke, monitor, update status.                                             | Approve go-live, monitor owners, and support window.                        | Production smoke passes; monitoring and next iteration list are active. |

## Product-Specific Cutover Notes

| Product             | Current cutover posture                                                                    | Primary blockers                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| PMI KC KB           | Demo runtime exists; production cutover runbook exists and needs client-owned resources.   | PMI KC admin/billing, approved production sources, source/data-store maps, auth domains, roles, Gmail notification decision.   |
| Lease Renewal Agent | No standalone agent runtime should be built yet.                                           | Requirements, permitted systems, trigger model, data source list, user approval model, and acceptance tests.                   |
| Gmail Inbox 0       | Dan-email-first pilot direction exists; legacy Owner Router artifacts are source material. | Dan mailbox access model, historical scan protocol, label setup authority, live Gmail testing approach, Drive source approval. |

## Integration Rules

- Prefer read-only verification first.
- Use dry-run commands before imports, seeding, deployment, or label setup.
- Do not copy demo Firestore data, demo OAuth clients, demo service accounts, or demo
  buckets into production.
- Production sources must be approved PMI KC-owned files or approved safe summaries.
- Record every meaningful cutover action in `docs/status.md`.

## Rollback Model

- PMI KC KB: redeploy the previous Cloud Run revision, disable production env maps, and
  leave source folders untouched.
- Lease Renewal Agent: no rollback exists until a runtime is designed; discovery docs are
  the only active artifact for now.
- Gmail Inbox 0: remove or stop applying Gmail labels/filters, keep existing messages in
  Gmail, and preserve Drive source files for audit.
