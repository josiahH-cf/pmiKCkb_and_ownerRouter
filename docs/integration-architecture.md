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
| `preview_payload_schema`      | Optional structured field descriptors for the execution preview |
| `test_notes`                  | How the action is/will be tested                                |
| `rollback_note`               | Rollback or correction path                                     |
| `connection_health_check_ref` | Pointer to the deterministic health check for the system        |
| `production_allowed`          | Whether execution is permitted in production (default `false`)  |

`preview_payload_schema` is the machine-readable companion to `preview_schema_note`: a
list of `{ name, label, type, required, source_system, note }` descriptors (types:
string/number/boolean/date/enum/reference). `validatePreviewPayload`
(`lib/integrations/preview-payload.ts`) enforces that a preview payload contains exactly
the declared fields — required fields present, values typed, and no undeclared keys — so
an execution preview can never silently carry more data than the approver saw. The
maintenance-chain entries carry structured schemas today; Dotloop and Boom previews stay
prose-only until their vendor-confirmation-required contracts are confirmed, and the
undocumented Rentvine renewal writeback has none by design.

### Connection health-check contracts

Each registry entry's `connection_health_check_ref` points at a deterministic per-system
contract in `lib/integrations/health-checks.ts` (`health.rentvine.api_key`,
`health.leadsimple.rest_api`, `health.dotloop.oauth_app`, `health.quickbooks.oauth_app`,
`health.boom.partner_api`, `health.google_sheets.api`, `health.gmail.workspace_api`).
A contract is ordered metadata — config presence, auth validation, read-only endpoint
probe, rate-limit read — describing what a health check must verify before an action
could ever be considered for execution. `runHealthCheck` only works through an injected
transport and has no default: the module performs no I/O, so production code cannot make
a live call from here. Mocked transports exercise the contracts in tests
(`tests/unit/health-checks.test.ts`, `tests/helpers/mock-connectors.ts`).

### Readiness lifecycle and the production gate

`Planned -> Needs Connection -> Needs Permission -> Ready for Test ->
Approved for Execution` (or `Disabled` at any time).

`production_allowed` may be `true` only when `readiness` is `Approved for Execution` and
`evidence_status` is `Documented` with non-empty `documented_evidence`. This is enforced in
the schema. Every seeded entry today is `production_allowed: false`, which keeps the
registry inside the no-write safety boundary.

### Catalog coverage (2026-06-12 expansion)

The seed catalog (`lib/integrations/action-registry-seed.ts`) now holds 17 entries: the
original 9 plus read-only `rentvine.lease.read` and `rentvine.work_order.read` (documented
lease/work-order list/view used for renewal-candidate discovery and chain verification),
`leadsimple.task.create` (orchestration task creation, vendor-confirmation-required), the
Gmail Inbox 0 pair `gmail.label.apply` / `gmail.draft.create` (per
`docs/products/gmail-inbox-zero.md`: additive labels and unsent drafts only, no send
capability in any scope; both stay `Planned` until the client approves the Gmail access
model), and the lease-renewal connector trio `google_sheets.renewal_checklist.{read,
reconcile,writeback}` (per `docs/products/lease-renewal-connector-design.md` §5.2: read the
mapped tabs with tabs 4 & 7 denied at the connector boundary; reconcile fields into flags,
never writes; and the one approval-gated single-cell write-back, `Documented` + `Planned`,
gated behind the §4.0 admin feature flag — off by default — and an approved per-action spec).
Move-Out + Deposit Disposition actions were deliberately **not** added: the
research backlog still marks their triggers, approvers, and target systems as TBD, so
catalog entries would invent scope.

### Renewal-notice send policy — per-action spec drafts (S13 F5, spec-only)

These two draft specs frame the future renewal-notice send path for the owner. They are
**docs-only this cycle**: no seed entry, no Gmail runtime, no code. Both stay
`production_allowed: false`. The locked policy (decision 3, 2026-07-02, `F-PRECUST-CYCLE`) is
**unsent draft, human clicks Send** — so only the first action is ever pursued; the second is
recorded as the alternative that was explicitly **not** chosen and would need its own future
decision to reconsider.

**`gmail.renewal_notice.draft_create`** (the policy-aligned action, not yet built)

- `label`: "Create renewal-notice Gmail draft (unsent)"
- `target_system`: Gmail
- `product_lane`: Lease Renewal Agent
- `expected_action`: Create an UNSENT Gmail draft in the approval sender's mailbox from an
  owner-approved renewal notice (reusing the built `buildOwnerRenewalDraft` /
  `buildTenantOfferDraft` composers with the verbatim `DRAFT_BANNER`). The operator opens the
  draft in Gmail and clicks Send. Never sends from the app.
- `readiness`: `Needs Permission` — blocked on the client-approved Gmail access model (sender
  identity, OAuth scope `gmail.compose` on `kb-automation@pmikcmetro.com`) and a per-action spec.
- `evidence_status`: `Documented` — Gmail API `users.drafts.create` is a documented,
  compose-only (no send) capability; the gap is the access-model approval, not the API.
- `required_permissions`: `https://www.googleapis.com/auth/gmail.compose` (create/read/update
  drafts; **no** `gmail.send`), domain-wide delegation as the approval sender, inside the
  `pmikcmetro.com` boundary.
- `preview_schema_note`: the approver sees the exact recipient, subject, and body (banner
  included) before the draft is created; no auto-population of the To field beyond the
  owner-approved recipient.
- `rollback_note`: an unsent draft is deletable with no external effect; nothing leaves the
  mailbox until a human sends it.
- `connection_health_check_ref`: `health.gmail.workspace_api`.
- `production_allowed`: **false**.

**`gmail.renewal_notice.send`** (the alternative — explicitly NOT chosen)

- `label`: "Send renewal notice from the app (autonomous send)"
- `expected_action`: Send the renewal notice directly (auto-send after queue approval).
- `readiness`: `Disabled`. The owner chose the unsent-draft model; app-initiated send stays
  off. This entry exists only to make the rejected alternative auditable.
- `evidence_status`: `Undocumented` (policy, not capability) — reviving it requires a new owner
  decision that overrides decision 3 plus a full per-action spec.
- `required_permissions`: would need `gmail.send` — deliberately **not** requested.
- `production_allowed`: **false** (and would stay false without an explicit future approval).

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
