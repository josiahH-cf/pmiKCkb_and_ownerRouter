// S246 R-S246-7: one short batch row per lease, projected on the server from the desk row the
// orchestration already loaded. Three seams later suites change in exactly one place each:
//   - `renewalBatchRowStage`: the one stage line and the one next step (today the existing S232
//     status and action text);
//   - `renewalBatchRowTags`: at most three tags (only what exists today is populated);
//   - `orderThisBatch` in `renewal-batch.ts`: the order inside "This batch".
// Pure: nothing here reads a source or records anything.

import { formatCalendarDate, formatCalendarDateOrTimestamp } from "@/lib/date-display";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { isStableLeaseId } from "@/lib/lease-renewal/desk-view-continuation";
import {
  deskLeaseWorkStatusInput,
  leaseWorkStatusLines,
  projectLeaseWorkStatus,
} from "@/lib/lease-renewal/lease-work-status";
import {
  renewalBatchPlacement,
  type RenewalBatchItem,
} from "@/lib/lease-renewal/renewal-batch";
import { RENTVINE_STATUS_UNAVAILABLE_LABEL } from "@/lib/lease-renewal/renewal-target";

export interface RenewalBatchNextStep {
  /** The link's words. */
  readonly label: string;
  /** Where on the lease page the step is worked; null opens the lease itself. */
  readonly stepId: string | null;
  readonly controlId: string | null;
}

export interface RenewalBatchRowStage {
  /** One line: the status, who the lease waits on and since when. */
  readonly stageLine: string;
  readonly nextStep: RenewalBatchNextStep;
  /** The staff record and the linked thread disagree; both facts are in `checkDetail`. */
  readonly needsCheck: boolean;
  readonly checkDetail: string | null;
}

const CONTROL_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,120}$/;
const OPEN_LEASE_LABEL = "Open the lease";

type StageSourceRow = Pick<
  DeskLeaseRow,
  "guidance" | "manualProgress" | "staffRecordedAtIso" | "staffRecordUnavailable"
> & { readonly followUp?: DeskLeaseRow["followUp"] };

/**
 * The batch row's one stage line and one next step. Today both come from the existing S232
 * status projection and the desk guidance action; a later stage projection replaces this one
 * function and nothing else on the row.
 */
export function renewalBatchRowStage(
  row: StageSourceRow,
  sourceReadAtIso: string | null,
): RenewalBatchRowStage {
  const status = projectLeaseWorkStatus(deskLeaseWorkStatusInput(row, sourceReadAtIso));
  const lines = leaseWorkStatusLines(status);
  const action = row.guidance.action;
  const blockers = row.guidance.blockers;
  // The same rule the table's Action column follows: open blockers are the action on a blocked
  // or unverified lease.
  const causalBlockers =
    blockers.length > 0 &&
    (action.kind === "blocked" || action.kind === "needs_verification");
  let stageLine: string;
  if (status.check && lines.check) stageLine = lines.check;
  else if (status.evidence.source === "staff_record_unavailable")
    stageLine = `${status.label}: the staff record could not be read`;
  else if (causalBlockers)
    stageLine =
      blockers.length === 1
        ? `${status.label}, one open item`
        : `${status.label}, ${blockers.length} open items`;
  else if (
    (action.kind === "needs_verification" || action.kind === "review") &&
    action.label.trim() !== ""
  )
    // The source read decides these statuses; its reason is the rest of the one line.
    stageLine = `${status.label}: ${action.label.trim().replace(/\.$/, "")}`;
  else {
    const recordedAt =
      status.evidence.source === "staff_record" && status.evidence.atIso
        ? formatCalendarDateOrTimestamp(status.evidence.atIso)
        : null;
    const waiting = status.waitingOn
      ? status.status === "waiting"
        ? `Waiting on ${status.waitingOn}`
        : `${status.label}, waiting on ${status.waitingOn}`
      : status.label;
    stageLine = recordedAt
      ? `${waiting}${status.waitingOn ? " since" : ","} ${recordedAt}`
      : status.evidence.nothingRecorded
        ? `${waiting}, nothing recorded yet`
        : waiting;
  }

  // One next step: the first open blocker, else the guidance action. A status sentence or a
  // classification label (for example "Outside this window") is context, never a next step.
  const next = causalBlockers
    ? { label: blockers[0].label, destination: blockers[0].destination }
    : action.kind === "act" || action.kind === "waiting" || action.kind === "complete"
      ? { label: action.label, destination: action.destination }
      : {
          label: OPEN_LEASE_LABEL,
          destination: "destination" in action ? action.destination : null,
        };
  const destination = next.destination;
  const stepId = destination?.kind === "workspace_phase" ? destination.stepId : null;
  const controlId =
    destination?.kind === "workspace_phase" &&
    destination.controlId &&
    CONTROL_ID_PATTERN.test(destination.controlId)
      ? destination.controlId
      : null;
  return {
    stageLine,
    nextStep: {
      label: next.label.trim() === "" ? OPEN_LEASE_LABEL : next.label,
      stepId,
      controlId,
    },
    needsCheck: status.status === "needs_check",
    checkDetail: status.check ? lines.check : null,
  };
}

export type RenewalBatchTagKey =
  | "standing_agreement"
  | "housing_assistance"
  | "needs_check";

export interface RenewalBatchTag {
  readonly key: RenewalBatchTagKey;
  readonly label: string;
  /** What the tag is read from, in one sentence. */
  readonly detail: string;
}

export const RENEWAL_BATCH_TAG_LABELS: Record<RenewalBatchTagKey, string> = {
  standing_agreement: "Standing agreement",
  housing_assistance: "Housing assistance",
  needs_check: "Needs a check",
};

