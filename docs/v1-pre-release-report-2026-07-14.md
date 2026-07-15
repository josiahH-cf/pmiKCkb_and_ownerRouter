# Final-V1 pre-release report

Date: 2026-07-14. Release state: **pre-V1 / local candidate**. This report is a readiness artifact, not
live authority and not final V1 acceptance.

## Local completion ledger

| Suite                     | State                        | Local evidence                                                                                                  | Remaining acceptance boundary                                                                      |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| S20 execution authority   | Local green                  | Immutable preview/approval/one-attempt ledger and adversarial tests                                             | Per-action Registry promotion and live proof                                                       |
| S21 trusted publication   | Local green                  | Versioned policy/scanner/rollback boundary and tests                                                            | Production roots/scanners/import/index proof                                                       |
| S22 Vendor portal/mailbox | Local green                  | Separate Vendor claims, TOTP gate, assignment 404, OAuth/vault seam, revocation, fake Gmail                     | Live identity/TOTP/invite/OAuth/vault/Vendor acceptance                                            |
| S23 Console data boundary | Local green                  | Server-selected live/test providers, provenance, bounded snippets, no production fixtures                       | Production provider wiring and browser acceptance                                                  |
| S24 Communications policy | Local green                  | Versioned retention/hold and three immutable artifacts plus transient AI reply policy                           | TTL/scheduler activation and authoritative runtime sources                                         |
| S25 Lease execution       | Gated — local boundary green | 11-action graph, providers/fakes, previews, one attempt, receipts, reconciliation, focused and integrated tests | Real account contracts/mappings, permitted proofs, promotion, acceptance for every action          |
| S26 Maintenance execution | Gated — local boundary green | 19-action graph, Vendor/Drive/Rentvine/mail/LeadSimple/QuickBooks fakes and negative tests                      | Real account contracts/mappings, permitted proofs, promotion, acceptance for every action          |
| S27 release acceptance    | Gated — local boundary green | Manifest verifier, pre-V1 banner, integrated fake API/E2E, this ledger, browser and rollback plans              | Deploy/live proofs, browser run, dependency disposition, rollback rehearsal, Dan/Josiah acceptance |

`lib/release/manifest.ts` is the machine-readable schema/verifier. It pins the Registry hash and rejects
missing S20–S26 evidence, required action keys, per-action production proof/monitor/rollback, Registry
closure/drift, or either named acceptance. The current builder deliberately returns a failing pre-V1
manifest. The local Admin fake-acceptance endpoint is demo-only and returns 404 in production.

## Exact hard-stop packets

All packets target a future separately authorized sandbox or production environment; current cost is
`$0` and no provider call occurred. Before each future step: identify the approved record, run the
budget guard (and ADC check for Google), approve only that action, retain the immutable idempotency key
and one-attempt rule, capture a bodyless receipt/readback, then close the action and use the named
correction path on failure. Josiah owns technical execution/monitor/rollback; Dan owns business result
acceptance. Vendor self-consent applies only to that Vendor mailbox.

