<!-- spec-shape: overhaul-v1 -->

# S26 — Maintenance V1 external execution

> New 2026-07-14. Implements R03 plus the Round 2 assigned-ticket Vendor workflow. Every row below is
> required for final V1; provider/credential gaps are release blockers rather than manual substitutes.

**Implementation status (2026-07-14): Gated — safe local boundary green.** The complete action graph,
shared one-attempt orchestrator, Vendor/Drive/Rentvine/mail/LeadSimple/QuickBooks fake providers, UI
readiness state, server ledger/rules, and AC-S26-1..9 local tests are built. Every external action stays
Registry-closed; live identity/folder/account contracts, authoritative mappings, permitted proofs,
deployment, and Dan/Josiah acceptance are absent. See `docs/v1-pre-release-report-2026-07-14.md`.
The shared kernel reuses S20 for staff and S22's verified-TOTP/same-mailbox/assigned-ticket/self-consent
boundary for Vendor actions, and revalidates that authority immediately before its atomic provider claim.

**Goal.** A maintenance request can move from intake through secure Vendor assignment, evidence,
owner/vendor communication, Rentvine/LeadSimple state, QuickBooks draft-bill handoff, and closure while
the Vendor sees only assigned work. Routine bounded evidence and exact-confirmed communication stay
usable; consequential operating/accounting changes remain Admin-approved and auditable.

**What it is / how it functions.**

| R03 group                        | Canonical action keys                                                                                                | Risk / V1 behavior                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| App account lifecycle            | new `vendor.account.invite`, `vendor.account.disable`, `vendor.assignment.change`                                    | High; Admin only via S22                                                             |
| Mailbox lifecycle                | new `vendor.gmail.connect`, `vendor.gmail.revoke`, `vendor.gmail.health`                                             | Vendor self-consent/revoke after MFA; Admin may revoke; no DWD                       |
| Drive photos                     | `google_drive.maintenance_photo.store`                                                                               | Medium only for scanned append-only assigned-ticket upload; overwrite/delete is High |
| Rentvine create                  | `rentvine.work_order.create`                                                                                         | High; Admin-approved exact preview                                                   |
| Rentvine assignment/update/close | new `rentvine.work_order.assign_vendor`, existing `rentvine.work_order.update_status`                                | High; Admin-approved transition with read-after-write                                |
| Owner email                      | new `gmail.maintenance_owner_notice.send`, `gmail.thread.reply`                                                      | Medium; internal Editor exact-confirmed                                              |
| Vendor email                     | new `vendor.gmail.thread.read`, `vendor.gmail.draft.create`, `vendor.gmail.thread.reply`, `vendor.gmail.label.apply` | Assigned-ticket only; Vendor or Admin exact-confirms sends                           |
| LeadSimple                       | `leadsimple.process.update_stage`, `leadsimple.task.create`                                                          | High; Admin-approved documented contract                                             |
| QuickBooks                       | `quickbooks.bill.create_draft`                                                                                       | High; Admin-approved draft only, never post/pay                                      |

- **Orchestrator — `lib/maintenance/execution/`.** Immutable ticket/action dependency graph with exact
  preview, risk, approval, idempotency, one attempt, receipt/reconciliation, correction/rollback, and
  bodyless audit. External state never becomes true merely because the app ticket advanced.
- **Account/mailbox.** S22 is the implementation contract. Assignment is explicit and audited; disable/
  deassign denies access immediately. Vendor OAuth is their own Gmail/Workspace mailbox only.
- **Photos.** Authorized internal user or assigned MFA Vendor may append one validated image to the
  Admin-configured ticket folder after size/MIME/malware/sensitivity checks. Filename/path are server
  derived. Upload is Medium/reversible; replace/delete/move or different folder is High/Admin.
- **Rentvine.** Create from verified unit/issue/priority/trade/vendor inputs. Assignment/status/close
  validates allowed transition and current state, then reads after write. Unknown unit/vendor/status or
  drift is Blocked. Close requires completion evidence and any configured financial/owner checks.
- **Communication.** Owner recipient comes from authoritative property-owner source. Vendor mail is
  linked to assigned ticket. S24 base artifact/AI policy/exact confirmation apply. No message chooses a
  vendor, approves cost, or changes ticket status by itself.
- **LeadSimple/QuickBooks.** Use documented account contracts only. LeadSimple mirrors/advances the
  configured process; QuickBooks creates a draft bill with Vendor, amount/account, Rentvine work-order,
  and property/unit references. Posting, payment, bank, and ledger mutation remain out of V1.
- **Buildable now (app-plane).** Orchestrator, schemas/registry entries false, previews, fake providers,
  transition policy, UI/queue/audit/reconciliation, and tests per row.
- **Gated (owner / vendor).** S22 live setup, folder/source mappings, provider contracts/plans/credentials,
  registry promotions, every first external mutation/send, deploy, and production acceptance.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ all nine R03 groups execute in V1, including account/mailbox lifecycle,
  Rentvine assignment/closure, Vendor email, LeadSimple, and QuickBooks draft bill.
- _Answered 2026-07-14:_ Vendors use external app credentials and own Gmail/Workspace OAuth, see only
  assigned tickets, and every AI-assisted send is explicitly confirmed by Vendor or Admin.
- _Assumption:_ append-only scanned ticket-photo upload is a bounded Medium action; photo replace/delete/
  move and folder-policy change are consequential High actions.
- _Assumption:_ QuickBooks “executes” means create a draft Bill only, matching the approved R03 label and
  current registry action; no posting/payment/approval of funds is implied.
