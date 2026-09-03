// S102: enrich export-shaped lease views with the documented lease detail (`GET /leases/{leaseID}`).
//
// The `/leases/export` row carries no lease-scoped rent (its `unit.rent` is a unit attribute that
// tracks the unit's listed rent), while the lease detail carries `baseRentAmount`, `rentAmount`, and
// the month-to-month evidence S103 consumes. This module reads each lease's detail with bounded
// concurrency and applies it to the view through the pure mapper helpers. A failed detail read marks
// only that lease `unavailable`; it never invents a rent and never changes portfolio completeness.
//
// Read-only by construction: it calls only the client's documented `getLease` read.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  applyLeaseDetailToView,
  leaseIdOfView,
  markLeaseDetailUnavailable,
} from "@/lib/integrations/rentvine/lease-mapper";

export interface LeaseDetailReader {
  getLease(leaseId: string | number): Promise<Record<string, unknown>>;
}

/** Bounded fan-out for the per-lease detail reads inside one live lease generation. */
export const LEASE_DETAIL_READ_CONCURRENCY = 6;

export interface LeaseDetailEnrichmentResult {
  /** True only when every lease with an id received its detail. */
  detailComplete: boolean;
  /** Leases marked unavailable (failed read, missing id, or no detail reader). */
  detailUnavailableCount: number;
}

/**
 * Mutate the given views in place with their lease detail. Views without a resolvable lease id and
 * every view when `reader` is absent are marked unavailable. Concurrency is bounded so a portfolio
 * read cannot burst the provider; a 429 surfaces through the client's own retry-after error and is
 * treated like any other per-lease failure.
 */
export async function enrichLeaseViewsWithDetail(
  views: readonly RawLease[],
  reader: LeaseDetailReader | undefined,
  concurrency: number = LEASE_DETAIL_READ_CONCURRENCY,
): Promise<LeaseDetailEnrichmentResult> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Lease detail enrichment requires a positive integer concurrency.");
  }
  let unavailable = 0;
  if (!reader) {
    for (const view of views) {
      markLeaseDetailUnavailable(view);
      unavailable += 1;
    }
    return { detailComplete: false, detailUnavailableCount: unavailable };
  }

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < views.length) {
      const view = views[next];
      next += 1;
      const leaseId = leaseIdOfView(view);
      if (leaseId === null) {
        markLeaseDetailUnavailable(view);
        unavailable += 1;
        continue;
      }
      try {
        const detail = await reader.getLease(leaseId);
        applyLeaseDetailToView(view, detail);
      } catch {
        markLeaseDetailUnavailable(view);
        unavailable += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(views.length, 1)) }, worker),
  );
  return { detailComplete: unavailable === 0, detailUnavailableCount: unavailable };
}
