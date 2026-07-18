// Client-safe contract for persistent Lease Renewal Test runs in production.
//
// Every alias below is invented and reserved. Test actions persist app-owned attempts and
// receipts, but this module has no provider, network, or external-executor dependency.

import type { DataMode } from "@/lib/data-mode";
import {
  LEASE_EXECUTION_ACTIONS,
  LEASE_EXECUTION_DEFINITION_MAP,
  type LeaseExecutionActionKey,
} from "@/lib/lease-renewal/execution/matrix";

export const LEASE_TEST_RUN_STATUSES = [
  "Created",
  "Reviewed",
  "Approved",
  "Executing",
  "Done",
] as const;

export type LeaseTestRunStatus = (typeof LEASE_TEST_RUN_STATUSES)[number];

export const LEASE_TEST_RUN_STATUS_LABELS: Record<LeaseTestRunStatus, string> = {
  Created: "Created",
  Reviewed: "Reviewed",
  Approved: "Approved",
  Executing: "Executing",
  Done: "App Test complete",
};

export const LEASE_TEST_SCENARIO = "standard-renewal" as const;
export const LEASE_TEST_CONFIRMATION = "SIMULATE LEASE TEST ACTION" as const;

export const LEASE_TEST_ALIASES = Object.freeze({
  leaseRef: "lease:test-maple-204-2027",
  propertyLabel: "TEST — 204 Maple Court Unit 2",
  residentLabel: "Taylor Test Resident",
  residentEmail: "taylor.resident@example.invalid",
  mailboxLabel: "TEST Workflow mailbox (internal adapter)",
  threadLabel: "TEST renewal thread (internal adapter)",
});

export const LEASE_TEST_ACTION_TARGETS: Record<LeaseExecutionActionKey, string> = {
  "gmail.renewal_notice.draft_create": `${LEASE_TEST_ALIASES.residentEmail} — TEST unsent draft adapter`,
  "gmail.renewal_notice.send": `${LEASE_TEST_ALIASES.residentEmail} — TEST delivery adapter`,
  "gmail.thread.reply": LEASE_TEST_ALIASES.threadLabel,
  "gmail.label.apply": `${LEASE_TEST_ALIASES.threadLabel} — Waiting on Outside`,
  "rentvine.renewal.portal_message.send":
    "Taylor Test Resident — TEST portal conversation adapter",
  "sms.renewal_message.send": "Taylor Test Resident — TEST SMS adapter",
  "google_sheets.renewal_checklist.writeback":
    "TEST renewal checklist row — internal adapter",
  "dotloop.loop.create_from_template": "TEST Dotloop renewal workspace",
  "dotloop.document.upload": "TEST renewal document workspace",
  "rentvine.lease.renewal_writeback": `${LEASE_TEST_ALIASES.leaseRef} — TEST RentVine adapter`,
  "boom.resident.enroll": "Taylor Test Resident — TEST Boom adapter",
};

export const LEASE_TEST_ACTIONS = LEASE_EXECUTION_ACTIONS;

export const LEASE_BUSINESS_CLOSEOUT_GATES = Object.freeze([
  {
    id: "owner_direction",
    label: "Source-backed owner direction and approved terms",
    testActionKeys: [] as readonly LeaseExecutionActionKey[],
  },
  {
    id: "tenant_agreement",
    label: "Tenant response, agreement, and channel timing",
    testActionKeys: [
      "gmail.renewal_notice.send",
      "rentvine.renewal.portal_message.send",
      "sms.renewal_message.send",
    ] as readonly LeaseExecutionActionKey[],
  },
  {
    id: "conditional_facts",
    label: "Property, occupancy, pet, insurance, deposit, and charge facts",
    testActionKeys: [] as readonly LeaseExecutionActionKey[],
  },
  {
    id: "signed_documents",
    label: "Applicable document package and completed signatures",
    testActionKeys: [
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ] as readonly LeaseExecutionActionKey[],
  },
  {
    id: "provider_updates",
    label: "RentVine renewal, services, and charge updates",
    testActionKeys: [
      "rentvine.lease.renewal_writeback",
      "boom.resident.enroll",
    ] as readonly LeaseExecutionActionKey[],
  },
  {
    id: "sheet_closeout",
    label: "Renewal Sheet closeout and read-after-write reconciliation",
    testActionKeys: [
      "google_sheets.renewal_checklist.writeback",
    ] as readonly LeaseExecutionActionKey[],
  },
] as const);

