// Client-safe maintenance ticket model (console overhaul Slice E). Just the status vocabulary and
// record shapes, with NO firebase-admin / server imports, so the client queue can share the types +
// the status list with the server writer without pulling the Admin SDK (or next/headers) into the
// client bundle. The Firestore writer (lib/firestore/maintenance-tickets.ts) re-exports these.

import type { DataMode } from "@/lib/data-mode";
import type { ProductRecordRetentionFields } from "@/lib/operations/product-record-retention";

export const MAINTENANCE_TICKET_STATUSES = [
  "Open",
  "Waiting on Response",
  "Waiting on Vendor",
  "Scheduled",
  "Closed",
] as const;
export type MaintenanceTicketStatus = (typeof MAINTENANCE_TICKET_STATUSES)[number];

/** Forward lifecycle moves. Closed tickets use the separate audited reopen operation. */
export const MAINTENANCE_ALLOWED_STATUS_TRANSITIONS: Record<
  MaintenanceTicketStatus,
  readonly MaintenanceTicketStatus[]
> = {
  Open: ["Waiting on Response", "Waiting on Vendor", "Scheduled", "Closed"],
  "Waiting on Response": ["Waiting on Vendor", "Scheduled", "Closed"],
  "Waiting on Vendor": ["Waiting on Response", "Scheduled", "Closed"],
  Scheduled: ["Waiting on Response", "Waiting on Vendor", "Closed"],
  Closed: [],
};

export type MaintenanceTicketActivityAction =
  | "create"
  | "status"
  | "close"
  | "reopen"
  | "assign"
  | "vendor-assign"
  | "test-action"
  | "label"
  | "note"
  // S108: the exact estimate amount an Editor recorded, and the preapproval routing it produced.
  | "estimate";

export interface MaintenanceTicketReporter {
  kind: "staff" | "external";
  uid?: string;
  name?: string;
  contact?: string;
}

export interface MaintenanceTicketRecord extends Partial<ProductRecordRetentionFields> {
  id: string;
  /** Explicit record lane. Legacy records without this field normalize to Live at read time. */
  data_mode: DataMode;
  status: MaintenanceTicketStatus;
  priority: string;
  /** "auto-inferred" (emergency-keyword scan) or "operator-set" — transparent + overridable. */
  priority_provenance: string;
  summary: string;
  description: string;
  unit: { unitId: string; label: string } | null;
  photo_refs: string[];
  reporter: MaintenanceTicketReporter;
  labels: string[];
  assignee_uid?: string;
  vendor_id?: string;
  space_id: string;
  /**
   * S108: the exact estimate for this work, in whole cents, as recorded by an Editor. Absent means
   * no estimate is recorded; absence is never treated as within a property preapproval.
   */
  estimate_amount_cents?: number;
  /**
   * S109 triage carried from the public intake. `photos_needed` stays true until a person attaches
   * the photos through the staff photo action; S108 reads it as a blocker.
   */
  intake_urgency?: "emergency_fire" | "urgent_flooding" | "normal";
  intake_issue_type?: string;
  photos_needed?: boolean;
  intake_resource_id?: string;
  estimate_recorded_at?: string;
  estimate_recorded_by_uid?: string;
  source_trigger_key?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  closed_reason?: string;
}

export interface MaintenanceTicketActivityRecord {
  id: string;
  ticket_id: string;
  actor_uid: string;
  action: MaintenanceTicketActivityAction;
  previous_status?: MaintenanceTicketStatus;
  new_status?: MaintenanceTicketStatus;
  text?: string;
  created_at: string;
}
