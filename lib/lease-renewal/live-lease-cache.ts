// Server-only short-TTL memo of the live RentVine lease export, shared by the renewal-notice route and
// the live-notices desk. Without it, drafting one notice costs three full-portfolio reads (desk render
// + Preview + Create); with it, reads inside the TTL window are coalesced to one. The authoritative
// RentVine data is held in memory only for the TTL and is never logged or persisted; the bounded
// staleness (LEASE_EXPORT_TTL_MS) is safe because the operator reviews the draft before sending.
//
// S57: the read is the COMPLETE paged export (`listAllLeasesExport`), never the provider's 25-row
// default page, and the read's completeness travels with the views so a partial read is never
// presented as the portfolio.
//
// `nowMs` is passed IN (never Date.now() here) so callers stay deterministic and tests are hermetic;
// clearLiveLeaseCache() resets the module state between tests.

import type { LeaseExportReadResult, RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";

export interface LeaseExportReader {
  listAllLeasesExport(): Promise<LeaseExportReadResult>;
}

export const LEASE_EXPORT_TTL_MS = 60_000;

/** The cached live read: mapped lease views plus the completeness of the underlying export read. */
export interface LiveLeaseRead {
  views: RawLease[];
  /** False when the paged export hit its page cap — the views may be a partial portfolio. */
  complete: boolean;
}

interface CacheEntry {
  read: LiveLeaseRead;
  expiresAt: number;
}

let entry: CacheEntry | null = null;
let inflight: Promise<LiveLeaseRead> | null = null;

/**
 * Return the live lease read (views + completeness), served from the cache when a non-expired entry
 * exists, otherwise read once (coalescing concurrent misses into a single read). A failed read is NOT
 * cached — the error propagates and the next call retries.
 *
 * The cache is a single global entry, correct only because RentVine is one enforced account
 * (assertRentVineAccount): every caller reads the same portfolio. If the app ever becomes
 * multi-credential, key the entry by reader identity. Callers MUST treat the returned array and its
 * view objects as READ-ONLY — it is the shared cache entry, not a copy.
 */
export async function getLiveLeaseRead(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
): Promise<LiveLeaseRead> {
  if (entry && entry.expiresAt > nowMs) return entry.read;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const exportRead = await reader.listAllLeasesExport();
      const read: LiveLeaseRead = {
        views: leaseViewsFromExport(exportRead.rows),
        complete: exportRead.complete,
      };
      entry = { read, expiresAt: nowMs + ttlMs };
      return read;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Views-only convenience over getLiveLeaseRead, for callers that key on a specific lease. */
export async function getLiveLeaseViews(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
): Promise<RawLease[]> {
  return (await getLiveLeaseRead(reader, nowMs, ttlMs)).views;
}

/** Reset the module cache. Test-only; production relies on the TTL. */
export function clearLiveLeaseCache(): void {
  entry = null;
  inflight = null;
}
