import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { FINAL_V1_ACTION_PREVIEW_SCHEMAS } from "@/lib/integrations/final-v1-action-contracts";

/**
 * Verified Action Registry catalog. One entry per external action type from the integration
 * research (docs/research/integration-capability-2026-06.md), the tool-role architecture
 * (docs/integration-architecture.md), and the workflow-communication architecture.
 *
 * Safety invariant (updated 2026-07-19, F-SEND-AUTHORIZED): the self-mailbox workflow-linked
 * read/reply/label transport actions and the authorized renewal-notice draft-into-Gmail action are
 * production-eligible. Generic non-workflow new-message send stays false as a deliberate safety
 * choice. Google documents gmail.compose as send-capable, so every no-send/draft-only ceiling is
 * enforced by route, action, confirmation, and audit contracts, and sample/test data never produces
 * a real draft.
 *
 * Each entry's `connection_health_check_ref` points at the matching per-system contract in
 * lib/integrations/health-checks.ts. Maintenance-chain entries carry a structured
 * `preview_payload_schema`; Dotloop and Boom previews stay prose-only until their
 * vendor-confirmation-required contracts are confirmed.
 *
 * Deliberately absent: Move-Out + Deposit Disposition actions. The research backlog still
 * marks their triggers, approvers, and target systems as TBD, so adding entries would
 * invent scope.
 */
