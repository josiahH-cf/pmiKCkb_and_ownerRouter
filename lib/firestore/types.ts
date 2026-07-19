import type { Role } from "@/lib/auth/roles";
import type {
  ACTION_EVENT_MODES,
  ACTION_EVIDENCE_STATUSES,
  ACTION_PREVIEW_FIELD_TYPES,
  ACTION_TARGET_SYSTEMS,
} from "@/lib/constants";
import type { DecisionReasonCode } from "@/lib/lease-renewal/reason-codes";
import type { Citation } from "@/lib/schemas";
import type { SourceState } from "@/lib/source-state";

export type SopStatus = "Placeholder" | "Draft" | "In Review" | "Approved" | "Deprecated";
export type TemplateStatus = "Draft" | "In Review" | "Approved" | "Deprecated";
export type PlaceholderStatus = "Open" | "In Review" | "Resolved" | "Deferred";
export type PlaceholderPriority = "P0" | "P1" | "P2";
export type Sensitivity = "Low" | "Medium" | "High";
export type Audience =
  | "Tenant"
  | "Owner"
  | "Applicant"
  | "Vendor"
  | "Internal"
  | "Unknown";
export type Channel =
  | "RentVine"
  | "Gmail"
  | "LeadSimple"
  | "Internal"
  | "Phone"
  | "Other";
export type ToolIntegrationStatus =
  | "Link only"
  | "Read-only"
  | "Draft-only"
  | "Blocked"
  | "Deferred";
export type SourceApprovalStatus =
  | "Unreviewed"
  | "Transcript-derived"
  | "Approved"
  | "Deprecated";
export type ChangeLogEntityType =
  | "sop"
  | "template"
  | "tool"
  | "placeholder"
  | "source"
  | "user";
export type ChangeLogAction = "create" | "update" | "approve" | "reject" | "deprecate";
export type NotificationLogStatus = "Sent" | "Skipped" | "Failed";

// Approval Queue v1 (workflow-control layer). See docs/product-definition-gap-plan.md.
export type QueueItemStatus =
  | "Ready for Approval"
  | "Blocked"
  | "Snoozed"
  | "Returned"
  | "Approved"
  | "Completed"
  | "Cancelled"
  | "Disabled"
  | "Failed"
  | "Closed";
export type QueueRiskLevel = "Low" | "Medium" | "High" | "Blocked";
export type QueueAudienceGroup =
  | "Dan/Admin decisions"
  | "Team follow-up"
  | "Outside waiting"
  | "Failed/Blocked automation";
export type QueueItemType =
  | "ApprovalPackage"
  | "ProcessDefinitionChange"
  | "AutomationFailure"
  | "ExternalActionReadiness"
  | "SourceFactConflict";
export type QueueActivityAction =
  | "created"
  | "assigned"
  | "returned"
  | "snoozed"
  | "unsnoozed"
  | "blocked"
  | "unblocked"
  | "approved"
  | "disabled"
  | "closed"
  | "refreshed"
  | "skipped"
  | "comment";
export type QueueNotificationEvent =
  | "created"
  | "assigned"
  | "returned_for_revision"
  | "unsnoozed"
  | "blocked"
  | "unblocked"
  | "overdue"
  | "closed";
export type QueueEmailSettingEvent =
  | QueueNotificationEvent
  | "blocked_overdue_escalation";
export type QueueNotificationRecipientRole =
  | "Assignee"
  | "Required approver"
  | "Creator/editor"
  | "Admin selected";
export type QueueEmailSetupStatus = "Ready" | "Disconnected" | "Not Required";
export type QueueNotificationHealthStatus =
  | "Healthy"
  | "Needs Attention"
  | "Action Required";
export type ProcessDefinitionStatus =
  | "Draft"
  | "Testing"
  | "Pending Approval"
  | "Active"
  | "Needs Revision"
  | "Retired";