- _Assumption:_ LeadSimple actions are required only when the connected maintenance process is mapped;
  a verified “not configured for this workflow” cannot close final V1 globally until PMI KC either
  configures the V1 process or records that the action is not applicable to all launch tickets.
- _Client-owned:_ provide non-secret unit/vendor/status/folder/process/account mappings and credentials
  at exact setup gates. Common issue templates/escalation rules may limit AI drafts but do not change
  the approved deterministic execution matrix.

**Cross-product impacts.** Evolves S4 maintenance intake, S20 authority, S22 Vendor identity, S24
communications, ticket state/activity, Action Registry, connector health, Approval Queue, Drive image
store, Rentvine/LeadSimple/QuickBooks clients, environment handoff, and S27. Supersede marker:
`MAINTENANCE-EXTERNAL-EXECUTION-LATER`.

**Adversarial acceptance checks.**

- **AC-S26-1** — Registry/catalog and ticket workflow expose every R03 group/action key with dependency,
  risk, preview, health, receipt, correction, and `production_allowed:false` default. _Verify:_ `npm
test -- maintenance-execution-matrix action-registry-schema`.
- **AC-S26-2** — Vendor assignment boundary and MFA precede all Vendor detail/mail/photo actions; Admin
  account/assignment changes are High and immediately revoke access. _Verify:_ `npm test --
vendor-lifecycle maintenance-execution-authority`.
- **AC-S26-3** — Assigned Vendor/internal Editor may append one validated ticket image to the configured
  folder; wrong ticket/folder/path/MIME/size/scanner/sensitivity blocks before bytes/provider. Replace/
  delete requires Admin High approval. _Verify:_ `npm test -- maintenance-photo-executor`.
- **AC-S26-4** — Rentvine create/assign/status/close uses authoritative IDs, allowed transition, Admin
  approval, idempotency, and read-after-write; drift/unknown/ambiguity causes zero retry and visible
  reconciliation. _Verify:_ `npm test -- rentvine-work-order-executor`.
- **AC-S26-5** — Owner initiation uses authoritative recipient and `maintenance-owner:v1.0`; missing
  owner/unit/value blocks. Internal Editor exact confirmation is Medium and duplicate/drift makes at
  most one Gmail attempt. _Verify:_ `npm test -- maintenance-owner-email`.
- **AC-S26-6** — Vendor provider can access only assigned linked thread; Vendor/Admin exact confirmation
  binds From/ticket/thread/body. AI/message cannot choose vendor, approve cost, or transition/close.
  _Verify:_ `npm test -- vendor-gmail-boundary maintenance-ai-boundary`.
- **AC-S26-7** — LeadSimple fake adapter updates only mapped process/stage/task under Admin approval and
  reconciles result; undocumented endpoint/plan blocks with zero call. _Verify:_ `npm test --
leadsimple-maintenance-executor`.
- **AC-S26-8** — QuickBooks fake adapter creates one draft Bill with exact required references after
  Admin approval; post/pay/bank/ledger methods do not exist and amount/account/vendor drift blocks.
  _Verify:_ `npm test -- quickbooks-draft-bill-executor`.
- **AC-S26-9** — Fake-provider E2E completes invite/MFA/assignment/mailbox/photo/Rentvine/owner/vendor/
  LeadSimple/QuickBooks/close in order; injected failure stops dependents and never leaks another ticket
  or duplicates an external attempt. _Verify:_ `npm run test:e2e:core -- maintenance-execution`.
- **AC-S26-10** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run test:firestore`, `npm run verify:redaction`, `npm run build`,
  `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** No live invite/account/claim/OAuth/token/folder change, Drive upload,
Rentvine/LeadSimple/QuickBooks mutation, Gmail send/read, registry flip, deploy, or smoke without exact
approval. No Vendor internal role, cross-ticket access, DWD, autonomous send, provider-selected vendor,
cost approval, blind transition, photo overwrite/delete, QuickBooks post/pay, ambiguous retry, or raw
values/tokens/content in git/log/audit. ~$10 cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory intake/ticket/activity/photo/assignment/current clients/registry/tests and
   produce contract/evidence/mapping rows for every action above.
2. _Build:_ implement orchestrator/ledger/transition policy/fake executors, all new registry entries
   false, using S20 authority and S22 assignment/MFA.
3. _Build:_ deliver account/mailbox, photos, Rentvine create, Rentvine assign/update/close, owner email,
   vendor email, LeadSimple, and QuickBooks as separate slices; pass focused AC before continuing.
4. _Understanding:_ obtain official/account contracts and mappings for vendor-confirmation-required
   actions; never infer endpoints/stages/accounts from a UI or raw customer record.
5. _Verify:_ falsify cross-ticket IDs, MFA bypass, file attacks, status drift, missing recipient, AI
   side effects, duplicate attempts, and accounting escalation; run fake-provider E2E/full verification.
6. _Gate:_ request setup/first-live approval per action key with data/cost/rollback/proof; no blanket
   Maintenance write authorization.
7. _Owner:_ Dan accepts business/ticket results; Josiah accepts technical monitoring/rollback/OAuth watch.
8. _Context update:_ add per-action live facts plus `F-MAINTENANCE-V1-EXECUTION-BUILT` citing
   AC-S26-1..10; update registry/environment/status/plan/loop per slice.

**Deletion/merge recommendation.** KEEP as the canonical final-V1 Maintenance execution spec. MERGE
S4 as intake/history evidence; delete active “later/manual” wording only when each action ships.
