# Integration Architecture

Verified tool-role architecture, event model, build order, and Action Registry model for PMI KC.

- Evidence: `docs/research/integration-capability-2026-06.md`.
- Client/vendor gaps: `docs/research-backlog.md`, `docs/client-checklist.md`, and the exact
  recommendation-first `docs/v1-client-unblock-checklist-2026-07-14.md`.
- Safety: `AGENTS.md` and `docs/north-star.md`.

## Safety posture

This document organizes and gates integrations; it does not grant execution. No autonomous send and
no system-of-record write to Rentvine, LeadSimple, Dotloop, QuickBooks, Boom, operating Sheets,
banks/ledgers, or client Drive without an approved action spec, preview, confirmation, audit,
correction/rollback, and tests. The Action Registry is a catalog, not an executor.

## Tool-role map

| Tool          | Architectural role                      | Authoritative for                                         | Not authoritative for                                |
| ------------- | --------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Rentvine      | Operational system of record            | Leases, properties, contacts, work orders, inspections    | Workflow orchestration; accounting ledger            |
| LeadSimple    | Workflow orchestration                  | Task sequencing, stages, reminders, notifications         | Core lease truth; creating owners/properties         |
| Dotloop       | Document-package layer                  | Renewal/signing document packages                         | Lease state; maintenance execution                   |
| QuickBooks    | Downstream accounting/ledger            | Bills, invoices, payments, financial audit trail          | Property/lease/work-order objects                    |
| Boom          | Auxiliary resident financial services   | Rent reporting/screening in its supported products        | Lease-state authority; maintenance                   |
| Google Sheets | Exception/control plane                 | Exception lists, mappings/rates, dashboards               | Canonical lease/work-order/accounting truth          |
| Gmail         | Workflow communication system of record | Native messages, threads, labels, unsent drafts           | Workflow status, tasks, decisions, operational truth |
| PMI KC KB     | Workflow-control/record owner           | Workflow run, linkage, proposals, approvals, app activity | Replacing external systems of record                 |

Rentvine remains authoritative for the operational records it holds. Gmail remains authoritative for
message state. PMI KC stores bodyless Gmail linkage and only human-reviewed operational meaning.

## Event model

| System        | Mode                          | Boundary                                                      |
| ------------- | ----------------------------- | ------------------------------------------------------------- |
| Dotloop       | webhook                       | Loop/contact/profile/participant events plus replay           |
| QuickBooks    | webhook                       | Documented webhooks                                           |
| Boom          | webhook (vendor packet)       | Advertised; endpoint contract not confirmed                   |
| Rentvine      | polling or LeadSimple sync    | No public webhooks found                                      |
| LeadSimple    | LeadSimple sync               | Direct Rentvine sync tier-dependent                           |
| Google Sheets | Apps Script                   | Simple/installable triggers; exception plane only             |
| Gmail         | authenticated Pub/Sub webhook | Change signal only; match IDs against existing workflow links |

Gmail push processing may advance cursor/dedupe state and create value-free linked attention. It may
not fetch unrelated content, invoke AI, create a task, change workflow state, or send.

## Build order and process chains

1. Maintenance Work Order Intake is a working in-app write workflow with a complete persistent Test
   path. Activate each Live Rentvine/LeadSimple/QuickBooks action independently as its exact contract
   and mapping become configured.
2. Renewal read/gather/reconcile/review is Live-capable and the complete action graph is Test-ready.
   Rentvine renewal mutation remains unavailable until its actual supported contract is known.
3. Workflow Communications supplies evidence and reviewed communication steps inside those products;
   it is not a standalone inbox lane and creates no external-system authority.

Lease renewal:

`candidate detection -> owner communication/decision -> multichannel tenant outreach ->
document package -> signature/confirmation -> gated SoR update -> verification -> closeout`

Maintenance:

`intake -> KB ticket/review -> owner/vendor communication as approved -> gated Rentvine work order ->
LeadSimple orchestration -> status verification -> downstream accounting/exception coordination`

Email activity alone does not complete renewal outreach/consent, choose a maintenance vendor,
approve cost, transition a ticket, or write a system of record.

## Action Registry model

One record exists per external action type. Records live in server-write-only `action_registry` and
are seeded via `npm run seed:action-registry`. Each record contains:

