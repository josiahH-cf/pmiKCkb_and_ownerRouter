# PMI KC V1 gap implementation program

Decision source: the owner's 2026-07-14 Round 3 response in
`docs/v1-readiness-audit-round-3-2026-07-14.html`. This is the durable, runner-neutral packet for an
outside session triggered with `/loop`, “run the loop,” or “implement the V1 gaps.” It replaces the
Round 3 question-gathering phase. It does not authorize a live send, external mutation, account
provisioning, mailbox connection, deploy, or production smoke.

## End state

The release may be called **V1** only when all S20–S27 acceptance checks pass, every R02/R03 action is
implemented and proven end to end in its permitted environment, the external Vendor portal passes
assigned-ticket acceptance, and Dan/Josiah complete their business/technical acceptance. Intermediate
deployments are **pre-V1**.

## Locked decisions

- Internal Editors directly execute enabled Low/Medium instances. High/consequential writes require
  Admin approval. Admin may approve and execute their own proposal at every risk. A technical
  `Blocked` state cannot be waived merely by approval.
- Every Lease Renewal action in R02 and Maintenance action in R03 is final-V1 scope.
- Validation-passing Editor source/process additions publish immediately inside the configured trust
  boundary, with version, rollback, and audit. Content can never grant a role or enable an action.
- Vendors are external, assigned-ticket-only Firebase users. Admin invites; the Vendor receives a
  one-time setup link; verified-email TOTP MFA gates ticket details and Gmail OAuth. V1 supports
  vendor-owned Gmail/Google Workspace through per-vendor OAuth only.
- The listed retention defaults and legal-hold override are approved. The current three scaffold
  generators become version `v1.0`; AI may rewrite only from authorized context and verified value
  replacements, and every send is exact-confirmed by a human.
- Console shows bounded message metadata/snippet inline and full body only in an authorized workflow
  communication panel. Production has no fixture fallback.

## Dependency order for `/loop`

| Slice | Suite | Safe unattended outcome                                                                                                                         | Stop before                                                                    |
| ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1     | S20   | Risk classification, Editor/Admin authority, proposal/execution state machine, audit, tests                                                     | Any Registry flip or live action                                               |
| 2     | S21   | Bounded stream/chunk storage, trusted validator, fenced local scanner, version/ref reuse/rollback/audit                                         | Production connector/root/scanner changes                                      |
| 3     | S23   | Live-only Console contracts, scoped detail panel, fixture fencing, failure states                                                               | Live customer/Gmail read                                                       |
| 4     | S24   | Date/Timestamp TTL plus numeric query schema, bounded crash-resumable emulator-only cleanup worker, dual-null legal hold, v1.0 artifacts/policy | Live index/TTL/scheduler deployment, legacy migration, or Gmail send           |
| 5     | S22   | Vendor auth/assignment/MFA/OAuth app-plane and emulator paths                                                                                   | Real invite, OAuth client/secret, mailbox connection                           |
| 6     | S25   | Exact schemas/S20 bridge plus typed synthetic executors for all 11 R02 action keys, closed by default                                           | Vendor credentials, Registry promotion, SoR writes, or sends                   |
| 7     | S26   | Exact schemas/S20 bridge plus typed synthetic executors for all 19 R03 action keys, closed by default                                           | Credentials, account creation, Registry promotion, Drive/SoR writes            |
| 8     | S27   | Actual-adapter synthetic E2E, hardened manifest/report, pre-V1 labels, local browser render, safe rollback/cutover rehearsal                    | Deploy, deployed browser/live/rollback acceptance, or bounded production proof |

Within S25/S26, implement one external system per slice. Each slice must ship preview, idempotency,
read-after-write or reconciliation, rollback/correction, audit, failure typing, and tests before the
next adapter starts. Vendor-confirmation-required or undocumented APIs may receive a typed disabled
adapter and contract tests, but the action is not “implemented” and V1 cannot close until the real
contract is documented and proven.

