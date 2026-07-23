import type {
  ExecutionActionKind,
  ExecutionBlockerCode,
  ExecutionClassification,
  ExecutionRisk,
} from "@/lib/execution/types";

interface ActionPolicy {
  defaultRisk: Exclude<ExecutionRisk, "Blocked">;
  forbidden?: boolean;
  kind: ExecutionActionKind;
  requiresActionRegistry: boolean;
}

/**
 * The immutable server-owned risk floor for every current Action Registry key and every
 * approved S21/S25/S26 key. Browser input is deliberately absent: an instance may be
 * elevated to Blocked by failed gates, but can never lower this floor.
 */
export const EXECUTION_ACTION_POLICIES = {
  "app.content.publish": policy("Medium", "trusted_publication", false),
  "app.local_draft.create": policy("Low", "local_draft", false),
  "boom.resident.enroll": policy("High", "system_of_record_write", true),
  "dotloop.document.upload": policy("High", "document_write", true),
  "dotloop.loop.create_from_template": policy("High", "document_write", true),
  "gmail.draft.create": policy("Medium", "workflow_draft", true),
  "gmail.label.apply": policy("Low", "governed_label", true),
  "gmail.mailbox.read": policy("Low", "read", true),
  "gmail.maintenance_owner_notice.draft_create": policy("Medium", "workflow_draft", true),
  "gmail.maintenance_owner_notice.send": policy("Medium", "workflow_communication", true),
  "gmail.message.send": {
    ...policy("Medium", "workflow_communication", true),
    forbidden: true,
  },
  "gmail.renewal_notice.draft_create": policy("Medium", "workflow_draft", true),
  "gmail.renewal_notice.send": policy("Medium", "workflow_communication", true),
  "gmail.thread.reply": policy("Medium", "workflow_communication", true),
  "google_drive.maintenance_photo.store": policy("Medium", "assigned_ticket_photo", true),
  "google_drive.renewal_comp_screenshot.store": policy(
    "Medium",
    "renewal_comp_screenshot",
    true,
  ),
  "google_sheets.audit_snapshot.append": policy("High", "system_of_record_write", true),
  "google_sheets.renewal_checklist.read": policy("Low", "read", true),
  "google_sheets.renewal_checklist.reconcile": policy("Low", "read", true),
  "google_sheets.renewal_checklist.writeback": policy(
    "High",
    "system_of_record_write",
    true,
  ),
  "leadsimple.process.update_stage": policy("High", "system_of_record_write", true),
  "leadsimple.task.create": policy("High", "system_of_record_write", true),
  "quickbooks.bill.create_draft": policy("High", "accounting_write", true),
  "rentcast.rental_listings.search": policy("Low", "read", true),
  "rentvine.lease.read": policy("Low", "read", true),
  "rentvine.lease.renewal_writeback": policy("High", "system_of_record_write", true),
  "rentvine.renewal.portal_message.send": policy(
    "Medium",
    "workflow_communication",
    true,
  ),
  "rentvine.work_order.assign_vendor": policy("High", "vendor_assignment", true),
  "rentvine.work_order.create": policy("High", "system_of_record_write", true),
  "rentvine.work_order.read": policy("Low", "read", true),
  "rentvine.work_order.update_status": policy("High", "system_of_record_write", true),
  "sms.renewal_message.send": policy("Medium", "workflow_communication", true),
  "vendor.account.disable": policy("High", "identity_write", true),
  "vendor.account.invite": policy("High", "identity_write", true),
  "vendor.assignment.change": policy("High", "vendor_assignment", true),
  "vendor.gmail.connect": policy("High", "oauth_lifecycle", true),
  "vendor.gmail.draft.create": policy("Medium", "workflow_draft", true),
  "vendor.gmail.health": policy("Low", "health", true),
  "vendor.gmail.label.apply": policy("Low", "governed_label", true),
  "vendor.gmail.revoke": policy("High", "oauth_lifecycle", true),
  "vendor.gmail.thread.read": policy("Low", "read", true),
  "vendor.gmail.thread.reply": policy("Medium", "workflow_communication", true),
} as const satisfies Record<string, ActionPolicy>;

export type ExecutionActionKey = keyof typeof EXECUTION_ACTION_POLICIES;

export interface ExecutionTechnicalGates {
  connectionReady: boolean;
  documentedEvidence: boolean;
  endpointDocumented: boolean;
  permissionGranted: boolean;
  productionAllowed: boolean;
  requiredValuesPresent: boolean;
  roleScopeAuthorized: boolean;
  sourceValidated: boolean;
}

export interface WorkflowCommunicationGates {
  exactConfirmed?: boolean;
  governedLabel?: boolean;
  humanInitiated: boolean;
  mailboxScopeAuthorized: boolean;
  recipientMatchesPreview?: boolean;
  reversible?: boolean;
  scheduled?: boolean;
  bulk?: boolean;
  modelTriggered?: boolean;
  workflowLinked: boolean;
}

export interface TrustedPublicationGates {
  configuredRoot: boolean;
  editorScopeAuthorized: boolean;
  malwareCheckPassed: boolean;
  sensitivityCheckPassed: boolean;
  typeAndSizeAllowed: boolean;
  versionAndRollbackReady: boolean;
}

export interface AssignedTicketPhotoGates {
  appendOnly: boolean;
  assignedTicketFolder: boolean;
  malwareCheckPassed: boolean;
  sensitivityCheckPassed: boolean;
  typeAndSizeAllowed: boolean;
}

