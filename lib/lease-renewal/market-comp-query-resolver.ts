import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  LEASE_EXPORT_MAX_AGE_MS,
  getLiveLeaseSnapshot,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  MarketCompQueryResolutionError,
  buildMarketCompQueryBasis,
  type MarketCompQueryBasis,
} from "@/lib/lease-renewal/market-comp-query-basis";

/** Resolve one exact current lease server-side so a browser cannot nominate provider query facts. */
export async function resolveCurrentMarketCompQueryBasis(
  leaseId: string,
  nowMs: number = Date.now(),
): Promise<MarketCompQueryBasis> {
  const requestedLeaseId = leaseId.trim();
  const config = buildLiveRentVineConfig();
  if (!config.ok) {
    throw new MarketCompQueryResolutionError(
      config.reason === "account_mismatch"
        ? "rentvine_account_mismatch"
        : "rentvine_not_configured",
      409,
      config.reason === "account_mismatch"
        ? "The configured RentVine account does not match the PMI KC production account."
        : "RentVine must be connected before a lease-backed RentCast lookup can run.",
    );
  }

  let current: Awaited<ReturnType<typeof getLiveLeaseSnapshot>>;
  try {
    current = await getLiveLeaseSnapshot(config.rentvineClient, nowMs);
  } catch {
    throw new MarketCompQueryResolutionError(
      "rentvine_read_failed",
      503,
      "The current RentVine lease read failed, so no RentCast lookup ran.",
    );
  }
  const { snapshot, currency } = current;
  if (currency.state === "expired") {
    throw new MarketCompQueryResolutionError(
      "lease_data_expired",
      409,
      `The live lease data is ${Math.round(currency.ageMs / 60_000)} minutes old, past the ${Math.round(
        LEASE_EXPORT_MAX_AGE_MS / 60_000,
      )}-minute maximum. Refresh the Renewals desk before looking up comps.`,
    );
  }

  const matches = snapshot.views.filter(
    (candidate) => leaseViewId(candidate) === requestedLeaseId,
  );
  if (matches.length === 0) {
    throw new MarketCompQueryResolutionError(
      snapshot.complete ? "lease_not_found" : "lease_read_incomplete",
      snapshot.complete ? 404 : 409,
      snapshot.complete
        ? "The requested lease was not found in the current RentVine export."
        : "The RentVine export is incomplete, so absence of this lease cannot be verified.",
    );
  }
  if (matches.length !== 1) {
    throw new MarketCompQueryResolutionError(
      "lease_ambiguous",
      409,
      "More than one current RentVine export row matched this lease id, so no lookup ran.",
    );
  }
  return buildMarketCompQueryBasis(matches[0], requestedLeaseId);
}
