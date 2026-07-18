import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  MAINTENANCE_TEST_ACTIONS,
  type MaintenanceTestActionReceipt,
} from "@/lib/maintenance/test-workflow";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ALIASES,
  LEASE_TEST_BUSINESS_ACTIONS,
  LEASE_TEST_BUSINESS_ACTION_LABELS,
  LEASE_TEST_RUN_STATUS_LABELS,
  leaseTestActionDependencies,
  leaseTestBusinessActionAvailability,
  leaseTestBusinessActionBlocker,
  type LeaseTestActionReceipt,
  type LeaseTestBusinessAction,
  type LeaseTestBusinessEvent,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

/**
 * One bodyless projection of an isolated Test owning record. Every downstream surface renders this
 * same contract, so owner, due state, blocker, next action, mode, record link, and evidence identity
 * cannot drift independently. It intentionally contains no customer value, message body, unit label,
 * recipient, source candidate, or provider payload.
 */
export interface TestOperationalHandoff {
  id: string;
  data_mode: "test";
  kind: "lease_renewal" | "maintenance";
  owning_record_id: string;
  owning_record_href: string;
  status: string;
  next_owner: string;
  due_state: string;
  blocker: string;
  exact_next_action: string;
  evidence_identity: string;
  receipt_count: number;
  updated_at: string;
}

export function buildLeaseTestOperationalHandoff(
  run: LeaseTestRunRecord,
  receipts: readonly LeaseTestActionReceipt[],
  events: readonly LeaseTestBusinessEvent[],
): TestOperationalHandoff {
  const runReceipts = receipts.filter((receipt) => receipt.run_id === run.id);
  const runEvents = events.filter((event) => event.run_id === run.id);
  const next = leaseNextAction(run, runReceipts);
  const latestEvidence = [...runReceipts, ...runEvents].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  )[0];

  return {
    id: `test-handoff:lease:${run.id}`,
    data_mode: "test",
    kind: "lease_renewal",
    owning_record_id: run.id,
    owning_record_href: `/lease-renewal/runs/${encodeURIComponent(run.id)}`,
    status: LEASE_TEST_RUN_STATUS_LABELS[run.status],
    next_owner: next.owner,
    due_state: next.due,
    blocker: next.blocker,
    exact_next_action: next.action,
    evidence_identity: latestEvidence?.id ?? "No Test evidence recorded yet",
    receipt_count: runReceipts.length + runEvents.length,
    updated_at: run.updated_at,
  };
}

