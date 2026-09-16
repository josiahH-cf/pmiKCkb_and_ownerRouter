import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  MarketCompQueryResolutionError,
  buildMarketCompQueryBasis,
  type MarketCompQueryBasis,
  type MarketCompQueryResolutionCode,
} from "@/lib/lease-renewal/market-comp-query-basis";

/**
 * S118: the server-resolved subject a comparison starts from, projected once per page read so
 * the starting range and the RentCast report links come from the same source facts the lookup
 * would send. An unresolved subject names its exact cause instead of an empty or guessed value.
 */
export type MarketSubjectProjection =
  | { status: "resolved"; basis: MarketCompQueryBasis }
  | {
      status: "unresolved";
      code: MarketCompQueryResolutionCode | "snapshot_unavailable";
      message: string;
    };

export function projectMarketSubject(
  view: RawLease | null | undefined,
  leaseId: string,
): MarketSubjectProjection {
  if (!view)
    return {
      status: "unresolved",
      code: "snapshot_unavailable",
      message:
        "The current RentVine lease read is unavailable, so the comparison subject, its starting range and its report links cannot be resolved.",
    };
  try {
    return { status: "resolved", basis: buildMarketCompQueryBasis(view, leaseId) };
  } catch (error) {
    if (error instanceof MarketCompQueryResolutionError)
      return { status: "unresolved", code: error.code, message: error.message };
    throw error;
  }
}
