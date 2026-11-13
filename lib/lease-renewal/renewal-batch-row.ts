// S246 R-S246-7: one short batch row per lease, projected on the server from the desk row the
// orchestration already loaded. Three seams later suites change in exactly one place each:
//   - `renewalBatchRowStage`: the one stage line and the one next step (today the existing S232
//     status and action text);
//   - `renewalBatchRowTags`: at most three tags (only what exists today is populated);
//   - `orderThisBatch` in `renewal-batch.ts`: the order inside "This batch".
// Pure: nothing here reads a source or records anything.

import { formatCalendarDate, formatCalendarDateOrTimestamp } from "@/lib/date-display";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import { rentViewBasisPhrase } from "@/lib/lease-renewal/rent-basis";
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
import { cycleDispositionHold } from "./cycle-disposition";
import { RENTVINE_STATUS_UNAVAILABLE_LABEL } from "@/lib/lease-renewal/renewal-target";
import { HOUSING_ASSISTANCE_SUGGESTION } from "@/lib/lease-renewal/cohort";
import { RENEWAL_PATH_DEFINITION } from "@/lib/lease-renewal/renewal-path";
import {
  kickoffOrderGroup,
  kickoffRowLine,
  type KickoffOrderGroup,
} from "@/lib/lease-renewal/renewal-preparation";

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
> & {
  readonly followUp?: DeskLeaseRow["followUp"];
  readonly renewalStage?: DeskLeaseRow["renewalStage"];
};

/**
 * The batch row's one stage line and one next step. S247: both come from the one stage
 * projection the row carries (`row.renewalStage`), the same one the lease page's guided view and
 * the assistant read. The next step opens the lease at its current path step in the guided view.
 * A row built without the projection keeps the S232 status and guidance action it had before.
 */
