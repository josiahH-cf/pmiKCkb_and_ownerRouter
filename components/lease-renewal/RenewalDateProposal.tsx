"use client";

// S263 R-S263-1..4 (BEH-S263-1, BEH-S263-3, BEH-S263-4): the verified current lease end beside the
// working renewal dates in Working renewal terms, the one supported next-day start, and the way
// back to the tenant offer a date fix started from. Showing a suggestion saves nothing; only the
// explicit choice saves, through the existing working-date save, after the server checks the
// cycle, the verified end and the field revision. No provider is written and no end is invented.

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import { currentCycleFieldEmpty } from "@/lib/lease-renewal/current-cycle-terms";
import type { LeaseTerm } from "@/lib/lease-renewal/lease-term-types";
import {
  RETURN_TO_TENANT_OFFER_LABEL,
  USE_DAY_AFTER_LEASE_END_LABEL,
  VERIFY_CURRENT_LEASE_END_LABEL,
  proposeRenewalStart,
  type VerifiedLeaseEnd,
} from "@/lib/lease-renewal/renewal-date-proposal";
import { KICKOFF_FIX_TARGETS } from "@/lib/lease-renewal/renewal-preparation";
import {
  WORKING_END_FIELD_ID,
  WORKING_START_FIELD_ID,
} from "@/lib/lease-renewal/message-readiness";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
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

type DateFixReturn = { readonly field: string; readonly returnTo: string } | null;
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

/** A date fix opened from Offer the tenant remembers that offer so staff can return to it. */
export function startDateFixFromOffer(field: string, returnTo: string) {
  pendingReturn = { field, returnTo };
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
        {RETURN_TO_TENANT_OFFER_LABEL}
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

/**
 * R-S263-2/3: the end stays a manual entry. A saved end that is not after the start is shown for
 * review; it is never changed for staff.
 */
export function RenewalEndDateCheck() {
  const working = useRenewalWorkingRecord();
  const terms = workingRenewalTerms(working?.record ?? null);
  if (!terms.effectiveDate || !terms.endDate || terms.endDate > terms.effectiveDate)
    return null;
  return (
    <p data-renewal-field="renewal-dates-out-of-order" role="note">
      The saved renewal end date is not after the start date. Review the end date.
    </p>
  );
}
