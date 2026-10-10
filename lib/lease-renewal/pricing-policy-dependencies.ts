import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { withRenewalNoticeAdmission } from "@/lib/firestore/renewal-notice-safety";
import {
  RenewalPricingPolicyStore,
  type PricingSourceVerifier,
} from "@/lib/firestore/renewal-pricing-policies";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "./live-lease-cache";
import {
  leaseCurrentRent,
  leasePortfolioId,
  leaseViewId,
  leaseEndDateIso,
} from "@/lib/integrations/rentvine/lease-mapper";
import { resolveRenewalWorkBasis } from "./workspace-cycle-context";
/** This factory resolves actual source membership. A name match or caller's portfolio never qualifies. */
export function pricingPolicyDependencies(actor: AuthenticatedUser) {
  const store = new RenewalPricingPolicyStore();
  const read = async () => {
    const c = buildLiveRentVineConfig();
    if (!c.ok)
      throw new EditableLayerError(
        "The current RentVine lease source is unavailable. Policy wording remains manageable; assignment waits for membership.",
        409,
      );
    return requireCurrentLeaseViews(
      withRenewalNoticeAdmission(actor, c.rentvineClient),
      Date.now(),
    );
  };
  const verifier: PricingSourceVerifier = {
    portfolio: async (id) => (await read()).some((v) => leasePortfolioId(v) === id),
    lease: async (id) => {
      const matches = (await read()).filter((v) => leaseViewId(v) === id);
      if (matches.length !== 1)
        throw new EditableLayerError(
          "The actual lease identity is missing or ambiguous.",
          409,
        );
      const v = matches[0];
      const basis = await resolveRenewalWorkBasis(actor, id);
      const portfolioId = leasePortfolioId(v);
      if (!portfolioId)
        throw new EditableLayerError(
          "The lease's verified portfolio membership is unavailable.",
          409,
        );
      return {
        leaseId: id,
        portfolioId,
        currentRent: leaseCurrentRent(v) ?? null,
        cycleDate:
          leaseEndDateIso(v) ??
          (basis && basis.kind !== "lease_bound" ? basis.dateIso : null),
        rentSource: "RentVine contractual base rent",
      };
    },
  };
  return { store, verifier };
}
