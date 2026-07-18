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

export const MAINTENANCE_TEST_PUBLIC_INTAKE = Object.freeze({
  propertyKey: MAINTENANCE_TEST_UNIT.unitId,
  summary: "TEST — kitchen sink leak",
  description: "TEST fixture: a slow drip needs staff review.",
  contact: "resident-maintenance@example.invalid",
});

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

export const MAINTENANCE_BUSINESS_CLOSEOUT_GATES = Object.freeze([
  {
    id: "diagnosis_scope",
    label: "Diagnosis, scope, and responsibility decision",
    testActionKeys: [] as readonly MaintenanceTestActionKey[],
  },
  {
    id: "approval",
    label: "Required owner or manager approval",
    testActionKeys: [
      "gmail.maintenance_owner_notice.send",
    ] as readonly MaintenanceTestActionKey[],
  },
  {
    id: "vendor_schedule",
    label: "Vendor acceptance and scheduled appointment",
    testActionKeys: [
      "vendor.assignment.change",
      "leadsimple.process.update_stage",
    ] as readonly MaintenanceTestActionKey[],
  },
  {
    id: "physical_completion",
    label: "Physical work completion and quality verification",
    testActionKeys: [
      "rentvine.work_order.update_status",
    ] as readonly MaintenanceTestActionKey[],
  },
  {
    id: "invoice",
    label: "Invoice review and accounting disposition",
    testActionKeys: [
      "quickbooks.bill.create_draft",
    ] as readonly MaintenanceTestActionKey[],
  },
  {
    id: "stakeholder_closeout",
    label: "Owner, tenant, and Vendor closeout communication",
    testActionKeys: [
      "gmail.maintenance_owner_notice.send",
    ] as readonly MaintenanceTestActionKey[],
  },
] as const);

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

export function maintenanceTestBusinessCloseoutBoundary(
  receipts: readonly MaintenanceTestActionReceipt[],
) {
  const completedKeys = new Set(receipts.map((receipt) => receipt.action_key));
  return {
    businessCloseoutEligible: false as const,
    businessCloseoutStatus: "not_proven" as const,
    gates: MAINTENANCE_BUSINESS_CLOSEOUT_GATES.map((gate) => ({
      id: gate.id,
      label: gate.label,
      internalTestReceiptCount: gate.testActionKeys.filter((actionKey) =>
        completedKeys.has(actionKey),
      ).length,
      internalTestReceiptTotal: gate.testActionKeys.length,
      outcome:
        gate.testActionKeys.length === 0
          ? ("not_represented" as const)
          : gate.testActionKeys.every((actionKey) => completedKeys.has(actionKey))
            ? ("internal_simulation_only" as const)
            : ("test_evidence_incomplete" as const),
    })),
  };
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
