# Integration Capability Research — Verified Findings (2026-06)

Preserved, durable record of the verified conclusions from the deep-research review of the
PMI KC tool stack (Rentvine, LeadSimple, Dotloop, QuickBooks Online, Boom, Google Sheets).
The original working report lived at `docs/temp/deep-research-report (1).md`, which is
disposable under `AGENTS.md`. This file is the citable, durable version.

- Status: verified vendor/public-documentation research, not client confirmation.
- Use this to justify architecture decisions in `docs/integration-architecture.md`.
- Client-confirmation and vendor-packet gaps stay tracked in `docs/research-backlog.md`.

## Why this exists

The product docs historically treated all six external tools as one undifferentiated
"no system-of-record writes" list. That safety posture is correct and unchanged, but it
hid real, decision-grade differences between the tools. This research separates what can be
built with high confidence from what is plan-gated or vendor-confirmation dependent.

## Headline conclusions

1. **Tool roles are not interchangeable.** Rentvine is the operational system of record;
   LeadSimple is workflow orchestration; Dotloop is the document-package layer; QuickBooks
   is the accounting/ledger layer; Boom is a resident-facing rent-reporting/screening
   service; Google Sheets is an exception queue / control plane, not a primary source of
   truth once external systems are connected.
2. **Maintenance is the strongest first executable-write integration.** Rentvine publicly
   documents work-order create/list/view, work-order statuses, vendor trades, inspections,
   and file uploads; LeadSimple publicly documents a direct Rentvine maintenance
   integration (work-order sync, stage-to-status mapping back to Rentvine, and creating
   Rentvine work orders from LeadSimple when enabled).
3. **Rentvine lease-renewal writeback is undocumented.** Rentvine public API docs expose
   lease export/list/view (start/end/move-in/move-out/increase-eligibility dates, tenant
   contacts) and show the lease modified timestamp changing after renewal, move-out, and
   rent-increase portal actions — but no public endpoint was found for executing a renewal,
   modifying renewal charges, or performing the renewal mutation itself. Treat renewal
   writeback as **undocumented / vendor-confirmation-required** until private/vendor docs
   confirm it.
4. **Lease renewal is a multi-step operational chain, not a single action.** Client
   workbooks show owner pricing confirmation, renewal letters, Google Forms intake, lease
   docs, insurance/pet checks, recurring-charge setup, inspection tracking, air-filter
   setup, and utility proof.
5. **The repo's governance already fits.** Read-only-first, per-action approval, visible
   previews, rollback notes, connection-health checks, and per-run human approval are the
   correct way to operationalize this stack. No governance relaxation is implied by this
   research.

## Per-tool verified capability summary

### Rentvine — operational system of record

- Auth via account-scoped API keys and roles.
- Documented objects: properties, portfolios, owners, tenants, vendors, leases, work
  orders, work-order statuses, vendor trades, inspections, files, plus accounting
  diagnostics.
- Documented maintenance writes: create work orders, create work-order statuses, create
  vendor trades, create inspections, upload files.
- Documented lease operations: export/list/view only (enough to identify renewal
  candidates and monitor state changes).
- No public webhook documentation found → use polling or LeadSimple sync for state.
- Conclusion: authoritative READ source for renewal candidate discovery; authoritative
  execution/record surface for maintenance objects.

### LeadSimple — workflow orchestration

- Admins can self-enable a REST API key; API can read and change account data.
- Documented direct Rentvine integration: syncs owners, tenants, applicants, vendors,
  properties, units, work orders into LeadSimple (hourly for most, faster for some
  applicant/delinquency flows).
- Documented maintenance integration: work orders sync into a dedicated process; stages
  map back to Rentvine statuses; work orders can be created from LeadSimple.
- Two-way sync is limited today: can push selected contact/property/unit/maintenance
  fields back to Rentvine; does NOT create new owners or properties in Rentvine; does NOT
  push communications into Rentvine.
- Plan gating: Rentvine direct integration is on the current Operations plan; work-order
  sync availability is plan-restricted.
- Conclusion: strong fit for human-in-the-loop orchestration, task sequencing, stage
  management, reminders, notifications. Not the place to invent core lease truth.

### Dotloop — document-package layer

- API v2 uses OAuth 2.0 with approved application registration (not a simple API key).
- Documented resources: profiles, loops, loop details, folders, documents, participants,
  task lists, contacts, templates, webhooks.
