// Server-only: read-only live source of RentVine unit candidates for the maintenance location→unit
// matcher. Makes ONE RentVine /leases/export read and derives value-free-per-item unit candidates
// (unit id + composed street label). Read-only — no write, no system-of-record update. Degrades to a
// discriminated status (never throws to the caller / never leaks the underlying error message) so the
// route can return a clear panel when RentVine is not connected.

import {
  buildLiveRentVineConfig,
  type LiveRentVineConfig,
} from "@/lib/lease-renewal/live-config";
import { RentVineAuthError } from "@/lib/integrations/rentvine/client";
import {
  deriveUnitCandidatesFromExport,
  type UnitCandidate,
} from "@/lib/maintenance/unit-matcher";

export type UnitSourceStatus =
  | "ok"
  | "not_configured"
  | "account_mismatch"
  | "auth_error"
  | "read_error";

export type UnitSourceOutcome =
  | { status: "ok"; candidates: UnitCandidate[]; skipped: number }
  | { status: Exclude<UnitSourceStatus, "ok"> };

/**
 * Load live unit candidates from RentVine. The config is injectable for testing; by default it reads
 * process.env. A RentVine auth failure maps to `auth_error`, any other read failure to `read_error`.
 */
export async function loadLiveUnitCandidates(
  config: LiveRentVineConfig = buildLiveRentVineConfig(),
): Promise<UnitSourceOutcome> {
  if (!config.ok) return { status: config.reason };

  try {
    const rows = await config.rentvineClient.listLeasesExport();
    const { candidates, skipped } = deriveUnitCandidatesFromExport(rows);
    return { status: "ok", candidates, skipped };
  } catch (error) {
    if (error instanceof RentVineAuthError) return { status: "auth_error" };
    return { status: "read_error" };
  }
}
