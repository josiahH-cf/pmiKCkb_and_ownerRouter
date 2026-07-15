# Final-V1 tab and browser acceptance plan

Date: 2026-07-14. Status: **pre-V1; local synthetic and deployed owner evidence are separate**. Local
component, core E2E, or browser checks do not substitute for owner acceptance against a pinned deployed
revision.

For local regression, use only the invented aliases from `lib/release/synthetic-execution.ts`; the
production boundary must refuse fake providers and fixture fallback. For deployed acceptance, resolve
the exact prerequisites in `docs/v1-client-unblock-checklist-2026-07-14.md`, pin the commit/revision and
Registry hash, and capture bodyless evidence only.

Run every surface at desktop (1440×900) and phone (390×844) widths. Verify keyboard focus, readable
source/failure state, no horizontal dead end, no customer/message content in URL or audit, and a visible
`Pre-V1` label until the release manifest accepts every gate.

## Local synthetic regression record

On 2026-07-14, all eight surfaces rendered in the in-app browser at both required widths against an
isolated loopback Firestore emulator and demo project. Each showed the Pre-V1 label; checked phone
documents had no horizontal overflow; Lease and Maintenance showed their action-level provider
readiness lists; and fresh page logs were clean. The run found and fixed one boundary defect: an
internal demo/staff cookie on `/vendor` now fails closed to `/vendor/sign-in` instead of exposing a
Firebase decode error. No live read, write, invite, OAuth, send, deployment, or traffic change occurred.

This record is `Local` only. It does not satisfy the required keyboard, role, unavailable-provider,
failure/recovery, approved-record, or pinned deployed-revision checks below; capture those separately
before Josiah's technical acceptance.

| Surface                 | Roles/scopes                                                  | Success case                                                                                               | Required failure/recovery case                                                                           |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Console                 | Admin, scoped Editor; Vendor denied                           | Live-only operational fields show provenance/freshness; targeted communication opens in its governed panel | Missing/stale provider is visibly unavailable; no fixture fallback or full body inline                   |
| Spaces                  | Admin, scoped Editor; Vendor denied                           | Trusted publication respects connector/root/Space/scanner policy and immutable version                     | Wrong root/type/size/scope/scanner fails closed with correction path                                     |
| Approval Queue          | Admin; Editor sees only permitted work                        | Exact preview/reason/linked execution is clear on desktop/phone                                            | Stale/returned/revoked/technical Blocked cannot execute or self-heal                                     |
| Workflow Communications | authorized internal mailbox/workflow scope                    | Linked thread, governed artifact, source-visible proposal, exact confirmation                              | Wrong mailbox/thread/recipient/source, expired confirmation, duplicate or ambiguous send refuses         |
| Connections             | Admin and appropriately scoped user                           | Each provider shows named health, readiness, and environment                                               | Missing contract/credential/mapping or scope drift stays Blocked, never simulated green                  |
| Admin                   | Admin only                                                    | User/Vendor/policy/hold/release controls require reason and show bounded state                             | Editor/Vendor denied; duplicate invite, last-Admin risk, and partial failure show recovery               |
| Notifications           | signed-in internal roles by scope                             | Relevant attention/decision state opens the exact governed workflow                                        | Cross-Space, stale, missing target, and read-state failure do not leak or dead-end                       |
| Vendor portal           | assigned verified-email+TOTP Vendor; authorized Admin support | Assigned ticket and assigned linked mailbox thread only; exact-confirmed reply                             | Guessed/deassigned/disabled ticket is indistinguishable 404; wrong mailbox/scope/revocation stops access |

For S25 and S26, exercise preview, role/risk, approval or exact confirmation, receipt/read-after-write,
provider unavailability, drift, duplicate click, ambiguous result reconciliation, and correction on the
relevant surface. Dan records business acceptance only after the business/source/template outcomes are
correct. Josiah records technical acceptance only after desktop/phone, monitoring, rollback, OAuth/Gmail
watch, and every per-action proof are green.

Evidence must be non-secret and bodyless: commit/revision, action key, role, browser/viewport, timestamp,
expected/actual state, result/receipt hash, monitor/rollback references, and named acceptor. Do not store
screenshots containing customer records, mail bodies, tokens, or credentials in git.

Record local synthetic results as `Local` only. Record a deployed result only when it names the exact
production revision and environment; neither result is `Accepted` until every action proof, rollback
rehearsal, dependency disposition, and Dan/Josiah signature is present in the release manifest.
