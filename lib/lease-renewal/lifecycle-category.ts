import type { CohortDisposition } from "@/lib/lease-renewal/cohort";
import type { CycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import type { RenewalDeskRetentionState } from "@/lib/lease-renewal/desk-model";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import type { manualRenewalSummary } from "@/lib/lease-renewal/workspace-state";

/**
 * S134 (F14): one pure, cycle-aware lifecycle category per lease, projected from real current
 * evidence: the audited manual cycle (S113), the app-recorded progress (S72), the current-cycle
 * versus provider-date relation (S123), the source-attributed move-out disposition (S124) and the
 * existing eligibility window. It is a presentation category, never a provider status or a workflow
 * transition; it writes nothing and a saved staff work-status label alone never yields Complete.
 */
export const LIFECYCLE_CATEGORIES = [
  "complete",
  "non_renewal",
  "in_progress",
  "upcoming",
  "later",
  "unknown",
] as const;
export type LifecycleCategory = (typeof LIFECYCLE_CATEGORIES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleCategory, string> = {
  complete: "Complete",
  non_renewal: "Non-renewal initiated",
  in_progress: "In progress",
  upcoming: "Upcoming",
  later: "Later / outside current window",
  unknown: "Unknown: review",
};

/** Alphabetic order of the visible labels; the sort consumes this key, never a color or class. */
export const LIFECYCLE_SORT_ORDER: readonly LifecycleCategory[] = [
  ...LIFECYCLE_CATEGORIES,
].sort((left, right) =>
  LIFECYCLE_LABELS[left].localeCompare(LIFECYCLE_LABELS[right], "en-US"),
);

export type LifecycleAttribution =
  | "staff_recorded"
  | "app_recorded"
  | "provider_notice"
  | "staff_decision"
  | null;

export interface LifecycleProjection {
  readonly category: LifecycleCategory;
  readonly label: string;
  /** Who or what established the category when it is a completion or a non-renewal. */
  readonly attribution: LifecycleAttribution;
  /** Short visible qualifier beside the label; null when the label stands alone. */
  readonly qualifier: string | null;
  /** One sentence explaining the evidence; never a send, close or completion claim. */
  readonly explanation: string;
}

export interface LifecycleInput {
  readonly retention: RenewalDeskRetentionState;
  readonly disposition: CohortDisposition;
  readonly manualProgress?: ReturnType<typeof manualRenewalSummary> | null;
  readonly cycleSourceDate?: CycleSourceDateChange | null;
  readonly moveOut?: MoveOutDisposition | null;
  /** The saved app-recorded progress (S72), when one exists. */
  readonly appProgress?: { readonly complete: boolean } | null;
  /** False when saved progress could not be read; the category then fails closed to unknown. */
  readonly progressStateAvailable: boolean;
}

const ATTRIBUTION_TEXT: Record<Exclude<LifecycleAttribution, null>, string> = {
  staff_recorded: "recorded by staff",
  app_recorded: "recorded in the app",
  provider_notice: "RentVine notice",
  staff_decision: "staff decision",
};

export function lifecycleAttributionText(
  attribution: LifecycleAttribution,
): string | null {
  return attribution ? ATTRIBUTION_TEXT[attribution] : null;
}

function projection(
  category: LifecycleCategory,
  attribution: LifecycleAttribution,
  qualifier: string | null,
  explanation: string,
): LifecycleProjection {
  return {
    category,
    label: LIFECYCLE_LABELS[category],
    attribution,
    qualifier,
    explanation,
  };
}

export function projectLifecycleCategory(input: LifecycleInput): LifecycleProjection {
  const {
    retention,
    manualProgress = null,
    cycleSourceDate = null,
    moveOut = null,
    appProgress = null,
  } = input;
  if (!input.progressStateAvailable)
    return projection(
      "unknown",
      null,
      null,
      "Saved renewal progress could not be read, so the lifecycle stage is unverified. Refresh before relying on it.",
    );
  if (retention.state === "needs_verification")
    return projection("unknown", null, null, `${retention.label}.`);

  const cycleAdvanced = cycleSourceDate?.state === "changed";
  const manualComplete = manualProgress?.complete === true;
  const appComplete = !manualProgress && appProgress?.complete === true;
  const completedCycle = manualComplete || appComplete;
  const completionAttribution: LifecycleAttribution = manualComplete
    ? "staff_recorded"
    : appComplete
      ? "app_recorded"
      : null;

  if (completedCycle && !cycleAdvanced) {
    const handoff = manualComplete && manualProgress?.nonRenewal === true;
    return projection(
      "complete",
      completionAttribution,
      handoff
        ? `Non-renewal handoff completed (${ATTRIBUTION_TEXT[completionAttribution!]})`
        : ATTRIBUTION_TEXT[completionAttribution!],
      handoff
        ? "The current cycle's non-renewal handoff is complete as recorded by staff. This does not establish provider-verified completion."
        : `The current cycle is complete as ${ATTRIBUTION_TEXT[completionAttribution!]}. This does not establish provider-verified signatures or synchronization.`,
    );
  }
  if (moveOut?.state === "initiated")
    return projection("non_renewal", "provider_notice", "RentVine notice", moveOut.label);
  if (manualProgress?.nonRenewal === true && !manualComplete)
    return projection(
      "non_renewal",
      "staff_decision",
      "staff decision",
      "Staff recorded a non-renewal decision on the current cycle; the non-renewal handoff remains open.",
    );
  if (moveOut?.state === "withdrawn")
    return projection("unknown", null, null, moveOut.label);
  if (moveOut?.state === "unknown" && moveOut.reason !== "lease_not_active")
    return projection("unknown", null, null, moveOut.label);

  const unfinishedManual = Boolean(manualProgress) && !manualComplete;
  const unfinishedApp = Boolean(appProgress) && appProgress?.complete !== true;
  if (unfinishedManual || unfinishedApp || retention.state === "tracked_incomplete")
    return projection(
      "in_progress",
      null,
      null,
      cycleAdvanced
        ? "Recorded renewal work is unfinished and the provider lease end has changed since the cycle was recorded; review the recorded terms."
        : "Recorded renewal work on the current cycle is unfinished.",
    );

  const previousCycleNote = completedCycle
    ? " A previous cycle was completed; the provider lease end has since advanced, so that completion does not cover this one."
    : "";
  if (retention.state === "window" || retention.state === "periodic_review")
    return projection(
      "upcoming",
      null,
      null,
      `${retention.label}; no renewal work is recorded yet.${previousCycleNote}`,
    );
  if (retention.state === "outside")
    return projection("later", null, null, `${retention.label}.${previousCycleNote}`);
  return projection(
    "unknown",
    null,
    null,
    "The lifecycle stage could not be established from the current evidence.",
  );
}

export const LIFECYCLE_DESK_FILTERS = ["all", ...LIFECYCLE_CATEGORIES] as const;
export type LifecycleDeskFilter = (typeof LIFECYCLE_DESK_FILTERS)[number];

export const LIFECYCLE_CONTROL_LABEL = "Lifecycle status";

export function lifecycleFilterLabel(filter: LifecycleDeskFilter): string {
  return filter === "all" ? "All lifecycle stages" : LIFECYCLE_LABELS[filter];
}

/** Absent means the category was not projected; it filters as unknown, never as any other stage. */
export function matchesLifecycleFilter(
  filter: LifecycleDeskFilter,
  key: LifecycleCategory | undefined,
): boolean {
  if (filter === "all") return true;
  return (key ?? "unknown") === filter;
}

/** The sort key: the visible label, so the order follows what the operator reads. */
export function lifecycleSortValue(key: LifecycleCategory | undefined): string {
  return LIFECYCLE_LABELS[key ?? "unknown"];
}
