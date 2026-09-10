import { renewalDecisionRecordKey, type ReconciledFieldOutcome } from "./pipeline";
import { renewalReconciliationSourceTriggerKey } from "./approval-queue-mapping";
/** An explicit fact correction has the same exact source identity without inventing a conflict. */
export function currentRentCorrectionKey(
  outcome: ReconciledFieldOutcome,
  runId: string,
): string | null {
  const joins = outcome.matchedCandidateJoinIds;
  if (
    outcome.fieldKey !== "current_rent" ||
    joins?.length !== 1 ||
    !/^lease:[1-9]\d*$/.test(joins[0])
  )
    return null;
  return renewalReconciliationSourceTriggerKey(
    runId,
    renewalDecisionRecordKey(joins[0], outcome.recordRef),
    "current_rent",
  );
}
