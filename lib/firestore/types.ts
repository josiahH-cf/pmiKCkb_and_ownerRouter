import type { Role } from "@/lib/auth/roles";
import type { SourceState } from "@/lib/source-state";

export type SopStatus = "Placeholder" | "Draft" | "In Review" | "Approved" | "Deprecated";
export type Sensitivity = "Low" | "Medium" | "High";

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

export interface ChangeLogRecord {
  id: string;
  entity_type: "sop" | "template" | "tool" | "placeholder" | "source" | "user";
  entity_id: string;
  editor_uid: string;
  action: "create" | "update" | "approve" | "reject" | "deprecate";
  note?: string;
  actor_via_email_token?: string;
  created_at: string;
}
