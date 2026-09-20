import type { RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import type { LeaseStatusTableRead } from "@/lib/lease-renewal/move-out-disposition";

// S124: one bounded, memoized read of the documented RentVine lease status table (`GET
// /leases/statuses`). The table is account configuration, not customer data, and changes rarely; a
// short TTL keeps every desk render and message preparation from re-reading it while a failure is
// never cached (the next caller retries). This module has no write capability.

export const LEASE_STATUS_TABLE_TTL_MS = 15 * 60_000;

export interface LeaseStatusTableReader {
  listLeaseStatuses?: () => Promise<RentVineLeaseStatus[]>;
}

let cached: { statuses: readonly RentVineLeaseStatus[]; readAtMs: number } | null = null;
let inflight: Promise<readonly RentVineLeaseStatus[]> | null = null;

export function clearLeaseStatusTableCache(): void {
  cached = null;
  inflight = null;
}

export async function readLeaseStatusTable(
  reader: LeaseStatusTableReader,
  nowMs: number,
): Promise<LeaseStatusTableRead> {
  if (typeof reader.listLeaseStatuses !== "function") return { status: "unavailable" };
  if (cached && nowMs - cached.readAtMs < LEASE_STATUS_TABLE_TTL_MS) {
    return { status: "available", statuses: cached.statuses };
  }
  try {
    inflight ??= reader.listLeaseStatuses().then((statuses) => {
      cached = { statuses: Object.freeze([...statuses]), readAtMs: nowMs };
      return cached.statuses;
    });
    const statuses = await inflight;
    return { status: "available", statuses };
  } catch {
    return { status: "unavailable" };
  } finally {
    inflight = null;
  }
}
