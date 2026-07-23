import type { Role } from "@/lib/auth/roles";

export const EXECUTION_RISK_LEVELS = ["Low", "Medium", "High", "Blocked"] as const;

export type ExecutionRisk = (typeof EXECUTION_RISK_LEVELS)[number];

export type ExecutionActionKind =
  | "read"
  | "health"
  | "local_draft"
  | "governed_label"
  | "workflow_draft"
  | "workflow_communication"
  | "trusted_publication"
  | "assigned_ticket_photo"
  | "renewal_comp_screenshot"
  | "system_of_record_write"
  | "document_write"
  | "identity_write"
  | "oauth_lifecycle"
  | "vendor_assignment"
  | "accounting_write";

export type ExecutionBlockerCode =
  | "action_unknown"
  | "action_not_production_allowed"
  | "approval_route_missing"
  | "connection_not_ready"
  | "documented_evidence_missing"
  | "endpoint_not_documented"
  | "exact_confirmation_missing"
  | "generic_action_forbidden"
  | "human_initiation_missing"
  | "mailbox_scope_invalid"
  | "malware_check_failed"
  | "permission_missing"
  | "preview_invalid"
  | "recipient_drift"
  | "required_value_missing"
  | "role_scope_invalid"
  | "sensitivity_check_failed"
  | "source_validation_failed"
  | "ticket_folder_invalid"
  | "type_or_size_invalid"
  | "unsupported_automation"
  | "workflow_link_missing";

export interface ExecutionClassification {
  actionKey: string;
  blockers: readonly ExecutionBlockerCode[];
  defaultRisk: Exclude<ExecutionRisk, "Blocked"> | null;
  kind: ExecutionActionKind | null;
  requiresActionRegistry: boolean;
  risk: ExecutionRisk;
}

export interface ExecutionActor {
  role: Role | "Vendor";
  uid: string;
}

export interface ExecutionApproval {
  approvedByRole: Role;
  approvedByUid: string;
  /** Exact external target/source context approved with the value preview, when present. */
  contextHash?: string;
  previewHash: string;
  reason: string;
}

export type ExecutionAuthorityDisposition =
  | "direct_execution"
  | "admin_approval_required"
  | "approved_execution"
  | "denied";

export interface ExecutionAuthorityDecision {
  canExecute: boolean;
  disposition: ExecutionAuthorityDisposition;
  reason: string;
  risk: ExecutionRisk;
}

export const ACTION_EXECUTION_STATES = [
  "Ready",
  "Awaiting Admin",
  "Approved",
  "Executing",
  "Succeeded",
  "Failed",
  "Needs reconciliation",
  "Returned",
  "Revoked",
] as const;

export type ActionExecutionState = (typeof ACTION_EXECUTION_STATES)[number];

export interface ActionExecutionRecord {
  id: string;
  action_key: string;
  action_kind: ExecutionActionKind;
  actor_role: Role;
  actor_uid: string;
  approval?: ExecutionApproval;
  attempt_count: number;
  correction_reference?: string;
  /** Bodyless hash of server-owned external target/source identity when applicable. */
  context_hash?: string;
  created_at: string;
  idempotency_hash: string;
  last_error_code?: string;
  preview_hash: string;
  requires_action_registry: boolean;
  result_code?: string;
  risk: Exclude<ExecutionRisk, "Blocked">;
  scope_ref?: string;
  state: ActionExecutionState;
  updated_at: string;
}

export type ActionExecutionActivityAction =
  | "prepared"
  | "approved"
  | "returned"
  | "revoked"
  | "claimed"
  | "succeeded"
  | "failed"
  | "reconciliation_required";

export interface ActionExecutionActivityRecord {
  id: string;
  action: ActionExecutionActivityAction;
  action_key: string;
  actor_uid: string;
  created_at: string;
  execution_id: string;
  from_state?: ActionExecutionState;
  reason?: string;
  to_state: ActionExecutionState;
}
