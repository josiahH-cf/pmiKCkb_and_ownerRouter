import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";

/**
 * Verified Action Registry catalog. One entry per external action type from the integration
 * research (docs/research/integration-capability-2026-06.md), the tool-role architecture
 * (docs/integration-architecture.md), and the workflow-communication architecture.
 *
 * Safety invariant: only the self-mailbox, workflow-linked read/reply/label/reply-draft transport
 * actions are production-eligible. Generic new-message send and sample-backed renewal or
 * maintenance initiations stay false. Google documents gmail.compose as send-capable, so every
 * no-send/draft-only ceiling is enforced by route, action, confirmation, and audit contracts.
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
export const ACTION_REGISTRY_SEED: CreateActionRegistryInput[] = [
  {
    key: "rentvine.work_order.create",
    label: "Create Rentvine work order",
    target_system: "Rentvine",
    expected_action: "Create a maintenance work order in Rentvine.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Rentvine API documents work-order create/list/view, statuses, vendor trades, inspections, and file uploads.",
    required_permissions: ["Rentvine API key with work-order write role"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show property/unit, vendor/trade, description, priority, and the resulting Rentvine work-order fields before creating.",
    preview_payload_schema: [
      {
        name: "property_unit",
        label: "Property / unit",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "vendor_trade",
        label: "Vendor / trade",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "description",
        label: "Work description",
        type: "string",
        required: true,
        source_system: "KB Internal",
      },
      {
        name: "priority",
        label: "Priority",
        type: "enum",
        required: true,
        source_system: "KB Internal",
        note: "Rentvine work-order priority vocabulary.",
      },
      {
        name: "expected_status",
        label: "Resulting work-order status",
        type: "enum",
        required: true,
        source_system: "Rentvine",
      },
    ],
    rollback_note:
      "Cancel or close the created work order in Rentvine and record the reversal in the workflow run.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
  },
  {
    key: "rentvine.work_order.read",
    label: "Read Rentvine work orders",
    target_system: "Rentvine",
    expected_action:
      "Read work-order state from Rentvine for read-only verification of the maintenance chain.",
    product_lane: "PMI KC KB",
    readiness: "Needs Connection",
    evidence_status: "Documented",
    documented_evidence:
      "Rentvine API documents work-order list/view; no webhooks exist, so state is read by polling or LeadSimple sync.",
    required_permissions: ["Rentvine API key with work-order read role"],
    event_ingestion_mode: "Polling",
    preview_schema_note:
      "Show the work-order id or list filter being read; read-only, nothing changes.",
    preview_payload_schema: [
      {
        name: "work_order_id",
        label: "Work-order id",
        type: "reference",
        required: false,
        source_system: "Rentvine",
        note: "Omit to read a filtered list instead of a single work order.",
      },
      {
        name: "list_filter",
        label: "List filter",
        type: "string",
        required: false,
        source_system: "KB Internal",
      },
    ],
    rollback_note: "Read-only; nothing to roll back.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
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
      "Rentvine documents work-order status creation; LeadSimple documents stage-to-status mapping back into Rentvine.",
    required_permissions: ["Rentvine API key with work-order write role"],
    event_ingestion_mode: "LeadSimple Sync",
    preview_schema_note:
      "Show the work-order id, current status, and target status before updating.",
    preview_payload_schema: [
      {
        name: "work_order_id",
        label: "Work-order id",
        type: "reference",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "current_status",
        label: "Current status",
        type: "enum",
        required: true,
        source_system: "Rentvine",
      },
      {
        name: "target_status",
        label: "Target status",
        type: "enum",
        required: true,
        source_system: "Rentvine",
      },
    ],
    rollback_note: "Restore the prior status value recorded in the workflow run.",
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
    label: "Write a reconciled value back to the renewal-checklist sheet",
    target_system: "Google Sheets",
    expected_action:
      "Write a single agreed, reconciled value back to its originating sheet cell via the re-anchored cell map with read-after-write verification.",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Documented",
    documented_evidence:
      "Google Sheets API documents single-cell value writes (spreadsheets.values.update) and read-after-write reads; the §4.1-4.3 write-back model re-anchors the row, compare-and-sets, reads after write, and stays single-cell. Documented (there is no vendor to confirm Sheets writes); execution stays gated behind the §4.0 admin feature flag and an approved per-action spec.",
    required_permissions: [
      "Google Sheets API write access to the approved renewal-checklist sheet",
      "Admin-enabled write-back feature flag (off by default) + per-console-user suggest/approve permission (§4.0)",
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
      "Phase-2 only and off by default; until an Admin enables the feature flag and assigns per-console-user permissions, write-back exists only in mocked/in-memory-sheet tests (lib/lease-renewal/writeback.ts).",
    rollback_note:
      "Correction-style rollback: re-write the stored expected_prior_value through the same verified path. Sheets has no universal revert; the original is preserved in the append-only Activity log.",
    connection_health_check_ref: "health.google_sheets.api",
    production_allowed: false,
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
    readiness: "Approved for Execution",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail API documents draft creation via gmail.compose. The owner approved production draft creation on 2026-07-13; this action remains draft-only because its runtime method and action gate never call send. Evidence: docs/evidence/gmail-production-activation-2026-07-13.md.",
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
      "Fake-transport coverage verifies the draft-only method boundary; production proof records identifiers only.",
    rollback_note: "Delete the unsent draft; nothing was sent.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: true,
  },
  {
    key: "gmail.renewal_notice.draft_create",
    label: "Create renewal-notice Gmail draft (unsent)",
    target_system: "Gmail",
    expected_action:
      "Create an unsent Gmail draft in the approval sender's mailbox from an owner-approved renewal notice (owner email or tenant offer email), with the verbatim DRAFT_BANNER in the body; the operator opens it in Gmail and clicks Send. Code never calls send.",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Documented",
    documented_evidence:
      "The Gmail transport and draft-only ceiling are proven, but the current renewal route is backed by sample workspaces rather than an authorized real renewal run. It remains preview-only until authoritative workflow facts and recipient sources are connected.",
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
      "The draft request builders remain deterministic preview artifacts. Runtime creation is blocked while the visible renewal run is simulation/sample data.",
    rollback_note: "Delete the unsent draft; nothing was sent.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "gmail.maintenance_owner_notice.draft_create",
    label: "Create maintenance owner-notice Gmail draft (unsent)",
    target_system: "Gmail",
    expected_action:
      "Create an unsent owner-notice draft from an authorized maintenance ticket and verified owner contact.",
    product_lane: "Maintenance Intake",
    readiness: "Planned",
    evidence_status: "Undocumented",
    documented_evidence:
      "The repository has a deterministic maintenance owner-notice preview, but the ticket record does not yet carry a verified owner-email source. No executable Gmail route is approved.",
    required_permissions: [
      "Authorized maintenance ticket access",
      "Client-confirmed authoritative owner-contact source",
      "Approved owner-notice template and recipient policy",
    ],
    event_ingestion_mode: "Manual",
    preview_schema_note:
      "Before promotion, show ticket reference, verified recipient source, subject, full body with DRAFT_BANNER, and approved template reference.",
    preview_payload_schema: [
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
      },
    ],
    test_notes:
      "Planned only. Falsification must prove missing/conflicting owner facts reject before Gmail client construction.",
    rollback_note: "Delete the unsent draft; nothing was sent.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
  {
    key: "rentvine.lease.renewal_writeback",
    label: "Write lease renewal back to Rentvine",
    target_system: "Rentvine",
    expected_action:
      "Execute a lease renewal or update renewal charges in Rentvine (system-of-record update).",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Undocumented",
    documented_evidence:
      "No public Rentvine endpoint found for executing a renewal or modifying renewal charges; lease export/list/view only. Gated until vendor confirmation.",
    required_permissions: ["Vendor-confirmed Rentvine lease-write capability"],
    event_ingestion_mode: "None",
    preview_schema_note:
      "Not executable: requires a confirmed endpoint and an approved per-action spec before a preview can be defined.",
    rollback_note:
      "Undefined until the endpoint is confirmed; renewal writeback stays non-executable.",
    connection_health_check_ref: "health.rentvine.api_key",
    production_allowed: false,
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
    readiness: "Planned",
    evidence_status: "Documented",
    documented_evidence:
      "S22/S26 define the server-owned uid-to-vendor-to-ticket assignment join.",
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
    label: "Send exact-confirmed renewal notice",
    target_system: "Gmail",
    expected_action:
      "Send one S24-governed renewal notice to the authoritative recipient.",
    product_lane: "Lease Renewal Agent",
    readiness: "Planned",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail compose/send transport is proven; S25 must supply authoritative recipient and receipt.",
    required_permissions: [
      "gmail.compose",
      "Exact confirmation",
      "Authoritative renewal mapping",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show workflow, recipient, artifact/policy/sources, subject, exact body, and RFC Message-ID.",
    rollback_note: "Reconcile by RFC Message-ID and send a reviewed linked correction.",
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
    label: "Send exact-confirmed maintenance owner notice",
    target_system: "Gmail",
    expected_action:
      "Send one maintenance-owner:v1.0 notice to the authoritative owner recipient.",
    product_lane: "PMI KC KB",
    readiness: "Planned",
    evidence_status: "Documented",
    documented_evidence:
      "Gmail transport is proven; S24 freezes the artifact and S26 supplies authoritative owner mapping.",
    required_permissions: [
      "gmail.compose",
      "Authoritative owner mapping",
      "Exact confirmation",
    ],
    event_ingestion_mode: "Webhook",
    preview_schema_note:
      "Show ticket, owner recipient, artifact/policy/sources, exact body, and RFC Message-ID.",
    rollback_note: "Reconcile by RFC Message-ID and send a reviewed linked correction.",
    connection_health_check_ref: "health.gmail.workspace_api",
    production_allowed: false,
  },
];
