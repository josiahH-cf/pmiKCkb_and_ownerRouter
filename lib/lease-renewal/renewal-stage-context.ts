// S247 ARCH-S247-1: the one place a loaded desk row becomes the stage projection's context. The
// desk orchestration and the lease page both call this on the same row shape, and the lease page
// hands the same context to the browser so the guided view recomputes the stage from the live
// staff record with exactly the facts the desk row used. Pure.

import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import {
  deskLeaseWorkStatusInput,
  leaseWorkStatusLines,
  projectLeaseWorkStatus,
} from "@/lib/lease-renewal/lease-work-status";
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
  | "openConflicts"
  | "leaseTerm"
  | "moveOut"
  | "renewalTarget"
  | "workStatus"
> & { readonly followUp?: DeskLeaseRow["followUp"] };

export function renewalStageContextFor(
  row: StageRow,
  outreach: LeaseOutreachEvidenceInput | null,
  sourceReadAtIso: string | null,
): RenewalStageContext {
  const action = row.guidance.action;
  const target = row.renewalTarget;
  const term = row.leaseTerm;
  const status = projectLeaseWorkStatus(
    deskLeaseWorkStatusInput(
      {
        ...row,
        followUp: row.followUp
          ? { waiting: row.followUp.waiting, lastContact: row.followUp.lastContact }
          : null,
      },
      sourceReadAtIso,
    ),
  );
  const workStatus = row.workStatus;
  return {
    leaseId: row.id,
    staffRecordUnavailable: row.staffRecordUnavailable === true,
    standingAgreement: row.renewalPricing?.authority.covered
      ? { label: null, reason: row.renewalPricing.authority.reason }
      : null,
    housingAssistance: null,
    numbers: {
      verified: row.guidance.rentVerification.state === "verified",
      openDifferences: row.openConflicts,
    },
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
      row.guidance.overallStatus === "needs_verification" && "label" in action
        ? {
            label: action.label,
            refresh: !("destination" in action) || action.destination.kind === "none",
          }
        : null,
    handStatus:
      workStatus?.state === "recorded" && workStatus.cycleRelation === "current"
        ? { key: workStatus.status, label: workStatus.label }
        : null,
    lastContactAtIso: row.followUp?.lastContact.atIso ?? null,
    threadCheck:
      status.check && status.check.linkedThread
        ? leaseWorkStatusLines(status).check
        : null,
    outreach,
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
