import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";

/**
 * Verified Action Registry catalog. One entry per external action type from the integration
 * research (docs/research/integration-capability-2026-06.md) and the tool-role architecture
 * (docs/integration-architecture.md).
 *
 * Safety invariant: every entry is `production_allowed: false`. This catalog is metadata
 * only and authorizes no external write. Readiness and evidence reflect documented
 * capability today; an approved per-action spec is still required before any entry can be
 * marked production-eligible (and the schema only permits that for `Approved for Execution`
 * entries with `Documented` evidence).
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
    rollback_note:
      "Cancel or close the created work order in Rentvine and record the reversal in the workflow run.",
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
    rollback_note: "Restore the prior status value recorded in the workflow run.",
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
    rollback_note: "Set the stage back to the recorded prior value.",
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
    rollback_note: "Void or delete the draft bill before it is posted.",
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
    rollback_note:
      "Mark or remove the appended row; sheets stay an exception surface only.",
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
    production_allowed: false,
  },
];
