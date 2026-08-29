import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  createRentcastUsageStore,
  rentcastMonthKey,
  type RentcastUsageStore,
} from "@/lib/firestore/rentcast-usage";
import {
  createMarketCompProvider,
  type MarketCompResult,
} from "@/lib/lease-renewal/market-comp-provider";
import {
  MarketCompQueryResolutionError,
  RENTCAST_PUBLIC_SOURCE_URL,
  type MarketCompQueryBasis,
} from "@/lib/lease-renewal/market-comp-query-basis";
import { resolveCurrentMarketCompQueryBasis } from "@/lib/lease-renewal/market-comp-query-resolver";
import {
  DEFAULT_TREND_HISTORY_MONTHS,
  RentCastMarketCompProvider,
  RENTCAST_LISTINGS_ACTION_KEY,
  RENTCAST_MARKET_COMP_SOURCE,
  type MarketTrendResult,
} from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";
import {
  clearCompCacheForTests,
  compCacheKey,
  evaluateRentcastQuota,
  readCompCache,
  resolveRentcastAllowance,
  writeCompCache,
  type RentcastQuotaView,
} from "@/lib/lease-renewal/rentcast-quota";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
  runProductionRuntimeGatedAction,
} from "@/lib/operations/runtime-suspension-gate";

// A comp-basis number: finite and non-negative (a comp is never negative). The manual pass-through echoes
// the operator's own entered numbers; the schema deliberately carries no rent decision.
const compMoney = z.number().finite().nonnegative();