export function renewalBatchRowStage(
  row: StageSourceRow,
  sourceReadAtIso: string | null,
): RenewalBatchRowStage {
  const projected = row.renewalStage;
  if (projected)
    return {
      stageLine: projected.stageLine,
      nextStep: {
        label: projected.nextStep.label,
        stepId: projected.nextStep.stepId,
        controlId: null,
      },
      needsCheck: projected.needsCheck,
      checkDetail: projected.checkDetail,
    };
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
 * The row's tags, at most three: a standing agreement that covers this lease (S250 R-S250-8), the
 * lease's stored Housing assistance Yes fact (S251 R-S251-11; never RentVine wording), and two
 * waiting facts that disagree.
 */
export function renewalBatchRowTags(
  row: Pick<DeskLeaseRow, "renewalPricing"> & {
    readonly housingAssistance?: DeskLeaseRow["housingAssistance"];
  },
  stage: Pick<RenewalBatchRowStage, "needsCheck" | "checkDetail">,
): RenewalBatchTag[] {
  const tags: RenewalBatchTag[] = [];
  if (row.renewalPricing?.authority.covered)
    tags.push({
      key: "standing_agreement",
      label: RENEWAL_BATCH_TAG_LABELS.standing_agreement,
      detail: row.renewalPricing.authority.reason,
    });
  if (row.housingAssistance?.status === "yes")
    tags.push({
      key: "housing_assistance",
      label: RENEWAL_BATCH_TAG_LABELS.housing_assistance,
      detail: `Housing assistance: ${row.housingAssistance.program}, recorded by staff on this lease.`,
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
  readonly currentBaseRent?: number | null;
  /** S277 R-S277-5: the base shown is the staff working correction ("Working $1,350.00"). */
  readonly currentBaseRentWorking?: boolean;
  readonly recommendedRent?: { value: number; basis: string } | null;
  /** S277 R-S277-2: the short basis phrase of Rent to recommend, from the one projection. */
  readonly recommendedBasis?: string | null;
  /** S277 R-S277-5: the base rent the owner approved for this term ("Approved $1,425.00"). */
  readonly approvedRent?: number | null;
  readonly nextStep: RenewalBatchNextStep;
  readonly tags: readonly RenewalBatchTag[];
  /**
   * S273 R-S273-3: the one actionable exception cue for a held or out-of-date unsent message
   * ("Scheduled message out of date" or "Message held"), linking to its step (S246 R-S246-7 allows
   * one). Absent when there is none.
   */
  readonly messageCue?: {
    readonly kind: "out_of_date" | "held";
    readonly label: string;
    readonly stepId: string;
  };
  /** R-S246-12: "RentVine status unavailable" when the lease status could not be read. */
  readonly statusNote: string | null;
  /**
   * S251 R-S251-10: "RentVine mentions housing assistance. Set the field?" while the fact is not
   * set and RentVine text mentions assistance. A suggestion only; it changes nothing.
   */
  readonly suggestion: string | null;
  /** The plain reason a lease sits in its count group, when the group label is not enough. */
  readonly reason: string | null;
  /**
   * R-S246-5: the recorded cycle date and the later lease end RentVine reports now, with the
   * cycle and revision of the work record this row was projected from. A confirmation names that
   * version, so a record another operator changed after the row was shown is refused.
   */
  readonly sourceRenewal: {
    readonly recordedDateIso: string;
    readonly sourceDateIso: string;
    readonly recordedLabel: string;
    readonly sourceLabel: string;
    readonly cycleId: string;
    readonly revision: number;
  } | null;
  /**
   * S249 R-S249-11 / R-S249-13: the kickoff from the one preparation projection the Now card reads:
   * ready for review, or the named missing inputs with the step that fixes them. Null when the row
   * was projected without it or its owner step is already underway.
   */
  readonly kickoff: {
    readonly line: string;
    readonly missing: readonly string[];
    /** True when no comparison is stored for this cycle, so batch preparation would look it up. */
    readonly needsComparison: boolean;
    readonly allowanceReached: boolean;
    /** The cycle date the batch claim is keyed by. */
    readonly cycleDateIso: string | null;
  } | null;
}

/** S249: whether the lease's owner step is underway (sent, scheduled, waiting or decided). */
function ownerStepStarted(stage: DeskLeaseRow["renewalStage"]): boolean {
  if (!stage) return false;
  if (stage.waiting || stage.needsCheck) return true;
  if (stage.currentStepId === "ask-owner")
    return stage.nextStep.label !== RENEWAL_PATH_DEFINITION["ask-owner"].primary.label;
  return !["check-numbers", "compare-market", "month-to-month-review"].includes(
    stage.currentStepId,
  );
}

function kickoffFor(row: DeskLeaseRow): {
  group: KickoffOrderGroup;
  view: RenewalBatchRowView["kickoff"];
} {
  if (cycleDispositionHold(row.renewalTarget?.cycleDisposition))
    return { group: "other", view: null };
  const preparation = row.kickoff;
  const stage = row.renewalStage;
  const group = kickoffOrderGroup({
    preparation,
    currentStepId: stage?.currentStepId,
    ownerStepStarted: ownerStepStarted(stage),
  });
  if (!preparation || group === "other") return { group, view: null };
  // S250: a lease whose standing agreement covers the owner step takes its rent from the rule, so
  // its kickoff needs no comparison; one whose coverage could not be confirmed on this read waits
  // for a read that confirms it or not. Neither is handed to batch preparation. A lease that left
  // the rule (a typed different rent) is an ordinary target.
  const authority = row.renewalPricing?.authority;
  const coverageFenced = authority?.covered === true || authority?.unconfirmed === true;
  return {
    group,
    view: {
      line: kickoffRowLine(preparation),
      missing: preparation.missing,
      needsComparison:
        !coverageFenced &&
        ((preparation.comparison.state === "none" && !preparation.comparison.attempted) ||
          preparation.comparison.state === "allowance_reached"),
      allowanceReached: preparation.comparison.state === "allowance_reached",
      cycleDateIso:
        row.renewalTarget?.kind === "target" ? row.renewalTarget.cycleDateIso : null,
    },
  };
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
  const kickoff = kickoffFor(row);
  // S261 ARCH-S261-1: "Current base rent" is the one base decision as the desk can make it
  // without a charge read: the working correction, else the RentVine contractual base.
  const base = operationalCurrentRent({
    workingRent: row.workingCurrentRent ?? null,
    contractualRent: row.currentRent,
  });
  const recommended =
    row.kickoff?.rent.value != null && !cycleDispositionHold(target?.cycleDisposition)
      ? { value: row.kickoff.rent.value, basis: row.kickoff.rent.basis }
      : null;
  const triage = row.renewalStage?.triage;
  const attention = triage
    ? {
        ...triage,
        rank: triage.rank === 1 && kickoff.group === "missing" ? 0 : triage.rank,
        due: row.followUp?.due?.atIso ?? null,
      }
    : undefined;
  return {
    key,
    placement,
    attention,
    kickoffGroup: kickoff.group,
    kickoff: kickoff.view,
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
    currentBaseRent: base.amount,
    currentBaseRentWorking: base.basis === "working",
    recommendedRent: recommended,
    recommendedBasis: recommended
      ? rentViewBasisPhrase(
          row.kickoff?.rent,
          row.renewalPricing?.authority.label ?? null,
        )
      : null,
    approvedRent:
      typeof row.ownerApprovedRent === "number" &&
      !cycleDispositionHold(target?.cycleDisposition)
        ? row.ownerApprovedRent
        : null,
    nextStep: stage.nextStep,
    tags: renewalBatchRowTags(row, stage),
    ...(row.renewalStage?.messageCue && !cycleDispositionHold(target?.cycleDisposition)
      ? { messageCue: { ...row.renewalStage.messageCue } }
      : {}),
    statusNote:
      [
        target?.statusUnavailable
          ? RENTVINE_STATUS_UNAVAILABLE_LABEL
          : target?.cycleDisposition?.state === "retired" && target.statusName
            ? `RentVine: ${target.statusName}`
            : null,
        target?.cycleDisposition?.state === "unavailable"
          ? "Retirement status unavailable"
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    suggestion:
      row.housingAssistanceMention && !row.housingAssistance
        ? HOUSING_ASSISTANCE_SUGGESTION
        : null,
    reason: placement.kind === "fixed" ? placement.reason : null,
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
            recordedLabel: formatCalendarDate(target.recordedDateIso),
            sourceLabel: formatCalendarDate(target.sourceDateIso),
            cycleId: target.cycleId,
            revision: target.revision,
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
