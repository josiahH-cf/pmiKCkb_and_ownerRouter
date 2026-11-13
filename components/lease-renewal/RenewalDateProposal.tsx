"use client";

// S263 R-S263-1..4 (BEH-S263-1, BEH-S263-3, BEH-S263-4): the verified current lease end beside the
// working renewal dates in Working renewal terms, the one supported next-day start, and the way
// back to the tenant offer a date fix started from. Showing a suggestion saves nothing; only the
// explicit choice saves, through the existing working-date save, after the server checks the
// cycle, the verified end and the field revision. No provider is written and no end is invented.
//
// S285 R-S285-1 (ARCH-S285-1, BEH-S285-1): beside manual entry of the working end, the end-date
// choices staff make from a stated term. Choosing one fills the end field and the existing save
// stores it with its basis; showing the choices saves nothing.

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import { currentCycleFieldEmpty } from "@/lib/lease-renewal/current-cycle-terms";
import type { LeaseTerm } from "@/lib/lease-renewal/lease-term-types";
import {
  RETURN_TO_TENANT_OFFER_LABEL,
  USE_DAY_AFTER_LEASE_END_LABEL,
  VERIFY_CURRENT_LEASE_END_LABEL,
  chosenEndInconsistency,
  isCalendarDate,
  isRenewalEndBasis,
  proposeRenewalStart,
  renewalEndChoices,
  type VerifiedLeaseEnd,
} from "@/lib/lease-renewal/renewal-date-proposal";
import { KICKOFF_FIX_TARGETS } from "@/lib/lease-renewal/renewal-preparation";
import {
  WORKING_END_FIELD_ID,
  WORKING_START_FIELD_ID,
} from "@/lib/lease-renewal/message-readiness";
import { workingEntry, workingRenewalTerms } from "@/lib/lease-renewal/working-record";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

/** The anchors of the two working date fields in Ask the owner. */
export const WORKING_START_CONTROL_ID = WORKING_START_FIELD_ID;
export const WORKING_END_CONTROL_ID = WORKING_END_FIELD_ID;

export interface RenewalLeaseEndFacts {
  readonly leaseEnd: VerifiedLeaseEnd;
  readonly term: LeaseTerm | null;
  /** A recorded non-renewal or move-out: no contiguous renewal is proposed. */
  readonly nonRenewal: boolean;
  /**
   * S285 R-S285-1: the current lease's verified start and end, for the "current lease's length"
   * choice. Absent or null when the start or the end is not verified.
   */
  readonly currentLease?: {
    readonly startIso: string | null;
    readonly endIso: string | null;
  } | null;
}

const LeaseEndContext = createContext<RenewalLeaseEndFacts | null>(null);

export function RenewalLeaseEndProvider({
  value,
  children,
}: Readonly<{ value: RenewalLeaseEndFacts | null; children: ReactNode }>) {
  return <LeaseEndContext.Provider value={value}>{children}</LeaseEndContext.Provider>;
}

export function useRenewalLeaseEnd() {
  return useContext(LeaseEndContext);
}

// ---- Return to tenant offer -------------------------------------------------------------------

