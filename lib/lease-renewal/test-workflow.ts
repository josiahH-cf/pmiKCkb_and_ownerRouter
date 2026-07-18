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
  "Moved to Move-Out",
] as const;

export type LeaseTestRunStatus = (typeof LEASE_TEST_RUN_STATUSES)[number];

export const LEASE_TEST_RUN_STATUS_LABELS: Record<LeaseTestRunStatus, string> = {
  Created: "Created",
  Reviewed: "Reviewed",
  Approved: "Approved",
  Executing: "Executing",
  Done: "App Test complete",
  "Moved to Move-Out": "Moved to Move-Out",
};

export const LEASE_TEST_SCENARIO = "standard-renewal" as const;
export const LEASE_TEST_CONFIRMATION = "SIMULATE LEASE TEST ACTION" as const;
export const LEASE_TEST_BUSINESS_CONFIRMATION =
  "RECORD LEASE TEST BUSINESS MILESTONE" as const;

export const LEASE_TEST_BUSINESS_ACTIONS = [
  "candidate_included",
  "owner_renewal_approved",
  "tenant_offer_scheduled",
  "conditional_facts_confirmed",
  "tenant_accepts",
  "tenant_moves_out",
  "signatures_complete",
  "business_test_closeout",
] as const;

export type LeaseTestBusinessAction = (typeof LEASE_TEST_BUSINESS_ACTIONS)[number];

export const LEASE_TEST_BUSINESS_ACTION_LABELS: Record<LeaseTestBusinessAction, string> =
  {
    candidate_included: "Record candidate inclusion and cadence",
    owner_renewal_approved: "Record owner renewal direction",
    tenant_offer_scheduled: "Record tenant offer timing",
    conditional_facts_confirmed: "Confirm conditional Test facts",
    tenant_accepts: "Record tenant acceptance",
    tenant_moves_out: "Start Test Move-Out handoff",
    signatures_complete: "Record simulated signatures",
    business_test_closeout: "Close the Test business journey",
  };

export const LEASE_TEST_BUSINESS_ACTION_EFFECTS: Record<LeaseTestBusinessAction, string> =
  {
    candidate_included:
      "Persist the canonical included disposition, standard two-month cadence, and bodyless Test worklog reason.",
    owner_renewal_approved:
      "Bind the compiled Test renewal terms as owner-approved before any tenant commitment.",
    tenant_offer_scheduled:
      "Record the by-fifteenth offer rule and a 30-day signature window for this Test run.",
    conditional_facts_confirmed:
      "Bind the compiled property, occupancy, pet, insurance, deposit, and charge Test facts.",
    tenant_accepts:
      "Preserve the Test tenant acceptance after separate Gmail, Portal, and SMS receipts.",
    tenant_moves_out:
      "Terminate renewal actions and start an isolated Test Move-Out handoff with its next owner.",
    signatures_complete:
      "Record a simulated signature milestone after both Test Dotloop receipts.",
    business_test_closeout:
      "Close the app-only Test business journey after every milestone and all 11 Test receipts.",
  };

