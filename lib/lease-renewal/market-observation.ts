import type { MarketCompResult } from "@/lib/lease-renewal/market-comp-provider";
import type { MarketCompQueryBasis } from "@/lib/lease-renewal/market-comp-query-basis";
import { RenewalMarketBasisSchema } from "@/lib/lease-renewal/market-basis-schema";
import type {
  RenewalMarketBasis,
  RenewalMarketProviderTrend,
} from "@/lib/lease-renewal/renewal-progress";
export type CapturedCompResult = MarketCompResult & {
  queryBasis?: MarketCompQueryBasis;
  cached?: boolean;
  sourceUrl?: string;
  quota?: { used: number; allowance: number; remaining: number; warn: boolean };
};
export interface RenewalMarketObservation {
  id: string;
  leaseId: string;
  cycleId: string;
  result: CapturedCompResult;
  market: RenewalMarketBasis;
  recordedAt: string;
}
export function marketBasisFromCapturedResult(
  result: CapturedCompResult,
): RenewalMarketBasis {
  if (result.source !== "RentCast" || result.confidence !== "Likely") return {};
  const basis = result.queryBasis;
  const parsed = RenewalMarketBasisSchema.safeParse({
    provider: {
      source: result.source,
      rangeLow: result.rangeLow,
      rangeHigh: result.rangeHigh,
      pointEstimate: result.pointEstimate,
      compCount: result.compCount,
      retrievedAt: result.retrievedAt,
      ...(basis
        ? {
            radiusMiles: basis.policy.maxRadiusMiles,
            requestedCompCount: basis.policy.requestedCompCount,
            lookupSubjectAttributes: basis.policy.lookupSubjectAttributes,
            providerVersion: basis.policy.providerVersion,
            cacheState: result.cached ? "cache" : "live",
            omittedAttributes: basis.attributes
              .filter((item) => item.status === "omitted")
              .map((item) => ({ field: item.field, reason: item.reason })),
            unitFilters: basis.query,
          }
        : {}),
      ...(result.subjectProperty ? { subjectProperty: result.subjectProperty } : {}),
      ...(result.comparables ? { comps: result.comparables } : {}),
    },
  });
  return parsed.success ? parsed.data : {};
}
export function capturedTrend(
  result: Record<string, unknown>,
): RenewalMarketProviderTrend | null {
  if (
    result.source !== "RentCast" ||
    result.confidence !== "Likely" ||
    typeof result.zipCode !== "string" ||
    typeof result.retrievedAt !== "string" ||
    !result.history ||
    typeof result.history !== "object"
  )
    return null;
  const months: RenewalMarketProviderTrend["months"] = {};
  for (const [month, value] of Object.entries(result.history)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !value || typeof value !== "object") continue;
    const entry: RenewalMarketProviderTrend["months"][string] = {};
    for (const field of ["averageRent", "medianRent"] as const) {
      const number = (value as Record<string, unknown>)[field];
      if (typeof number === "number" && Number.isFinite(number) && number >= 0)
        entry[field] = number;
    }
    if (Object.keys(entry).length) months[month] = entry;
  }
  return Object.keys(months).length
    ? { zipCode: result.zipCode, retrievedAt: result.retrievedAt, months }
    : null;
}
