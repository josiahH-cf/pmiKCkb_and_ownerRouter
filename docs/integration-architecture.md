# Integration Architecture

Verified tool-role architecture, event model, build order, and the Action Registry model
for PMI KC external-system integrations. This is the durable engineering reference behind
the product lanes.

- Evidence basis: `docs/research/integration-capability-2026-06.md`.
- Client-confirmation and vendor-packet gaps: `docs/research-backlog.md`.
- Safety boundaries: `docs/north-star.md`, `AGENTS.md`. Nothing here relaxes them.

## Safety posture (unchanged)

This document describes how integrations are _organized and gated_, not authorization to
build live writes. No autonomous send. No system-of-record writes to Rentvine, LeadSimple,
Dotloop, QuickBooks, Boom, operating Sheets, banks, ledgers, or client Drive folders
without a future approved per-action spec, tests, audit fields, and rollback. The Action
Registry below is a metadata catalog only; it executes nothing.

## Tool-role map

Each tool has a distinct, verified role. They are not interchangeable, and Google Sheets is
explicitly not a primary source of truth once external systems are connected.

| Tool          | Architectural role                | Authoritative for                                      | Not authoritative for                        |
| ------------- | --------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Rentvine      | Operational system of record      | Leases, properties, contacts, work orders, inspections | Workflow orchestration; accounting ledger    |
| LeadSimple    | Workflow orchestration            | Task sequencing, stages, reminders, notifications      | Core lease truth; creating owners/properties |
| Dotloop       | Document-package layer            | Renewal/signing document packages                      | Lease state; maintenance execution           |
| QuickBooks    | Accounting / ledger (downstream)  | Bills, invoices, payments, financial audit trail       | Property/lease/work-order objects            |
| Boom          | Resident financial services (aux) | Rent reporting (BoomReport), screening (BoomScreen)    | Lease-state authority; maintenance           |
| Google Sheets | Exception queue / control plane   | Exception lists, mapping/rate tables, dashboards       | Canonical lease/work-order/accounting truth  |
| PMI KC KB     | Workflow-control + record owner   | The first workflow-run record and approvals            | Replacing external systems of record         |

Relationship rule: the KB owns the central workflow-run record and approvals; external
systems are referenced through backlinks and Action Registry action records. Rentvine
remains authoritative for the underlying lease/property/work-order facts it holds.

## Event model

Use event-driven ingestion where documented, polling or sync where it is not.

| System        | Ingestion mode (`action_event_mode`) | Notes                                            |
| ------------- | ------------------------------------ | ------------------------------------------------ |
| Dotloop       | `webhook`                            | Loop/contact/profile/participant events + replay |
| QuickBooks    | `webhook`                            | Documented webhooks                              |
| Boom          | `webhook` (vendor-packet)            | Advertised; endpoint contract request-only       |
| Rentvine      | `polling` or `leadsimple-sync`       | No public webhooks found                         |
| LeadSimple    | `leadsimple-sync`                    | Hourly/faster direct Rentvine sync tiers         |
| Google Sheets | `apps-script`                        | Simple/installable triggers                      |

## Build order

Build the most-documented, least-ambiguous writes first.

1. **Maintenance Work Order Intake — first executable write.** Rentvine documents
   work-order create/status/vendor-trade/inspection/file APIs, and LeadSimple documents a
   direct Rentvine maintenance sync (work-order sync, stage-to-status mapping, work-order
   creation). This is the lowest-ambiguity executable integration.
2. **Renewal preparation and verification — read/gather/draft only.** Identify candidates,
   gather facts, prepare document packages and owner drafts, and verify post-renewal state.
3. **Lease-renewal writeback — last, and gated.** Rentvine public API has no documented
   lease-renewal-write endpoint. Renewal writeback stays non-executable until vendor/private
   documentation confirms the endpoint, and then only behind an approved per-action spec.

Lease Renewal Agent remains the first _product lane_; maintenance is the first _executable
write_ inside the KB automation surface. These are not in conflict: renewal preparation can
proceed read-only while the writeback stays gated.

## Process chains

### Lease renewal (multi-step; not a single action)

`candidate detection -> owner decision -> tenant intake -> document package ->
signature/confirmation -> system-of-record update -> service/charge verification ->
closeout`