| Field                                                 | Meaning                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `key`                                                 | Stable action slug                                   |
| `label`, `expected_action`, `product_lane`            | Human purpose and owning product                     |
| `target_system`                                       | External target                                      |
| `readiness`, `evidence_status`, `documented_evidence` | Readiness/evidence gate                              |
| `required_permissions`, `required_plan`               | Target permissions/tier                              |
| `event_ingestion_mode`                                | Resulting-state event mechanism                      |
| `preview_schema_note`, `preview_payload_schema`       | Exact governed preview fields                        |
| `test_notes`, `rollback_note`                         | Falsification and correction/rollback                |
| `connection_health_check_ref`                         | Deterministic health contract                        |
| `production_allowed`                                  | Explicit production execution gate; false by default |

`validatePreviewPayload` requires exactly the declared fields, required values, and matching types;
undeclared fields fail. `production_allowed:true` requires `Approved for Execution` plus `Documented`
evidence. Runtime routes must also enforce identity, entity authorization, roles, governed artifacts,
confirmation, and audit. A true transport entry alone never authorizes arbitrary end-user behavior.

The catalog has 38 entries. Activation is per action and does not define whether the application is
V1. S22/S25/S26 include account/OAuth/Vendor-mail/renewal-send/portal/SMS/assignment and
maintenance-owner actions with independent states.
Current internal Gmail transport subset (new closed S25/S26 and external Vendor Gmail keys are listed
in their suite matrices):