export function buildMaintenanceTestOperationalHandoff(
  ticket: MaintenanceTicketRecord,
  receipts: readonly MaintenanceTestActionReceipt[],
): TestOperationalHandoff {
  const ticketReceipts = receipts
    .filter((receipt) => receipt.ticket_id === ticket.id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const completed = new Set(ticketReceipts.map((receipt) => receipt.action_key));
  const missing = MAINTENANCE_TEST_ACTIONS.filter((action) => !completed.has(action));
  const next = maintenanceNextAction(ticket, missing);

  return {
    id: `test-handoff:maintenance:${ticket.id}`,
    data_mode: "test",
    kind: "maintenance",
    owning_record_id: ticket.id,
    owning_record_href: `/maintenance?ticket_id=${encodeURIComponent(ticket.id)}`,
    status: ticket.status === "Closed" ? "App Test ticket closed" : ticket.status,
    next_owner: next.owner,
    due_state: next.due,
    blocker: next.blocker,
    exact_next_action: next.action,
    evidence_identity: ticketReceipts[0]?.id ?? "No Test receipt recorded yet",
    receipt_count: ticketReceipts.length,
    updated_at: ticket.updated_at,
  };
}

function leaseNextAction(
  run: LeaseTestRunRecord,
  receipts: readonly LeaseTestActionReceipt[],
) {
  if (run.status === "Moved to Move-Out") {
    return {
      owner: "Move-Out operator",
      due: "Move-Out Test handoff started",
      blocker: "Renewal actions are terminal and intentionally disabled",
      action: "Open the owning Test Move-Out Space handoff",
    };
  }
  if (run.status === "Done") {
    return {
      owner: "Lease renewal reviewer",
      due: "App Test journey complete",
      blocker: "Live provider and real-world business closeout remain unproven",
      action: "Review bodyless Test evidence or restore the Test baseline",
    };
  }
  if (run.status === "Created") {
    return run.candidate_disposition
      ? {
          owner: "Lease renewal reviewer",
          due: `Review by ${LEASE_TEST_ALIASES.candidateReviewDate}`,
          blocker: "Run must advance to Reviewed",
          action: "Advance the owning Test run to Reviewed",
        }
      : {
          owner: "Lease renewal operator",
          due: `Candidate review by ${LEASE_TEST_ALIASES.candidateReviewDate}`,
          blocker: "Candidate cadence and inclusion are not recorded",
          action: "Record candidate inclusion and cadence",
        };
  }
  if (run.status === "Reviewed") {
    return {
      owner: "Lease renewal approver",
      due: `Tenant offer due ${LEASE_TEST_ALIASES.tenantOfferDueDate}`,
      blocker: run.owner_direction
        ? "Run must advance to Approved"
        : "Owner renewal direction is not recorded",
      action: run.owner_direction
        ? "Advance the owning Test run to Approved"
        : "Record source-backed Test owner renewal direction",
    };
  }
  if (run.status === "Approved") {
    const action = !run.tenant_offer_timing
      ? "Record tenant offer timing"
      : !run.conditional_facts_key
        ? "Confirm conditional Test facts"
        : "Advance the owning Test run to Executing";
    return {
      owner: "Lease renewal operator",
      due: `Tenant offer due ${LEASE_TEST_ALIASES.tenantOfferDueDate}`,
      blocker:
        action === "Advance the owning Test run to Executing"
          ? "Run must advance to Executing"
          : "Required pre-outreach milestone is missing",
      action,
    };
  }

  const completed = new Set(receipts.map((receipt) => receipt.action_key));
  const availableBusiness = LEASE_TEST_BUSINESS_ACTIONS.find(
    (action) => leaseTestBusinessActionAvailability(run, receipts, action).available,
  );
  const availableAction = LEASE_TEST_ACTIONS.find((action) => {
    if (completed.has(action) || leaseTestBusinessActionBlocker(run, action))
      return false;
    return leaseTestActionDependencies(action).every((dependency) =>
      completed.has(dependency),
    );
  });
  const nextBusiness = chooseExecutingBusinessAction(run, availableBusiness);
  if (nextBusiness) {
    return {
      owner: "Lease renewal operator",
      due: leaseExecutingDue(run),
      blocker: "No external provider is contacted in Test mode",
      action: LEASE_TEST_BUSINESS_ACTION_LABELS[nextBusiness],
    };
  }
  if (availableAction) {
    return {
      owner: "Lease renewal operator",
      due: leaseExecutingDue(run),
      blocker: "No external provider is contacted in Test mode",
      action: `Simulate ${availableAction} and record its Test receipt`,
    };
  }
  return {
    owner: "Lease renewal operator",
    due: leaseExecutingDue(run),
    blocker: "A prerequisite milestone or Test receipt is still missing",
    action: "Open the owning Test run to review the exact prerequisite",
  };
}

function chooseExecutingBusinessAction(
  run: LeaseTestRunRecord,
  available: LeaseTestBusinessAction | undefined,
) {
  // Candidate/owner/timing/fact milestones belong to earlier stages; if data drift ever makes one
  // look available here, do not project an invalid backward action.
  if (!available || run.status !== "Executing") return undefined;
  return [
    "tenant_accepts",
    "tenant_moves_out",
    "signatures_complete",
    "business_test_closeout",
  ].includes(available)
    ? available
    : undefined;
}

function leaseExecutingDue(run: LeaseTestRunRecord) {
  return run.tenant_response === "accepted"
    ? `${LEASE_TEST_ALIASES.signatureWindowDays}-day Test signature window`
    : `Tenant offer due ${LEASE_TEST_ALIASES.tenantOfferDueDate}`;
}

function maintenanceNextAction(
  ticket: MaintenanceTicketRecord,
  missingActions: readonly string[],
) {
  if (ticket.status === "Closed") {
    return {
      owner: "Maintenance reviewer",
      due: "App Test ticket closed",
      blocker:
        missingActions.length > 0
          ? `${missingActions.length} internal Test action receipt(s) remain incomplete`
          : "Physical work, invoice disposition, stakeholder notice, and Live readback remain unproven",
      action:
        missingActions.length > 0
          ? "Reopen only with an audited reason before completing missing Test actions"
          : "Review Test evidence; do not report Live business closeout",
    };
  }
  if (!ticket.assignee_uid) {
    return {
      owner: "Maintenance triage operator",
      due: "Assignment required; no app due date recorded",
      blocker: "No staff owner is assigned",
      action: "Assign the owning Test ticket to a supported staff identity",
    };
  }
  if (missingActions.length > 0) {
    return {
      owner: "Assigned maintenance operator",
      due: "No app due date recorded",
      blocker: `${missingActions.length} internal Test action receipt(s) remain incomplete`,
      action: `Simulate ${missingActions[0]} and record its Test receipt`,
    };
  }
  return {
    owner: "Assigned maintenance operator",
    due: "Closeout review due; no app due date recorded",
    blocker: "A close reason is required",
    action: "Close the Test ticket with an audited reason",
  };
}