export interface LeaseTestRunRecord {
  id: string;
  data_mode: Extract<DataMode, "test">;
  scenario: typeof LEASE_TEST_SCENARIO;
  status: LeaseTestRunStatus;
  labels: readonly ["TEST DATA"];
  lease_ref: string;
  property_label: string;
  resident_label: string;
  resident_email: string;
  action_total: number;
  created_by_uid: string;
  updated_by_uid: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface LeaseTestActionReceipt {
  id: string;
  run_id: string;
  data_mode: "test";
  action_key: LeaseExecutionActionKey;
  target_label: string;
  outcome: "simulated_success";
  provider_contacted: false;
  live_proof_eligible: false;
  attempt_count: 1;
  actor_uid: string;
  created_at: string;
}

export interface LeaseTestActionAttempt {
  id: string;
  run_id: string;
  data_mode: "test";
  action_key: LeaseExecutionActionKey;
  target_label: string;
  attempt_number: 1;
  state: "succeeded";
  provider_contacted: false;
  actor_uid: string;
  created_at: string;
}

export function leaseTestCompletionBoundary(
  run: LeaseTestRunRecord,
  receipts: readonly LeaseTestActionReceipt[],
) {
  const completedKeys = new Set(receipts.map((receipt) => receipt.action_key));
  return {
    appTestComplete:
      run.status === "Done" &&
      LEASE_TEST_ACTIONS.every((actionKey) => completedKeys.has(actionKey)),
    businessCloseoutEligible: false as const,
    businessCloseoutStatus: "not_proven" as const,
    gates: LEASE_BUSINESS_CLOSEOUT_GATES.map((gate) => ({
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

export function nextLeaseTestRunStatus(
  status: LeaseTestRunStatus,
): LeaseTestRunStatus | null {
  const index = LEASE_TEST_RUN_STATUSES.indexOf(status);
  return index < 0 || index === LEASE_TEST_RUN_STATUSES.length - 1
    ? null
    : LEASE_TEST_RUN_STATUSES[index + 1];
}

export function leaseTestActionDependencies(
  actionKey: LeaseExecutionActionKey,
): readonly LeaseExecutionActionKey[] {
  return (LEASE_EXECUTION_DEFINITION_MAP.get(actionKey)?.dependsOn ?? []).filter(
    (key): key is LeaseExecutionActionKey =>
      LEASE_TEST_ACTIONS.includes(key as LeaseExecutionActionKey),
  );
}

export function buildLeaseTestActionEvidence(input: {
  receiptId: string;
  attemptId: string;
  runId: string;
  actionKey: LeaseExecutionActionKey;
  actorUid: string;
  createdAt: string;
}): { receipt: LeaseTestActionReceipt; attempt: LeaseTestActionAttempt } {
  const shared = {
    run_id: input.runId,
    data_mode: "test" as const,
    action_key: input.actionKey,
    target_label: LEASE_TEST_ACTION_TARGETS[input.actionKey],
    provider_contacted: false as const,
    actor_uid: input.actorUid,
    created_at: input.createdAt,
  };
  return {
    receipt: {
      id: input.receiptId,
      ...shared,
      outcome: "simulated_success",
      live_proof_eligible: false,
      attempt_count: 1,
    },
    attempt: {
      id: input.attemptId,
      ...shared,
      attempt_number: 1,
      state: "succeeded",
    },
  };
}
