<!-- spec-shape: overhaul-v1 -->

# S26 — Maintenance V1 execution

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R03 and the assigned-ticket
> Vendor workflow. Maintenance intake-through-close and Vendor authentication are application V1;
> each real provider action activates independently.

**Implementation status (2026-07-15): Working app/Test-ready locally.** Production code persists a
canonical invented Maintenance ticket in Firestore, labels it Test, supports normal assignment,
Vendor assignment, status/activity/note transitions, persists isolated Test action receipts, and can
close the ticket. The canonical unit is `unit:test-maple-204` / `TEST — 204 Maple Court Unit 2`; the
Vendor is `vendor:test-summit-plumbing` / `service@summit-plumbing.example.invalid`. The Admin
integrated Test workspace also traverses all 19 typed S26 executors with one attempt/receipt each and
zero Live-provider calls. S22 supplies Firebase password/TOTP and the assigned-ticket Test mailbox.
Live Drive/Rentvine/Gmail/LeadSimple/QuickBooks actions retain separate activation states. Production
deployment/browser acceptance remains to be refreshed; inactive providers do not make the app Pre-V1.

**Goal.** A Maintenance request moves from intake through Test or Live ticket creation, assignment,
activity/evidence, owner/Vendor communication, external-action receipts, and closure while a Vendor
sees only assigned work. The Test journey is complete inside the production app and contacts no
external system. Each enabled Live action is explicit, target-labeled, human-confirmed, one-attempt,
reconciled, and auditable; unavailable providers remain visible without blocking the rest of V1.

**What it is / how it functions.**

| R03 group                        | Canonical action keys                                                                                            | Risk / V1 behavior                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| App account lifecycle            | `vendor.account.invite`, `vendor.account.disable`, `vendor.assignment.change`                                    | Admin exact preview/confirmation; Test Firebase Vendor/app assignment or separately configured Live identity |
| Mailbox lifecycle                | `vendor.gmail.connect`, `vendor.gmail.revoke`, `vendor.gmail.health`                                             | Test app-only mailbox; Live Vendor self-consent/revoke after TOTP; no DWD                                    |
| Drive photos                     | `google_drive.maintenance_photo.store`                                                                           | Medium scanned append-only Live upload; isolated Test receipt; overwrite/delete remains High                 |
| Rentvine create                  | `rentvine.work_order.create`                                                                                     | High Admin-approved Live preview or isolated Test receipt                                                    |
| Rentvine assignment/update/close | `rentvine.work_order.assign_vendor`, `rentvine.work_order.update_status`                                         | High Admin-approved conditional Live transition or isolated Test receipt                                     |
| Owner email                      | `gmail.maintenance_owner_notice.send`, `gmail.thread.reply`                                                      | Medium internal exact-confirmed Live communication or non-delivering Test receipt                            |
| Vendor email                     | `vendor.gmail.thread.read`, `vendor.gmail.draft.create`, `vendor.gmail.thread.reply`, `vendor.gmail.label.apply` | Assigned-ticket Test mailbox or same-address OAuth Live mailbox; exact confirmation on reply                 |
| LeadSimple                       | `leadsimple.process.update_stage`, `leadsimple.task.create`                                                      | High documented Live contract or isolated Test receipt                                                       |
| QuickBooks                       | `quickbooks.bill.create_draft`                                                                                   | High Admin-approved Live draft only or isolated Test receipt; never post/pay                                 |

- **Record/executor lane.** Ticket, Vendor assignment, action input, execution record, idempotency
  identity, mailbox, receipt, and audit carry `live|test`; legacy absence resolves to Live. Test routes
  re-read the persisted ticket and reject Live records before writing. The shared external
  orchestrator refuses Test input on a normal production executor and refuses Live input in the
  isolated Test workspace.
- **Persistent Maintenance Test journey.** An Editor explicitly seeds one canonical Firestore Test
  ticket with invented issue text; no browser-supplied customer/unit/vendor value is accepted. The
  normal Maintenance UI can assign the canonical Test Vendor, change status, add notes/activity, run
  explicit Test actions after confirmation, list receipts, and close the ticket with a reason. Test
  receipts say `provider_contacted:false`, `live_proof_eligible:false` and name the simulated target.
- **Full typed Test coverage.** The Admin production Test workspace invokes all 19 actual executor
  selections against explicitly branded isolated adapters. It proves schemas, dependencies, S20
  authority, one-attempt claims, receipts, idempotency, reconciliation/correction, and failure stops;
  its in-memory run never changes a provider or activation state.
