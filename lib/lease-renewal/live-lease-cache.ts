// Server-only short-TTL memo of the live RentVine lease export, shared by the renewal-notice route and
// the live-notices desk. Without it, drafting one notice costs three full-portfolio reads (desk render
// + Preview + Create); with it, reads inside the TTL window are coalesced to one. The authoritative
// RentVine data is held in memory only for the TTL and is never logged or persisted; the bounded
// staleness (LEASE_EXPORT_TTL_MS) is safe because the operator reviews the draft before sending.
//
// `nowMs` is passed IN (never Date.now() here) so callers stay deterministic and tests are hermetic;
// clearLiveLeaseCache() resets the module state between tests.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";

export interface LeaseExportReader {
  listLeasesExport(): Promise<Record<string, unknown>[]>;
}

export const LEASE_EXPORT_TTL_MS = 60_000;

interface CacheEntry {
  views: RawLease[];
  expiresAt: number;
}

let entry: CacheEntry | null = null;
let inflight: Promise<RawLease[]> | null = null;

/**
 * Return the live lease views, served from the cache when a non-expired entry exists, otherwise read
 * once (coalescing concurrent misses into a single read). A failed read is NOT cached — the error
 * propagates and the next call retries.
 *
 * The cache is a single global entry, correct only because RentVine is one enforced account
 * (assertRentVineAccount): every caller reads the same portfolio. If the app ever becomes
 * multi-credential, key the entry by reader identity. Callers MUST treat the returned array and its
 * view objects as READ-ONLY — it is the shared cache entry, not a copy.
 */
export async function getLiveLeaseViews(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
): Promise<RawLease[]> {
  if (entry && entry.expiresAt > nowMs) return entry.views;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const views = leaseViewsFromExport(await reader.listLeasesExport());
      entry = { views, expiresAt: nowMs + ttlMs };
      return views;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Reset the module cache. Test-only; production relies on the TTL. */
export function clearLiveLeaseCache(): void {
  entry = null;
  inflight = null;
}
