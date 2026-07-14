# Integration Architecture

Verified tool-role architecture, event model, build order, and Action Registry model for PMI KC.

- Evidence: `docs/research/integration-capability-2026-06.md`.
- Client/vendor gaps: `docs/research-backlog.md` and `docs/client-checklist.md`.
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

1. Maintenance Work Order Intake remains the first candidate external write because Rentvine
   documents work-order APIs. Its write action is still gated by the registry and approved spec.
2. Renewal preparation proceeds read/gather/reconcile/draft-only. Rentvine renewal writeback remains
   undocumented and non-executable.
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

The catalog has 23 entries. No non-Gmail external system-of-record write is executable. Gmail entries:

| Key                                           | State            | Product boundary                                                                                               |
| --------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `gmail.mailbox.read`                          | Approved / true  | Profile/history/watch and a deliberately linked thread in the signed-in mailbox; no arbitrary inbox query/list |
| `gmail.thread.reply`                          | Approved / true  | Linked reply transport only; Approver/Admin; approved template plus exact confirmation required                |
| `gmail.draft.create`                          | Approved / true  | Linked unsent reply-draft transport; approved template required                                                |
| `gmail.label.apply`                           | Approved / true  | One approved label plus fixed governed rule and human reason on a linked thread                                |
| `gmail.message.send`                          | Disabled / false | Generic new-message compose/send is not exposed                                                                |
| `gmail.renewal_notice.draft_create`           | Planned / false  | Sample desk is preview-only; needs real run, authoritative recipient, template                                 |
| `gmail.maintenance_owner_notice.draft_create` | Planned / false  | Needs verified owner contact, trigger, and approved template                                                   |

The four approved Gmail scopes are unchanged. `gmail.compose` is send-capable, so the no-send and
workflow-only boundaries come from route/action/role/template/exact-confirmation code and tests.

### Final Round 3 target contract (not current execution authority)

R01–R09 settle product scope. S20 gives internal Editors enabled Low/Medium execution, routes
consequential High work to Admin, permits Admin self-approval, and preserves technical Blocked gates.
S25 requires app-executed Lease Gmail, Sheet, Rentvine, Dotloop, portal-chat, SMS, and conditional Boom.
S26 requires Vendor account/mailbox, Drive photo, Rentvine create/assign/update/close, owner/vendor mail,
LeadSimple, and QuickBooks draft-bill execution. S22 adds an assigned-ticket-only external Vendor using
verified-email TOTP and per-vendor Gmail/Workspace OAuth, never DWD. Product inclusion never flips
`production_allowed`; each action still needs documented evidence, exact permission/identity, preview,
idempotency, audit, reconciliation/rollback, tests, registry code review, and explicit live authority.
Undocumented/vendor-confirmation-required actions block final V1 rather than becoming manual fallbacks.

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
`lib/integrations/health-checks.ts`. Gmail watch renewal is manual and observable; no scheduler is
approved. S24 locally encodes confirmation usable 10 minutes/delete 30 days, dedupe 7 days, sync audit
90 days, workflow link 365 days from last authorized update, bodyless send/write/workflow audit 7
years, and no persisted V1 AI/extracted Gmail facts. Admin legal hold and a later written policy
override deletion. Cleanup planning/worker and hold/release are Local green; production Firestore TTL
and scheduler configuration remain separately gated and no mutable environment TTL can widen policy.

## Vendor-confirmation matrix

| Capability                          | Status                                      | Action                                                                                        |
| ----------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Rentvine maintenance writes         | Documented capability; execution gated      | First external-write candidate after approved action gate                                     |
| Rentvine lease-renewal writeback    | Undocumented                                | Keep non-executable; request vendor docs                                                      |
| Rentvine webhooks                   | None found                                  | Polling / LeadSimple sync                                                                     |
| LeadSimple endpoint coverage        | Vendor confirmation required                | Confirm endpoints and Operations plan                                                         |
| Dotloop signing lifecycle           | Vendor confirmation required                | Confirm signature-state semantics                                                             |
| Boom endpoint contract              | Vendor confirmation required                | Request API/vendor packet                                                                     |
| Gmail outbound vendor communication | R04 contract locked; implementation missing | Build S22 per-vendor OAuth/TOTP/assigned-ticket boundary; live OAuth/invite/send remain gated |

## Source normalization

Client workbooks mix legacy and current terminology. Before a connector touches a live system, freeze
canonical stages, systems, IDs, and approval points. Missing/conflicting authoritative sources must be
visible and block external drafting/writing where required; they are not filled by email or a model.