export const LEASE_TEST_ALIASES = Object.freeze({
  leaseRef: "lease:test-maple-204-2027",
  propertyLabel: "TEST — 204 Maple Court Unit 2",
  residentLabel: "Taylor Test Resident",
  residentEmail: "taylor.resident@example.invalid",
  mailboxLabel: "TEST Workflow mailbox (internal adapter)",
  threadLabel: "TEST renewal thread (internal adapter)",
  leaseEndDate: "2027-09-30",
  candidateReviewDate: "2027-07-31",
  tenantOfferDueDate: "2027-08-15",
  signatureWindowDays: 30,
  ownerTermsLabel: "TEST — approved 12-month renewal terms",
  conditionalFactsLabel:
    "TEST — property, occupancy, pet, insurance, deposit, and charge facts confirmed",
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
  candidate_disposition?: "included";
  candidate_cadence?: "two_month_window";
  candidate_off_cycle?: false;
  candidate_worklog_reason?: "canonical_standard_window_test_fixture";
  owner_direction?: "renew";
  owner_terms_key?: "canonical-test-renewal-terms-v1";
  tenant_offer_timing?: "by_fifteenth";
  signature_window_days?: 30;
  conditional_facts_key?: "canonical-test-conditional-facts-v1";
  tenant_response?: "accepted" | "move_out";
  signatures_state?: "simulated_complete";
  business_test_status?: "test_complete" | "moved_to_move_out";
  move_out_handoff?: {
    data_mode: "test";
    direct_link: "/spaces/move-out-deposit-disposition";
    next_owner: "Move-Out operator";
    state: "started";
  };
  created_by_uid: string;
  updated_by_uid: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface LeaseTestBusinessEvent {
  id: string;
  run_id: string;
  data_mode: "test";
  action: LeaseTestBusinessAction;
  outcome:
    | "included_standard_window"
    | "renewal_terms_approved"
    | "offer_due_by_fifteenth_with_30_day_signature_window"
    | "canonical_conditional_facts_confirmed"
    | "tenant_accepted"
    | "move_out_handoff_started"
    | "simulated_signatures_complete"
    | "test_business_journey_complete";
  actor_uid: string;
  provider_contacted: false;
  live_proof_eligible: false;
  created_at: string;
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
    testBusinessJourneyComplete: run.business_test_status === "test_complete",
    businessCloseoutEligible: false as const,
    businessCloseoutStatus: "not_proven" as const,
    gates: LEASE_BUSINESS_CLOSEOUT_GATES.map((gate) => ({
      id: gate.id,
      label: gate.label,
      internalTestReceiptCount: gate.testActionKeys.filter((actionKey) =>
        completedKeys.has(actionKey),
      ).length,
      internalTestReceiptTotal: gate.testActionKeys.length,
      milestoneRecorded: businessGateRecorded(run, gate.id),
      outcome: businessGateRecorded(run, gate.id)
        ? gate.testActionKeys.every((actionKey) => completedKeys.has(actionKey))
          ? ("internal_simulation_only" as const)
          : ("test_evidence_incomplete" as const)
        : ("test_milestone_missing" as const),
    })),
  };
}

export function nextLeaseTestRunStatus(
  status: LeaseTestRunStatus,
): LeaseTestRunStatus | null {
  if (status === "Done" || status === "Moved to Move-Out") return null;
  const standardSequence: readonly LeaseTestRunStatus[] = [
    "Created",
    "Reviewed",
    "Approved",
    "Executing",
    "Done",
  ];
  const index = standardSequence.indexOf(status);
  return index < 0 ? null : (standardSequence[index + 1] ?? null);
}

export function leaseTestBusinessActionBlocker(
  run: LeaseTestRunRecord,
  actionKey: LeaseExecutionActionKey,
): string | null {
  if (run.status === "Moved to Move-Out" || run.tenant_response === "move_out") {
    return "The Test renewal moved to Move-Out; remaining renewal actions are disabled.";
  }
  if (run.owner_direction !== "renew" || !run.tenant_offer_timing) {
    return "Record owner renewal direction and tenant-offer timing first.";
  }
  const afterResponse: readonly LeaseExecutionActionKey[] = [
    "google_sheets.renewal_checklist.writeback",
    "dotloop.loop.create_from_template",
    "dotloop.document.upload",
    "rentvine.lease.renewal_writeback",
    "boom.resident.enroll",
  ];
  if (afterResponse.includes(actionKey)) {
    if (run.tenant_response !== "accepted") {
      return "Record the Test tenant acceptance before document or writeback actions.";
    }
    if (!run.conditional_facts_key) {
      return "Confirm the canonical conditional Test facts first.";
    }
  }
  if (
    ["rentvine.lease.renewal_writeback", "boom.resident.enroll"].includes(actionKey) &&
    run.signatures_state !== "simulated_complete"
  ) {
    return "Record the simulated signature milestone before final record updates.";
  }
  return null;
}

export function leaseTestBusinessActionAvailability(
  run: LeaseTestRunRecord,
  receipts: readonly LeaseTestActionReceipt[],
  action: LeaseTestBusinessAction,
): { available: boolean; reason: string } {
  const completed = new Set(receipts.map((receipt) => receipt.action_key));
  const result = (available: boolean, reason: string) => ({ available, reason });
  if (run.status === "Done" || run.status === "Moved to Move-Out") {
    return result(false, "This Test business journey is closed.");
  }
  if (action === "candidate_included") {
    return result(
      run.status === "Created" && !run.candidate_disposition,
      "Available only in Created before candidate review.",
    );
  }
  if (action === "owner_renewal_approved") {
    return result(
      run.status === "Reviewed" &&
        run.candidate_disposition === "included" &&
        !run.owner_direction,
      "Review the included Test candidate first.",
    );
  }
  if (action === "tenant_offer_scheduled") {
    return result(
      run.status === "Approved" &&
        run.owner_direction === "renew" &&
        !run.tenant_offer_timing,
      "Approve the Test owner direction first.",
    );
  }
  if (action === "conditional_facts_confirmed") {
    return result(
      run.status === "Approved" &&
        run.owner_direction === "renew" &&
        !run.conditional_facts_key,
      "Approve the Test owner direction first.",
    );
  }
  if (action === "tenant_accepts" || action === "tenant_moves_out") {
    const outreachComplete = [
      "gmail.renewal_notice.send",
      "rentvine.renewal.portal_message.send",
      "sms.renewal_message.send",
    ].every((key) => completed.has(key as LeaseExecutionActionKey));
    return result(
      run.status === "Executing" && !run.tenant_response && outreachComplete,
      "Complete separate Gmail, Portal, and SMS Test receipts first.",
    );
  }
  if (action === "signatures_complete") {
    const documentsComplete = [
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ].every((key) => completed.has(key as LeaseExecutionActionKey));
    return result(
      run.status === "Executing" &&
        run.tenant_response === "accepted" &&
        Boolean(run.conditional_facts_key) &&
        documentsComplete &&
        !run.signatures_state,
      "Record tenant acceptance, conditional facts, and both Dotloop Test receipts first.",
    );
  }
  return result(
    run.status === "Executing" &&
      run.tenant_response === "accepted" &&
      run.signatures_state === "simulated_complete" &&
      LEASE_TEST_ACTIONS.every((key) => completed.has(key)) &&
      run.business_test_status !== "test_complete",
    "Record every Test milestone and all 11 Test action receipts first.",
  );
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

function businessGateRecorded(
  run: LeaseTestRunRecord,
  gateId: (typeof LEASE_BUSINESS_CLOSEOUT_GATES)[number]["id"],
) {
  if (gateId === "owner_direction") return run.owner_direction === "renew";
  if (gateId === "tenant_agreement") return run.tenant_response === "accepted";
  if (gateId === "conditional_facts") return Boolean(run.conditional_facts_key);
  if (gateId === "signed_documents") {
    return run.signatures_state === "simulated_complete";
  }
  if (gateId === "provider_updates" || gateId === "sheet_closeout") {
    return run.business_test_status === "test_complete";
  }
  return false;
}
