# V1 tab and browser acceptance plan

Date: 2026-07-15. Status: **working-app acceptance plan**.

V1 acceptance proves that the deployed application can be used end to end. It does not require every
future external provider to be Live. Provider activation is inventoried independently, and an
unconfigured provider must appear honestly as unavailable while the production Test workspace proves
the corresponding application workflow without contacting that provider.

Run each applicable surface at desktop (1440×900) and phone (390×844). Verify keyboard focus,
readable state, no horizontal dead end, no secret/customer content in URLs or audit, and an always-
visible `Live` or `Test` marker wherever a record or action can write.

## Acceptance identities and records

- Internal Admin and scoped Editor accounts use `pmikcmetro.com` Firebase sign-in.
- Test Maintenance uses unit `unit:test-maple-204`, displayed as
  `TEST — 204 Maple Court Unit 2`.
- Test Vendor uses `vendor:test-summit-plumbing`, displayed as
  `Summit Plumbing Test Vendor`, with the non-routable address
  `service@summit-plumbing.example.invalid`.
- Test records persist in production Firestore and may reach Done. Every Test receipt says no provider
  was contacted and is not eligible as Live-provider proof.
- A Live action requires an exact target-labeled preview and human confirmation. Exercise a Live write
  only when that exact provider action is enabled and configured.

## Surface walkthrough

| Surface                 | Working V1 path                                                                                                                                             | Required failure/recovery path                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Console                 | Show Live operational data and the isolated Test workspace together, with freshness/provenance and a clear mode badge                                       | Provider outage is visibly unavailable; no Test fallback is presented as Live                                               |
| Spaces / Ask            | Open an authorized Space; return a cited source-backed answer; show `No Reliable Source Found` when unsupported                                             | Wrong Space or missing source fails closed without a generic property-management answer                                     |
| Approval Queue          | Open an item, review exact action/target/reason, and approve/return/snooze within role                                                                      | Stale, revoked, returned, or blocked work cannot execute or silently self-heal                                              |
| Workflow Communications | Open a workflow-linked thread/artifact, review source-visible content, and exact-confirm a permitted action                                                 | Wrong mailbox/thread/recipient, expired confirmation, duplicate click, or ambiguous send refuses                            |
| Lease Renewal           | Run the production Test journey through the typed actions and receipts; show each separately activated Live provider                                        | Unavailable provider stays named/unavailable; Test completion never marks that provider Live-proven                         |
| Maintenance             | Seed the canonical Test ticket, move intake through assignment/status/activity/notes/receipts to Done                                                       | Cross-mode assignment, stale state, invalid file, or unavailable Live provider refuses with correction guidance             |
| Connections             | Show each provider's independent state and the action keys it enables                                                                                       | Missing contract, credential, mapping, health, or scope closes only the dependent Live action                               |
| Admin                   | Manage staff roles, source policy, Test Vendor provision/disable, Test workspace, and release/provider status with reasons                                  | Editor/Vendor denied; duplicate provision and partial identity failure expose reconciliation/cleanup                        |
| Notifications           | Open a relevant item into its exact governed workflow                                                                                                       | Cross-Space, stale, missing target, or read-state failure does not leak or dead-end                                         |
| Vendor portal           | Complete Test password setup and TOTP, then view only the assigned Test ticket and app-only mailbox; for Live, use same-address OAuth only after activation | Guessed/deassigned/disabled/cross-mode ticket is indistinguishable 404; Test identity cannot start OAuth or send externally |

## Write acceptance

For both Lease and Maintenance, exercise preview, role/risk, exact confirmation or approval,
one-attempt receipt, duplicate click, stale-state refusal, ambiguous-result reconciliation, and
correction. For Test mode, assert `provider_contacted=false` and `live_proof_eligible=false` on every
receipt. For a Live action, assert the named target, provider reference, and read-after-write result.

No acceptance step permits generic inbox browsing, free-form compose, autonomous/scheduled/bulk/
model-triggered sends, a guessed provider endpoint, QuickBooks post/pay, or destructive photo
replacement/deletion.

## Completion record

Capture bodyless evidence: commit/revision, route, role, viewport, mode, action key, timestamp,
expected/actual state, receipt hash, provider contacted yes/no, and rollback result. A business or
technical owner may record observations, but a missing named signature does not make a working app
unready.

Application acceptance is complete when the deployed core surfaces and production Test journeys pass
and rollback is rehearsed. Each Live provider advances separately from unavailable/test-ready to
live-configured/live-proven/enabled after its own bounded proof; inactive future providers do not reopen
V1 application readiness.
