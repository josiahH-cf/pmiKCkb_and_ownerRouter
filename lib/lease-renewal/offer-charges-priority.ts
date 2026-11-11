// S264 with S269 (R-S269-1, Offer the tenant): what Review offer charges gives the one Guided
// priority. After the working terms, the first material unresolved charge row, else the open
// insurance or Resident Benefits Package choice, else a hold on the review itself, leads the
// outcome by its own control id. The flag says whether every applicable transition decision is
// made, so S265's missing flyer leads only after it. Pure and client-safe; it names a control and
// never operates one.

import type { GuidedPriorityExtensions } from "./guided-priority";
import { MESSAGE_CONTROL_IDS } from "./message-readiness";
import { offerChargeRowControlId, type OfferChargeReview } from "./offer-charges";

export type OfferChargesPriority = NonNullable<GuidedPriorityExtensions["offerCharges"]>;

export function offerChargesPriority(
  review: OfferChargeReview | null | undefined,
): OfferChargesPriority | null {
  if (!review) return null;
  const transitionsReady =
    review.decisions.insuranceTransition !== "unknown" &&
    review.decisions.rbpChange !== "unknown";
  if (review.lead?.rowKey)
    return { target: offerChargeRowControlId(review.lead.rowKey), transitionsReady };
  if (review.decisions.insuranceTransition === "unknown")
    return { target: MESSAGE_CONTROL_IDS.insurance("tenant"), transitionsReady };
  if (review.decisions.rbpChange === "unknown")
    return { target: MESSAGE_CONTROL_IDS.rbpChange, transitionsReady };
  // A hold without its own row (an unreadable source or saved review) opens the review.
  if (review.holds.length)
    return { target: MESSAGE_CONTROL_IDS.offerCharges, transitionsReady };
  return null;
}
