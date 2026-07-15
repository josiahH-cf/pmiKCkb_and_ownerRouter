import type { PreviewPayloadField } from "@/lib/firestore/types";

type FieldType = PreviewPayloadField["type"];
type SourceSystem = PreviewPayloadField["source_system"];

const f = (
  name: string,
  label: string,
  type: FieldType,
  source_system: SourceSystem = "KB Internal",
  required = true,
): PreviewPayloadField => ({ name, label, type, required, source_system });

/**
 * Exact, bodyless preview contracts for every S25/S26 external action. These schemas are
 * overlaid onto the durable Action Registry seed so an executor can never receive a field
 * that the approving human did not see. Values are supplied only by server-owned adapters.
 */
export const FINAL_V1_ACTION_PREVIEW_SCHEMAS: Readonly<
  Record<string, readonly PreviewPayloadField[]>
> = Object.freeze({
  "gmail.renewal_notice.draft_create": [
    f("workflow_context", "Workflow context", "reference"),
    f("template_ref", "Approved artifact", "reference"),
    f("from", "From", "string", "Gmail"),
    f("to", "Recipient", "string"),
    f("subject", "Subject", "string"),
    f("body", "Exact draft body", "string"),
    f("recipient_source_ref", "Recipient source", "reference"),
    f("mailbox_source_ref", "Mailbox source", "reference"),
    f("draft_banner_present", "Review banner present", "boolean"),
  ],
  "gmail.renewal_notice.send": [
    f("workflow_context", "Workflow context", "reference"),
    f("template_ref", "Approved artifact", "reference"),
    f("from", "From", "string", "Gmail"),
    f("to", "Recipient", "string"),
    f("subject", "Subject", "string"),
    f("body", "Exact body", "string"),
    f("recipient_source_ref", "Recipient source", "reference"),
    f("mailbox_source_ref", "Mailbox source", "reference"),
    f("rfc_message_id", "RFC Message-ID", "reference"),
  ],
  "gmail.thread.reply": [
    f("workflow_context", "Workflow context", "reference"),
    f("template_ref", "Approved artifact", "reference"),
    f("from", "From", "string", "Gmail"),
    f("recipients", "Recipients", "string", "Gmail"),
    f("subject", "Subject", "string", "Gmail"),
    f("body", "Exact body", "string"),
    f("thread_ref", "Thread", "reference", "Gmail"),
    f("rfc_message_id", "RFC Message-ID", "reference"),
  ],
  "gmail.label.apply": [
    f("thread_ref", "Thread", "reference", "Gmail"),
    f("workflow_context", "Workflow context", "reference"),
    f("suggested_label", "Governed label", "enum"),
    f("rule_ref", "Approved label rule", "reference"),
    f("reason", "Human reason", "string"),
  ],
  "google_sheets.renewal_checklist.writeback": [
    f("tab", "Tab", "reference", "Google Sheets"),
    f("row_key", "Re-anchored row key", "reference", "Google Sheets"),
    f("column", "Column", "reference", "Google Sheets"),
    f("before_value", "Before value", "string", "Google Sheets"),
    f("after_value", "After value", "string"),
    f("source_of_value", "Source of value", "string"),
    f("verification_link", "Verification link", "string"),
  ],
  "rentvine.lease.renewal_writeback": [
    f("lease_ref", "Lease", "reference", "Rentvine"),
    f("current_rent", "Current rent", "number", "Rentvine"),
    f("new_rent", "Approved new rent", "number"),
    f("effective_date", "Effective date", "date"),
    f("lease_end_date", "Lease end date", "date", "Rentvine"),
    f("fee_cents", "Approved fee", "number"),
  ],
  "dotloop.loop.create_from_template": [
    f("workflow_context", "Workflow context", "reference"),
    f("template_ref", "Template", "reference", "Dotloop"),
    f("participant_refs", "Participants", "string"),
  ],
  "dotloop.document.upload": [
    f("loop_ref", "Loop", "reference", "Dotloop"),
    f("document_ref", "Document", "reference"),
    f("document_type", "Document type", "enum"),
    f("content_hash", "Content hash", "reference"),
  ],
  "rentvine.renewal.portal_message.send": [
    f("workflow_context", "Workflow context", "reference"),
    f("recipient", "Recipient", "reference", "Rentvine"),
    f("thread_ref", "Portal thread", "reference", "Rentvine"),
    f("template_ref", "Approved artifact", "reference"),
    f("body", "Exact message", "string"),
  ],
  "sms.renewal_message.send": [
    f("workflow_context", "Workflow context", "reference"),
    f("recipient", "Recipient", "string"),
    f("sender", "Approved sender", "string"),
    f("template_ref", "Approved artifact", "reference"),
    f("body", "Exact bounded text", "string"),
    f("consent_ref", "Consent evidence", "reference"),
  ],
  "boom.resident.enroll": [
    f("applicable", "Applicability", "boolean"),
    f("resident_ref", "Resident", "reference", "Boom"),
    f("rule_ref", "Applicability rule", "reference"),
  ],
  "vendor.account.invite": [
    f("vendor_email", "Vendor email", "string"),
    f("ticket_ref", "Initial ticket", "reference"),
    f("artifact_ref", "Invite artifact", "reference"),
    f("reason", "Admin reason", "string"),
  ],
  "vendor.account.disable": [
    f("vendor_ref", "Vendor", "reference"),
    f("vendor_uid", "Vendor identity", "reference"),
    f("reason", "Admin reason", "string"),
  ],
  "vendor.assignment.change": [
    f("vendor_ref", "Vendor", "reference"),
    f("ticket_ref", "Ticket", "reference"),
    f("assignment_operation", "Assignment operation", "enum"),
    f("reason", "Admin reason", "string"),
  ],
  "vendor.gmail.connect": [
    f("vendor_ref", "Vendor", "reference"),
    f("mailbox_email", "Mailbox", "string", "Gmail"),
    f("oauth_scopes", "Exact scopes", "string", "Gmail"),
    f("redirect_uri", "Redirect URI", "string"),
  ],
  "vendor.gmail.revoke": [
    f("vendor_ref", "Vendor", "reference"),
    f("mailbox_email", "Mailbox", "string", "Gmail"),
    f("reason", "Revocation reason", "string"),
  ],
  "vendor.gmail.health": [
    f("vendor_ref", "Vendor", "reference"),
    f("mailbox_email", "Mailbox", "string", "Gmail"),
  ],
  "google_drive.maintenance_photo.store": [
    f("ticket_ref", "Ticket", "reference"),
    f("folder_ref", "Ticket folder", "reference", "Google Drive"),
    f("server_filename", "Server-derived filename", "string"),
    f("mime_type", "MIME type", "string"),
    f("size_bytes", "Size", "number"),
    f("content_hash", "Content hash", "reference"),
    f("assigned_ticket", "Assigned ticket", "boolean"),
    f("malware_scan_passed", "Malware scan passed", "boolean"),
    f("sensitivity_scan_passed", "Sensitivity scan passed", "boolean"),
    f("append_only", "Append only", "boolean"),
  ],
  "rentvine.work_order.create": [
    f("property_unit", "Property / unit", "reference", "Rentvine"),
    f("vendor_trade", "Vendor / trade", "reference", "Rentvine"),
    f("description", "Work description", "string"),
    f("priority", "Priority", "enum"),
    f("expected_status", "Resulting status", "enum", "Rentvine"),
  ],
  "rentvine.work_order.assign_vendor": [
    f("work_order_id", "Work order", "reference", "Rentvine"),
    f("current_vendor", "Current Vendor", "reference", "Rentvine"),
    f("target_vendor", "Target Vendor", "reference", "Rentvine"),
    f("current_status", "Current status", "enum", "Rentvine"),
    f("reason", "Assignment reason", "string"),
  ],
  "rentvine.work_order.update_status": [
    f("work_order_id", "Work order", "reference", "Rentvine"),
    f("current_status", "Current status", "enum", "Rentvine"),
    f("target_status", "Target status", "enum", "Rentvine"),
    f("completion_evidence", "Completion evidence present", "boolean"),
    f("financial_checks_passed", "Financial checks passed", "boolean"),
    f("owner_checks_passed", "Owner checks passed", "boolean"),
  ],
  "gmail.maintenance_owner_notice.send": [
    f("workflow_context", "Workflow context", "reference"),
    f("ticket_ref", "Ticket", "reference"),
    f("template_ref", "Approved artifact", "reference"),
    f("from", "From", "string", "Gmail"),
    f("recipients", "Owner recipient", "string"),
    f("subject", "Subject", "string"),
    f("body", "Exact body", "string"),
    f("recipient_source_ref", "Recipient source", "reference"),
    f("mailbox_source_ref", "Mailbox source", "reference"),
    f("rfc_message_id", "RFC Message-ID", "reference"),
  ],
  "vendor.gmail.thread.read": vendorThreadFields(),
  "vendor.gmail.draft.create": [
    ...vendorThreadFields(),
    f("recipient", "Recipient", "string", "Gmail"),
    f("template_ref", "Approved artifact", "reference"),
    f("body", "Exact draft body", "string"),
  ],
  "vendor.gmail.thread.reply": [
    ...vendorThreadFields(),
    f("recipient", "Recipient", "string", "Gmail"),
    f("template_ref", "Approved artifact", "reference"),
    f("body", "Exact reply body", "string"),
    f("rfc_message_id", "RFC Message-ID", "reference"),
  ],
  "vendor.gmail.label.apply": [
    ...vendorThreadFields(),
    f("suggested_label", "Governed label", "enum"),
    f("rule_ref", "Approved label rule", "reference"),
    f("reason", "Human reason", "string"),
  ],
  "leadsimple.process.update_stage": [
    f("process_id", "Process", "reference", "LeadSimple"),
    f("current_stage", "Current stage", "enum", "LeadSimple"),
    f("target_stage", "Target stage", "enum", "LeadSimple"),
  ],
  "leadsimple.task.create": [
    f("process_id", "Process", "reference", "LeadSimple"),
    f("task_ref", "Task idempotency reference", "reference"),
    f("task_title", "Task title", "string"),
    f("assignee_ref", "Assignee", "reference", "LeadSimple"),
    f("due_date", "Due date", "date"),
  ],
  "quickbooks.bill.create_draft": [
    f("vendor", "Vendor", "reference", "QuickBooks"),
    f("amount", "Amount cents", "number"),
    f("currency", "Currency", "enum"),
    f("account", "Account", "reference", "QuickBooks"),
    f("rentvine_work_order_number", "Rentvine work order", "reference", "Rentvine"),
    f("property_unit", "Property / unit", "reference", "Rentvine"),
  ],
});

function vendorThreadFields(): PreviewPayloadField[] {
  return [
    f("vendor_ref", "Vendor", "reference"),
    f("mailbox_email", "Mailbox", "string", "Gmail"),
    f("ticket_ref", "Assigned ticket", "reference"),
    f("thread_ref", "Linked thread", "reference", "Gmail"),
  ];
}
