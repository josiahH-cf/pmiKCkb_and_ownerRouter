// Client-safe contract for the production Maintenance Test workspace.
//
// These aliases are deliberately invented and reserved. Test execution never resolves a live
// provider; it writes an app-owned receipt that is visibly ineligible for live-provider proof.

import type { DataMode } from "@/lib/data-mode";

export type MaintenanceDataMode = DataMode;

export const MAINTENANCE_TEST_UNIT = {
  unitId: "unit:test-maple-204",
  label: "TEST — 204 Maple Court Unit 2",
  confidence: "Verified" as const,
};

export const MAINTENANCE_TEST_VENDOR = {
  id: "vendor:test-summit-plumbing",
  label: "Summit Plumbing Test Vendor",
  email: "service@summit-plumbing.example.invalid",
} as const;

export const MAINTENANCE_TEST_CONFIRMATION = "SIMULATE TEST ACTION" as const;

export const MAINTENANCE_TEST_ACTIONS = [
  "rentvine.work_order.create",
  "vendor.assignment.change",
  "gmail.maintenance_owner_notice.send",
  "leadsimple.process.update_stage",
  "rentvine.work_order.update_status",
  "quickbooks.bill.create_draft",
] as const;

export type MaintenanceTestActionKey = (typeof MAINTENANCE_TEST_ACTIONS)[number];

export const MAINTENANCE_TEST_ACTION_TARGETS: Record<MaintenanceTestActionKey, string> = {
  "rentvine.work_order.create": "TEST RentVine workspace (internal simulation)",
  "vendor.assignment.change": `${MAINTENANCE_TEST_VENDOR.label} (TEST assignment)`,
  "gmail.maintenance_owner_notice.send":
    "owner-maple@example.invalid (TEST mailbox simulation)",
  "leadsimple.process.update_stage":
    "TEST LeadSimple maintenance process (internal simulation)",
  "rentvine.work_order.update_status": "TEST RentVine work order (internal simulation)",
  "quickbooks.bill.create_draft":
    "TEST QuickBooks draft bill workspace (internal simulation)",
};

export interface MaintenanceTestActionReceipt {
  id: string;
  ticket_id: string;
  data_mode: "test";
  action_key: MaintenanceTestActionKey;
  target_label: string;
  outcome: "simulated_success";
  provider_contacted: false;
  live_proof_eligible: false;
  actor_uid: string;
  created_at: string;
}

/**
 * Pure receipt builder. It has no provider, fetch, mail, Drive, or external-executor dependency.
 * Persistence is performed by the Maintenance Firestore store after it proves the ticket is Test.
 */
export function buildMaintenanceTestActionReceipt(input: {
  id: string;
  ticketId: string;
  actionKey: MaintenanceTestActionKey;
  actorUid: string;
  createdAt: string;
}): MaintenanceTestActionReceipt {
  return {
    id: input.id,
    ticket_id: input.ticketId,
    data_mode: "test",
    action_key: input.actionKey,
    target_label: MAINTENANCE_TEST_ACTION_TARGETS[input.actionKey],
    outcome: "simulated_success",
    provider_contacted: false,
    live_proof_eligible: false,
    actor_uid: input.actorUid,
    created_at: input.createdAt,
  };
}