type DateFixReturn = {
  readonly field: string;
  readonly returnTo: string;
  /** S277 R-S277-4: the return's own words when it is not the tenant offer. */
  readonly label?: string;
} | null;
let pendingReturn: DateFixReturn = null;
const returnListeners = new Set<() => void>();
function notifyReturn() {
  for (const listener of returnListeners) listener();
}
function subscribeReturn(listener: () => void) {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

/**
 * A date fix opened from Offer the tenant remembers that offer so staff can return to it. S277
 * R-S277-4: the owner's answer opens the same editor for its dates and names its own return.
 */
export function startDateFixFromOffer(field: string, returnTo: string, label?: string) {
  pendingReturn = { field, returnTo, ...(label ? { label } : {}) };
  notifyReturn();
}

export function finishDateFix() {
  pendingReturn = null;
  notifyReturn();
}

export function useDateFixReturn(): DateFixReturn {
  return useSyncExternalStore(
    subscribeReturn,
    () => pendingReturn,
    () => null,
  );
}

/**
 * "Return to tenant offer": shown only while a date fix that started in Offer the tenant is open.
 * It returns to the same offer, whose entered values stay where they were.
 */
export function ReturnToTenantOffer() {
  const pending = useDateFixReturn();
  if (!pending) return null;
  return (
    <p data-renewal-field="return-to-tenant-offer">
      <Button
        onClick={() => {
          const target = pending.returnTo;
          finishDateFix();
          focusRenewalDashboardControl(target);
        }}
        size="compact"
        type="button"
        variant="secondary"
      >
        {pending.label ?? RETURN_TO_TENANT_OFFER_LABEL}
      </Button>
    </p>
  );
}

// ---- Working renewal terms ---------------------------------------------------------------------

/** "Current lease ends", the verified fact, kept apart from the working renewal dates. */
export function CurrentLeaseEndFact() {
  const facts = useRenewalLeaseEnd();
  if (!facts) return null;
  const end = facts.leaseEnd;
  return (
    <p data-renewal-field="current-lease-end" data-lease-end={end.state}>
      {end.state === "verified" ? (
        <>
          Current lease ends: <strong>{formatCalendarDate(end.endIso)}</strong>
          {end.basis === "recorded_cycle"
            ? " (the recorded renewal cycle staff kept working)"
            : " (RentVine)"}
          .
        </>
      ) : (
        <>
          Current lease end is not verified. {end.line}{" "}
          <Button
            onClick={() => focusRenewalDashboardControl(KICKOFF_FIX_TARGETS.correctFact)}
            size="compact"
            type="button"
            variant="secondary"
          >
            {VERIFY_CURRENT_LEASE_END_LABEL}
          </Button>
        </>
      )}
    </p>
  );
}

/**
 * R-S263-1: beside manual entry of the working start, the day after the verified current lease
 * end. Choosing it saves that date through the existing save with its basis; nothing else does.
 */
export function RenewalStartSuggestion() {
  const facts = useRenewalLeaseEnd();
  const working = useRenewalWorkingRecord();
  if (!facts || !working) return null;
  const proposal = proposeRenewalStart({
    leaseEnd: facts.leaseEnd,
    term: facts.term,
    nonRenewal: facts.nonRenewal,
    startEmpty: currentCycleFieldEmpty(working.record, "terms_effective_date"),
  });
  if (proposal.state !== "suggested") return null;
  return (
    <div className="ui-stack-tight" data-renewal-field="renewal-start-suggestion">
      <p className="muted">
        Suggested start: {formatCalendarDate(proposal.startIso)}, the day after the
        current lease ends on {formatCalendarDate(proposal.leaseEndIso)}. Choose it, or
        enter the start date.
      </p>
      {working.canEdit ? (
        <p>
          <Button
            onClick={() =>
              void working.save("terms_effective_date", proposal.startIso, {
                dateProposal: {
                  kind: "day_after_lease_end",
                  leaseEndIso: proposal.leaseEndIso,
                },
                context: `The day after the current lease ends on ${formatCalendarDate(proposal.leaseEndIso)}.`,
              })
            }
            size="compact"
            type="button"
            variant="secondary"
          >
            {USE_DAY_AFTER_LEASE_END_LABEL}
          </Button>
        </p>
      ) : null}
    </div>
  );
}

/** The working start staff chose (entered, not saved yet) or saved, for the end choices. */
function chosenOrSavedStart(
  working: NonNullable<ReturnType<typeof useRenewalWorkingRecord>>,
): string | null {
  const typed = working.localDraft("terms_effective_date")?.text ?? null;
  if (isCalendarDate(typed)) return typed;
  return workingRenewalTerms(working.record).effectiveDate;
}

/** S285 R-S285-1: the line above the end-date choices. */
export const RENEWAL_END_CHOICE_LINE =
  "Choose a term for the end date, or enter the end date.";

/**
 * S285 R-S285-1 (ARCH-S285-1, BEH-S285-1): beside manual entry of the working end, while the
 * current-cycle end is empty and a start is chosen or saved, "Use a 12 month term (ends
 * 12/31/2027)" and, when the current lease's verified dates give another whole number of months,
 * "Use the current lease's length, 6 months (ends 06/30/2027)". Choosing one fills the end field
 * and the existing save stores it with its basis ("12 month term chosen by staff" or "current
 * lease length chosen by staff"). Showing the choices saves nothing. While a chosen end is not
 * saved yet, a changed start recomputes it in the field (local only; the change saves nothing).
 * A start whose day does not repeat in the end month offers no choice and the existing line asks
 * for the end. Month-to-month, non-renewal and inspection-only cases show no choice.
 */
export function RenewalEndSuggestion() {
  const facts = useRenewalLeaseEnd();
  const working = useRenewalWorkingRecord();
  const start = working ? chosenOrSavedStart(working) : null;
  const endEmpty = working
    ? currentCycleFieldEmpty(working.record, "terms_end_date")
    : false;
  const result =
    facts && working
      ? renewalEndChoices({
          startIso: start,
          term: facts.term,
          nonRenewal: facts.nonRenewal,
          endEmpty,
          currentLease: facts.currentLease ?? null,
        })
      : null;
  const pendingEnd = working?.localDraft("terms_end_date") ?? null;
  const pendingBasis = pendingEnd?.command?.options?.context;
  const followed =
    result?.state === "choices" && isRenewalEndBasis(pendingBasis)
      ? (result.choices.find((choice) => choice.basis === pendingBasis) ?? null)
      : null;
  const followedEnd = followed?.endIso ?? null;
  const followedBasis = followed?.basis ?? null;
  const pendingText = pendingEnd?.text ?? null;
  const editLocalDraft = working?.editLocalDraft;
  // A chosen end that is not saved yet follows the start it was computed from. Local only.
  useEffect(() => {
    if (!editLocalDraft || !followedEnd || !followedBasis || pendingText === null) return;
    if (pendingText === followedEnd) return;
    editLocalDraft("terms_end_date", followedEnd, {
      value: followedEnd,
      options: { context: followedBasis },
    });
  }, [editLocalDraft, followedEnd, followedBasis, pendingText]);
  if (!facts || !working || !result) return null;
  if (result.state === "enter")
    return (
      <p className="muted" data-renewal-field="renewal-end-enter">
        {result.line}
      </p>
    );
  if (result.state !== "choices") return null;
  return (
    <div className="ui-stack-tight" data-renewal-field="renewal-end-suggestion">
      <p className="muted">{RENEWAL_END_CHOICE_LINE}</p>
      {working.canEdit ? (
        <p className="ui-row">
          {result.choices.map((choice) => (
            <Button
              key={choice.kind}
              onClick={() =>
                void working.save("terms_end_date", choice.endIso, {
                  context: choice.basis,
                })
              }
              size="compact"
              type="button"
              variant="secondary"
            >
              {choice.label}
            </Button>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/**
 * R-S263-2/3: a saved end that is not after the start is shown for review; it is never changed
 * for staff. S285 R-S285-1: a saved end chosen as a term stays when the start changes later, and
 * the inconsistency is shown for review.
 */
export function RenewalEndDateCheck() {
  const facts = useRenewalLeaseEnd();
  const working = useRenewalWorkingRecord();
  const terms = workingRenewalTerms(working?.record ?? null);
  const endEntry = workingEntry(working?.record ?? null, "terms_end_date");
  const termLine = chosenEndInconsistency({
    startIso: terms.effectiveDate,
    endIso: terms.endDate,
    basis: endEntry?.context ?? null,
    currentLease: facts?.currentLease ?? null,
  });
  const outOfOrder = Boolean(
    terms.effectiveDate && terms.endDate && terms.endDate <= terms.effectiveDate,
  );
  if (!outOfOrder && !termLine) return null;
  return (
    <>
      {outOfOrder ? (
        <p data-renewal-field="renewal-dates-out-of-order" role="note">
          The saved renewal end date is not after the start date. Review the end date.
        </p>
      ) : null}
      {termLine ? (
        <p data-renewal-field="renewal-end-term-changed" role="note">
          {termLine}
        </p>
      ) : null}
    </>
  );
}