- "Loop-It" facade can create a loop, insert property info, add participants, and create
  from templates in one request; supports folder creation, multipart document upload,
  participant add, task-list listing, and webhook subscription (loop/contact/profile/
  participant events).
- Access is an approved/controlled program; permitted uses granted case by case.
- Not fully solidified publicly: exact e-signature/send lifecycle ("send for signature /
  remind / completed / declined") — vendor-confirmation required before locking that
  contract.
- Conclusion: strong renewal document-orchestration candidate if PMI KC uses Dotloop as
  the signing/document workspace.

### QuickBooks Online — accounting/ledger layer

- REST/JSON Accounting API. Entities include Customer, Vendor, Account, Invoice, Bill,
  Payment, BillPayment, Refund, reports, items, queries, batches, change-data-capture,
  sparse updates, and webhooks. Documented throttling/limits, webhooks, sandbox.
- No native property-management objects (no "lease renewal," "unit turn," "work order").
  Property context must be carried via references/conventions/custom metadata (inference
  from the published entity model, not an Intuit-prescribed pattern).
- Conclusion: sits DOWNSTREAM of maintenance/renewal operations. Good first use:
  accountant-facing bill/invoice queues that preserve the Rentvine work-order number and
  property/unit context, with webhooks/polling to confirm posting/payment state after
  approval.

### Boom — resident financial services (auxiliary)

- BoomReport (automated tri-bureau rent reporting) and BoomScreen (tenant screening).
- Publicly advertises partner/lifecycle APIs, programmatic enrollment, data prefill,
  webhooks/events, partner dashboards; rent reporting can embed in the resident portal or
  the lease-signing flow; PMS integrations page lists Rentvine.
- Detailed endpoint contract is request-only (not publicly inspectable) → "API available,
  schema still needs vendor packet."
- Conclusion: appropriate for move-in / renewal amenity enrollment and rent-reporting
  connectedness; NOT a fit for lease-state authority or maintenance execution.

### Google Sheets — exception queue / control plane

- Sheets API supports value reads/writes and batch updates; `spreadsheets.batchUpdate`
  groups structural/formatting operations. Apps Script supports simple and installable
  triggers (open, edit, change).
- Conclusion: strong fit for control tables, approval queues, exception dashboards,
  mapping/rate-card tables, and temporary manual-review surfaces. Should NOT be the
  canonical source of lease, work-order, or accounting truth once external systems connect.

## Event model (documented reality)

| System        | Event ingestion                                             |
| ------------- | ----------------------------------------------------------- |
| Dotloop       | Webhooks (loop/contact/profile/participant) + replay window |
| QuickBooks    | Webhooks                                                    |
| Boom          | Webhooks/events advertised; vendor packet required          |
| Rentvine      | No public webhooks found → polling or LeadSimple sync       |
| Google Sheets | Apps Script simple/installable triggers                     |
| LeadSimple    | Direct Rentvine sync (hourly/faster tiers)                  |

## Source-normalization requirement

Client workbooks mix current and legacy system vocabulary (e.g., legacy Propertyware
references alongside Rentvine "RV"). Before automation touches live systems, freeze the
canonical names for stages, systems, record IDs, and approval points. This is a product
requirement, not documentation polish.

## Open questions / limitations (carried into research-backlog)

- Rentvine lease-renewal mutation support: undocumented in public docs; needs vendor/private
  confirmation.
- LeadSimple endpoint-by-endpoint coverage: API existence and admin enablement verified;
  full endpoint contract sits behind authentication.
- Boom endpoint contract: advertised but request-only; vendor packet required.
- Dotloop signing-flow specifics: loops/templates/participants/documents/webhooks
  confirmed; exact signature-state/reminder/completion semantics need vendor confirmation.
- Source normalization: canonical stage/system/record-ID/approval vocabulary must be frozen
  before connector work.

## Sources

Verified sources used for the underlying research: the PMI KC repo governance and product
docs; the official Rentvine API docs; official LeadSimple help-center articles on REST
access and the Rentvine direct integration; the public Dotloop API v2 developer guide and
API license terms; official Intuit QuickBooks Online developer documentation; official Boom
partner/API and PMS-integration pages; official Google Sheets API and Apps Script trigger
docs; plus direct review of the uploaded client workbooks (`Tenant Move
In_Out_Renewal Checklist.xlsx`, `2026 Invoices.xlsx`, `PMI_KC_Tool_Access_Template.xlsm`)
for current operational practice.