| Key                                           | State            | Product boundary                                                                                                                                 |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gmail.mailbox.read`                          | Approved / true  | Profile/history/watch and a deliberately linked thread in the signed-in mailbox; no arbitrary inbox query/list                                   |
| `gmail.thread.reply`                          | Approved / true  | Linked reply transport only; internal Editor/Admin exact-confirms enabled Medium work; approved template required                                |
| `gmail.draft.create`                          | Test / false     | Linked unsent reply-draft transport; Live stays closed until exact confirmation, idempotency/one-attempt, UI review, and receipt are implemented |
| `gmail.label.apply`                           | Approved / true  | One approved label plus fixed governed rule and human reason on a linked thread                                                                  |
| `gmail.message.send`                          | Disabled / false | Generic new-message compose/send is not exposed                                                                                                  |
| `gmail.renewal_notice.draft_create`           | Planned / false  | Sample desk is preview-only; needs real run, authoritative recipient, template                                                                   |
| `gmail.maintenance_owner_notice.draft_create` | Planned / false  | Needs verified owner contact, trigger, and approved template                                                                                     |

The four approved Gmail scopes are unchanged. `gmail.compose` is send-capable, so the no-send and
workflow-only boundaries come from route/action/role/template/exact-confirmation code and tests.

### Working V1 contract

R01–R09 settle product scope. S20 gives internal Editors enabled Low/Medium execution, routes
consequential High work to Admin, permits Admin self-approval, and preserves technical Blocked gates.
S25 requires app-executed Lease Gmail, Sheet, Rentvine, Dotloop, portal-chat, SMS, and conditional Boom.
S26 requires Vendor account/mailbox, Drive photo, Rentvine create/assign/update/close, owner/vendor mail,
LeadSimple, and QuickBooks draft-bill execution. S22 adds an assigned-ticket-only external Vendor using
verified-email TOTP and per-vendor Gmail/Workspace OAuth, never DWD. The Test Vendor uses the same real
Firebase password/TOTP boundary with an app-only mailbox and no OAuth/provider construction. Its
repeatable reset/re-enable path is an app identity operation, not a provider action: an exact preview
binds current UID/status/`inviteVersion`, the UID rotates, old sessions/confirmations fail, and its
stable Test records remain. A partial reset keeps the replacement identity disabled and resumable; it
never falls through to Live.

The production app is ready when these workflows work in Live/Test lanes. A Live provider action is
enabled only with documented evidence, exact permission/identity/mapping, target/effect preview,
human confirmation, idempotency, audit, reconciliation/rollback, tests, and monitoring. An
undocumented action remains unavailable without relabeling the application.

The production Test workspace runs all 11 S25 and 19 S26 action adapters plus the complete S22
Vendor identity/mail journey against invented aliases and typed Test provider state. Those paths
use exact Registry preview schemas, immutable S20 risk/authority, same-workflow dependency receipts,
one-attempt execution, readback, and reconciliation. Test execution is memory-only for typed adapters,
accepts only branded no-client executors, writes `dataMode:test`/non-Live receipts, and rejects Live
records. Live orchestration rejects Test records/adapters, Registry overrides, and schema/risk lowering.
This proves application behavior, not an account-specific provider contract or Live action.

Promote one action only after its row in `docs/v1-client-unblock-checklist-2026-07-14.md` has the named
official/account evidence, authoritative mapping, credential-owner/location label, separately permitted
bounded proof, bodyless receipt/readback, monitor, correction path, code review, and exact authority.
Test receipts can satisfy application-workflow acceptance and can never satisfy Live-provider proof.

## Data-lane boundary

- Missing legacy mode resolves to Live.
- Reserved Test unit/Vendor/email aliases cannot be assigned to Live records.
- Browser state cannot select a provider lane.
- Console renders a bounded Live provider projection and a separate Test projection at once.
- External action identity, idempotency key, context hash, record, receipt, and audit bind the lane.
- Persistent Maintenance/Vendor Test state lives in Firestore through authenticated server routes;
  typed external Test adapters contain no provider client.
- Test Vendor authentication reset preserves the stable Vendor id, assignments, ticket/mailbox state,
  receipts, and bodyless audit while rotating the Firebase UID and incrementing `inviteVersion`.
  Response-only setup links use `no-store`; stale UID sessions/confirmations and drifted previews are
  rejected before mailbox or provider construction.

## Gmail-to-workflow source and write model

`WorkflowCommunicationContext` names lane, entity, purpose, action, source references, and optional
template version. It is an untrusted browser reference until the server loads the entity and verifies
space capability. A `WorkflowCommunicationLink` stores only actor/mailbox keys, workflow reference,
Gmail IDs, artifact references, hashes, status, timestamps, and expiry.

AI-assisted thread understanding is explicit and on-demand. Unknown/excluded categories are rejected
before Gmail/model construction; detected excluded intent is rejected before the model call. Results
are transient `Needs Review` proposals with Gmail provenance. There is currently no reviewed commit
model for derived facts/tasks/status, so output is not persisted or applied.

No Gmail result directly writes Rentvine, LeadSimple, Dotloop, QuickBooks, Boom, Sheets, Drive, banks,
or client records. S25/S26 executors consume separately approved workflow facts through their own
registry key, preview, risk, approval, idempotency, and reconciliation; email/model output alone cannot
trigger them.

## Connection health and retention

Each registry entry points to a deterministic health-check contract in
`lib/integrations/health-checks.ts`. Gmail watch renewal is manual and observable. S24 encodes
confirmation usable 10 minutes/delete 30 days, dedupe 7 days, sync audit
90 days, workflow link 365 days from last authorized update, bodyless send/write/workflow audit 7
years, and no persisted V1 AI/extracted Gmail facts. Admin legal hold and a later written policy
override deletion. The V1 safe default is bounded on-demand cleanup plus health reporting. Firestore
TTL (canonical Date/Timestamp `expires_at`), extra indexes, and Scheduler automation are optional
volume-driven optimizations. A bodyless run ledger makes deletion counts crash-resumable; no mutable
environment value can widen policy.

## Vendor-confirmation matrix

| Capability                          | Status                                 | Action                                                                                                                        |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Rentvine maintenance writes         | Documented capability; execution gated | First external-write candidate after approved action gate                                                                     |
| Rentvine lease-renewal writeback    | Undocumented                           | Keep non-executable; request vendor docs                                                                                      |
| Rentvine webhooks                   | None found                             | Polling / LeadSimple sync                                                                                                     |
| LeadSimple endpoint coverage        | Vendor confirmation required           | Confirm endpoints and Operations plan                                                                                         |
| Dotloop signing lifecycle           | Vendor confirmation required           | Confirm signature-state semantics                                                                                             |
| Boom endpoint contract              | Vendor confirmation required           | Request API/vendor packet                                                                                                     |
| Gmail outbound vendor communication | S22 Local green; live resources gated  | Configure/approve TOTP, OAuth client/vault, first invite/consent/read/send separately; assigned-ticket fake boundary is green |

## Source normalization

Client workbooks mix legacy and current terminology. Before a connector touches a live system, freeze
canonical stages, systems, IDs, and approval points. Missing/conflicting authoritative sources must be
visible and block external drafting/writing where required; they are not filled by email or a model.
