// Server-only run resolver injected by the resolve route (slice 1b). A resolution's key is derived
// from runId + field_key only (`lease_renewal:reconcile:{runId}:{field_key}`), never the read
// timestamp, so a run rebuilt at resolve time matches the flag rendered on the page. This module
// writes nothing — it only rebuilds a run so the persistence layer can match a flag against it.
//
// It is injected ONLY at the route so the persistence layer (lib/firestore/lease-renewal-resolutions)
// stays decoupled from the live network clients; that layer keeps its pure getSimulationRun default.

import {
  LIVE_REVIEW_RUN_ID,
  rebuildLiveRenewalRun,
} from "@/lib/lease-renewal/live-review";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getLeaseTestRun } from "@/lib/firestore/lease-renewal-test-runs";
import type { Firestore } from "firebase-admin/firestore";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import {
  buildTestRenewalSimulation,
  getSimulationRun,
} from "@/lib/lease-renewal/simulation";

/**
 * Resolve a renewal run by id for the resolve route: rebuild the live-review run for the live id
 * (read-only; returns null when live sources are unconfigured or the read fails, never throws),
 * otherwise fall back to the pure simulation run (null for an unknown id). The live-branch read
 * timestamp does not affect the source_trigger_key, so it never changes which flag is matched.
 */
export async function resolveRenewalRun(runId: string): Promise<RenewalRunResult | null> {
  if (runId === LIVE_REVIEW_RUN_ID) {
    return rebuildLiveRenewalRun(new Date().toISOString());
  }
  return getSimulationRun(runId);
}

/**
 * Builds the actor-bound resolver used by the authenticated route. Persisted production Test runs
 * intentionally reuse the synthetic source tables, but only after the addressed Test record is
 * proven to exist. The unbound resolver above remains pure and cannot turn an arbitrary id into a
 * synthetic run.
 */
export function createRenewalRunResolver(
  actor: AuthenticatedUser,
  db?: Firestore,
): (runId: string) => Promise<RenewalRunResult | null> {
  return async (runId) => {
    const knownRun = await resolveRenewalRun(runId);
    if (knownRun) return knownRun;
    if (!runId.startsWith("test-renewal-")) return null;

    const persisted = await getLeaseTestRun(actor, runId, db);
    return persisted ? buildTestRenewalSimulation(runId) : null;
  };
}
