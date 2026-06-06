import type { Role } from "@/lib/auth/roles";
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
  audience: string;
  channel: string;
  urgency: string;
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
  process_run_ref: QueueProcessRunRef;
  space_id?: string;
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
