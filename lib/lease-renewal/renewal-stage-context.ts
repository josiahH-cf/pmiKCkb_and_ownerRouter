// S247 ARCH-S247-1: the one place a loaded desk row becomes the stage projection's context. The
// desk orchestration and the lease page both call this on the same row shape, and the lease page
// hands the same context to the browser so the guided view recomputes the stage from the live
// staff record with exactly the facts the desk row used. Pure.

import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import type { LeaseOutreachEvidenceInput } from "@/lib/lease-renewal/outreach-evidence";
import {
  projectRenewalStage,
  summarizeRenewalStage,
  type RenewalStageContext,
  type RenewalStageSummary,
} from "@/lib/lease-renewal/renewal-stage";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

type StageRow = Pick<
  DeskLeaseRow,
  | "id"
  | "guidance"
  | "manualProgress"
  | "staffRecordedAtIso"
  | "staffRecordUnavailable"
  | "renewalPricing"
  | "housingAssistance"
  | "housingAssistanceMention"
  | "openConflicts"
  | "leaseTerm"
  | "moveOut"
  | "renewalTarget"
  | "workStatus"
  | "endDateIso"
> & {
  readonly followUp?: DeskLeaseRow["followUp"];
  readonly kickoff?: DeskLeaseRow["kickoff"];
  /** S282: the cohort's disposition and reason, which name the off-cycle hold. */
  readonly disposition?: DeskLeaseRow["disposition"];
  readonly reason?: DeskLeaseRow["reason"];
  readonly offCycleEndDate?: DeskLeaseRow["offCycleEndDate"];
};

/**
 * S282 ARCH-S282-1/3: the guidance verification that is the off-cycle hold itself. The stage
 * projection reads that hold from the staff record's review instead, so the Now card, the
 * readiness lists and a save on this page agree; every other verification cause is unchanged.
 */
function offCycleVerification(row: StageRow): boolean {
  const action = row.guidance.action;
  return (
    row.offCycleEndDate !== undefined &&
    row.disposition === "review" &&
    row.reason === "off_cycle_date" &&
    row.guidance.overallStatus === "needs_verification" &&
    "destination" in action &&
    action.destination.kind === "workspace_phase"
  );
}

/** AC-S248-4: the lease's current cycle date, which places a message that named no cycle. */
export function renewalStageCycleDateIso(
  row: Pick<DeskLeaseRow, "renewalTarget" | "leaseTerm" | "endDateIso">,
): string | null {
  const target = row.renewalTarget;
  if (target?.kind === "target") return target.cycleDateIso;
  return row.leaseTerm.term === "month_to_month"
    ? (row.leaseTerm.nextReviewIso ?? null)
    : (row.endDateIso ?? null);
}

export function renewalStageContextFor(
  row: StageRow,
  outreach: LeaseOutreachEvidenceInput | null,
  // Kept for the callers' shape; S279 retired the linked-thread status this once fed (R-S279-2).
  _sourceReadAtIso: string | null,
): RenewalStageContext {
  const action = row.guidance.action;
  const target = row.renewalTarget;
  const term = row.leaseTerm;
  const workStatus = row.workStatus;
  return {
    leaseId: row.id,
    cycleDisposition: target?.cycleDisposition,
    staffRecordUnavailable: row.staffRecordUnavailable === true,
    // S250: a standing agreement names itself ("Covered by {agreement}"); the S194 exact kind
    // keeps its own reason.
    standingAgreement: row.renewalPricing?.authority.covered
      ? {
          label: row.renewalPricing.authority.label ?? null,
          reason: row.renewalPricing.authority.reason,
        }
      : null,
    // S250 R-S250-6: an applied agreement that does not cover the lease now, with its reason.
    ...(row.renewalPricing?.authority.kind === "standing" &&
    !row.renewalPricing.authority.covered
      ? { standingLeft: { reason: row.renewalPricing.authority.reason } }
      : {}),
    // S251: the lease's Housing assistance Yes fact; No and not set follow the standard path.
    housingAssistance:
      row.housingAssistance?.status === "yes"
        ? { program: row.housingAssistance.program }
        : null,
    ...(row.housingAssistanceMention && !row.housingAssistance
      ? { housingAssistanceMention: true as const }
      : {}),
    // S249 R-S249-1 (D-OP-7): where the preparation projection was made, the numbers check reads
    // RentVine as the basis and a Sheet difference is information; else the S157 guidance.
    numbers: row.kickoff
      ? {
          verified: row.kickoff.numbers.state === "agree",
          openDifferences: row.kickoff.numbers.state === "difference" ? 1 : 0,
          line: row.kickoff.numbers.line,
        }
      : {
          verified: row.guidance.rentVerification.state === "verified",
          openDifferences: row.openConflicts,
        },
    preparation: row.kickoff ?? null,
    term: {
      monthToMonth: term.term === "month_to_month",
      reviewNeeded:
        term.term === "needs_review" ||
        term.reviewState === "needs_anchor" ||
        term.recordedReviewStale === true,
    },
    moveOutInitiated: row.moveOut?.state === "initiated",
    sourceRenewal:
      target?.kind === "not_target" &&
      target.reason === "renewed_in_rentvine" &&
      target.recordedDateIso &&
      target.sourceDateIso &&
      target.cycleId &&
      target.revision !== undefined
        ? {
            recordedDateIso: target.recordedDateIso,
            sourceDateIso: target.sourceDateIso,
            cycleId: target.cycleId,
            revision: target.revision,
          }
        : null,
    verification:
      row.guidance.overallStatus === "needs_verification" &&
      "label" in action &&
      !offCycleVerification(row)
        ? {
            label: action.label,
            refresh: !("destination" in action) || action.destination.kind === "none",
          }
        : null,
    // S282 R-S282-2: the off-cycle end date the staff record's review is read against.
    ...(row.offCycleEndDate
      ? { offCycleEndDate: { endDateIso: row.offCycleEndDate.endDateIso } }
      : {}),
    handStatus:
      workStatus?.state === "recorded" && workStatus.cycleRelation === "current"
        ? { key: workStatus.status, label: workStatus.label }
        : null,
    // S279 R-S279-2: the stage reads who, since when, the last contact and the check from the
    // lease's own message evidence below; no viewer's linked Gmail thread enters the context.
    outreach,
    cycleDateIso: renewalStageCycleDateIso(row),
  };
}

/** The desk row's and the assistant's stage: the same projection the lease page shows. */
export function deskRowRenewalStage(
  row: StageRow,
  state: RenewalWorkspaceState | null,
  outreach: LeaseOutreachEvidenceInput | null,
  sourceReadAtIso: string | null,
): RenewalStageSummary {
  return summarizeRenewalStage(
    projectRenewalStage(state, renewalStageContextFor(row, outreach, sourceReadAtIso), {
      standingCovered: row.renewalPricing?.authority.covered === true,
    }),
  );
}
