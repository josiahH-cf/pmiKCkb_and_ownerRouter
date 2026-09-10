import { z } from "zod";
import {
  RenewalTermsSchema,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { chargeDateIso, type RenewalChargeInventory } from "./charge-inventory-model";
import type { RenewalWritebackEffectInput } from "./proposal-contract";

export const FutureRentBindingSchema = z
  .object({
    cycleId: z.string().uuid(),
    termsRevision: z.number().int().positive(),
    terms: RenewalTermsSchema,
    inventoryHash: z.string().regex(/^[a-f0-9]{64}$/),
    scheduleReview: z.string().trim().min(1).max(240),
  })
  .strict();
export type FutureRentBinding = z.infer<typeof FutureRentBindingSchema>;
export function futureRentInventoryHash(inventory: RenewalChargeInventory): string {
  return hashExecutionPreview({
    leaseId: inventory.leaseId,
    charges: [...inventory.charges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, classification, projection }) => ({ id, classification, projection })),
  });
}
export function futureRentWorkspaceMatches(
  raw: unknown,
  binding: FutureRentBinding,
): boolean {
  const state = raw as RenewalWorkspaceState | null;
  return (
    !!state &&
    state.cycleId === binding.cycleId &&
    state.termsRevision === binding.termsRevision &&
    state.ownerResponse?.outcome === "approved_terms" &&
    state.ownerResponse.terms?.rent === binding.terms.rent &&
    state.ownerResponse.terms?.effectiveDate === binding.terms.effectiveDate &&
    state.ownerResponse.terms?.endDate === binding.terms.endDate
  );
}
/** One reviewed schedule operation at a time. No assumed provider end-date inclusivity. */
export function assertFutureRentSchedule(
  binding: FutureRentBinding,
  inventory: RenewalChargeInventory,
  effect: RenewalWritebackEffectInput,
): void {
  FutureRentBindingSchema.parse(binding);
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (binding.inventoryHash !== futureRentInventoryHash(inventory))
    fail("The recurring-charge inventory changed. Prepare a new schedule preview.");
  const { terms } = binding;
  if (terms.effectiveDate <= inventory.asOfDate)
    fail(
      "Future-rent preparation requires an effective date after today; use a reviewed current correction when applicable.",
    );
  if (inventory.charges.some((charge) => charge.classification === "unknown"))
    fail("Resolve unclassified billing items before reviewing a future rent schedule.");
  const rentCharges = inventory.charges.filter(
    (charge) => charge.classification === "rent",
  );
  const amount = terms.rent.toFixed(2);
  if (effect.kind === "renewal_dates_update")
    fail("Future rent uses a separately reviewed charge operation.");
  if (effect.kind === "recurring_charge_update") {
    const current = rentCharges.find((charge) => charge.id === effect.chargeId);
    if (!current) fail("Select a verified rent-account billing item.");
    const keys = Object.keys(effect.changes);
    if (keys.length !== 1) fail("Review an end-date or amount change separately.");
    if (keys[0] === "endDate") {
      const end = chargeDateIso(effect.changes.endDate ?? null);
      if (current!.projection.endDate === null)
        fail(
          "This existing exact contract cannot add an end date to an open-ended charge. Review that schedule in RentVine before a fresh future-charge preview.",
        );
      if (
        current!.current !== true ||
        !end ||
        end <= inventory.asOfDate ||
        end >= terms.effectiveDate
      )
        fail(
          "The reviewed current-charge end must be after today and before the future start; the provider’s end-date boundary must be checked explicitly.",
        );
      return;
    }
    if (
      keys[0] !== "amount" ||
      current!.projection.frequency !== "1" ||
      effect.changes.amount !== amount ||
      chargeDateIso(current!.projection.startDate) !== terms.effectiveDate ||
      current!.current !== false ||
      current!.projection.recurringStatusID !== 2
    )
      fail("Only the approved amount on the exact future rent schedule can be changed.");
  } else if (effect.kind === "recurring_charge_create") {
    if (
      !rentCharges.some((charge) => charge.accountId === effect.create.accountID) ||
      effect.create.amount !== amount ||
      effect.create.frequency !== "1" ||
      chargeDateIso(effect.create.startDate) !== terms.effectiveDate ||
      chargeDateIso(effect.create.endDate ?? null) !== terms.endDate
    )
      fail(
        "A future charge must use a verified rent account and the exact approved amount and term dates.",
      );
  }
  const selected = effect.kind === "recurring_charge_update" ? effect.chargeId : null;
  for (const charge of rentCharges.filter((entry) => entry.id !== selected)) {
    const start = chargeDateIso(charge.projection.startDate),
      end = chargeDateIso(charge.projection.endDate);
    if (!start || (charge.projection.endDate !== null && !end))
      fail("A rent schedule date needs verification.");
    // Equal boundaries are deliberately unresolved; never guess whether an end date bills that day.
    if (start! <= terms.endDate && (!end || end >= terms.effectiveDate))
      fail(
        "Another rent schedule overlaps or shares an unverified boundary with these terms. Review and separately correct that schedule first.",
      );
  }
  if (effect.kind === "recurring_charge_update") {
    const end = chargeDateIso(effect.before.endDate);
    if (end !== terms.endDate)
      fail(
        "The selected future schedule end must match the approved term; correct its schedule separately in the existing exact charge controls.",
      );
  }
}
