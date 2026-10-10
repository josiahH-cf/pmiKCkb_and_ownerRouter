import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import { computeRentSuggestion } from "@/lib/lease-renewal/rent-suggestion";
/** All usable retained comparables feed calculation; the first-five rule affects display only. */
export function renewalCompRecommendation(
  preparation: RenewalWorkspaceState["preparation"],
  currentRent: number | null,
) {
  const provider = preparation?.market.provider;
  const comps = (provider?.comps ?? []).map((c, index) => ({
    rent: c.rent,
    source: `${provider!.source} retrieved ${provider!.retrievedAt}`,
    label: `Provider comparable ${index + 1}`,
  }));
  const suggestion = computeRentSuggestion({
    comps,
    ...(currentRent !== null ? { currentRent } : {}),
  });
  return {
    ...suggestion,
    source: provider ? `${provider.source} retrieved ${provider.retrievedAt}` : null,
    observationId: preparation?.observationId ?? null,
    limitations: [
      ...(currentRent === null
        ? [
            "Current contractual rent is unavailable; the comparison has no current-rent clamp.",
          ]
        : []),
      ...(!comps.length
        ? [
            "No normalized comparable rents are retained. Starting ranges and point estimates alone are not comparable evidence.",
          ]
        : []),
    ],
  };
}
