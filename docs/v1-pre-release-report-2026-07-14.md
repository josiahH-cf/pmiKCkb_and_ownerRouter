# Historical Final-V1 pre-release report (superseded)

> Historical snapshot from 2026-07-14. Its all-providers-live, mandatory TTL/scheduler,
> named-signoff, `Pre-V1`, and 169-gate conclusions are superseded by `F-WORKING-APP-V1` and the
> 2026-07-15 working-application report. Retain this file only to explain the earlier verifier output;
> do not use it as current release governance.

Date: 2026-07-14. Release state: **pre-V1 / local candidate**. This report is a readiness artifact, not
live authority and not final V1 acceptance.

## Local completion ledger

| Suite                     | State                        | Local evidence                                                                                                                                                                                                                                                                                                        | Remaining acceptance boundary                                                                                                                                                         |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S20 execution authority   | Local green                  | Immutable preview/target-context approval, canonical cross-actor one-attempt ledger, strict receipt/reconciliation boundary, and adversarial tests                                                                                                                                                                    | Per-action Registry promotion and live proof                                                                                                                                          |
| S21 trusted publication   | Local green                  | Bounded streaming intake, declared/actual length checks, hash-verified 384 KiB chunks, concurrent monotonic version allocation, commit-time policy revalidation, and content-bound rollback with a transactional current-policy reread                                                                                | Production roots/scanners/import/index proof                                                                                                                                          |
| S22 Vendor portal/mailbox | Local green                  | Typed synthetic invite→TOTP→assigned ticket→PKCE/OAuth/vault→mail→disable/revoke journey; immutable invited-email equality rechecked at OAuth start/callback/pre-vault/final-save with mid-flight secret cleanup; negative scope tests                                                                                | Live identity/TOTP/invite/OAuth/vault/Vendor acceptance                                                                                                                               |
| S23 Console data boundary | Local green                  | Server-selected live/test providers, provenance, bounded snippets, no production fixtures, local desktop/phone rendering                                                                                                                                                                                              | Production provider wiring and deployed role/failure-path browser acceptance                                                                                                          |
| S24 Communications policy | Local green                  | Canonical Firestore Date TTL plus numeric query field, dual-null hold, frozen-plan cleanup with complete processed/failed accounting, seven-year cleanup-ledger target, three immutable artifacts, and transient AI reply policy                                                                                      | TTL/index/scheduler activation, legacy migration, and authoritative runtime sources                                                                                                   |
| S25 Lease execution       | Gated — local boundary green | All 11 typed adapters run through the local-only one-attempt orchestrator with exact previews/receipts; the S20 queue bridge is separately covered by adversarial tests                                                                                                                                               | Real account contracts/mappings, permitted proofs, promotion, acceptance for every action                                                                                             |
| S26 Maintenance execution | Gated — local boundary green | All 19 typed Vendor/Drive/Rentvine/mail/LeadSimple/QuickBooks adapters run through that local-only kernel; S20/S22 authority seams are separately covered by negative tests                                                                                                                                           | Real account contracts/mappings, permitted proofs, promotion, acceptance for every action                                                                                             |
| S27 release acceptance    | Gated — local boundary green | Production-only manifest verifier with canonical globally unique evidence, candidate-bound acceptance hashes, conflict-suppressing canonical-project/Gmail/location/corpus command guard, pre-V1 banner, integrated synthetic API/E2E, local eight-surface browser render, and captured-prior-revision rollback guard | Manifest-bound deployment/smoke evidence, live proofs, authoritative pins/evidence, signed-in deployed browser run, dependency disposition, rollback rehearsal, Dan/Josiah acceptance |

`lib/release/manifest.ts` is the machine-readable schema/verifier. It pins the Registry hash and rejects
missing S20–S26 evidence, required action keys, per-action production proof/monitor/rollback, canonical
evidence reuse/path aliases, Registry closure/drift, or either named acceptance unless both carry the
exact release-identity hash over the candidate pins and proofs. The 11 Lease plus 19 Maintenance suite
memberships yield 29 unique required action proofs because `gmail.thread.reply` is shared. The current
builder deliberately returns a failing pre-V1 manifest. The local Admin fake-acceptance endpoint is
demo-only and returns 404 in production.

`lib/release/synthetic-execution.ts` and `lib/release/synthetic-vendor-acceptance.ts` use only invented
`example.invalid` aliases and fake provider state. They exercise the real typed domain adapters and
exact action preview schemas, not generic success stubs. The execution boundary rejects fake providers
outside an explicitly local test/demo environment, rejects production Registry overrides and schema or
risk lowering, and requires same-workflow dependency receipts. These results are safe regression
evidence only; they are deliberately unacceptable as release-manifest provider proof.

The suite memberships are 11 S25 actions plus 19 S26 actions, but the release manifest requires 29
unique action proofs because `gmail.thread.reply` is shared. Keep membership totals distinct from the
machine-readable unique-action count; the local report currently accepts and production-allows zero.