export type WorkflowRunStatus =
  | "Not Started"
  | "In Progress"
  | "Waiting on Team"
  | "Waiting on Outside"
  | "Blocked"
  | "Ready for Approval"
  | "Approved"
  | "Completed"
  | "Cancelled"
  | "Failed";
export type ExternalActionReadiness =
  | "Planned"
  | "Needs Connection"
  | "Needs Permission"
  | "Ready for Test"
  | "Approved for Execution"
  | "Disabled";
export type ActionTargetSystem = (typeof ACTION_TARGET_SYSTEMS)[number];
export type ActionEventMode = (typeof ACTION_EVENT_MODES)[number];
export type ActionEvidenceStatus = (typeof ACTION_EVIDENCE_STATUSES)[number];
export type ActionPreviewFieldType = (typeof ACTION_PREVIEW_FIELD_TYPES)[number];

// One descriptor per field an execution preview must show before an action could ever be
// approved. The machine-readable companion to `preview_schema_note`.
export interface PreviewPayloadField {
  name: string;
  label: string;
  type: ActionPreviewFieldType;
  required: boolean;
  source_system: ActionTargetSystem;
  note?: string;
}
export type WorkflowRunTimelineEvent =
  | "started"
  | "status_changed"
  | "completed"
  | "failed"
  | "comment";

export interface ProcessDefinitionSourceLink {
  label: string;
  url: string;
}

export interface ProcessDefinitionStep {
  id: string;
  title: string;
  description?: string;
}

export interface ProcessDefinitionActionReference {
  id: string;
  label: string;
  target_system: string;
  expected_action: string;
  readiness: ExternalActionReadiness;
  missing_connection_or_permission?: string;
  approval_owner_uid?: string;
  rollback_or_correction_note?: string;
  action_registry_key?: string;
}

