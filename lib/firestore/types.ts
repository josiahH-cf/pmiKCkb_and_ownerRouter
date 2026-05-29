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