The safe local adapter slices are complete as of 2026-07-14: the integrated invented-alias harness
invokes the actual typed executor for all 11 S25 and all 19 S26 action keys, with one attempt and one
bodyless receipt per key, plus the full synthetic S22 Vendor journey and zero live provider calls. This
is local boundary evidence only. The same one-system order now applies to provider contract capture,
exact Registry promotion, sandbox/reversible proof, and bounded production proof; none may be inferred
from the synthetic result.

## Outside-session operating contract

1. Read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, this packet, then S20–S27.
2. Inspect and preserve the dirty worktree. The July 14 Workflow Communications changes are user work.
3. Run `npm run verify:context-freshness` and the focused baseline for the selected suite.
4. Continue through safe local slices without asking again. Update facts/status/plan/loop at every
   slice boundary.
5. Before a live Google read, run `npm run preflight:adc`; if stale, stop and ask the owner to run
   `npm run auth:session` in their terminal.
6. Stop and provide an exact approval packet before any live action named above. Product inclusion is
   not operational authorization.
7. Use fake providers/emulators for customer data and mutations. Commit no Gmail body, customer data,
   token, secret, raw vendor payload, or live identifier.
8. Run focused checks per suite and `bash scripts/verify.sh` at each completed program milestone. Extend
   sentinels; never weaken them.

## Completion ledger

Track each row as `Not started`, `Local green`, `Gated`, `Live-proven`, or `Accepted`. A release row is
`Accepted` only with evidence and rollback.

| Suite | State       | Evidence / next boundary                                                                                                                                                                                                                                                                                                   |
| ----- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S20   | Local green | Shared risk/authority policy, bodyless one-attempt ledger, exact S25/S26 preparation bridge, atomic High queue, Editor Medium Gmail capability; no Registry flip                                                                                                                                                           |
| S21   | Local green | Bounded request stream, 384 KiB integrity chunks, immutable refs/version/rollback reuse/audit, local-demo scanner fence; production root/scanner/import/deploy proof gated                                                                                                                                                 |
| S22   | Local green | Verified-email TOTP Vendor session, assigned-ticket UI/join, invite/OAuth/vault/revoke/fake Gmail; live setup gated                                                                                                                                                                                                        |
| S23   | Local green | Server mode, scoped/provenanced projection, bounded Gmail metadata, test badge/cutover fence; live wiring gated                                                                                                                                                                                                            |
| S24   | Local green | Indexed bounded worker with atomic bodyless run progress, canonical Date/Timestamp TTL, dual-null hold, emulator-only CLI, three immutable artifacts, transient source-backed AI reply; production migration/TTL/mappings gated                                                                                            |
| S25   | Gated       | Exact schemas and actual typed adapters for all 11 keys pass invented-alias one-attempt/receipt acceptance; real contracts/mappings/proofs/promotion/acceptance pending                                                                                                                                                    |
| S26   | Gated       | Exact schemas and actual typed adapters for all 19 keys pass invented-alias one-attempt/receipt acceptance; live identity/provider mappings/proofs/promotion pending                                                                                                                                                       |
| S27   | Gated       | Hardened manifest/bodyless report, route-wide pre-V1 labels, synthetic S22/S25/S26 acceptance, local desktop/phone render, notifications-off cutover and prior-revision rollback guard are local green; deploy, pinned role/failure-path browser/live/rollback proof, dependency disposition, and named acceptance pending |

## Hard stop packet format

When a gate is reached, report: exact action key and environment; account/data affected; evidence and
tests already green; permission/credential/provider requirement; expected cost; one-attempt/idempotency
plan; rollback/correction; owner who must approve; and what safe work remains. Do not collapse multiple
systems into a blanket approval request. The current exact rows and recommended closed-by-default
decisions are maintained in `docs/v1-client-unblock-checklist-2026-07-14.md`.
