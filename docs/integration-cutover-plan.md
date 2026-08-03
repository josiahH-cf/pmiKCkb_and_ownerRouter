# Integration And Cutover Plan

This is the cross-product cutover plan for PMI KC KB, Lease Renewal Agent, and Workflow
Communications. Production is Live-only on `pmi-kc-app`; rehearsal is local and Live-read-only.

## Phase Gates

| Phase                                  | Goal                                                     | AI/engineering can do                                                                                                                                    | Client/human must provide                                                   | Exit gate                                                               |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0. Governance alignment                | Make the repo route to the three purchased products.     | Update routing docs, product docs, blockers, and status.                                                                                                 | Confirm product names and high-level scope.                                 | `AGENTS.md`, `docs/products/`, plan, workflow, and status are aligned.  |
| 1. Discovery                           | Identify facts, systems, users, and success criteria.    | Prepare interview questions, source inventory templates, and gap log.                                                                                    | Answer product questions and name owners for each system.                   | All critical unknowns are either answered or listed as blockers.        |
| 2. Access and accounts                 | Establish admin paths without secrets in git.            | Prepare env templates, preflight scripts, and least-privilege role checklist.                                                                            | Grant named Workspace, GCP/Firebase, Drive, Gmail, and provider access.     | Admin access works and is recorded without credentials.                 |
| 3. Integration capability verification | Prove each intended integration can be used safely.      | Run non-destructive API checks and smoke tests; verify per-vendor roles, event mode, and maintenance-first order per `docs/integration-architecture.md`. | Approve scopes, senders, representative scenarios, and named sandboxes.     | Each integration is verified, rejected, or moved to research backlog.   |
| 4. Source inventory                    | Identify approved source material and sensitivity.       | Build manifests and source-state records.                                                                                                                | Provide approved docs, folders, owners, and sensitivity decisions.          | Each active source has owner, state, location, and allowed use.         |
| 5. Security model                      | Define permissions by product and role.                  | Document role mappings, no-write boundaries, and audit points.                                                                                           | Approve user list, send authority, Drive access, and operational ownership. | Role matrix is approved and testable.                                   |
| 6. Environment setup                   | Keep Production Live-only and rehearsal local.           | Maintain the explicit local descriptor/effect fence and staged Production release path.                                                                  | Provide client-owned Production project, billing, domains, and users.       | Production preflight and exact local descriptor/refusal checks pass.    |
| 7. Product build planning              | Convert requirements into buildable tickets.             | Create acceptance criteria, tests, and blocked/unblocked work queues.                                                                                    | Confirm what belongs in v1 for each product.                                | No runtime work begins without a product-lane acceptance gate.          |
| 8. Migration and cutover prep          | Prepare approved data and operating procedure migration. | Plan imports, dry-runs, source metadata, and rollback.                                                                                                   | Approve final source set and operating calendar.                            | Dry-run import and smoke plan pass.                                     |
| 9. Acceptance and training             | Prove the products with real users.                      | Run test matrix, capture issues, update docs.                                                                                                            | Dan, Bailey, and named operators complete acceptance tasks.                 | User acceptance and security gates pass.                                |
| 10. Production cutover and monitoring  | Launch with support and rollback.                        | Deploy, smoke, monitor, update status.                                                                                                                   | Approve go-live, monitor owners, and support window.                        | Production smoke passes; monitoring and next iteration list are active. |

## Product-Specific Cutover Notes

| Product                 | Current cutover posture                                                                                                                                                                                                                    | Primary blockers                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| PMI KC KB               | Live-only Production serves from `pmi-kc-app` at `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`; the old service is absent. Local rehearsal is explicit Demo + Live-read-only and effect-refused.                                            | Only exact remaining provider/source dependencies; hosted Demo and a fixture seeder are deferred. |
| Lease Renewal Agent     | The integrated Live desk and ordinary app-plane runs are active; each provider action remains independently gated. Rentvine lease-renewal writeback still lacks a documented write endpoint.                                               | Exact provider contract/mapping/credential evidence for each action selected for activation.      |
| Workflow Communications | Workflow-linked staff Gmail transport is proven and governed; it is not a general inbox. Live Vendor mailbox activation remains per assigned Vendor with same-address OAuth/vault. Deterministic mailbox fixtures are automated-test only. | Per-Vendor OAuth/vault setup and any exact action-specific dependency not already documented.     |

## Integration Rules

- Prefer read-only verification first.
- Follow the verified tool roles and build order in `docs/integration-architecture.md`:
  Maintenance Work Order Intake is the first executable-write target (documented Rentvine
  work-order writes plus the LeadSimple Rentvine maintenance sync); the Rentvine
  lease-renewal writeback stays non-executable until vendor-confirmed and approved.
- Verify state-change ingestion by documented mode: webhooks for Dotloop and QuickBooks,
  polling or LeadSimple sync for Rentvine, Apps Script triggers for Sheets.
- Catalog every external action type in the Action Registry and activate only the exact named key
  after its contract, mapping, identity, preview, confirmation, receipt, reconciliation, monitoring,
  and rollback evidence are documented.
- Use dry-run commands before imports, deployment, or label setup. Deterministic seeding is confined
  to emulator-backed automated tests and never creates a product lane.
- Once local verification and cutover prep are green, stop adding local product surface
  unless it directly fixes a migration, acceptance, or known quality issue.
- Do not create or restore a Production Test lane. Invented aliases, fake providers, fixtures, and
  synthetic receipts stay under automated tests/helpers only.
- Do not provision a hosted Demo project or fixture seeder while
  `F-DEMO-DEFERRED-LOCAL-FIRST` remains active. Local rehearsal must keep the exact explicit
  Demo + Live-read-only descriptor and refuse durable/provider effects.
- Production sources must be approved PMI KC-owned files or approved safe summaries.
- Record every meaningful cutover action in `docs/status.md`.

## Rollback Model

- PMI KC KB: route `pmi-kc-app` traffic to the captured predecessor revision, verify the exact
  `307/200/307` boundary smoke, and leave source folders and Live records untouched. The deleted
  `pmi-kc-kb-demo` service is not a rollback target.
- Lease Renewal Agent: roll back the application revision for app-plane defects; use each activated
  provider action's correction/rollback contract for an external effect. There is no standalone
  agent runtime.
- Workflow Communications: preserve Gmail as the message system of record, use the exact action's
  disable/correction path, and roll back the application revision when appropriate. Do not infer a
  general mailbox or bulk-label rollback operation.