- **Orchestrator — `lib/maintenance/execution/`.** Immutable ticket/action dependency graph with exact
  preview, lane, risk, approval, idempotency, atomic one-attempt claim, receipt/reconciliation,
  correction/rollback, and bodyless audit. External state never becomes true merely because the app
  ticket advanced or a Test receipt exists.
- **S20/S22 boundaries.** S20 owns staff authority and exact High Approval Queue context. S22 owns
  Firebase Vendor password/TOTP, assigned-ticket/mode join, Test mailbox, same-address Live OAuth, and
  disable/revoke. Browser-supplied role/risk/target/lane never becomes authority.
- **Photos.** Enabled Live upload accepts one validated image for the assigned ticket and configured
  folder after size/MIME/malware/sensitivity checks; path/filename are server-derived and content hash
  is reconciled. Replace/delete/move remains High. Test action writes a receipt only—no Drive call or
  placeholder customer file.
- **Rentvine.** Enabled Live create/assign/status/close uses authoritative IDs, allowed transition,
  expected current state, provider-atomic conditional mutation, exact readback, and idempotency
  reconciliation. Unknown mappings, drift, or missing conditional support block that action. Test
  actions never resolve Rentvine.
- **Communication.** Live owner recipient comes from the configured property-owner source; Vendor mail
  stays in an assigned ticket. S24 artifacts and exact confirmation apply. Test owner notices are
  non-delivering receipts, while the Vendor Test mailbox persists draft/label/exact-reply inside the
  app. A message cannot choose a Vendor, approve cost, or transition/close a ticket.
- **LeadSimple/QuickBooks.** Enabled Live actions use documented account contracts only. LeadSimple
  requires expected-stage mutation and exact readback. QuickBooks creates/reconciles one draft Bill
  with exact Vendor, amount/account, work order, property/unit, currency, and `Draft` state. Posting,
  payment, bank, and ledger mutation do not exist. Test receipts never call these providers.
- **Activation model.** Application readiness is proven through persistent Maintenance Test state plus
  the all-action Test workspace. Each Live action independently moves through
  `unavailable|test_ready|live_configured|live_proven|enabled|suspended`; only `enabled` constructs its
  provider. Provider activation never changes a Test receipt into Live evidence.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ all nine R03 groups/all 19 action keys are V1 application features.
- _Answered 2026-07-15:_ Maintenance and Vendor authentication are part of V1; invented production
  Test tickets may persist, move through workflow, collect receipts, and close without Live providers.
- _Default:_ append-only scanned Live ticket-photo upload is Medium; replace/delete/move and folder
  policy changes are High.
- _Default:_ QuickBooks execution means create a draft Bill only; no posting, payment, or funds action.
- _Operational inputs, not product questions:_ non-secret unit/vendor/status/folder/process/account
  mappings and credentials are supplied when each Live action is activated. A provider not used at
  launch may stay unavailable without blocking application acceptance.

**Cross-product impacts.** Evolves Maintenance capture/intake/ticket/activity/assignment/close,
Firestore schemas/rules, S20 authority, S22 Vendor identity/Test mailbox, S24 communications,
data-mode isolation, Action Registry/provider activation, Connector health, Approval Queue, external
clients, environment handoff, S27 reporting, and Admin Test workspace. Supersede markers:
`MAINTENANCE-EXTERNAL-EXECUTION-LATER` and `ALL-MAINTENANCE-PROVIDERS-LIVE-BEFORE-V1`.

**Adversarial acceptance checks.**

- **AC-S26-1** — Registry/catalog/workflow expose all 19 keys with exact schema, dependency, risk,
  lane, health, receipt, correction, and separate application/activation state. Existing enabled Gmail
  actions retain their linked-workflow/artifact/confirmation gates; one provider cannot activate
  another. _Verify:_ `npm test -- maintenance-execution-matrix action-registry-schema
external-execution-boundary`.
- **AC-S26-2** — Vendor assignment, matching data mode, password/TOTP, and active state precede every
  Vendor detail/mail/photo action. Admin account/assignment changes bind exact preview/target/source;
  disable/deassign immediately denies access. Browser role/risk/lane and unallowlisted Test aliases are
  rejected. _Verify:_ `npm test -- vendor-lifecycle vendor-assignment-boundary
maintenance-execution-authority external-execution-s20-bridge`.
- **AC-S26-3** — Live photo upload validates ticket/folder/path/MIME/size/scanner/sensitivity before one
  append and reconciles hash; Test produces only a non-Live receipt. Replace/delete remains High and
  no Test route can call Drive. _Verify:_ `npm test -- maintenance-photo-executor`.