const MarketCompsRequestSchema = z
  .object({
    // S59: "comps" (the default) is the AVM comp basis; "trend" is the month-keyed /markets history.
    // Each is a SEPARATE billable RentCast request and is metered separately (AC-S59-18).
    operation: z.enum(["comps", "trend"]).default("comps"),
    // The browser nominates only a lease identity. Address, unit attributes, policy, and base rent
    // are re-resolved from the current RentVine export on the server.
    leaseId: z.string().trim().min(1).max(120),
    // The operator's OWN entered comp numbers, for the manual pass-through only (RentCast ignores them).
    manualBasis: z
      .object({
        rangeLow: compMoney.optional(),
        rangeHigh: compMoney.optional(),
        pmiNumber: compMoney.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Test-only reset for the in-memory comp cache (re-exported so route tests stay hermetic). */
export function resetMarketCompsCacheForTests(): void {
  clearCompCacheForTests();
}

async function readQuota(
  store: RentcastUsageStore,
  monthKey: string,
): Promise<RentcastQuotaView> {
  const usage = await store.readMonth(monthKey);
  return evaluateRentcastQuota(usage.billedCalls, resolveRentcastAllowance());
}

function referenceProjection(queryBasis: MarketCompQueryBasis, cached: boolean) {
  return {
    queryBasis,
    sourceUrl: RENTCAST_PUBLIC_SOURCE_URL,
    cached,
  };
}

/**
 * Run the configured market-comp provider and return a DISPLAY-only result. Reference only: the
 * response never sets or moves the offered rent. S59 adds, on the RentCast path only: a per-address
 * TTL cache (a hit costs zero live calls), a persisted monthly counter of billed calls, a soft
 * warning, and a hard quota stop that refuses live calls for the period while the manual path keeps
 * working. When the RentCast adapter is selected, the exact action key and runtime suspension gate
 * are enforced before a call; the manual adapter needs no provider gate and echoes operator input.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const config = readServerConfig();

    if (config.marketCompProvider === "rentcast") {
      await assertProductionRuntimeActionExecutable(RENTCAST_LISTINGS_ACTION_KEY);
    }

    const body = await parseJsonBody(request, MarketCompsRequestSchema);

    const queryBasis = await resolveCurrentMarketCompQueryBasis(body.leaseId);

    // A trend needs the server-resolved RentVine postal code. No browser-supplied fallback and no
    // placeholder can spend a provider call.
    if (body.operation === "trend" && !queryBasis.trendPostalCode) {
      return NextResponse.json(
        {
          error:
            "This lease has no 5-digit zip on file, so a market-trend lookup has nothing to query.",
          error_type: "missing_postal_code",
        },
        { status: 400 },
      );
    }

    if (config.marketCompProvider !== "rentcast") {
      if (body.operation === "trend") {
        // The manual provider has no trend source; answer honestly rather than fabricating one.
        return NextResponse.json({
          source: RENTCAST_MARKET_COMP_SOURCE,
          confidence: "Needs Verification",
          reason: "provider_not_live",
          ...referenceProjection(queryBasis, false),
        } satisfies MarketTrendResult);
      }
      const provider = createMarketCompProvider({
        provider: config.marketCompProvider,
        ...(body.manualBasis ? { basis: body.manualBasis } : {}),
      });
      const result = await provider.lookup({
        addressLabel: queryBasis.addressLabel,
        ...queryBasis.query,
      });
      return NextResponse.json({
        ...result,
        queryBasis,
        cached: false,
      });
    }

    // --- RentCast path: cache → quota stop → one gated live call → meter billed calls. ---
    const store = createRentcastUsageStore(user);
    const monthKey = rentcastMonthKey(Date.now());
    let quota = await readQuota(store, monthKey);

    const nowMs = Date.now();
    const cacheKey =
      body.operation === "trend"
        ? `trend:${queryBasis.policy.providerVersion}:${queryBasis.trendPostalCode}:${DEFAULT_TREND_HISTORY_MONTHS}`
        : compCacheKey({
            address: queryBasis.addressLabel,
            ...queryBasis.query,
            maxRadiusMiles: queryBasis.policy.maxRadiusMiles,
            requestedCompCount: queryBasis.policy.requestedCompCount,
            lookupSubjectAttributes: queryBasis.policy.lookupSubjectAttributes,
            providerVersion: queryBasis.policy.providerVersion,
          });
    const cached = readCompCache<MarketCompResult | MarketTrendResult>(cacheKey, nowMs);
    if (cached) {
      // AC-S59-3: a repeat inside the TTL performs ZERO additional live calls — a cached range
      // stays servable even after the allowance is exhausted, because serving it costs nothing.
      return NextResponse.json({
        ...cached,
        quota,
        ...referenceProjection(queryBasis, true),
      });
    }

    if (quota.exhausted) {
      // AC-S59-5: an explicit out-of-allowance refusal, no call made, hand entry still available.
      const refusal: MarketCompResult = {
        source: RENTCAST_MARKET_COMP_SOURCE,
        confidence: "Needs Verification",
        reason: "out_of_allowance",
      };
      return NextResponse.json({
        ...refusal,
        quota,
        ...referenceProjection(queryBasis, false),
      });
    }

    const provider = new RentCastMarketCompProvider({
      ...(config.rentcastApiKey ? { apiKey: config.rentcastApiKey } : {}),
      maxRadiusMiles: queryBasis.policy.maxRadiusMiles,
      compCount: queryBasis.policy.requestedCompCount,
      lookupSubjectAttributes: queryBasis.policy.lookupSubjectAttributes,
    });
    const lookup = async () =>
      body.operation === "trend"
        ? provider.lookupTrend(queryBasis.trendPostalCode as string)
        : provider.lookup({
            addressLabel: queryBasis.addressLabel,
            ...queryBasis.query,
          });
    const result = await runProductionRuntimeGatedAction(
      RENTCAST_LISTINGS_ACTION_KEY,
      lookup,
    );

    // AC-S59-4: the counter increments only on a real billed call — never on a cache hit and never
    // on a refusal that made no request. Billed mirrors RentCast's own billing (one 2xx with body).
    if (result.billed) {
      const usage = await store.incrementMonth(monthKey, 1);
      quota = evaluateRentcastQuota(usage.billedCalls, resolveRentcastAllowance());
    }
    if (result.confidence === "Likely") {
      writeCompCache(cacheKey, result, nowMs);
    }
    return NextResponse.json({
      ...result,
      quota,
      ...referenceProjection(queryBasis, false),
    });
  } catch (error) {
    if (error instanceof MarketCompQueryResolutionError) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: error.status },
      );
    }
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      return NextResponse.json(
        {
          action_key: RENTCAST_LISTINGS_ACTION_KEY,
          error:
            error instanceof ActionRuntimeSuspendedError
              ? error.message
              : "Live market-comp lookup is unavailable until the RentCast action has owner-approved permission. Enter your own comp numbers instead.",
          error_type: error.code,
        },
        { status: error.status },
      );
    }
    return apiErrorResponse(error);
  }
}