| Action key                                  | Required data and permission/contract before any proof                                                          | Evidence and rollback/correction gate                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `vendor.account.invite`                     | Approved Vendor email/ticket; Identity Platform setup link + TOTP configuration; Admin exact approval           | Fake acceptance only; disable Auth, revoke sessions/tokens, retain audit                   |
| `vendor.account.disable`                    | Approved Vendor id/reason; Identity Admin permission                                                            | Prove immediate denial; break-glass re-enable only after review                            |
| `vendor.assignment.change`                  | Approved Vendor/ticket join; Admin authority                                                                    | Prove old assignment 404/new assignment only; reverse with a new audited assignment        |
| `vendor.gmail.connect`                      | Same verified Vendor Gmail/Workspace address; exact OAuth client/redirect/four scopes/offline consent and vault | Prove state/PKCE/scope/address; revoke grant and destroy vault secret                      |
| `vendor.gmail.revoke`                       | Exact Vendor/mailbox/grant; Vendor self-revoke or Admin approval                                                | Prove token/watch destruction; reconnect only through new consent                          |
| `vendor.gmail.health`                       | Exact Vendor vault reference and scoped health endpoint                                                         | Bodyless health proof; close mailbox actions on drift                                      |
| `vendor.gmail.thread.read`                  | Active assignment and linked thread; Vendor OAuth read scope                                                    | Assigned-thread-only proof; revoke/close on leakage or scope drift                         |
| `vendor.gmail.draft.create`                 | Active assignment, linked thread, authoritative recipient/body; compose scope                                   | Draft id/hash proof; delete unsent draft                                                   |
| `vendor.gmail.thread.reply`                 | Same plus exact actor/mailbox/ticket/thread/body/RFC Message-ID confirmation                                    | One send receipt; reconcile ambiguity, then reviewed correction reply                      |
| `vendor.gmail.label.apply`                  | Active assignment, linked thread, governed label; modify scope                                                  | Label readback; restore prior governed labels                                              |
| `gmail.renewal_notice.draft_create`         | Authorized internal mailbox, authoritative renewal recipient/values, S24 artifact                               | Draft id/hash; delete unsent draft                                                         |
| `gmail.renewal_notice.send`                 | Same plus exact human confirmation and Gmail send authority                                                     | RFC Message-ID; reconcile ambiguity/correct on linked thread                               |
| `gmail.thread.reply`                        | Authorized linked renewal or maintenance thread and exact confirmation                                          | Message receipt; reconcile before reviewed corrective reply                                |
| `gmail.label.apply`                         | Authorized linked thread and governed label mapping                                                             | Label readback; restore prior governed labels                                              |
| `google_sheets.renewal_checklist.writeback` | Approved operating Sheet/range/row/cell mapping, expected value, Sheets write permission, Admin approval        | CAS + readback hashes; new proposal restores prior verified value                          |
| `rentvine.lease.renewal_writeback`          | Official account renewal endpoint/schema/rent-date-fee semantics, IDs, credential, Admin approval               | Provider receipt/readback; documented Rentvine correction only—no endpoint guessing        |
| `dotloop.loop.create_from_template`         | Approved account/template/participant mapping, API plan/credential, Admin approval                              | Loop receipt/reconcile; documented archive/correction                                      |
| `dotloop.document.upload`                   | Approved loop/document/type/source and upload contract, Admin approval                                          | Document receipt/hash; remove or supersede through documented correction                   |
| `rentvine.renewal.portal_message.send`      | Official portal-thread/message contract, authoritative recipient/thread, exact confirmation                     | Separate portal receipt; reviewed correction on same thread                                |
| `sms.renewal_message.send`                  | PMI KC-selected documented SMS provider/number/consent contract and exact confirmation                          | Separate SMS receipt; provider-thread correction; never infer email success                |
| `boom.resident.enroll`                      | Explicit applicability rule, resident/account mapping, Boom contract/credential, Admin approval                 | Enrollment/readback or audited not-applicable; documented de-enroll/correction             |
| `google_drive.maintenance_photo.store`      | Configured ticket folder, assigned actor, validated/scanned image, Drive scope                                  | File id/hash in exact folder; quarantine/correct—no overwrite/delete without High approval |
| `rentvine.work_order.create`                | Official create contract, authoritative unit/issue/priority/trade/vendor IDs, credential, Admin approval        | Work-order receipt/readback; documented correction, no blind retry                         |
| `rentvine.work_order.assign_vendor`         | Official assignment contract/current work order/vendor state, Admin approval                                    | Assignment readback; new reviewed assignment correction                                    |
| `rentvine.work_order.update_status`         | Official transition/close contract, current state and completion/financial checks, Admin approval               | Status readback; documented corrective transition                                          |
| `gmail.maintenance_owner_notice.send`       | Authoritative owner recipient/unit/values, internal mailbox, `maintenance-owner:v1.0`, exact confirmation       | Gmail receipt; reconcile/correct on linked thread                                          |
| `leadsimple.process.update_stage`           | Documented account process/stage mapping, plan/credential, Admin approval                                       | Stage receipt/readback; documented corrective stage                                        |
| `leadsimple.task.create`                    | Documented process/task mapping and exact parent, Admin approval                                                | Task receipt/reconcile; close/correct through provider contract                            |
| `quickbooks.bill.create_draft`              | Exact Vendor/amount/account/work-order/property/unit mapping, accounting permission, Admin approval             | Draft Bill receipt/readback; void/delete draft per contract—never post/pay/bank/ledger     |

Production source roots/scanners, S23 live providers, S24 TTL/scheduler, an approved deployment, seven
internal tab plus Vendor portal browser acceptance, dependency/security disposition, rollback rehearsal,
and final Dan/Josiah signatures are additional release gates. None can be inferred from local green
tests or product inclusion.

## Next executable action

No further honest provider adapter can be implemented without inventing an account contract or mapping.
The next `/loop` action is to prepare the first separately authorized S25 Gmail renewal proof packet:
confirm the authoritative renewal recipient/value mapping and approved internal mailbox for
`gmail.renewal_notice.draft_create`, then obtain exact permission for a bounded non-customer or approved
record proof. If that external gate is not available, take the next packet in the table without opening
or promoting any unrelated action.