const BASE_ACTION_REGISTRY_SEED: CreateActionRegistryInput[] = [
  {
    key: "rentvine.work_order.create",
    label: "Create Rentvine work order",
    target_system: "Rentvine",
    expected_action: "Create a maintenance work order in Rentvine.",
    product_lane: "PMI KC KB",
    // Bounded S99 proof window (owner grant 2026-09-02, one TEST create on property 84 only);
    // closed on proof completion by the paired close commit.
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      'Official POST /maintenance/work-orders documents the exact create body: decimal-string ids, boolean isVacant/isOwnerApproved/isSharedWithOwner, string "0" isSharedWithTenant, and sendVendorNotification defaulting TRUE so the serialized false is load-bearing. Success requires the { workOrder, schedulingStatusID } envelope plus a separate detail GET matching every reviewed field.',
    required_permissions: ["Rentvine Manage Work Orders permission"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show the exact ticket-derived property/unit, reviewed description, documented priority, fresh Pending/Open-grouped status, explicit vacancy, optional trade category, and every fixed-off approval/share/notification flag before creating.",
    preview_payload_schema: [
      {
        name: "ticket_ref",
        label: "App ticket",
        type: "reference",
        required: true,
        source_system: "KB Internal",
        note: "The one persisted Live app ticket this create is assembled from.",
      },
      {
        name: "property_id",
        label: "Property",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "unit_id",
        label: "Unit",
        type: "reference",
        required: true,
        source_system: "Rentvine",
        note: "S99 narrows the provider's optional unit to the one verified ticket unit.",
      },
      {
        name: "description",
        label: "Work description",
        type: "string",
        required: true,
        source_system: "KB Internal",
        note: "The exact reviewed ticket description; inline replacements refuse.",
      },
      {
        name: "priority_id",
        label: "Priority",
        type: "enum",
        required: true,
        source_system: "Rentvine",
        note: "Documented create vocabulary only: 1 Low, 2 Medium, 3 High.",
      },
      {
        name: "work_order_status_id",
        label: "Initial status",
        type: "reference",
        required: true,
        source_system: "Rentvine",
        note: "Fresh catalog id whose live primary grouping is Pending or Open.",
      },
      {
        name: "is_vacant",
        label: "Unit is vacant",
        type: "boolean",
        required: true,
        source_system: "KB Internal",
        note: "Explicit staff confirmation; never inferred from missing lease data.",
      },
      {
        name: "vendor_trade_id",
        label: "Maintenance category",
        type: "reference",
        required: false,
        source_system: "Rentvine",
        note: "Trade identity only; grants no Vendor assignment.",
      },
      {
        name: "owner_approved",
        label: "Owner approved",
        type: "boolean",
        required: true,
        source_system: "KB Internal",
        note: "Always false: the app claims no owner approval.",
      },
      {
        name: "shared_with_tenant",
        label: "Resident Portal share",
        type: "string",
        required: true,
        source_system: "Rentvine",
        note: 'Always the exact string "0"; the record stays off the Resident Portal.',
      },
      {
        name: "shared_with_owner",
        label: "Owner Portal share",
        type: "boolean",
        required: true,
        source_system: "Rentvine",
        note: "Always false; the record stays off the Owner Portal.",
      },
      {
        name: "send_vendor_notification",
        label: "Vendor notification",
        type: "boolean",
        required: true,
        source_system: "Rentvine",
        note: "Always false; the provider default is true.",
      },
      {
        name: "send_email",
        label: "Email notification",
        type: "boolean",
        required: true,
        source_system: "Rentvine",
        note: "Always false; the email object is omitted.",
      },
    ],
    rollback_note:
      "Cancellation is a separate reviewed status attempt: move the exact receipt-bound work order to the unique live system Cancelled status; never DELETE.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: true,
  },
  {
    key: "rentvine.work_order.read",
    label: "Read Rentvine work orders",
    target_system: "Rentvine",
    expected_action:
      "Read work-order state from Rentvine for read-only verification of the maintenance chain.",
    product_lane: "PMI KC KB",
    // Reopened inside the S99 create proof window: the governed create requires its own fresh
    // catalog/mapping reads under this exact key; closed again by the paired close commit.
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Official GET /maintenance/work-orders (list rows are { workOrder, contact } wrappers), /maintenance/work-orders/{workOrderID} ({ workOrder, schedulingStatusID }), /maintenance/work-order/statuses, and /maintenance/vendor-trades document the consumed read envelopes. Lists page explicitly at the documented pageSize 15 with a 20-page cap and explicit completeness; no webhooks exist.",
    required_permissions: ["Rentvine Manage Work Orders permission"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show the exact work-order id, or the ticket-bound typed property/unit filter, being read; read-only, nothing changes, and pagination completeness is explicit.",
    preview_payload_schema: [
      {
        name: "work_order_id",
        label: "Work-order id",
        type: "reference",
        required: false,
        source_system: "Rentvine",
        note: "Omit to run the bounded ticket-scoped list read instead.",
      },
      {
        name: "property_id",
        label: "Property filter",
        type: "reference",
        required: false,
        source_system: "Rentvine",
      },
      {
        name: "unit_id",
        label: "Unit filter",
        type: "reference",
        required: false,
        source_system: "Rentvine",
      },
    ],
    rollback_note: "Read-only; nothing to roll back.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: true,
  },
  {
    key: "rentvine.work_order.update_status",
    label: "Update Rentvine work-order status",
    target_system: "Rentvine",
    expected_action: "Update the status of an existing Rentvine work order.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Official POST /maintenance/work-orders/{workOrderID} documents the update; S99 sends only { workOrderStatusID, sendVendorNotification: false, sendReview: false } and accepts only the exact { workOrder } response root. Detail readback must show the target status with every tracked non-status field unchanged. Status ids come from the fresh account catalog, never a hard-coded transition matrix.",
    required_permissions: ["Rentvine Manage Work Orders permission"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show the exact work-order id, fresh current status, fresh-catalog target status, and both fixed-off notification flags before updating.",
    preview_payload_schema: [
      {
        name: "work_order_id",
        label: "Work-order id",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "current_status_id",
        label: "Current status",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "target_status_id",
        label: "Target status",
        type: "reference",
        required: true,
        source_system: "Rentvine",
        note: "Fresh catalog id revalidated by detail read; must differ from current.",
      },
      {
        name: "send_vendor_notification",
        label: "Vendor notification",
        type: "boolean",
        required: true,
        source_system: "Rentvine",
        note: "Always false.",
      },
      {
        name: "send_review",
        label: "Completion review request",
        type: "boolean",
        required: true,
        source_system: "Rentvine",
        note: "Always false; no completion review is requested.",
      },
    ],
    rollback_note:
      "Restore the receipted prior status through a separately previewed, approved, and confirmed status attempt while the work order still holds the receipted target status.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "rentvine.lease.read",
    label: "Read Rentvine leases",
    target_system: "Rentvine",
    expected_action:
      "Read lease, tenant-contact, and date facts from Rentvine to identify renewal candidates (read-only).",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Rentvine API documents lease export/list/view, enough to identify renewal candidates; no renewal-write endpoint is documented.",
    required_permissions: ["Rentvine API key with lease read role"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show the lease id or candidate filter (for example lease-end date range) being read; read-only, nothing changes.",
    preview_payload_schema: [
      {
        name: "lease_id",
        label: "Lease id",
        type: "reference",
        required: false,
        source_system: "Rentvine",
        note: "Omit to read a renewal-candidate list instead of a single lease.",
      },
      {
        name: "lease_end_before",
        label: "Lease end before",
        type: "date",
        required: false,
        source_system: "KB Internal",
      },
    ],
    rollback_note: "Read-only; nothing to roll back.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "leadsimple.process.update_stage",
    label: "Update LeadSimple process stage",
    target_system: "LeadSimple",
    expected_action: "Advance or set the stage of a LeadSimple process.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Vendor-Confirmation-Required",
    documented_evidence:
      "LeadSimple documents an admin-enabled REST API and a direct Rentvine integration; endpoint-by-endpoint coverage sits behind authentication.",
    required_permissions: ["LeadSimple admin-enabled REST API key"],
    required_plan: "LeadSimple Operations plan",
    event_ingestion_mode: "LeadSimple Sync",
    preview_schema_note:
      "Show the process id, current stage, and target stage before changing.",
    preview_payload_schema: [
      {
        name: "process_id",
        label: "Process id",
        type: "reference",
        required: true,
        source_system: "LeadSimple",
      },
      {
        name: "current_stage",
        label: "Current stage",
        type: "enum",
        required: true,
        source_system: "LeadSimple",
      },
      {
        name: "target_stage",
        label: "Target stage",
        type: "enum",
        required: true,
        source_system: "LeadSimple",
      },
    ],
    rollback_note: "Set the stage back to the recorded prior value.",
    connection_health_check_ref: "health.leadsimple.rest_api",
    production_allowed: false,
  },
  {
    key: "leadsimple.task.create",
    label: "Create LeadSimple task",
    target_system: "LeadSimple",
    expected_action:
      "Create an orchestration task or reminder inside a LeadSimple process.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Vendor-Confirmation-Required",
    documented_evidence:
      "LeadSimple is the verified workflow-orchestration layer (task sequencing, stages, reminders); its REST API can read and change account data, but the task-endpoint contract sits behind authentication and needs vendor confirmation.",
    required_permissions: ["LeadSimple admin-enabled REST API key"],
    required_plan: "LeadSimple Operations plan",
    event_ingestion_mode: "LeadSimple Sync",
    preview_schema_note:
      "Show the process id, task title, assignee, and due date before creating the task.",
    rollback_note: "Delete or close the created task in LeadSimple.",
    connection_health_check_ref: "health.leadsimple.rest_api",
    production_allowed: false,
  },
  {
    key: "dotloop.loop.create_from_template",
    label: "Create Dotloop renewal loop from template",
    target_system: "Dotloop",
    expected_action:
      "Create a renewal loop from a template, inserting property info and participants.",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Dotloop API v2 documents loops, templates, participants, the Loop-It facade, and webhooks (OAuth2 approved app).",
    required_permissions: ["Dotloop OAuth2 approved application", "Profile access"],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show the template, property fields, and participant list before creating the loop.",
    rollback_note: "Archive or delete the created loop and remove added participants.",
    connection_health_check_ref: "health.dotloop.oauth_app",
    production_allowed: false,
  },
  {
    key: "dotloop.document.upload",
    label: "Upload document to Dotloop loop folder",
    target_system: "Dotloop",
    expected_action: "Upload a renewal document into a loop folder.",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Dotloop API documents folder creation and multipart document upload to a loop.",
    required_permissions: ["Dotloop OAuth2 approved application", "Loop write access"],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show the loop, folder, file name, and document type before uploading.",
    rollback_note: "Delete the uploaded document from the loop folder.",
    connection_health_check_ref: "health.dotloop.oauth_app",
    production_allowed: false,
  },
  {
    key: "quickbooks.bill.create_draft",
    label: "Create QuickBooks bill draft",
    target_system: "QuickBooks",
    expected_action:
      "Create a draft bill that preserves the Rentvine work-order number and property/unit context.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Intuit QuickBooks Online Accounting API documents Bill, Vendor, Account entities, sparse updates, and webhooks.",
    required_permissions: ["QuickBooks Online OAuth2 app", "Accounting scope"],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show vendor, amount, account, and the referenced Rentvine work-order number and property/unit before creating the draft.",
    preview_payload_schema: [
      {
        name: "vendor",
        label: "Vendor",
        type: "reference",
        required: true,
        source_system: "QuickBooks",
      },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "account",
        label: "Account",
        type: "reference",
        required: true,
        source_system: "QuickBooks",
      },
      {
        name: "rentvine_work_order_number",
        label: "Rentvine work-order number",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "property_unit",
        label: "Property / unit",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
    ],
    rollback_note: "Void or delete the draft bill before it is posted.",
    connection_health_check_ref: "health.quickbooks.oauth_app",
    production_allowed: false,
  },
  {
    key: "boom.resident.enroll",
    label: "Enroll resident in Boom",
    target_system: "Boom",
    expected_action:
      "Enroll a resident in BoomReport rent reporting at move-in or renewal.",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Permission",
    evidence_status: "Vendor-Confirmation-Required",
    documented_evidence:
      "Boom advertises partner/lifecycle APIs, programmatic enrollment, and webhooks, but the endpoint contract is request-only (vendor packet required).",
    required_permissions: ["Boom partner API credentials"],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show resident identity, lease, and enrollment program before enrolling.",
    rollback_note: "Unenroll the resident through the Boom lifecycle API.",
    connection_health_check_ref: "health.boom.partner_api",
    production_allowed: false,
  },
  {
    key: "google_sheets.audit_snapshot.append",
    label: "Write audit snapshot to Google Sheet",
    target_system: "Google Sheets",
    expected_action: "Append an audit/exception snapshot row to a control sheet.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Google Sheets API documents value writes and batchUpdate; Apps Script documents installable triggers.",
    required_permissions: ["Google Sheets API access to the approved control sheet"],
    event_ingestion_mode: "Apps Script",
    preview_schema_note:
      "Show the target sheet, the row shape, and the values before appending.",
    preview_payload_schema: [
      {
        name: "target_sheet",
        label: "Target sheet",
        type: "reference",
        required: true,
        source_system: "Google Sheets",
        note: "Must be the approved exception/control sheet.",
      },
      {
        name: "snapshot_kind",
        label: "Snapshot kind",
        type: "enum",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "row_values",
        label: "Row values",
        type: "string",
        required: true,
        source_system: "KB Internal",
        note: "Rendered row exactly as it will be appended.",
      },
    ],
    rollback_note:
      "Mark or remove the appended row; sheets stay an exception surface only.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: false,
  },
  {
    key: "google_sheets.renewal_checklist.read",
    label: "Read the renewal-checklist sheet",
    target_system: "Google Sheets",
    expected_action:
      "Read the mapped renewal tabs/columns from the team's lease-renewal checklist sheet (read-only).",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Google Sheets API documents value reads (spreadsheets.values.get/batchGet) and tab/grid metadata; the renewal semantic map (docs/products/lease-renewal-spreadsheet-map.md) defines the in-scope tabs and columns. Read-only; the credential/sensitive tabs 4 & 7 are excluded at the connector boundary.",
    required_permissions: [
      "Google Sheets API read access to the approved renewal-checklist sheet",
      "Tab scope limited to the mapped renewal tabs; tabs 4 & 7 are denied at the connector boundary (hard-exclusion, not a runtime toggle)",
    ],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show the target sheet and the in-scope tab/column set being read (tabs 4 & 7 excluded); read-only, nothing changes.",
    preview_payload_schema: [
      {
        name: "target_sheet",
        label: "Target sheet",
        type: "reference",
        required: true,
        source_system: "Google Sheets",
        note: "Must be the approved renewal-checklist sheet.",
      },
      {
        name: "tab_scope",
        label: "Tab scope",
        type: "string",
        required: true,
        source_system: "KB Internal",
        note: "Mapped renewal tabs only; tabs 4 & 7 are excluded at the connector boundary.",
      },
    ],
    rollback_note: "Read-only; nothing to roll back.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: false,
  },
  {
    key: "google_sheets.renewal_checklist.reconcile",
    label: "Reconcile renewal-checklist fields",
    target_system: "Google Sheets",
    expected_action:
      "Deterministically reconcile each renewal field across the sheet, Rentvine (read-authoritative), building-level facts, and the Google Form, emitting flags only.",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Documented",
    documented_evidence:
      "Reconciliation rules derive from the semantic map and the connector design §3.2/§6.1; the step compares sheet values against Rentvine (read-authoritative), building-level facts, and the Google Form and routes severity. It produces flags, never a write.",
    required_permissions: [
      "Read access to the renewal-checklist sheet (via the read connector)",
      "Rentvine API key with lease read role (read-authoritative reconciliation input)",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the field being reconciled, the compared source values (sheet / Rentvine / form / building), and the resulting flag + severity; produces flags, never a write.",
    rollback_note: "Produces flags only; nothing to roll back.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: false,
  },
  {
    key: "google_sheets.renewal_checklist.writeback",
    label: "Retired broad Sheet writeback identifier (non-executable)",
    target_system: "Google Sheets",
    expected_action:
      "None. This broad identifier is retired and permanently non-executable; the exact S98 keys google_sheets.renewal_checklist.row_append and google_sheets.renewal_checklist.field_update own every operating-Sheet write.",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Retired by S98 (2026-09-02). The historical KB-Proposed abstraction required a provider-owned stable-row transaction/status/tombstone seam Google Sheets does not expose; S98 replaced it with a Sheets-native app-at-most-once contract under the exact google_sheets.renewal_checklist.row_append and google_sheets.renewal_checklist.field_update keys. This identifier remains only so historical dispositions and receipts keep parsing; it cannot grant, prove, or inherit any Sheet write and no window or activation may open it.",
    required_permissions: [
      "None. This identifier is retired and permanently non-executable.",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Show the addressed cell (tab, row_key, column), the before/after values, the source that authorized the value, and the verification link before any write; one human button-press per write.",
    preview_payload_schema: [
      {
        name: "tab",
        label: "Tab",
        type: "reference",
        required: true,
        source_system: "Google Sheets",
      },
      {
        name: "row_key",
        label: "Re-anchored row key",
        type: "reference",
        required: true,
        source_system: "Google Sheets",
        note: "Content-anchored row identity, re-resolved at write time (not a raw row index).",
      },
      {
        name: "column",
        label: "Column",
        type: "reference",
        required: true,
        source_system: "Google Sheets",
      },
      {
        name: "before_value",
        label: "Before value",
        type: "string",
        required: true,
        source_system: "Google Sheets",
        note: "The compare-and-set expected_prior_value read from the cell.",
      },
      {
        name: "after_value",
        label: "After value",
        type: "string",
        required: true,
        source_system: "KB Internal",
        note: "The agreed reconciled value to write.",
      },
      {
        name: "source_of_value",
        label: "Source of value",
        type: "string",
        required: true,
        source_system: "KB Internal",
        note: "Which reconciliation source authorized the resolved value.",
      },
      {
        name: "verification_link",
        label: "Verification link",
        type: "string",
        required: true,
        source_system: "KB Internal",
        note: "Deep link to the workflow-run / reconciliation evidence for the write.",
      },
    ],
    test_notes:
      "The app-plane contract is unit/Firestore proven to the provider seam. Preview and commit independently refuse before any live Sheet read when any required provider primitive is absent. The committed key and feature flag remain off; fixed-A1 smoke primitives are synthetic evidence only.",
    rollback_note:
      "Separately preview and exact-confirm a correction that clears only the receipted provider effect. The provider must condition atomically on the current cell generation so every intervening edit, including same-value ABA, blocks the clear.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: false,
  },
  {
    key: "google_sheets.renewal_checklist.row_append",
    label: "Append one operating renewal Sheet row",
    target_system: "Google Sheets",
    expected_action:
      "One atomic spreadsheets.batchUpdate whose single appendCells request appends one exact row after the current logical Renewals table with the system note on the resolved tenant_name cell (PMI KC writeback — operation <opaque id> — lease <provider id> — property <provider id>; the sealed proof mode uses the TEST — PMI KC writeback proof — prefix). The same capability owns ONLY the separately confirmed receipt-bound reversal of that exact unchanged app-appended row through one batchUpdate deleteDimension ROWS request; no other key or category can delete a row.",
    product_lane: "Lease Renewal Agent",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "The official Sheets batchUpdate/appendCells contract applies its single subrequest atomically and writes RowData values plus the note in one call; deleteDimension removes exactly one ROW range. Sheets exposes no operation-status or idempotency ledger for these requests, so the app claims one attempt before the call, an uncertain response parks ambiguous and never retries, and reconciliation searches the exact opaque note identity, reporting observed state without claiming causality. The append requires server-resolved provider lease/property ids and a nonblank source-backed tenant_name; renewal_date is never inferred from RentVine endDate; the browser cannot select mode, note, ids, or the row key.",
    required_permissions: [
      "ACTIVATED 2026-09-02 after its passed bounded live proofs on the owner-designated lease 115/property 84: one sealed proof-mode append with the TEST note prefix, exact receipt, and durable succeeded state, then the separately previewed and confirmed receipt-bound deleteDimension reversal of the exact unchanged row with absence readback by the stable note key.",
      "Sheets DWD write scope on the approved operating sheet plus the reviewed operating-write runtime switch",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Show the tab, server-resolved lease/property identity, tenant label, every nonblank field with its exact source, the mode-correct note, and the correction rule. Preview performs zero writes.",
    rollback_note:
      "Only the exact unchanged receipt-bound appended row may be deleted, under a new preview/confirmation, with final readback proving the stable key and note absent.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: true,
  },
  {
    key: "google_sheets.renewal_checklist.field_update",
    label: "Update one supported operating renewal Sheet field",
    target_system: "Google Sheets",
    expected_action:
      "One exact-cell server-side find/replace (matchEntireCell, single GridRange) that replaces one supported checklist cell only while the exact anchored row, resolved header, and expected current value still match; zero occurrences means collaborator drift and nothing changed.",
    product_lane: "Lease Renewal Agent",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "The official Sheets findReplace subrequest is scoped to one grid cell and returns occurrencesChanged, giving a provider-side compare-and-set: 1 means the exact expected value was replaced, 0 means drift with no change. The supported-field allowlist is exactly the 19-field Renewals semantic schema; murky/missing/duplicate headers, protected or merged targets, formulas, ambiguous row identity, and type mismatch refuse before the call. A correction restores the exact receipted prior value under a new confirmation through the same primitive.",
    required_permissions: [
      "ACTIVATED 2026-09-02 after its passed bounded live proofs on the proof row: the blank current_rent compare-and-set to the fresh source-backed charge amount, honestly parked when the Sheet's currency rendering defeated exact readback and reconciled to a durable receipt from fresh provider state under the committed format tolerance, then a separately confirmed forward correction that captured the live formatted rendering as its expected value and restored the receipted prior blank with exact readback.",
      "Sheets DWD write scope on the approved operating sheet plus the reviewed operating-write runtime switch",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Show the tab, stable row identity or anchored row, field, exact expected and proposed values, the value source, and the correction rule. Preview performs zero writes.",
    rollback_note:
      "A separately previewed and confirmed correction compare-and-sets the exact receipted prior value back into the same cell and requires exact readback.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: true,
  },
  {
    key: "gmail.mailbox.read",
    label: "Read signed-in user's Gmail mailbox",
    target_system: "Gmail",
    expected_action:
      "Read mailbox profile and incremental history, and read only a thread already linked to an authorized workflow entity in the signed-in user's own mailbox.",
    product_lane: "Workflow Communications",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail API documents users.getProfile, users.threads.get, users.watch, and users.history.list under gmail.readonly. On 2026-07-13 the owner approved the per-user Gmail connection, and a keyless DWD users.getProfile call matched the signed-in pmikcmetro.com user. The workflow surface additionally requires an authorized bodyless workflow link before a thread read. Evidence: docs/evidence/gmail-production-activation-2026-07-13.md.",
    required_permissions: [
      "Owner-approved per-user DWD access model restricted to server-verified pmikcmetro.com users",
      "Verified https://www.googleapis.com/auth/gmail.readonly on DWD client 104374162913177846911",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show the signed-in mailbox identity and authorized workflow context; no arbitrary inbox query, cross-mailbox access, or mutation.",
    rollback_note:
      "Set production_allowed false, remove gmail.readonly from the DWD client, stop watches, and redeploy the prior revision.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "gmail.message.send",
    label: "Generic Gmail new-message send (not exposed)",
    target_system: "Gmail",
    expected_action:
      "Transport capability retained for evidence only; the workflow product does not expose generic new-message sending.",
    product_lane: "Workflow Communications",
    readiness: "Disabled",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail API documents users.messages.send under gmail.compose and the transport was proven on 2026-07-13, but generic new-message compose is outside the workflow-adapter product boundary. Workflow initiations create unsent drafts instead.",
    required_permissions: [
      "Existing gmail.compose DWD grant",
      "Owner-approved production send activation (2026-07-13)",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Not exposed. A future use would require a workflow-specific action and preview schema.",
    rollback_note:
      "Disable this action and redeploy. A delivered email is not retractable; ambiguous outcomes are reconciled by RFC Message-ID and never automatically retried.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "gmail.thread.reply",
    label: "Send confirmed Gmail thread reply",
    target_system: "Gmail",
    expected_action:
      "Attempt exactly one user-confirmed reply in the signed-in user's selected Gmail thread with matching Subject, threadId, In-Reply-To, and References.",
    product_lane: "Workflow Communications",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail thread guidance documents the required threadId, matching Subject, In-Reply-To, and References contract. The owner approved production reply on 2026-07-13; the runtime adds exact-payload confirmation, idempotency, and bodyless audit. Evidence: docs/evidence/gmail-production-activation-2026-07-13.md.",
    required_permissions: [
      "gmail.readonly for the live parent thread",
      "Existing gmail.compose DWD grant",
      "Owner-approved production reply activation (2026-07-13)",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Show workflow context, approved template, exact From/recipients/Subject/body, thread id, In-Reply-To, References, and RFC Message-ID before confirmation.",
    preview_payload_schema: [
      {
        name: "workflow_context",
        label: "Workflow context",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "template_ref",
        label: "Approved reply template",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "from",
        label: "From",
        type: "string",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "recipients",
        label: "Recipients",
        type: "string",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "subject",
        label: "Subject",
        type: "string",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "body",
        label: "Exact body",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "thread_ref",
        label: "Thread",
        type: "reference",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "rfc_message_id",
        label: "RFC Message-ID",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
    ],
    rollback_note:
      "Disable this action and redeploy. A delivered reply is not retractable; ambiguous outcomes are reconciled before any new attempt.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "gmail.label.apply",
    label: "Apply Gmail triage label",
    target_system: "Gmail",
    expected_action:
      "Apply a visible user label to a selected thread in the signed-in user's mailbox.",
    product_lane: "Workflow Communications",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail API documents user-label creation under gmail.labels and thread label mutation under gmail.modify. Both scopes were authorized on DWD client 104374162913177846911 and the owner approved production label application on 2026-07-13. Evidence: docs/evidence/gmail-production-activation-2026-07-13.md.",
    required_permissions: [
      "Owner-approved label-mutation action model",
      "Verified gmail.labels and gmail.modify DWD grants",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show the thread, the suggested label, and the matching rule or reason before applying.",
    preview_payload_schema: [
      {
        name: "thread_ref",
        label: "Thread",
        type: "reference",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "workflow_context",
        label: "Workflow context",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "suggested_label",
        label: "Suggested label",
        type: "enum",
        required: true,
        source_system: "KB Internal",
        note: "One of: Waiting on Outside, Waiting on Team, Dan Decision, Draft Ready.",
      },
      {
        name: "rule_ref",
        label: "Approved label rule",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "reason",
        label: "Human reason",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
    ],
    rollback_note: "Remove the applied label; labels are additive and reversible.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "gmail.draft.create",
    label: "Create Gmail reply draft",
    target_system: "Gmail",
    expected_action:
      "Create an unsent reply draft in a thread from an approved reply pattern; Dan presses Send manually.",
    product_lane: "Workflow Communications",
    readiness: "Ready for Test",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail API documents draft creation via gmail.compose, and the transport has fake-client coverage. The current route has no exact-confirmation, idempotency/one-attempt ledger, or user-operable reviewed-draft receipt, so Live execution remains gate-closed while the isolated Test lane can exercise the contract.",
    required_permissions: [
      "Owner-approved per-user draft action model",
      "gmail.compose scope (send-capable; this action invokes draft creation only)",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show the thread, the source reply template, and the full draft body before creating the unsent draft.",
    preview_payload_schema: [
      {
        name: "thread_ref",
        label: "Thread",
        type: "reference",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "workflow_context",
        label: "Workflow context",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "template_ref",
        label: "Approved reply template",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "draft_body",
        label: "Draft body",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "draft_banner_present",
        label: "Draft banner present",
        type: "boolean",
        required: true,
        source_system: "KB Internal",
        note: "Drafts carry the review-before-sending banner.",
      },
    ],
    test_notes:
      "Fake-transport coverage verifies the draft-only method boundary. The committed production seed blocks the route before any Gmail client method call until a confirmed, idempotent UI ledger is implemented and reviewed.",
    rollback_note: "Delete the unsent draft; nothing was sent.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "gmail.renewal_notice.draft_create",
    label: "Create renewal-notice Gmail draft (unsent)",
    target_system: "Gmail",
    expected_action:
      "Create an unsent Gmail draft in the approval sender's mailbox from an owner-approved renewal notice (owner email or tenant offer email), with the verbatim DRAFT_BANNER in the body; the operator opens it in Gmail and clicks Send. Code never calls send.",
    product_lane: "Lease Renewal Agent",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Owner granted send/draft authorization across the board (2026-07-19, F-SEND-AUTHORIZED): this draft-into-Gmail action is cleared for production. The executor creates an UNSENT draft only (code never sends); a human presses Send in Gmail. Runtime still requires an authorized real renewal run with verified recipient sources, which is a data-safety guard (sample/test data never produces a real draft), not a governance gate.",
    required_permissions: [
      "Committed DWD grant for the signed-in pmikcmetro.com user (docs/evidence/gmail-dwd-grant-2026-07.md)",
      "gmail.compose scope (this action's route calls only createDraft; separate gmail.send scope absent)",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Show the recipient, subject, and full body (DRAFT_BANNER included) before creating the unsent draft; the To field carries only the owner-approved recipient.",
    preview_payload_schema: [
      {
        name: "to",
        label: "Recipient",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "subject",
        label: "Subject",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "draft_body",
        label: "Draft body",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "draft_banner_present",
        label: "Draft banner present",
        type: "boolean",
        required: true,
        source_system: "KB Internal",
        note: "Drafts carry the review-before-sending banner.",
      },
    ],
    test_notes:
      "The draft request builders remain deterministic preview artifacts. The registry gate is open (2026-07-19); runtime draft creation still requires a real (non-sample) renewal run with verified recipients, so sample/test data yields a preview only and never a real draft.",
    rollback_note: "Delete the unsent draft; nothing was sent.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "gmail.maintenance_owner_notice.draft_create",
    label: "Create maintenance owner-notice Gmail draft (unsent)",
    target_system: "Gmail",
    expected_action:
      "Create an unsent owner-notice draft from an authorized maintenance ticket and verified owner contact.",
    product_lane: "Maintenance Intake",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "The authoritative property-owner email is confirmed present and email-shaped on 25/25 live RentVine leases at portfolio.owners[].email (Slice 1, 2026-07-22; docs/products/rentvine-live-field-map-2026-07-22.md) and resolves via resolveRenewalRecipient's owner channel (owner coverage 25/25, verified live). This gate authorizes DRAFT creation only (unsent, review-before-sending banner) and reuses the proven Gmail DWD draft grant; code never sends. The paired gmail.maintenance_owner_notice.send action stays production_allowed:false.",
    required_permissions: [
      "Authorized maintenance ticket access",
      "gmail.compose (draft only)",
      "Authoritative owner mapping (RentVine portfolio.owners[].email)",
      "Approved owner-notice template and recipient policy",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Before promotion, show ticket reference, verified recipient source, subject, full body with DRAFT_BANNER, and approved template reference.",
    preview_payload_schema: [
      // Aligned 2026-07-31 with the exact values `buildMaintenanceOwnerNoticeDraftAction` emits.
      // The schema previously declared `draft_body` while the implementation emits `body`, and
      // omitted `workflow_context`, `from`, and `mailbox_source_ref` entirely. Preview validation
      // rejects both missing-required and unexpected fields, so the action would have been blocked
      // outright the moment it ran through the S20 preview check.
      {
        name: "workflow_context",
        label: "Workflow context",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "ticket_ref",
        label: "Maintenance ticket",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "recipient_source_ref",
        label: "Verified owner-contact source",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "mailbox_source_ref",
        label: "Authenticated mailbox source",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "from",
        label: "Sender mailbox",
        type: "string",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "to",
        label: "Recipient",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "template_ref",
        label: "Approved template",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "subject",
        label: "Subject",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "body",
        label: "Draft body",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "draft_banner_present",
        label: "Draft banner present",
        type: "boolean",
        required: true,
        source_system: "KB Internal",
      },
    ],
    test_notes:
      "Draft-into-Gmail only, never sends. The registry gate is open (2026-07-22); runtime draft creation still requires a real (non-sample) ticket with a verified owner recipient resolved from the authoritative source (portfolio.owners[].email), so sample/test data yields a preview only and never a real draft. Falsification must prove missing/conflicting owner facts reject before Gmail client construction. The paired send action stays production_allowed:false.",
    rollback_note: "Delete the unsent draft; nothing was sent.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "rentvine.lease.renewal_writeback",
    label: "Retired broad renewal writeback (compatibility identifier)",
    target_system: "Rentvine",
    expected_action:
      "None. S97 retired this broad identifier; it is a non-executable compatibility key and can never name a provider effect.",
    product_lane: "Lease Renewal Agent",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "S97 replaced the ambiguous broad writeback with three exact keys: rentvine.lease.renewal_dates.update, rentvine.lease.recurring_charge.create (whose committed capability alone includes its paired receipt-bound reversal DELETE), and rentvine.lease.recurring_charge.update. This retired identifier remains only so historical references stay resolvable; it cannot grant, prove, or inherit any successor capability and no production execution path reads it.",
    required_permissions: [
      "None. This identifier is retired and permanently non-executable.",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "No preview exists. The S97 exact keys own the renewal-writeback preview contracts; this retired identifier renders only its non-executable status.",
    rollback_note:
      "Not applicable; the identifier performs no effect. Reversal semantics live on the exact S97 keys.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "rentvine.lease.renewal_dates.update",
    label: "Update RentVine lease renewal dates",
    target_system: "Rentvine",
    expected_action:
      "POST /leases/{leaseID} with fresh startDate copied unchanged plus only the changed endDate and/or increaseEligibilityDate (system-of-record update).",
    product_lane: "Lease Renewal Agent",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "The official RentVine contract documents POST /leases/{leaseID} returning an HTTP 200 {lease} wrapper. The S97 body always includes fresh startDate copied unchanged as YYYY-MM-DD and includes changed endDate and/or increaseEligibilityDate only, each YYYY-MM-DD or explicit null; at least one editable date must change, startDate is not editable, and every other lease field is omitted. Execution requires independent fresh GET /leases/{leaseID} readback matching the copied start date, changed dates, and preserved omitted state; exact prior dates are the reversal input. The provider has no proven idempotency or compare-and-set, so the app claims one attempt and never retries ambiguity.",
    required_permissions: [
      "ACTIVATED 2026-09-02 after its passed bounded live proof on the owner-designated lease 115: one confirmed endDate forward effect with exact readback and durable receipt, a duplicate confirmation replayed with no second POST, and a separately previewed/confirmed reversal that restored the exact receipted prior dates.",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the exact lease id, fresh before dates, only the proposed changed dates, the copied startDate, the reversal (exact prior dates), actor, and one-lease scope. Preview performs zero writes.",
    rollback_note:
      "A separately previewed and confirmed reversal POSTs the exact receipted prior dates back to the same lease and requires exact readback; drift refuses automatic reversal.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: true,
  },
  {
    key: "rentvine.lease.recurring_charge.create",
    label: "Create RentVine lease recurring charge",
    target_system: "Rentvine",
    expected_action:
      "POST /leases/{leaseID}/recurring-charges with every required official field explicitly supplied; this key's committed capability alone also owns the paired receipt-bound reversal DELETE /leases/{leaseID}/recurring-charges/{chargeID}.",
    product_lane: "Lease Renewal Agent",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "The official RentVine contract documents POST /leases/{leaseID}/recurring-charges returning an HTTP 200 {recurringCharge} wrapper with optional nullable previousCharge and a positive string leaseRecurringChargeID. Required S97 body values are strings: positive canonical decimal accountID, amount matching ^(?:0|[1-9]\\d*)\\.\\d{2}$, exact nonblank description, canonical dayDue 1-31, explicit canonical frequency 1-24, and real startDate as MM/DD/YYYY; optional real endDate uses MM/DD/YYYY and is omitted for open-ended. No provider default or another lease supplies a value. Execution requires an independent detail GET on the returned id matching every normalized submitted field. The paired reversal DELETE is reachable only from the original create receipt after a fresh detail read canonically equals the receipted projection and a new exact confirmation; its HTTP 200 response is the deleted charge object directly and is followed by detail not-found plus collection absence. No other key or category can grant that DELETE, and arbitrary deletion is unavailable.",
    required_permissions: [
      "ACTIVATED 2026-09-02 after its passed bounded live proof on the owner-designated lease 115: proof charge created (response-shape ambiguity honestly parked, then reconciled from fresh provider state), the receipt-bound reversal DELETE applied with detail-absence plus list-absence proof, and the approved durable update-target charge created cleanly with exact normalized readback.",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the exact lease id, every explicit charge field (accountID, amount, description, dayDue, frequency, startDate, optional endDate), the receipt-bound delete reversal availability, actor, and one-lease scope. Preview performs zero writes.",
    rollback_note:
      "Only the exact unchanged receipt-bound created charge may be deleted, after fresh canonical equality with its create receipt and a separately confirmed preview; absence is then read back. Drift permits read-only reconciliation only and never recreates the charge.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: true,
  },
  {
    key: "rentvine.lease.recurring_charge.update",
    label: "Update RentVine lease recurring charge",
    target_system: "Rentvine",
    expected_action:
      "POST /leases/{leaseID}/recurring-charges/{chargeID} with only changed official fields (system-of-record update).",
    product_lane: "Lease Renewal Agent",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "The official RentVine contract documents POST /leases/{leaseID}/recurring-charges/{chargeID} returning an HTTP 200 {recurringCharge} wrapper with optional nullable previousCharge. The S97 body permits only changed accountID, amount, description, dayDue, frequency, startDate, and/or endDate with the same string wire formats as create; it must be nonempty and null values are rejected. Because the provider documents no clear value, V1 rejects both dated-to-open-ended and open-ended-to-dated endDate transitions: neither has a supported exact inverse. Execution requires an independent exact detail GET where every changed field matches and every omitted field equals the fresh pre-read; the exact prior changed fields are the reversal input.",
    required_permissions: [
      "ACTIVATED 2026-09-02 after its passed bounded live proof on the owner-designated lease 115: one confirmed amount update with exact normalized readback, then a separately previewed/confirmed restore whose readback hash equals the charge's original creation receipt hash exactly.",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the exact lease id, exact charge id, fresh before fields, only the proposed changed fields, the reversal (exact prior changed fields) where every change has a supported exact inverse, actor, and one-charge scope. Preview performs zero writes.",
    rollback_note:
      "A separately previewed and confirmed reversal POSTs the exact receipted prior changed fields back to the same charge and requires exact readback; a change without a supported exact inverse is refused at proposal time.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: true,
  },
  {
    key: "google_drive.maintenance_photo.store",
    label: "Store maintenance photo in Drive",
    target_system: "Google Drive",
    expected_action:
      "Upload a captured maintenance photo to the in-boundary Drive folder, acting as the pmikcmetro.com DWD subject.",
    product_lane: "PMI KC KB",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Google Drive v3 multipart upload is documented; access is keyless domain-wide delegation acting AS a pmikcmetro.com user (mirrors the Sheets reader). Requires the Drive scope authorized for the DWD service account in Admin console -> Domain-wide delegation, plus the maintenance folder id in SPACE_DRIVE_FOLDER_IDS.",
    required_permissions: [
      "Drive scope authorized for the DWD service account (Admin console -> Domain-wide delegation)",
      "Maintenance Drive folder id in SPACE_DRIVE_FOLDER_IDS",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the file name, MIME type, and target in-boundary Drive folder before uploading; nothing tenant/owner-facing is sent.",
    preview_payload_schema: [
      {
        name: "filename",
        label: "File name",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "mime_type",
        label: "MIME type",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "folder_id",
        label: "Target Drive folder",
        type: "reference",
        required: true,
        source_system: "Google Drive",
      },
    ],
    rollback_note:
      "Trash the uploaded file in Drive and remove its reference from the work-order draft.",
    connection_health_check_ref: "health.google_drive.dwd",
    production_allowed: false,
  },
  {
    key: "google_drive.renewal_comp_screenshot.store",
    label: "Store renewal comp screenshot in Drive",
    target_system: "Google Drive",
    expected_action:
      "Upload a renewal comp screenshot to the in-boundary renewal-comp Drive folder, acting as the pmikcmetro.com DWD subject.",
    product_lane: "PMI KC KB",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Reuses the proven maintenance Drive image-store seam (Drive v3 multipart upload, keyless domain-wide delegation acting AS a pmikcmetro.com user, F-DRIVE-DWD, Q-MAINT-STORAGE resolved). The Drive scope is already authorized (2026-06-29); the only remaining prod config is the renewal-comp folder id (RENEWAL_COMP_DRIVE_FOLDER_ID). Draft-only downstream: the stored drive:<id> ref attaches to the owner renewal DRAFT, which stays send_allowed:false.",
    required_permissions: [
      "Drive scope authorized for the DWD service account (Admin console -> Domain-wide delegation)",
      "Renewal-comp Drive folder id in RENEWAL_COMP_DRIVE_FOLDER_ID",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the file name, MIME type, and target in-boundary Drive folder before uploading; nothing tenant/owner-facing is sent.",
    preview_payload_schema: [
      {
        name: "filename",
        label: "File name",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "mime_type",
        label: "MIME type",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "folder_id",
        label: "Target Drive folder",
        type: "reference",
        required: true,
        source_system: "Google Drive",
      },
    ],
    rollback_note:
      "Trash the uploaded file in Drive and remove its reference from the owner renewal draft.",
    connection_health_check_ref: "health.google_drive.dwd",
    production_allowed: false,
  },
  {
    key: "rentcast.rental_listings.search",
    label: "Search RentCast rental listings (reference comps)",
    target_system: "RentCast",
    expected_action:
      "Query comparable long-term rental listings near a property address and aggregate them into a DISPLAY-only comparable-rent range (median point estimate). Read-only reference; never fills or moves the offered rent.",
    product_lane: "PMI KC KB",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Exact-key activation approved by the owner for the 2026-08-26 meeting-readiness run. The production provider is RentCast, RENTCAST_API_KEY is Secret-Manager-backed under the managed runtime identity, the account plan and monthly allowance were read back, and controlled 2026-08-25 live probes returned HTTP 200 for the built provider paths. The adapter is unit-proven, bounded by cache + usage counter + hard allowance stop, sends only the property address/unit filters, returns reference comps, and never sets offeredRent or writes any system of record. Rollback is this exact key back to false (or MARKET_COMP_PROVIDER=manual); no provider mutation needs reversal.",
    required_permissions: [
      "RENTCAST_API_KEY in Secret Manager, accessible only to the managed runtime identity (verified)",
      "Reviewed RentCast plan allowance configured for the hard usage stop (verified)",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the queried property address and the returned comparable-rent range as reference only; the only external datum is the address (no tenant PII, no rent figure sent), and the result never sets the offered rent.",
    preview_payload_schema: [
      {
        name: "queried_address",
        label: "Queried property address",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "comparable_range",
        label: "Returned comparable-rent range (reference only)",
        type: "string",
        required: false,
        source_system: "RentCast",
      },
    ],
    rollback_note:
      "None required: the listings search is a read with no mutation to reverse. A stale or low-confidence result renders a Needs Verification marker rather than a fabricated number.",
    connection_health_check_ref: "health.rentcast.api_key",
    production_allowed: true,
  },
  {
    key: "internal.transactional_notice.send",
    label: "Send internal transactional feedback notice (internal staff only)",
    target_system: "Gmail",
    expected_action:
      "Auto-send ONE metadata-only internal notice to the owner-configured INTERNAL staff destination when a feedback report is filed. Internal-only automation (D-AUTOMATION-LINE); never a client/tenant/owner-of-record/vendor recipient, never the free-text description.",
    product_lane: "PMI KC KB",
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Internal-staff auto-send is authorized by D-AUTOMATION-LINE (F-ROADMAP-BUILD-AUTHORIZED); every client-facing send stays human-confirmed. Recipient resolves ONLY from a non-actor-gated SYSTEM read of the owner transactional destination and MUST pass the internal-domain allowlist (enforced at config-set AND re-asserted at send); a caller-supplied recipient is impossible (no recipient field) and an absent/non-internal destination fails closed. Payload is metadata-only (route, origin, reporter role, ISO time, /admin deep link), never the description (F-SUPP-1 / TIX-8). One attempt per dedup key support_report:{id}:filed with a durable receipt; reuses the already-approved Gmail send scope + the internal transactional sender identity, no new external scope. This is a DEDICATED narrow key — the generic gmail.message.send stays Registry-closed. Built gated in S39.2; FLIPPED to production_allowed:true by the routine reviewed S39.3 change on 2026-07-23 (F-INTERNAL-NOTIFY, docs/facts.md) — this entry SENDS in production. Prose corrected 2026-08-06 (AC-S63-14) to match the flipped state before the S63 report cites its send scope-out.",
    required_permissions: [
      "Gmail send scope (already approved) via the internal transactional sender identity",
      "Owner-configured internal transactional destination (internal domain, Admin-set)",
    ],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the resolved internal recipient, the metadata-only subject/body (route, origin, reporter role, filed time, /admin deep link), and the dedup key; never the free-text feedback description.",
    preview_payload_schema: [
      {
        name: "recipient",
        label: "Internal destination",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "dedup_key",
        label: "Idempotency key",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "route",
        label: "Route (metadata only)",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
    ],
    test_notes:
      "Test-lane proof (S39.2, pre-flip): recipient-lock (SYSTEM read only; non-internal destination refused), metadata-only payload, idempotent one-attempt keyed support_report:{id}:filed, and honest delivered:true|false. The S39.3 flip landed 2026-07-23; the key sends in production.",
    rollback_note:
      "The gate-off kill switch plus the no-double-send idempotency guard plus the durable receipt; there is no client-facing effect to reverse (internal staff notice only), and the feedback queue write is never blocked by a send failure.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "vendor.account.invite",
    label: "Invite external Vendor account",
    target_system: "KB Internal",
    expected_action:
      "Create a scoped Firebase Vendor principal and deliver one setup link.",
    product_lane: "PMI KC KB",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Firebase Admin documents email action links; S22 requires exact-confirmed Admin delivery and verified-email TOTP before detail.",
    required_permissions: ["Identity Platform TOTP", "Approved invitation delivery"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the exact Vendor email, v1.0 invite artifact, and reason before delivery.",
    rollback_note:
      "Disable the Firebase user, revoke sessions, remove assignments, and queue OAuth revocation.",
    connection_health_check_ref: "health.firebase.vendor_identity",
    production_allowed: false,
  },
  {
    key: "vendor.account.disable",
    label: "Disable external Vendor account",
    target_system: "KB Internal",
    expected_action:
      "Disable one Vendor principal, revoke sessions, and deny assigned-ticket access.",
    product_lane: "PMI KC KB",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Firebase Admin documents user disable and refresh-token revocation.",
    required_permissions: ["Firebase Auth Admin"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show Vendor identity, active assignments, mailbox state, and reason.",
    rollback_note:
      "Admin may re-invite after verifying assignments and mailbox revocation state.",
    connection_health_check_ref: "health.firebase.vendor_identity",
    production_allowed: false,
  },
  {
    key: "vendor.assignment.change",
    label: "Change Vendor ticket assignment",
    target_system: "KB Internal",
    expected_action:
      "Assign or remove exactly one external Vendor from one maintenance ticket.",
    product_lane: "PMI KC KB",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "S53 implements the server-owned Live uid-to-vendor-to-ticket assignment join; the named production key remains closed pending its reviewed activation.",
    required_permissions: ["PMI KC Admin"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show ticket reference, current Vendor, target Vendor, and reason.",
    rollback_note:
      "Restore the prior assignment and preserve the bodyless assignment audit.",
    connection_health_check_ref: "health.firebase.vendor_identity",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.connect",
    label: "Connect Vendor Gmail mailbox",
    target_system: "Gmail",
    expected_action:
      "Connect the signed-in Vendor's same-address Gmail through server-side OAuth.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Google documents web-server OAuth, offline access, state, and Gmail scopes.",
    required_permissions: [
      "Vendor consent",
      "OAuth client",
      "Secret Manager token vault",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show exact mailbox, provider, requested scopes, and revocation path.",
    rollback_note:
      "Revoke the grant, destroy token material, and mark the connection revoked.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.revoke",
    label: "Revoke Vendor Gmail mailbox",
    target_system: "Gmail",
    expected_action:
      "Revoke one Vendor OAuth grant and destroy its server-side token material.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Google OAuth documents token revocation; S22 requires queued idempotent cleanup.",
    required_permissions: ["Token-vault destroy", "Google token revocation"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show mailbox key, connection state, affected linked tickets, and reason.",
    rollback_note:
      "Reconnect through a fresh Vendor consent flow; revoked tokens are never restored.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.health",
    label: "Check Vendor Gmail health",
    target_system: "Gmail",
    expected_action:
      "Check the signed-in Vendor's OAuth grant metadata without inbox browsing.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Google OAuth token metadata and Gmail profile endpoints document bounded health checks.",
    required_permissions: ["Vendor OAuth grant"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show mailbox key, granted scopes, last success, and revocation state.",
    rollback_note: "Read-only; mark degraded and require reconnect when invalid.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.thread.read",
    label: "Read assigned Vendor Gmail thread",
    target_system: "Gmail",
    expected_action:
      "Read one explicitly linked Gmail thread for one assigned Vendor ticket.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail documents thread get; S22 removes list/search/arbitrary thread methods.",
    required_permissions: ["gmail.readonly", "Assigned ticket/thread link"],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show assigned ticket, linked thread, mailbox key, and bounded metadata.",
    rollback_note: "Read-only; revoke the link or mailbox connection.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.draft.create",
    label: "Create assigned-ticket Vendor Gmail draft",
    target_system: "Gmail",
    expected_action: "Create one unsent reply draft in an assigned Vendor ticket thread.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail drafts.create is documented; S22 restricts it to assigned linked replies.",
    required_permissions: ["gmail.compose", "Assigned ticket/thread link"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show Vendor mailbox, ticket, thread, recipient, artifact/policy, and exact body.",
    rollback_note: "Delete the unsent draft.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.thread.reply",
    label: "Send assigned-ticket Vendor Gmail reply",
    target_system: "Gmail",
    expected_action:
      "Send one exact-confirmed reply from the Vendor mailbox on an assigned ticket.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail messages.send is documented; S22 binds Vendor/Admin exact confirmation and one attempt.",
    required_permissions: [
      "gmail.compose",
      "Assigned ticket/thread link",
      "Exact confirmation",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show actor, Vendor mailbox, ticket, thread, recipient, policy/artifact, and exact body.",
    rollback_note:
      "Reconcile by RFC Message-ID and send a reviewed correction; never retry ambiguity.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "vendor.gmail.label.apply",
    label: "Apply governed Vendor Gmail label",
    target_system: "Gmail",
    expected_action: "Apply one approved label to an assigned Vendor ticket thread.",
    product_lane: "Workflow Communications",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail thread modify is documented; S22 limits labels to the governed allowlist.",
    required_permissions: ["gmail.modify", "Assigned ticket/thread link"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show Vendor mailbox, assigned ticket/thread, approved label, rule, and reason.",
    rollback_note: "Restore the prior governed label set.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "gmail.renewal_notice.send",
    label: "Retired direct renewal-notice send (not exposed)",
    target_system: "Gmail",
    expected_action:
      "Historical compatibility key retained for evidence only; the product creates an unsent renewal-notice Gmail draft and a person sends it from Gmail.",
    product_lane: "Lease Renewal Agent",
    readiness: "Disabled",
    evidence_status: "Documented",
    documented_evidence:
      "D33 retired app-managed direct client sends. The workflow-specific unsent draft is the final app effect, and this compatibility key remains production_allowed:false rather than a future activation target.",
    required_permissions: [],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Not exposed. Review occurs on the unsent Gmail draft before a person sends from Gmail.",
    rollback_note:
      "No app-managed live effect exists for this key; keep it disabled and use the unsent-draft workflow.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "rentvine.renewal.portal_message.send",
    label: "Send renewal portal message",
    target_system: "Rentvine",
    expected_action:
      "Send one exact-confirmed renewal message in the documented Rentvine portal thread.",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Vendor-Confirmation-Required",
    documented_evidence:
      "The final-V1 action is approved, but the account-specific portal messaging contract is not documented.",
    required_permissions: ["Vendor-confirmed portal endpoint", "Exact confirmation"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show tenant, portal thread, exact message, source refs, and confirmation hash.",
    rollback_note: "Use the documented same-thread correction path after reconciliation.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "sms.renewal_message.send",
    label: "Send renewal SMS",
    target_system: "SMS",
    expected_action:
      "Send one exact-confirmed renewal SMS through PMI KC's documented provider.",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Vendor-Confirmation-Required",
    documented_evidence:
      "The final-V1 action is approved; PMI KC's operating SMS provider/account contract is not yet documented.",
    required_permissions: ["Approved SMS provider/plan/sender", "Exact confirmation"],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show authoritative recipient, sender, exact bounded text, sources, and confirmation hash.",
    rollback_note:
      "Reconcile the provider message id and send a reviewed correction; never retry ambiguity.",
    connection_health_check_ref: "health.sms.provider",
    production_allowed: false,
  },
  {
    key: "rentvine.work_order.assign_vendor",
    label: "Assign Vendor to Rentvine work order",
    target_system: "Rentvine",
    expected_action:
      "Assign one authoritative Rentvine Vendor to one current work order.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Rentvine documents work-order and Vendor/trade resources; account mapping and exact transition proof remain gated.",
    required_permissions: ["Rentvine work-order write", "Approved Vendor mapping"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show work order, current Vendor, target Vendor, current state, and reason.",
    rollback_note: "Restore the prior assignment after read-after-write reconciliation.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "gmail.maintenance_owner_notice.send",
    label: "Retired direct maintenance owner-notice send (not exposed)",
    target_system: "Gmail",
    expected_action:
      "Historical compatibility key retained for evidence only; the product creates an unsent maintenance owner-notice Gmail draft and a person sends it from Gmail.",
    product_lane: "PMI KC KB",
    readiness: "Disabled",
    evidence_status: "Documented",
    documented_evidence:
      "D33 retired app-managed direct client sends. The workflow-specific unsent draft is the final app effect, and this compatibility key remains production_allowed:false rather than a future activation target.",
    required_permissions: [],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Not exposed. Review occurs on the unsent Gmail draft before a person sends from Gmail.",
    rollback_note:
      "No app-managed live effect exists for this key; keep it disabled and use the unsent-draft workflow.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "rentvine.work_order.chat.sync",
    label: "Sync RentVine work-order chat (one confirmed page)",
    target_system: "Rentvine",
    expected_action:
      "Manually confirmed GET /chat/messages for one server-bound Work Order chat: chatObjectTypeID=1, the exact bound work-order id, one confirmed positive page, pageSize=20. The documented read marks retrieved messages read for the manager role, so this is a consequential stateful read; there is no rollback and never an automatic retry, poll, or second page.",
    product_lane: "Maintenance Intake",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Official List Chat Messages documents Basic Auth, the bare-array dotted-key row shape, integer pagination headers, sender roles 1 (manager) and 2 (tenant), attachment metadata, and automatic manager-role read marking. It does not authorize polling, POST /chat/messages, attachment download, or app-side mapping.",
    required_permissions: ["Rentvine chat read permission for the managed account"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the exact app ticket, server-bound work order, the one confirmed page, the fixed page size, and the irreversible manager read-marker consequence before dispatch.",
    preview_payload_schema: [
      {
        name: "ticket_ref",
        label: "App ticket",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "work_order_id",
        label: "Work order",
        type: "reference",
        required: true,
        source_system: "Rentvine",
        note: "Server-bound from the ticket's work-order link; the browser cannot supply it.",
      },
      {
        name: "page",
        label: "Confirmed page",
        type: "string",
        required: true,
        source_system: "Rentvine",
        note: "One explicit positive provider page; older pages need a new confirmation.",
      },
      {
        name: "page_size",
        label: "Page size",
        type: "string",
        required: true,
        source_system: "Rentvine",
        note: 'Always the exact literal "20".',
      },
      {
        name: "marks_read_for_managers",
        label: "Marks messages read for managers",
        type: "boolean",
        required: true,
        source_system: "Rentvine",
        note: "Always true; the documented read marker has no rollback.",
      },
    ],
    rollback_note:
      "None. The provider may have marked retrieved messages read for managers; the app discloses that uncertainty and relies on (account, messageID) deduplication for any later deliberate re-sync.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "gmail.maintenance_resident_reply.draft_create",
    label: "Create unsent resident reply draft (Gmail)",
    target_system: "Gmail",
    expected_action:
      "Create exactly one human-reviewed UNSENT Gmail draft in the signed-in user's connected mailbox, addressed to one server-verified resident email resolved fresh from the authoritative RentVine lease-tenants relation for one mapped resident-origin chat message. Never sends, never posts to RentVine chat, and has no draft-delete capability.",
    product_lane: "Maintenance Intake",
    readiness: "Needs Permission",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail drafts.create is documented for the DWD compose scope; the official Get Lease tenants include documents the exact leaseTenant.contactID plus nested contact.contactID/email fields the recipient resolution consumes. A browser-supplied address, public-intake contact, or message display name is never the recipient.",
    required_permissions: ["Gmail DWD compose scope for the signed-in managed mailbox"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Show the exact From mailbox, single verified resident To, subject, complete banner-bearing body, and the message/ticket/work-order sources before the one confirmation.",
    preview_payload_schema: [
      {
        name: "rfc_message_id",
        label: "Draft RFC Message-ID",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "workflow_context",
        label: "Workflow context",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "ticket_ref",
        label: "Maintenance ticket",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "message_ref",
        label: "Resident chat message",
        type: "reference",
        required: true,
        source_system: "Rentvine",
        note: "The one synchronized resident-origin message this reply answers.",
      },
      {
        name: "recipient_source_ref",
        label: "Verified resident source",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "mailbox_source_ref",
        label: "Authenticated mailbox source",
        type: "reference",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "from",
        label: "Sender mailbox",
        type: "string",
        required: true,
        source_system: "Gmail",
      },
      {
        name: "to",
        label: "Verified resident recipient",
        type: "string",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "subject",
        label: "Subject",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "body",
        label: "Draft body",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "draft_banner_present",
        label: "Review banner present",
        type: "boolean",
        required: true,
        source_system: "KB Internal",
      },
    ],
    rollback_note:
      "A person edits or deletes the still-unsent unchanged draft in Gmail through its exact link; the app has no draft-delete key or method and may only reconcile the observed result.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
];

/**
 * S97-S100 owner-authorized activation program (AGENTS "Owner-authorized activation program",
 * owner proof grant 2026-09-02): the exact keys currently inside a bounded temporary proof window.
 * A key listed here is production_allowed in this seed ONLY for its own live proof and is closed
 * again (list emptied, entry restored) before any other key's window or the final activation
 * patch. Outside a window this list is empty.
 */
export const OWNER_PROOF_WINDOW_OPEN_KEYS: readonly string[] = [
  "rentvine.work_order.create",
  "rentvine.work_order.read",
];

export const ACTION_REGISTRY_SEED: CreateActionRegistryInput[] =
  BASE_ACTION_REGISTRY_SEED.map((entry) => {
    const schema = FINAL_V1_ACTION_PREVIEW_SCHEMAS[entry.key];
    return schema
      ? { ...entry, preview_payload_schema: schema.map((field) => ({ ...field })) }
      : entry;
  });