- **AC-S26-4** — Live Rentvine create/assign/status/close uses authoritative IDs, allowed transition,
  Admin approval, expected state, exact post-read, and idempotency reconciliation; Test produces
  isolated receipts. Drift/ambiguity causes no overwrite/retry. _Verify:_ `npm test --
rentvine-work-order-executor`.
- **AC-S26-5** — Live owner initiation uses authoritative recipient and artifact with exact
  confirmation/payload readback; Test uses a visibly non-routable target receipt and zero Gmail calls.
  Duplicate/drift makes at most one attempt. _Verify:_ `npm test -- maintenance-owner-email
maintenance-test-workflow`.
- **AC-S26-6** — Test Vendor password/TOTP and assignment unlock only the matching Test ticket and
  app-only mailbox. Draft/label/reply persist with exact confirmation and no Gmail call. Live Vendor
  mail requires same-address OAuth. AI/message cannot choose Vendor, approve cost, or close. _Verify:_
  `npm test -- vendor-test-mailbox vendor-gmail-boundary maintenance-ai-boundary`.
- **AC-S26-7** — Live LeadSimple updates only a mapped process/stage/task under Admin approval with
  expected-stage mutation/readback and idempotency reconciliation; Test produces an isolated receipt.
  Undocumented endpoint remains unavailable. _Verify:_ `npm test --
leadsimple-maintenance-executor`.
- **AC-S26-8** — Live QuickBooks creates/reconciles one exact draft Bill after Admin approval; post/pay/
  bank/ledger methods do not exist. Test creates only a non-Live receipt. Amount/account/Vendor drift
  blocks. _Verify:_ `npm test -- quickbooks-draft-bill-executor`.
- **AC-S26-9** — Canonical Firestore Test ticket supports create → assign Test Vendor → status/notes/
  activity → explicit Test action receipts → close with no provider calls. The Admin integrated Test
  workspace separately invokes all 19 typed action selections, one attempt/receipt each, and failure
  stops dependencies without cross-ticket leakage. _Verify:_ `npm test --
maintenance-test-workflow maintenance-test-workflow-routes v1-synthetic-execution
v1-production-test-workspace-route`; `npm run test:e2e:core -- maintenance-execution`.
- **AC-S26-10** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run test:firestore`, `npm run verify:redaction`, `npm run build`,
  `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** No Test-to-Live fallback, Test provider call, Test receipt cited as
Live, Vendor internal role/cross-ticket/cross-mode access, DWD, autonomous send, browser/provider-
selected Vendor, cost approval by message, blind transition, photo overwrite/delete without High
authority, QuickBooks post/pay, guessed endpoint, ambiguous retry, or raw values/tokens/content in git/
log/audit. A Live action executes only when its own contract, connection, Registry state, target,
authority, exact confirmation, and reconciliation/correction pass. ~$10 cap.

**Ordered prompt sequence.**

1. _Application acceptance:_ seed the canonical Firestore Test ticket, assign the canonical Test
   Vendor, exercise status/notes/activity/Test receipts, Vendor assigned-ticket mailbox, and close.
2. _Full action acceptance:_ run the Admin production Test workspace across all 19 action keys with
   one-attempt, failure, idempotency, receipt, and zero-Live-call assertions.
3. _Workflow/browser acceptance:_ verify Live/Test labels, filtering, exact action target/effect,
   Vendor access, completion, unavailable provider states, and reconciliation at desktop/phone widths.
4. _Live activation:_ configure only the provider actions PMI KC uses, one at a time, from official/
   account contracts and authoritative mappings; perform one bounded reversible proof and attach
   bodyless monitoring/receipt evidence. Do not wait on unrelated providers.
5. _Verify/context:_ run mode/security/provider/full checks, then record application coverage separately
   from provider activation in facts/status/plan/loop.

**Deletion/merge recommendation.** KEEP as the canonical V1 Maintenance execution spec. MERGE S4 as
intake/history evidence; provider-specific activation runbooks may advance independently without
changing the working-app definition.