// One record per external action type. This is a metadata catalog that mirrors the
// verified tool roles in docs/integration-architecture.md. It executes nothing: an entry
// is eligible for production execution only when an approved spec sets `production_allowed`
// to true, which the schema gates behind `Approved for Execution` + `Documented` evidence.
export interface ActionRegistryRecord {
  id: string;
  key: string;
  label: string;
  target_system: ActionTargetSystem;
  expected_action: string;
  product_lane?: string;
  readiness: ExternalActionReadiness;
  evidence_status: ActionEvidenceStatus;
  documented_evidence: string;
  required_permissions: string[];
  required_plan?: string;
  event_ingestion_mode: ActionEventMode;
  preview_schema_note: string;
  preview_payload_schema?: PreviewPayloadField[];
  test_notes?: string;
  rollback_note: string;
  connection_health_check_ref?: string;
  production_allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRecord {
  uid: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
  last_active_at?: string;
}

export interface SpaceRecord {
  id: string;
  name: string;
  process_category: string;
  drive_folder_id: string;
  vertex_data_store_id: string;
  canonical_sop_id: string;
  read_only: boolean;
  created_at: string;
}

export interface SopRecord {
  id: string;
  space_id: string;
  title: string;
  owner_uid: string;
  backup_owner_uid?: string;
  status: SopStatus;
  source_state_hint: SourceState;
  sensitivity: Sensitivity;
  body_md: string;
  last_reviewed_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface TemplateRecord {
  id: string;
  space_id: string;
  name: string;
  audience: Audience;
  channel: Channel;
  body: string;
  approved_by_uid?: string;
  last_reviewed_at?: string;
  status: TemplateStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ToolRecord {
  id: string;
  name: string;
  url: string;
  purpose: string;
  primary_owner_uid: string;
  integration_status: ToolIntegrationStatus;
  sensitivity: Sensitivity;
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface PlaceholderRecord {
  id: string;
  space_id: string;
  related_sop_id?: string;
  missing_detail: string;
  source_hint?: string;
  owner_uid: string;
  priority: PlaceholderPriority;
  due_date?: string;
  status: PlaceholderStatus;
  resolution?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface SourceMetaRecord {
  drive_file_id: string;
  space_id: string;
  approval_status: SourceApprovalStatus;
  sensitivity: Sensitivity;
  last_reviewed_at?: string;
  reviewer_uid?: string;
}

export interface AskLogRecord {
  id: string;
  user_uid: string;
  space_id?: string;
  question: string;
  grounding_source_ids: string[];
  answer: string;
  source_state: SourceState;
  citations: Citation[];
  draft: string;
  escalation_owner?: string;
  user_feedback?: string;
  created_at: string;
}

export interface ChangeLogRecord {
  id: string;
  entity_type: ChangeLogEntityType;
  entity_id: string;
  editor_uid: string;
  action: ChangeLogAction;
  diff?: string;
  note?: string;
  actor_via_email_token?: string;
  created_at: string;
}

export interface NotificationLogRecord {
  id: string;
  channel: "Gmail";
  entity_id: string;
  entity_type: "sop" | "template" | "placeholder";
  event: string;
  recipients: string[];
  sender?: string;
  status: NotificationLogStatus;
  subject: string;
  error?: string;
  created_at: string;
}

// A queue item references a workflow run by id + display label. The run/process
// definition machinery is not built yet, so this is a stub reference for v1.
export interface QueueProcessRunRef {
  id: string;
  label: string;
}

export interface ApprovalQueueItemRecord {
  id: string;
  /** Legacy absence is Live; canonical audit fixtures explicitly carry Test. */
  data_mode?: "live" | "test";
  /** Stable identifier reserved for server-owned Test fixture restoration. */
  test_fixture_key?: string;
  process_run_ref: QueueProcessRunRef;
  space_id?: string;
  action_execution_id?: string;
  action_execution_context_hash?: string;
  action_execution_preview_hash?: string;
  action_execution_target?: string;
  item_type: QueueItemType;
  // Stable key for the originating run/action used to merge duplicates and relink
  // superseding items.
  source_trigger_key: string;
  status: QueueItemStatus;
  risk: QueueRiskLevel;
  audience_group: QueueAudienceGroup;
  assignee_uid?: string;
  required_approver_uid?: string;
  due_date?: string;
  action_needed: string;
  affected_system_action?: string;
  direct_link: string;
  snooze_until?: string;
  closed_at?: string;
  supersedes_item_id?: string;
  superseded_by_item_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalQueueActivityRecord {
  id: string;
  item_id: string;
  actor_uid: string;
  action: QueueActivityAction;
  previous_state?: string;
  new_state?: string;
  reason?: string;
  source_trigger: string;
  // JSON snapshot of approval-critical fields preserved when an open item refreshes.
  prior_version_snapshot?: string;
  created_at: string;
}

export interface ApprovalQueueNotificationRecord {
  id: string;
  item_id: string;
  event: QueueNotificationEvent;
  recipient_uid: string;
  recipient_role: QueueNotificationRecipientRole;
  title: string;
  message: string;
  process_run_ref: QueueProcessRunRef;
  status: QueueItemStatus;
  risk: QueueRiskLevel;
  due_date?: string;
  direct_link: string;
  read_at?: string;
  created_at: string;
}

export interface ApprovalQueueEmailSettingRecord {
  id: string;
  event_type: QueueEmailSettingEvent;
  email_enabled: boolean;
  recipient_roles: QueueNotificationRecipientRole[];
  trigger_condition: string;
  cooldown_hours: number;
  subject_preview: string;
  last_send_status?: NotificationLogStatus;
  last_send_at?: string;
  last_error?: string;
  updated_at: string;
  updated_by_uid?: string;
}

// Owner transactional/notice destination (D-1 support). Single-doc admin-editable setting for the
// owner-INTERNAL destination address; absence resolves to DEFAULT_OWNER_TRANSACTIONAL_EMAIL.
export interface OwnerTransactionalDestinationRecord {
  id: string;
  destination_email: string;
  updated_at: string;
  updated_by_uid?: string;
}

export interface ApprovalQueueNotificationHealth {
  status: QueueNotificationHealthStatus;
  queue_email_status: QueueEmailSetupStatus;
  failed_delivery_count: number;
  last_failure?: {
    created_at?: string;
    error?: string;
    subject?: string;
  };
  disabled_event_types: QueueEmailSettingEvent[];
  stale_overdue_count: number;
  blocked_item_count: number;
  blocked_high_risk_count: number;
  action_required_reasons: string[];
  needs_attention_reasons: string[];
  email_setup_error?: string;
}

export interface ProcessDefinitionRecord {
  id: string;
  space_id?: string;
  name: string;
  short_outcome: string;
  trigger: string;
  owner_uid: string;
  default_approver_uid: string;
  source_links: ProcessDefinitionSourceLink[];
  required_starting_inputs: string[];
  steps: ProcessDefinitionStep[];
  action_references: ProcessDefinitionActionReference[];
  success_condition: string;
  stop_condition?: string;
  escalation_condition?: string;
  status: ProcessDefinitionStatus;
  pending_queue_item_id?: string;
  active_version_id?: string;
  last_successful_test_run_id?: string;
  activation_override_reason?: string;
  created_by_uid: string;
  updated_by_uid?: string;
  submitted_at?: string;
  activated_at?: string;
  activated_by_uid?: string;
  created_at: string;
  updated_at: string;
}

export interface ProcessDefinitionVersionRecord {
  id: string;
  definition_id: string;
  version_number: number;
  activated_by_uid: string;
  activation_override_reason?: string;
  snapshot_json: string;
  created_at: string;
}

export interface WorkflowRunRecord {
  id: string;
  definition_id: string;
  definition_version_id?: string;
  /** Optional immutable source publication that this isolated Test run was started against. */
  source_publication_pin?: {
    data_mode: "test";
    resource_id: string;
    version_id: string;
    test_fixture_key: string;
  };
  process_name: string;
  status: WorkflowRunStatus;
  owner_uid: string;
  next_action: string;
  blocker?: string;
  due_date: string;
  is_test_run: boolean;
  simulation_only: boolean;
  production_metrics_included: boolean;
  started_by_uid: string;
  outcome_notes?: string;
  completed_at?: string;
  failed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunTimelineRecord {
  id: string;
  run_id: string;
  actor_uid: string;
  event_type: WorkflowRunTimelineEvent;
  summary: string;
  previous_status?: WorkflowRunStatus;
  new_status?: WorkflowRunStatus;
  created_at: string;
}

// Per-Space desk checklist (S13 Wave 2 / space-teeth E2b). One record per (run, step): the operator
// marks each process step Unchecked / Checked / Skipped as they work a run, keyed by a deterministic
// `${run_id}:${step_id}` doc id, with an append-only Activity twin. This is app-plane bookkeeping
// gated at `edit` — NOT the Admin-only write-back approval tier — and NEVER executes a
// system-of-record write. `Skipped` requires a reason ("not applicable this run").
export type WorkflowRunStepCheckStatus = "Unchecked" | "Checked" | "Skipped";

export interface WorkflowRunStepCheckRecord {
  id: string;
  run_id: string;
  definition_id: string;
  step_id: string;
  step_title: string;
  status: WorkflowRunStepCheckStatus;
  checked_by_uid?: string;
  checked_at?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunStepCheckActivityRecord {
  id: string;
  run_id: string;
  step_id: string;
  actor_uid: string;
  action: WorkflowRunStepCheckStatus;
  previous_status?: WorkflowRunStepCheckStatus;
  new_status: WorkflowRunStepCheckStatus;
  reason?: string;
  created_at: string;
}

// Lease Renewal Phase-1 resolution layer (connector design §3.5). One record per resolved
// reconciliation flag, keyed by its stable source_trigger_key. The flags themselves are recomputed
// deterministically from the run; only the human resolution + its append-only Activity persist.
// This layer NEVER executes a sheet/system-of-record write: a "pick a source" / "enter a corrected
// value" resolution only QUEUES a proposed write-back for the future Phase-2 approval-gated surface.
export type LeaseRenewalResolutionStatus = "Open" | "Resolved" | "Dismissed";
export type LeaseRenewalResolutionKind =
  | "pick_source"
  | "corrected_value"
  | "flag_incorrect";

// A proposed sheet write-back: QUEUED only. Phase 2 (admin-enabled, per-write button-press) is the
// only thing that may ever execute it; this layer always leaves `production_allowed: false`.
export interface LeaseRenewalProposedWriteback {
  field_key: string;
  value: string;
  source_of_value: string;
  status: "Queued";
  production_allowed: false;
}

export interface LeaseRenewalResolutionRecord {
  id: string;
  source_trigger_key: string;
  run_id: string;
  /**
   * Canonical in-boundary property key for an unambiguous address-joined flag. Optional for
   * legacy/name-joined records. This lets bodyless decision projections route to the owning
   * property without replaying a Live provider read or copying any source value.
   */
  property_key?: string;
  field_key: string;
  field_label: string;
  severity: QueueRiskLevel;
  status: LeaseRenewalResolutionStatus;
  resolution_kind?: LeaseRenewalResolutionKind;
  chosen_source?: string;
  corrected_value?: string;
  reason?: string;
  /** Enumerated reason-code taxonomy (S13 H2, additive/optional); a category, never a client value. */
  reason_code?: DecisionReasonCode;
  resolved_by_uid?: string;
  proposed_writeback?: LeaseRenewalProposedWriteback;
  created_at: string;
  updated_at: string;
}

export interface LeaseRenewalResolutionActivityRecord {
  id: string;
  source_trigger_key: string;
  run_id: string;
  property_key?: string;
  actor_uid: string;
  action: LeaseRenewalResolutionKind | "reopened";
  previous_status?: LeaseRenewalResolutionStatus;
  new_status: LeaseRenewalResolutionStatus;
  reason: string;
  reason_code?: DecisionReasonCode;
  created_at: string;
}

// Lease Renewal Phase-2 write-back APPROVAL layer (Q-WRITEBACK-METHOD control plane). One record per
// decided proposal, keyed by its source_trigger_key. A resolution QUEUES a proposed write-back; an
// Admin then Approves (authorizes the future, gated write) or Returns it here. This layer NEVER
// executes a sheet/system-of-record write: `production_allowed` and `executed` are always false and the
// state can only be one of the audited FSM's non-executing states.
export type LeaseRenewalWritebackApprovalState = "Approved" | "Returned for Revision";
export type LeaseRenewalWritebackApprovalDecision = "approve" | "return";

export interface LeaseRenewalWritebackApprovalRecord {
  id: string;
  source_trigger_key: string;
  run_id: string;
  property_key?: string;
  field_key: string;
  field_label: string;
  severity: QueueRiskLevel;
  state: LeaseRenewalWritebackApprovalState;
  // Snapshot of the queued proposal this decision was made against, so a later re-resolution that
  // changes the proposed value marks this approval stale (needs re-approval) instead of silently
  // authorizing a different value.
  proposed_value: string;
  source_of_value: string;
  reason: string;
  /** Enumerated reason-code taxonomy (S13 H2, additive/optional); a category, never a client value. */
  reason_code?: DecisionReasonCode;
  decided_by_uid: string;
  // Hard invariants — this layer never executes. Both are always false.
  production_allowed: false;
  executed: false;
  created_at: string;
  updated_at: string;
}

export interface LeaseRenewalWritebackApprovalActivityRecord {
  id: string;
  source_trigger_key: string;
  run_id: string;
  property_key?: string;
  actor_uid: string;
  action: LeaseRenewalWritebackApprovalDecision;
  previous_state?: LeaseRenewalWritebackApprovalState;
  new_state: LeaseRenewalWritebackApprovalState;
  reason: string;
  reason_code?: DecisionReasonCode;
  created_at: string;
}
