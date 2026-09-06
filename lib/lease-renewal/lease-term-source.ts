// S103: the server-side binding of a term review to the lease view a person actually saw.
//
// The browser sends the fingerprint of the view it rendered; the server recomputes the fingerprint
// from the current live lease read and refuses a review for a lease that does not exist or whose
// term-bearing facts changed since the page loaded. The stored record therefore always describes a
// real lease at a source state the server itself observed, never a client-asserted one.

import { leaseIdOfView } from "@/lib/integrations/rentvine/lease-mapper";
import { leaseTermSourceFingerprint } from "@/lib/lease-renewal/lease-term";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { getLiveLeaseSnapshot } from "@/lib/lease-renewal/live-lease-cache";

export type LeaseTermSourceRead =
  | { readonly status: "ok"; readonly sourceFingerprint: string }
  | { readonly status: "lease_not_found" }
  | { readonly status: "unavailable" };

/** Read the current live lease view for one lease id and fingerprint its term-bearing facts. */
export async function readLeaseTermSource(
  leaseId: string,
  nowMs: number = Date.now(),
): Promise<LeaseTermSourceRead> {
  const config = buildLiveRenewalConfig();
  if (!config.ok) return { status: "unavailable" };
  try {
    const { snapshot } = await getLiveLeaseSnapshot(config.rentvineClient, nowMs);
    const view = snapshot.views.find((candidate) => leaseIdOfView(candidate) === leaseId);
    if (!view) return { status: "lease_not_found" };
    return { status: "ok", sourceFingerprint: leaseTermSourceFingerprint(view) };
  } catch {
    return { status: "unavailable" };
  }
}
