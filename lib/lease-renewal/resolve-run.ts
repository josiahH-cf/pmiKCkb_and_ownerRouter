// Server-only run resolver injected by the resolve route (slice 1b). A resolution's key is derived
// from runId + field_key only (`lease_renewal:reconcile:{runId}:{field_key}`), never the read
// timestamp, so a run rebuilt at resolve time matches the flag rendered on the page. This module
// writes nothing — it only rebuilds a run so the persistence layer can match a flag against it.
//
// It is injected ONLY at the route so the persistence layer (lib/firestore/lease-renewal-resolutions)
// stays decoupled from the live network clients and never grows a fixture fallback.

import {
  LIVE_REVIEW_RUN_ID,
  rebuildLiveRenewalRun,
} from "@/lib/lease-renewal/live-review";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";

/**
 * Resolve a renewal run by id for the resolve route: rebuild the live-review run for the live id
 * (read-only; returns null when live sources are unconfigured or the read fails, never throws),
 * and refuse every former Test/sample id. The live-branch read timestamp does not affect the
 * source_trigger_key, so it never changes which flag is matched.
 */
export async function resolveRenewalRun(runId: string): Promise<RenewalRunResult | null> {
  return runId === LIVE_REVIEW_RUN_ID
    ? rebuildLiveRenewalRun(new Date().toISOString())
    : null;
}

/**
 * Builds the resolver used by the authenticated route. Only the ordinary Live-backed run id can
 * resolve; retired Test/sample ids cannot cause a fixture or persistence read.
 */
export function createRenewalRunResolver(): (
  runId: string,
) => Promise<RenewalRunResult | null> {
  return resolveRenewalRun;
}