Run `npm run release:manifest-report` for the current bodyless pre-V1 manifest result. Use
`docs/v1-client-unblock-checklist-2026-07-14.md` for the exact recommended evidence, owner, secret
location label, first proof, and correction path for each remaining row.

The 2026-07-14 Local browser regression used only a demo project and isolated loopback Firestore
emulator. All eight surfaces rendered with the Pre-V1 label at 1440×900 and 390×844, the checked phone
documents had no horizontal overflow, Lease and Maintenance showed action-level readiness, and fresh
page logs were clean. It also found and fixed the internal-cookie-to-Vendor-route error path. No live
read or write occurred. This does not cover approved production records, every role/failure/recovery
case, keyboard acceptance, or a pinned deployed revision, so those S27 browser gates remain open.

On 2026-07-15, code-only deployment authority was separately granted and exercised. Commit
`0dc0c7aa7be600e1097e80de448227917dc9101a` built successfully as Cloud Build
`9ae6958b-ec8c-48ef-bf0b-46dbe8194880` and is serving 100% of traffic as revision
`pmi-kc-kb-demo-00021-bj8`; `pmi-kc-kb-demo-00020-24d` is the captured prior revision. Public staff and
Vendor sign-in plus fail-closed UI/API authentication smoke passed. No signed-in role/provider action,
Registry promotion, import, cloud configuration, rules/index/TTL/scheduler change, or rollback rehearsal
occurred, so this receipt closes no final-V1 suite/action/acceptance gate by itself.

## Current verification evidence

The 2026-07-15 exact-worktree milestone is green. `bash scripts/verify.sh` passed clean install,
formatting, lint (zero errors/eight existing test-mock warnings), typecheck, 286 unit files / 1,984
tests, router/falsification/context/traceability/redaction gates, and the production build. Separate
Firestore acceptance passed 16 files / 56 tests on an isolated emulator port; core E2E passed 8 files
and 32 tests with 3 files / 18 scenarios intentionally skipped. `npm run cutover:dry-run -- --json`
passed every gate. `npm run release:manifest-report` correctly reports 29 unique required action
proofs, 0 accepted, 0 production-allowed, and 169 open gates. `npm audit --json` reports three Moderate
dev-only findings in the `firebase-tools` chain and no High/Critical finding; their final named,
time-bounded disposition remains an S27 acceptance item. The separately completed deployment is Ready
at 100% traffic, and its unauthenticated staff/Vendor boundary smoke is green; signed-in role, provider,
failure/recovery, full browser, and manifest-bound acceptance evidence remains open.

## Exact hard-stop packets

All packets target a future separately authorized sandbox or production environment; current cost is
`$0` and no provider call occurred. Before each future step: identify the approved record, run the
budget guard (and ADC check for Google), approve only that action, retain the immutable idempotency key
and one-attempt rule, capture a bodyless receipt/readback, then close the action and use the named
correction path on failure. Josiah owns technical execution/monitor/rollback; Dan owns business result
acceptance. Vendor self-consent applies only to that Vendor mailbox.