- Detection/read: Rentvine lease dates, tenant contacts, property/unit/owner context.
- Orchestration: LeadSimple workflow run, tasks, assignees, due dates, approvals.
- Documents: Dotloop loop/template/participants/upload.
- Optional resident services: Boom enrollment at move-in/renewal.
- System-of-record update: **gated** (Rentvine renewal writeback undocumented).

### Maintenance work order

`intake -> Rentvine work order (create/hold) -> LeadSimple orchestration ->
status sync back to Rentvine -> QuickBooks accounting artifact -> Sheets exception/coordination`

## Action Registry model

One record per external **action type** (for example `rentvine.work_order.create`). The
registry makes target system, evidence, permissions, plan tier, readiness, preview,
rollback, and production-eligibility explicit and auditable. It is a catalog; it does not
execute.

This extends the existing workflow-control foundation rather than replacing it:

- Readiness reuses `ExternalActionReadiness` (`lib/firestore/types.ts`): `Planned`,
  `Needs Connection`, `Needs Permission`, `Ready for Test`, `Approved for Execution`,
  `Disabled`.
- `ProcessDefinitionActionReference` action references can backlink to a registry entry via
  `action_registry_key`.
- Records live in the server-write-only `action_registry` Firestore collection and are
  seeded via `npm run seed:action-registry` (Admin SDK only; client writes denied).

### Record fields (`ActionRegistryRecord`)

| Field                         | Meaning                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `key`                         | Stable slug, e.g. `rentvine.work_order.create`                  |
| `label`                       | Human label, e.g. "Create Rentvine work order"                  |
| `target_system`               | `action_target_system` (Rentvine/LeadSimple/Dotloop/...)        |
| `expected_action`             | What the action does to the target system                       |
| `product_lane`                | Optional owning lane (KB / Lease Renewal Agent / Gmail Inbox 0) |
| `readiness`                   | `ExternalActionReadiness` state                                 |
| `evidence_status`             | `Documented` / `Vendor-Confirmation-Required` / `Undocumented`  |
| `documented_evidence`         | Where the capability is documented (or the confirmation gap)    |
| `required_permissions`        | Permissions/roles/scopes needed at the target system            |
| `required_plan`               | Optional vendor plan/tier (e.g. LeadSimple Operations)          |
| `event_ingestion_mode`        | `action_event_mode` for resulting state changes                 |
| `preview_schema_note`         | What an execution preview must show before running              |
| `test_notes`                  | How the action is/will be tested                                |
| `rollback_note`               | Rollback or correction path                                     |
| `connection_health_check_ref` | Pointer to the deterministic health check for the system        |
| `production_allowed`          | Whether execution is permitted in production (default `false`)  |

### Readiness lifecycle and the production gate

`Planned -> Needs Connection -> Needs Permission -> Ready for Test ->
Approved for Execution` (or `Disabled` at any time).

`production_allowed` may be `true` only when `readiness` is `Approved for Execution` and
`evidence_status` is `Documented` with non-empty `documented_evidence`. This is enforced in
the schema. Every seeded entry today is `production_allowed: false`, which keeps the
registry inside the no-write safety boundary.

## Vendor-confirmation matrix

| Capability                               | Status                       | Action                                   |
| ---------------------------------------- | ---------------------------- | ---------------------------------------- |
| Rentvine maintenance writes              | Documented                   | Eligible as first executable write       |
| Rentvine lease-renewal writeback         | Undocumented                 | Keep non-executable; request vendor docs |
| Rentvine webhooks                        | None found                   | Use polling / LeadSimple sync            |
| LeadSimple endpoint-by-endpoint coverage | Vendor-Confirmation-Required | Confirm endpoints + Operations plan      |
| Dotloop signing/send lifecycle           | Vendor-Confirmation-Required | Confirm signature-state semantics        |
| Boom endpoint contract                   | Vendor-Confirmation-Required | Request API/vendor packet                |
| QuickBooks accounting + webhooks         | Documented                   | Downstream artifacts after approval      |
| Google Sheets read/write + triggers      | Documented                   | Exception/control-plane use only         |

## Source-normalization requirement

Client workbooks mix legacy (e.g., Propertyware) and current (Rentvine "RV") vocabulary.
Before any connector touches a live system, freeze the canonical names for stages, systems,
record IDs, and approval points so authoritative field meaning is unambiguous. Treat this as
a product gate, not documentation polish.