export interface ExecutionRiskInput {
  actionKey: string;
  technical?: ExecutionTechnicalGates;
  communication?: WorkflowCommunicationGates;
  publication?: TrustedPublicationGates;
  ticketPhoto?: AssignedTicketPhotoGates;
}

export function classifyExecutionRisk(
  input: ExecutionRiskInput,
): ExecutionClassification {
  const action = EXECUTION_ACTION_POLICIES[input.actionKey as ExecutionActionKey];

  if (!action) {
    return blocked(input.actionKey, null, null, false, ["action_unknown"]);
  }

  const blockers: ExecutionBlockerCode[] = [];

  if (action.forbidden) blockers.push("generic_action_forbidden");

  if (action.requiresActionRegistry) {
    addTechnicalBlockers(blockers, input.technical);
  }

  if (
    action.kind === "workflow_communication" ||
    action.kind === "workflow_draft" ||
    action.kind === "governed_label" ||
    (action.kind === "read" && input.actionKey.includes("gmail"))
  ) {
    addCommunicationBlockers(blockers, action.kind, input.communication);
  }

  if (action.kind === "trusted_publication") {
    addPublicationBlockers(blockers, input.publication);
  }

  if (action.kind === "assigned_ticket_photo") {
    addTicketPhotoBlockers(blockers, input.ticketPhoto);
  }

  if (blockers.length > 0) {
    return blocked(
      input.actionKey,
      action.defaultRisk,
      action.kind,
      action.requiresActionRegistry,
      blockers,
    );
  }

  return {
    actionKey: input.actionKey,
    blockers: [],
    defaultRisk: action.defaultRisk,
    kind: action.kind,
    requiresActionRegistry: action.requiresActionRegistry,
    risk: action.defaultRisk,
  };
}

export function hasExecutionActionPolicy(
  actionKey: string,
): actionKey is ExecutionActionKey {
  return actionKey in EXECUTION_ACTION_POLICIES;
}

function policy(
  defaultRisk: Exclude<ExecutionRisk, "Blocked">,
  kind: ExecutionActionKind,
  requiresActionRegistry: boolean,
): ActionPolicy {
  return { defaultRisk, kind, requiresActionRegistry };
}

function blocked(
  actionKey: string,
  defaultRisk: Exclude<ExecutionRisk, "Blocked"> | null,
  kind: ExecutionActionKind | null,
  requiresActionRegistry: boolean,
  blockers: readonly ExecutionBlockerCode[],
): ExecutionClassification {
  return {
    actionKey,
    blockers: Array.from(new Set(blockers)),
    defaultRisk,
    kind,
    requiresActionRegistry,
    risk: "Blocked",
  };
}

function addTechnicalBlockers(
  blockers: ExecutionBlockerCode[],
  gates: ExecutionTechnicalGates | undefined,
) {
  if (!gates?.productionAllowed) blockers.push("action_not_production_allowed");
  if (!gates?.documentedEvidence) blockers.push("documented_evidence_missing");
  if (!gates?.endpointDocumented) blockers.push("endpoint_not_documented");
  if (!gates?.permissionGranted) blockers.push("permission_missing");
  if (!gates?.connectionReady) blockers.push("connection_not_ready");
  if (!gates?.roleScopeAuthorized) blockers.push("role_scope_invalid");
  if (!gates?.requiredValuesPresent) blockers.push("required_value_missing");
  if (!gates?.sourceValidated) blockers.push("source_validation_failed");
}

function addCommunicationBlockers(
  blockers: ExecutionBlockerCode[],
  kind: ExecutionActionKind,
  gates: WorkflowCommunicationGates | undefined,
) {
  if (!gates?.workflowLinked) blockers.push("workflow_link_missing");
  if (!gates?.mailboxScopeAuthorized) blockers.push("mailbox_scope_invalid");

  if (kind === "governed_label") {
    if (!gates?.governedLabel || !gates.reversible) {
      blockers.push("source_validation_failed");
    }
    return;
  }

  if (kind === "workflow_communication") {
    if (!gates?.humanInitiated) blockers.push("human_initiation_missing");
    if (!gates?.exactConfirmed) blockers.push("exact_confirmation_missing");
    if (!gates?.recipientMatchesPreview) blockers.push("recipient_drift");
    if (gates?.scheduled || gates?.bulk || gates?.modelTriggered) {
      blockers.push("unsupported_automation");
    }
  }
}

function addPublicationBlockers(
  blockers: ExecutionBlockerCode[],
  gates: TrustedPublicationGates | undefined,
) {
  if (!gates?.configuredRoot || !gates.editorScopeAuthorized) {
    blockers.push("role_scope_invalid");
  }
  if (!gates?.typeAndSizeAllowed) blockers.push("type_or_size_invalid");
  if (!gates?.malwareCheckPassed) blockers.push("malware_check_failed");
  if (!gates?.sensitivityCheckPassed) blockers.push("sensitivity_check_failed");
  if (!gates?.versionAndRollbackReady) blockers.push("source_validation_failed");
}

function addTicketPhotoBlockers(
  blockers: ExecutionBlockerCode[],
  gates: AssignedTicketPhotoGates | undefined,
) {
  if (!gates?.appendOnly || !gates.assignedTicketFolder) {
    blockers.push("ticket_folder_invalid");
  }
  if (!gates?.typeAndSizeAllowed) blockers.push("type_or_size_invalid");
  if (!gates?.malwareCheckPassed) blockers.push("malware_check_failed");
  if (!gates?.sensitivityCheckPassed) blockers.push("sensitivity_check_failed");
}