/**
 * The row's tags, at most three. Only what exists today is populated: a recorded standing owner
 * authority that covers this lease, and two waiting facts that disagree. The housing assistance
 * tag has no source yet, so it is never shown.
 */
export function renewalBatchRowTags(
  row: Pick<DeskLeaseRow, "renewalPricing">,
  stage: Pick<RenewalBatchRowStage, "needsCheck" | "checkDetail">,
): RenewalBatchTag[] {
  const tags: RenewalBatchTag[] = [];
  if (row.renewalPricing?.authority.covered)
    tags.push({
      key: "standing_agreement",
      label: RENEWAL_BATCH_TAG_LABELS.standing_agreement,
      detail: row.renewalPricing.authority.reason,
    });
  if (stage.needsCheck)
    tags.push({
      key: "needs_check",
      label: RENEWAL_BATCH_TAG_LABELS.needs_check,
      detail:
        stage.checkDetail ?? "Two recorded facts about this lease disagree. Check both.",
    });
  return tags.slice(0, 3);
}

/** One batch row, serializable from the server to the batch view. */
export interface RenewalBatchRowView extends RenewalBatchItem {
  /** The lease id, or "" when the source row resolved none (the row then has no link). */
  readonly leaseId: string;
  readonly canOpen: boolean;
  readonly address: string;
  readonly unit: string | null;
  readonly tenants: readonly string[];
  /** "Ends 12/31/2026", "Ended 10/31/2026", "Review due 12/10/2026" or the missing-date words. */
  readonly dateLabel: string;
  readonly dateIso: string | null;
  /** A second date fact when the cycle date and the RentVine lease end differ. */
  readonly dateNote: string | null;
  readonly stageLine: string;
  readonly nextStep: RenewalBatchNextStep;
  readonly tags: readonly RenewalBatchTag[];
  /** R-S246-12: "RentVine status unavailable" when the lease status could not be read. */
  readonly statusNote: string | null;
  /** The plain reason a lease sits in its count group, when the group label is not enough. */
  readonly reason: string | null;
  /** R-S246-5: the recorded cycle date and the later lease end RentVine reports now. */
  readonly sourceRenewal: {
    readonly recordedDateIso: string;
    readonly sourceDateIso: string;
    readonly recordedLabel: string;
    readonly sourceLabel: string;
  } | null;
}

export interface RenewalBatchRowContext {
  /** When the RentVine read behind the rows was taken. */
  readonly sourceReadAtIso: string | null;
  /** Today's Central business date, to say "Ends" or "Ended". */
  readonly todayIso: string;
}

function endDateLabel(iso: string | null, todayIso: string): string {
  if (!iso) return "No end date on file";
  return `${iso < todayIso ? "Ended" : "Ends"} ${formatCalendarDate(iso)}`;
}

/** Project one desk row into its batch row. */
export function projectRenewalBatchRow(
  row: DeskLeaseRow,
  context: RenewalBatchRowContext,
): RenewalBatchRowView {
  const placement = renewalBatchPlacement(row);
  const target = row.renewalTarget;
  const stage = renewalBatchRowStage(row, context.sourceReadAtIso);
  const monthToMonth = row.leaseTerm.term === "month_to_month";
  const reviewIso = monthToMonth ? row.leaseTerm.nextReviewIso : null;
  const cycleIso = placement.kind === "dated" ? placement.dateIso : null;
  const dateIso = cycleIso ?? reviewIso ?? row.endDateIso;
  const dateLabel = cycleIso
    ? endDateLabel(cycleIso, context.todayIso)
    : monthToMonth
      ? reviewIso
        ? `Review due ${formatCalendarDate(reviewIso)}`
        : "Review date needs to be recorded"
      : endDateLabel(row.endDateIso, context.todayIso);
  const dateNote =
    target?.kind === "target" && target.keptWorking && row.endDateIso
      ? `RentVine now reports ${formatCalendarDate(row.endDateIso)}; staff kept working this cycle`
      : null;
  const unitLabel = row.identity.unit?.label?.label?.trim() || null;
  const key = row.id || row.identity.address?.sourceRef || row.addressLabel;
  return {
    key,
    placement,
    sortDateIso: dateIso,
    sortLabel: row.addressLabel,
    leaseId: row.id,
    canOpen: isStableLeaseId(row.id),
    address: row.addressLabel,
    unit: unitLabel && !row.addressLabel.includes(unitLabel) ? unitLabel : null,
    tenants: row.tenantNameLabels,
    dateLabel,
    dateIso,
    dateNote,
    stageLine: stage.stageLine,
    nextStep: stage.nextStep,
    tags: renewalBatchRowTags(row, stage),
    statusNote: target?.statusUnavailable ? RENTVINE_STATUS_UNAVAILABLE_LABEL : null,
    reason: placement.kind === "fixed" ? placement.reason : null,
    sourceRenewal:
      target?.kind === "not_target" &&
      target.reason === "renewed_in_rentvine" &&
      target.recordedDateIso &&
      target.sourceDateIso
        ? {
            recordedDateIso: target.recordedDateIso,
            sourceDateIso: target.sourceDateIso,
            recordedLabel: formatCalendarDate(target.recordedDateIso),
            sourceLabel: formatCalendarDate(target.sourceDateIso),
          }
        : null,
  };
}

/** Project every loaded desk row; the batch view partitions exactly these. */
export function projectRenewalBatchRows(
  rows: readonly DeskLeaseRow[],
  context: RenewalBatchRowContext,
): RenewalBatchRowView[] {
  return rows.map((row) => projectRenewalBatchRow(row, context));
}
