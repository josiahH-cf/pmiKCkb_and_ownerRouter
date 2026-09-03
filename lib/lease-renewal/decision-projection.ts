import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import { writebackApprovalMatchesResolution } from "@/lib/lease-renewal/writeback-approval";
import { isCompleteLeaseRenewalResolutionRecord } from "@/lib/lease-renewal/effective-data-check";
import { currentResolutionForRenewalRun } from "@/lib/lease-renewal/effective-data-check";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";

export const LIVE_RENEWAL_DECISION_RUN_ID = "live-review";

export interface LeaseRenewalDecisionProjection {
  sourceTriggerKey: string;
  runId: string;
  dataMode: "Live" | "Test" | "Sample";
  fieldLabel: string;
  propertyKey?: string;
  decisionState: LeaseRenewalResolutionRecord["status"];
  decisionReceiptId: string;
  decisionReasonRecorded: boolean;
  decisionUpdatedAt: string;
  proposalState: "Not queued" | "Queued";
  proposalIdentity: string | null;
  authorizationState:
    | "Not queued"
    | "Awaiting Approval"
    | LeaseRenewalWritebackApprovalRecord["state"];
  authorizationReceiptId: string | null;
  authorizationReasonRecorded: boolean;
  executionState: "not_executed";
  owningHref: string;
}

export interface BuildLeaseRenewalDecisionProjectionOptions {
  runId?: string;
  /** Fresh current-source runs. A persisted Live decision is never called current without this join. */
  currentRuns: readonly RenewalRunResult[];
}

/**
 * Build a value-free, refresh-stable projection from app-owned decision/authorization records.
 * Candidate values, proposed values, reasons, addresses, and provider payloads are deliberately
 * omitted. A stale/mismatched authorization is not attached to a different decision identity.
 */
export function buildLeaseRenewalDecisionProjections(
  resolutions: readonly LeaseRenewalResolutionRecord[],
  approvals: readonly LeaseRenewalWritebackApprovalRecord[],
  options: BuildLeaseRenewalDecisionProjectionOptions,
): LeaseRenewalDecisionProjection[] {
  const approvalsByTrigger = new Map(
    approvals.map((approval) => [approval.source_trigger_key, approval]),
  );

  return resolutions
    .filter(
      (resolution) =>
        isCompleteLeaseRenewalResolutionRecord(resolution) &&
        options.currentRuns.some((run) =>
          Boolean(currentResolutionForRenewalRun(resolution, run)),
        ) &&
        (!options.runId || resolution.run_id === options.runId),
    )
    .map((resolution) => {
      const proposal = resolution.proposed_writeback;
      const candidateApproval = approvalsByTrigger.get(resolution.source_trigger_key);
      const approval =
        candidateApproval &&
        writebackApprovalMatchesResolution(resolution, candidateApproval)
          ? candidateApproval
          : undefined;
      const proposalQueued = proposal?.status === "Queued";

      return {
        sourceTriggerKey: resolution.source_trigger_key,
        runId: resolution.run_id,
        dataMode: modeForRun(resolution.run_id),
        fieldLabel: resolution.field_label,
        ...(resolution.property_key ? { propertyKey: resolution.property_key } : {}),
        decisionState: resolution.status,
        decisionReceiptId: resolution.id,
        decisionReasonRecorded: Boolean(resolution.reason?.trim()),
        decisionUpdatedAt: resolution.updated_at,
        proposalState: proposalQueued ? "Queued" : "Not queued",
        proposalIdentity: proposalQueued ? resolution.id : null,
        authorizationState: proposalQueued
          ? (approval?.state ?? "Awaiting Approval")
          : "Not queued",
        authorizationReceiptId: approval?.id ?? null,
        authorizationReasonRecorded: Boolean(approval?.reason.trim()),
        executionState: "not_executed",
        owningHref:
          resolution.run_id === LIVE_RENEWAL_DECISION_RUN_ID
            ? "/lease-renewal/live"
            : `/lease-renewal/runs/${encodeURIComponent(resolution.run_id)}`,
      } satisfies LeaseRenewalDecisionProjection;
    })
    .sort(
      (left, right) =>
        right.decisionUpdatedAt.localeCompare(left.decisionUpdatedAt) ||
        left.sourceTriggerKey.localeCompare(right.sourceTriggerKey),
    );
}

function modeForRun(runId: string): LeaseRenewalDecisionProjection["dataMode"] {
  if (runId === LIVE_RENEWAL_DECISION_RUN_ID) return "Live";
  if (runId.startsWith("lease_test_")) return "Test";
  return "Sample";
}
