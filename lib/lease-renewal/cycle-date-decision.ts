// S246 R-S246-5: when RentVine reports a later lease end than the cycle staff recorded, the lease
// asks for one decision: record staff completion with that RentVine date as the evidence, or keep
// working the recorded cycle. This is the "keep working" half: an app-owned decision bound to the
// exact cycle, the recorded date and the RentVine date staff saw. It completes nothing, changes no
// work record and reaches no provider. A decision made for other dates is simply not current, so
// the lease asks again. Pure and client-safe; the store is
// `lib/firestore/renewal-cycle-date-decisions.ts`.

export const RENEWAL_CYCLE_DATE_DECISION_SCHEMA_VERSION =
  "renewal-cycle-date-decision/v1" as const;

export interface RenewalCycleDateDecision {
  readonly schemaVersion: typeof RENEWAL_CYCLE_DATE_DECISION_SCHEMA_VERSION;
  readonly leaseId: string;
  /** The work record the decision is about. */
  readonly cycleId: string;
  /** The lease end that work record recorded. */
  readonly recordedDateIso: string;
  /** The later lease end RentVine reported when staff decided. */
  readonly sourceDateIso: string;
  readonly decision: "keep_working";
  readonly revision: number;
  readonly recordedAt: string;
  readonly recordedByUid: string;
  readonly recordedByLabel: string;
  /** The saving operation id; a repeated request returns the first result. */
  readonly eventId: string;
}

/**
 * Whether a stored decision still answers the question in front of staff: the same work record,
 * the same recorded date and the same RentVine date. Anything else is not current.
 */
export function cycleDateDecisionIsCurrent(
  decision: RenewalCycleDateDecision | null | undefined,
  current: {
    readonly cycleId: string | null | undefined;
    readonly recordedDateIso: string | null | undefined;
    readonly sourceDateIso: string | null | undefined;
  },
): boolean {
  return Boolean(
    decision &&
    decision.decision === "keep_working" &&
    current.cycleId &&
    decision.cycleId === current.cycleId &&
    current.recordedDateIso &&
    decision.recordedDateIso === current.recordedDateIso &&
    current.sourceDateIso &&
    decision.sourceDateIso === current.sourceDateIso,
  );
}

/** The source evidence a confirmed completion carries, in the staff record's own words. */
export function sourceRenewalCompletionEvidence(input: {
  readonly recordedDateIso: string;
  readonly sourceDateIso: string;
}): { readonly source: string; readonly reason: string } {
  return {
    source: `RentVine lease end ${input.sourceDateIso}`,
    reason: `RentVine reports lease end ${input.sourceDateIso}, later than the ${input.recordedDateIso} this cycle recorded. Staff confirmed the renewal complete from the Renewals desk.`,
  };
}
