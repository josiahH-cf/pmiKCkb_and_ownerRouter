import type { AuthenticatedUser } from "@/lib/auth/session";
import { RenewalPricingPolicyStore } from "@/lib/firestore/renewal-pricing-policies";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  leaseViewId,
  leasePortfolioId,
  leaseCurrentRent,
  leaseEndDateIso,
} from "@/lib/integrations/rentvine/lease-mapper";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type {
  RenewalPricingRead,
  VerifiedPricingLease,
} from "@/lib/lease-renewal/renewal-pricing-policy";
/** The desk and workspace share exact source membership and one bounded policy read. */
export async function readRenewalPricingForViews(
  actor: AuthenticatedUser,
  views: readonly RawLease[],
  now: Date,
  store = new RenewalPricingPolicyStore(),
): Promise<RenewalPricingRead> {
  const counts = new Map<string, number>();
  for (const v of views) {
    const id = leaseViewId(v);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const facts: VerifiedPricingLease[] = views.flatMap((v) => {
    const leaseId = leaseViewId(v),
      portfolioId = leasePortfolioId(v);
    return leaseId && portfolioId && counts.get(leaseId) === 1
      ? [
          {
            leaseId,
            portfolioId,
            currentRent: leaseCurrentRent(v) ?? null,
            cycleDate: leaseEndDateIso(v) ?? null,
            rentSource: "RentVine contractual base rent",
          },
        ]
      : [];
  });
  return {
    snapshot: await store.snapshot(actor, facts),
    facts,
    today: businessDateIso(now),
  };
}