| Action key                                  | Required data and permission/contract before any proof                                                          | Evidence and rollback/correction gate                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vendor.account.invite`                     | Approved Vendor email/ticket; Identity Platform setup link + TOTP configuration; Admin exact approval           | Current evidence is fake-only and insufficient; bounded proof must show invite/TOTP, then disable Auth, revoke sessions/tokens, and retain audit |
| `vendor.account.disable`                    | Approved Vendor id/reason; Identity Admin permission                                                            | Prove immediate denial; break-glass re-enable only after review                                                                                  |
| `vendor.assignment.change`                  | Approved Vendor/ticket join; Admin authority                                                                    | Prove old assignment 404/new assignment only; reverse with a new audited assignment                                                              |
| `vendor.gmail.connect`                      | Same verified Vendor Gmail/Workspace address; exact OAuth client/redirect/four scopes/offline consent and vault | Prove state/PKCE/scope/address; revoke grant and destroy vault secret                                                                            |
| `vendor.gmail.revoke`                       | Exact Vendor/mailbox/grant; Vendor self-revoke or Admin approval                                                | Prove token/watch destruction; reconnect only through new consent                                                                                |
| `vendor.gmail.health`                       | Exact Vendor vault reference and scoped health endpoint                                                         | Bodyless health proof; close mailbox actions on drift                                                                                            |
| `vendor.gmail.thread.read`                  | Active assignment and linked thread; Vendor OAuth read scope                                                    | Assigned-thread-only proof; revoke/close on leakage or scope drift                                                                               |
| `vendor.gmail.draft.create`                 | Active assignment, linked thread, authoritative recipient/body; compose scope                                   | Provider-fetched canonical artifact/recipient/body/thread payload hash plus draft ID; delete unsent draft                                        |
| `vendor.gmail.thread.reply`                 | Same plus exact actor/mailbox/ticket/thread/body/RFC Message-ID confirmation                                    | Exact RFC Message-ID plus provider-fetched canonical payload hash; reconcile ambiguity, then reviewed correction reply                           |
| `vendor.gmail.label.apply`                  | Active assignment, linked thread, governed label; modify scope                                                  | Label readback; restore prior governed labels                                                                                                    |
| `gmail.renewal_notice.draft_create`         | Authorized internal mailbox, authoritative renewal recipient/values, S24 artifact                               | Provider-fetched canonical artifact/recipient/sender/subject/body payload hash plus draft ID; delete unsent draft                                |
| `gmail.renewal_notice.send`                 | Same plus exact human confirmation and Gmail send authority                                                     | Exact RFC Message-ID plus provider-fetched canonical payload hash; reconcile ambiguity/correct on linked thread                                  |
| `gmail.thread.reply`                        | Authorized linked renewal or maintenance thread and exact confirmation                                          | Exact RFC Message-ID plus provider-fetched canonical artifact/recipient/body/thread payload hash; reconcile before correction                    |
| `gmail.label.apply`                         | Authorized linked thread and governed label mapping                                                             | Label readback; restore prior governed labels                                                                                                    |
| `google_sheets.renewal_checklist.writeback` | Approved operating Sheet/range/row/cell mapping, expected value, Sheets write permission, Admin approval        | CAS + readback hashes; new proposal restores prior verified value                                                                                |
| `rentvine.lease.renewal_writeback`          | Official account renewal endpoint/schema/rent-date-fee semantics, IDs, credential, Admin approval               | Exact pre-read/full post-read plus idempotency-key reconciliation; documented correction only—no endpoint guessing                               |
| `dotloop.loop.create_from_template`         | Approved account/template/participant mapping, API plan/credential, Admin approval                              | Loop receipt/reconcile; documented archive/correction                                                                                            |
| `dotloop.document.upload`                   | Approved loop/document/type/source and upload contract, Admin approval                                          | Document receipt/hash; remove or supersede through documented correction                                                                         |
| `rentvine.renewal.portal_message.send`      | Official portal-thread/message contract, authoritative recipient/thread, exact confirmation                     | Separate portal receipt; reviewed correction on same thread                                                                                      |
| `sms.renewal_message.send`                  | PMI KC-selected documented SMS provider/number/consent contract and exact confirmation                          | Consent bound to exact recipient/sender/workflow plus separate receipt; provider-thread correction; never infer email success                    |
| `boom.resident.enroll`                      | Explicit applicability rule, resident/account mapping, Boom contract/credential, Admin approval                 | Enrollment/readback or audited not-applicable; documented de-enroll/correction                                                                   |
| `google_drive.maintenance_photo.store`      | Configured ticket folder, assigned actor, validated/scanned image, Drive scope                                  | File id/hash in exact folder; quarantine/correct—no overwrite/delete without High approval                                                       |
| `rentvine.work_order.create`                | Official create contract, authoritative unit/issue/priority/trade/vendor IDs, credential, Admin approval        | Work-order receipt/readback; documented correction, no blind retry                                                                               |
| `rentvine.work_order.assign_vendor`         | Official assignment contract/current work order/vendor state, Admin approval                                    | Assignment readback; new reviewed assignment correction                                                                                          |
| `rentvine.work_order.update_status`         | Official transition/close contract, current state and completion/financial checks, Admin approval               | Status readback; documented corrective transition                                                                                                |
| `gmail.maintenance_owner_notice.send`       | Authoritative owner recipient/unit/values, internal mailbox, `maintenance-owner:v1.0`, exact confirmation       | Exact RFC Message-ID plus provider-fetched canonical artifact/recipient/sender/subject/body payload hash; reconcile/correct                      |
| `leadsimple.process.update_stage`           | Documented account process/stage mapping, plan/credential, Admin approval                                       | Stage receipt/readback; documented corrective stage                                                                                              |
| `leadsimple.task.create`                    | Documented process/task mapping and exact parent, Admin approval                                                | Task receipt/reconcile; close/correct through provider contract                                                                                  |
| `quickbooks.bill.create_draft`              | Exact Vendor/amount/account/work-order/property/unit mapping, accounting permission, Admin approval             | Draft Bill receipt/readback; void/delete draft per contract—never post/pay/bank/ledger                                                           |

Production source roots/scanners, S23 live providers, S24 TTL/scheduler, candidate-bound signed-in
smoke/browser evidence across seven internal tabs plus the Vendor portal, dependency/security
disposition, rollback rehearsal, and final Dan/Josiah signatures are additional release gates. The
recorded code-only deployment alone closes none of them; none can be inferred from local green tests or
product inclusion.

## Next executable action

No further honest provider adapter can be implemented without inventing an account contract or mapping.
Select one row from `docs/v1-client-unblock-checklist-2026-07-14.md`, keep its recommended closed default,
and collect only the named non-secret contract/mapping and credential-owner/location evidence. After a
separate approval, run that row's bounded proof in the explicitly permitted environment, capture a
bodyless receipt/readback plus monitor/correction evidence, and submit only that Registry action for code
review. If the external row is unavailable, work another independent row; never open or promote an
unrelated action.
