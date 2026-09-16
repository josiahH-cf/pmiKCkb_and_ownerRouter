// S117 (R117.4, AC-S117-4): compare a confirmed current-base charge update with the refreshed
// contractual base rent. A charge receipt proves the charge changed; it never proves the lease's
// displayed base rent changed. This projection reads durable records and the already-refreshed
// lease summary only. It performs no provider call and never substitutes the charge amount or the
// lease total for the base rent.

import type { RenewalAttemptRecord } from "@/lib/lease-renewal/execution/attempt-continuation";
import {
  renewalWritebackExecutionId,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export type CurrentBaseReadback =
  | { readonly state: "none" }
  | { readonly state: "prepared"; readonly chargeAmount: string }
  | {
      readonly state: "charge_applied_base_rent_matches";
      readonly chargeAmount: string;
      readonly baseRent: number;
    }
  | {
      readonly state: "charge_applied_base_rent_differs";
      readonly chargeAmount: string;
      readonly baseRent: number;
    }
  | {
      readonly state: "charge_applied_base_rent_unavailable";
      readonly chargeAmount: string;
    };

function cents(value: number | string): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function projectCurrentBaseReadback(input: {
  readonly proposal: RenewalWritebackProposal | null;
  readonly attempts: readonly RenewalAttemptRecord[];
  readonly currentRent: number | null | undefined;
}): CurrentBaseReadback {
  const { proposal } = input;
  if (!proposal || proposal.businessIntent !== "current_base") return { state: "none" };
  const entry = proposal.effects.find(
    (candidate) =>
      candidate.effect.kind === "recurring_charge_update" &&
      typeof candidate.effect.changes.amount === "string",
  );
  if (!entry || entry.effect.kind !== "recurring_charge_update") return { state: "none" };
  const chargeAmount = entry.effect.changes.amount as string;
  const executionId = renewalWritebackExecutionId(proposal, entry);
  const attempt = input.attempts.find((record) => record.executionId === executionId);
  if (attempt?.state !== "succeeded") return { state: "prepared", chargeAmount };
  const applied = cents(chargeAmount);
  const baseRent =
    typeof input.currentRent === "number" && Number.isFinite(input.currentRent)
      ? input.currentRent
      : null;
  if (baseRent === null || applied === null)
    return { state: "charge_applied_base_rent_unavailable", chargeAmount };
  return cents(baseRent) === applied
    ? { state: "charge_applied_base_rent_matches", chargeAmount, baseRent }
    : { state: "charge_applied_base_rent_differs", chargeAmount, baseRent };
}
