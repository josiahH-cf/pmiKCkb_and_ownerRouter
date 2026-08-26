// Fixture/dry-run-only projection of a RentVine renewal update.
//
// The preview names the two documented UPDATE routes and their rollback payloads, but it has no live
// executor. This is intentional: the API key's role is owner-attested as write-capable, while the
// permission, field semantics, partial-failure behavior, readback, idempotency, and rollback remain
// live-unproven. The action-registry gate therefore stays closed.

import type {
  RentVineLeaseUpdatePayload,
  RentVineRecurringChargeUpdatePayload,
} from "@/lib/integrations/rentvine/write-client";

export interface RentVineRenewalDryRunInput {
  leaseId: string;
  current: {
    startDate: string;
    endDate: string | null;
    increaseEligibilityDate?: string | null;
  };
  proposed: {
    endDate: string | null;
    increaseEligibilityDate?: string | null;
  };
  recurringCharge: {
    /** Existing charge only. The preview never creates a charge. */
    chargeId: string;
    currentAmount: string;
    proposedAmount: string;
    effectiveDate: string;
    currentStartDate?: string;
  };
}

export interface RentVineRenewalDryRunStep {
  method: "POST";
  path: string;
  purpose: string;
  request: RentVineLeaseUpdatePayload | RentVineRecurringChargeUpdatePayload;
  rollback: RentVineLeaseUpdatePayload | RentVineRecurringChargeUpdatePayload;
}

export interface RentVineRenewalDryRunPreview {
  kind: "rentvine_renewal_dry_run";
  evidence: "fixture-proven_live-unproven";
  executionAllowed: false;
  productionAllowed: false;
  steps: RentVineRenewalDryRunStep[];
  blockedUntil: string[];
}

function assertPositiveInteger(value: string, label: string): string {
  const normalized = String(value).trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer RentVine id.`);
  }
  return normalized;
}

function isoToUsDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Renewal effective date must be a real YYYY-MM-DD date.");
  }
  return `${match[2]}/${match[3]}/${match[1]}`;
}

/** Pure preview builder. It does not accept a client or make I/O possible. */
export function buildRentVineRenewalDryRunPreview(
  input: RentVineRenewalDryRunInput,
): RentVineRenewalDryRunPreview {
  const leaseId = assertPositiveInteger(input.leaseId, "Lease id");
  const chargeId = assertPositiveInteger(
    input.recurringCharge.chargeId,
    "Recurring-charge id",
  );
  const proposedLease: RentVineLeaseUpdatePayload = {
    startDate: input.current.startDate,
    endDate: input.proposed.endDate,
    ...(input.proposed.increaseEligibilityDate !== undefined
      ? { increaseEligibilityDate: input.proposed.increaseEligibilityDate }
      : {}),
  };
  const rollbackLease: RentVineLeaseUpdatePayload = {
    startDate: input.current.startDate,
    endDate: input.current.endDate,
    ...(input.current.increaseEligibilityDate !== undefined
      ? { increaseEligibilityDate: input.current.increaseEligibilityDate }
      : {}),
  };
  const proposedCharge: RentVineRecurringChargeUpdatePayload = {
    amount: input.recurringCharge.proposedAmount,
    startDate: isoToUsDate(input.recurringCharge.effectiveDate),
  };
  const rollbackCharge: RentVineRecurringChargeUpdatePayload = {
    amount: input.recurringCharge.currentAmount,
    ...(input.recurringCharge.currentStartDate
      ? { startDate: input.recurringCharge.currentStartDate }
      : {}),
  };

  return {
    kind: "rentvine_renewal_dry_run",
    evidence: "fixture-proven_live-unproven",
    executionAllowed: false,
    productionAllowed: false,
    steps: [
      {
        method: "POST",
        path: `/leases/${leaseId}`,
        purpose: "Update the documented lease dates only.",
        request: proposedLease,
        rollback: rollbackLease,
      },
      {
        method: "POST",
        path: `/leases/${leaseId}/recurring-charges/${chargeId}`,
        purpose: "Update one already-existing recurring charge only.",
        request: proposedCharge,
        rollback: rollbackCharge,
      },
    ],
    blockedUntil: [
      "A disposable client-approved test lease and existing recurring charge are named.",
      "The exact before-state is freshly read and exact-confirmed by a human.",
      "Permission, partial-failure behavior, readback, idempotency, and rollback are live-proven.",
      "The protected RentVine action key is separately reviewed and opened.",
    ],
  };
}

/** Provider-shaped wrapper used by fixtures and UI previews. It cannot execute by construction. */
export class RentVineRenewalDryRunProvider {
  preview(preview: RentVineRenewalDryRunPreview): RentVineRenewalDryRunPreview {
    return structuredClone(preview);
  }

  execute(): never {
    throw new Error(
      "The RentVine dry-run provider cannot execute. Live write proof and action activation are still required.",
    );
  }
}
