import type { Role } from "@/lib/auth/roles";
import type { SpaceScope } from "@/lib/constants";

export const WORK_TASK_STATES = [
  "Not started",
  "In progress",
  "Paused",
  "Blocked",
  "Completed",
  "Cancelled",
] as const;
export type WorkTaskState = (typeof WORK_TASK_STATES)[number];

export const WORK_SESSION_STATES = ["Active", "Ended"] as const;
export type WorkSessionState = (typeof WORK_SESSION_STATES)[number];

export const WORK_SESSION_END_REASONS = [
  "manual_pause",
  "task_switch",
  "idle_timeout",
  "blocked",
  "completed",
  "cancelled",
  "disconnect_review",
  "admin_correction",
] as const;
export type WorkSessionEndReason = (typeof WORK_SESSION_END_REASONS)[number];

export const WORK_SOURCE_TYPES = [
  "manual",
  "workflow_run",
  "renewal_lease",
  "maintenance_ticket",
  "approval_item",
] as const;
export type WorkSourceType = (typeof WORK_SOURCE_TYPES)[number];

export const WORK_RETENTION_POLICY_VERSION = "staff-work-retention:v1.0" as const;
export const WORK_RETENTION_MONTHS = 12;

export type WorkSourceStatus = "verified" | "unverified";

export interface WorkSourceReference {
  type: WorkSourceType;
  id?: string;
  link?: string;
  version?: string;
  status: WorkSourceStatus;
}

export interface WorkExpectationSnapshot {
  expectation_id: string;
  expectation_key: string;
  version: number;
  minimum_minutes: number;
  maximum_minutes: number;
  effective_at: string;
}

export interface WorkTaskRecord {
  id: string;
  space_id: string;
  source: WorkSourceReference;
  task_type: string;
  title: string;
  assignee_uid?: string;
  assigner_uid?: string;
  creator_uid: string;
  state: WorkTaskState;
  next_action: string;
  /** Plain-language job/property location supplied by the task creator. */
  work_location?: string;
  /** Materials still needed before the task can proceed. */
  materials_needed?: string;
  /** Materials already purchased or otherwise on hand. */
  materials_purchased?: string;
  due_at?: string;
  blocker_reason?: string;
  cancel_reason?: string;
  reopen_reason?: string;
  outcome_note?: string;
  expectation_snapshot?: WorkExpectationSnapshot;
  mapping_id?: string;
  mapping_version?: number;
  generation_key?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  cancelled_at?: string;
  record_version: number;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  retention_expires_at?: string;
  legal_hold: boolean;
}

export type WorkTaskActivityAction =
  | "created"
  | "derived"
  | "started"
  | "resumed"
  | "paused"
  | "switched"
  | "blocked"
  | "completed"
  | "cancelled"
  | "reopened"
  | "reassigned"
  | "expectation_rebased";

export interface WorkTaskActivityRecord {
  id: string;
  task_id: string;
  actor_uid: string;
  action: WorkTaskActivityAction;
  previous_state?: WorkTaskState;
  new_state: WorkTaskState;
  reason_code: string;
  reason_text?: string;
  idempotency_key: string;
  task_version: number;
  created_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  legal_hold: boolean;
}

export type WorkSessionCorrectionState = "none" | "corrected" | "needs_review";

export interface WorkSessionRecord {
  id: string;
  task_id: string;
  original_task_id: string;
  staff_uid: string;
  state: WorkSessionState;
  original_start_at: string;
  original_end_at?: string;
  end_reason?: WorkSessionEndReason;
  last_acknowledged_activity_at: string;
  effective_start_at: string;
  effective_end_at?: string;
  effective_minutes: number;
  correction_state: WorkSessionCorrectionState;
  idempotency_key: string;
  record_version: number;
  created_at: string;
  updated_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  retention_expires_at?: string;
  legal_hold: boolean;
}

export interface WorkActiveSessionLock {
  staff_uid: string;
  session_id: string;
  task_id: string;
  session_version: number;
  updated_at: string;
}

export interface WorkSessionCorrectionRecord {
  id: string;
  session_id: string;
  staff_uid: string;
  previous_task_id: string;
  new_task_id: string;
  previous_effective_start_at: string;
  previous_effective_end_at: string;
  new_effective_start_at: string;
  new_effective_end_at: string;
  previous_effective_minutes: number;
  new_effective_minutes: number;
  actor_uid: string;
  reason: string;
  previous_session_version: number;
  new_session_version: number;
  idempotency_key: string;
  created_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  retention_expires_at: string;
  legal_hold: boolean;
}

export interface WorkExpectationRecord {
  id: string;
  expectation_key: string;
  task_type: string;
  space_id?: string;
  version: number;
  minimum_minutes: number;
  maximum_minutes: number;
  effective_at: string;
  manager_uid: string;
  rationale: string;
  status: "active" | "superseded";
  superseded_at?: string;
  created_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  retention_expires_at?: string;
  legal_hold: boolean;
}

export interface WorkExpectationHead {
  expectation_key: string;
  expectation_id: string;
  version: number;
  updated_at: string;
}

export interface WorkDerivationMappingRecord {
  id: string;
  mapping_key: string;
  source_type: Exclude<WorkSourceType, "manual">;
  actionable_unit: string;
  task_type: string;
  title: string;
  next_action: string;
  space_id?: string;
  assignee_uid?: string;
  version: number;
  status: "active" | "superseded";
  effective_at: string;
  manager_uid: string;
  rationale: string;
  superseded_at?: string;
  created_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  retention_expires_at?: string;
  legal_hold: boolean;
}

export interface WorkDerivationMappingHead {
  mapping_key: string;
  mapping_id: string;
  version: number;
  updated_at: string;
}

export interface WorkAssignableUser {
  uid: string;
  email: string;
  role: Role;
  scopes?: readonly SpaceScope[];
}

export interface WorkAccountabilitySnapshot {
  tasks: WorkTaskRecord[];
  editable_task_ids: string[];
  sessions: WorkSessionRecord[];
  current_session?: WorkSessionRecord;
  expectations: WorkExpectationRecord[];
  mappings: WorkDerivationMappingRecord[];
  server_now: string;
  record_limit: number;
  may_be_truncated: boolean;
}

export type WorkExpectationComparison =
  | { label: "Below expected range"; difference_minutes: number }
  | { label: "Within expected range"; difference_minutes: 0 }
  | { label: "Above expected range"; difference_minutes: number };

export type WorkIdlePhase = "active" | "warning" | "cutoff";

export interface WorkRetentionCandidate {
  queue_id: string;
  target_collection: string;
  target_id: string;
  expires_at: string;
  anchor_kind: "record_time" | "task_terminal";
  governing_task_id?: string;
}

export interface WorkRetentionQueueRecord extends WorkRetentionCandidate {
  legal_hold: boolean;
  created_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
}

export interface WorkRetentionPlan {
  as_of: string;
  limit: number;
  candidates: WorkRetentionCandidate[];
  plan_hash: string;
}

export interface WorkRetentionReceipt {
  id: string;
  plan_hash: string;
  as_of: string;
  actor_uid: string;
  removed_targets: Array<{ collection: string; id: string }>;
  removed_count: number;
  skipped_count: number;
  created_at: string;
  retention_policy_version: typeof WORK_RETENTION_POLICY_VERSION;
  retention_expires_at: string;
  legal_hold: boolean;
}
