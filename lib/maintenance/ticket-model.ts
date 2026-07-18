// Client-safe maintenance ticket model (console overhaul Slice E). Just the status vocabulary and
// record shapes, with NO firebase-admin / server imports, so the client queue can share the types +
// the status list with the server writer without pulling the Admin SDK (or next/headers) into the
// client bundle. The Firestore writer (lib/firestore/maintenance-tickets.ts) re-exports these.

import type { DataMode } from "@/lib/data-mode";

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
  | "note";

export interface MaintenanceTicketReporter {
  kind: "staff" | "external";
  uid?: string;
  name?: string;
  contact?: string;
}

export interface MaintenanceTicketRecord {
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
