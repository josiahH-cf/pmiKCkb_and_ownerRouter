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
    address: z.string().trim().min(1).max(300).optional(),
    zipCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/)
      .optional(),
    bedrooms: z.number().int().nonnegative().max(20).optional(),
    bathrooms: z.number().nonnegative().max(20).optional(),
    squareFootage: z.number().int().positive().max(100_000).optional(),
    propertyType: z.string().trim().min(1).max(50).optional(),
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

/**
 * Run the configured market-comp provider and return a DISPLAY-only result. Reference only: the
 * response never sets or moves the offered rent. S59 adds, on the RentCast path only: a per-address
 * TTL cache (a hit costs zero live calls), a persisted monthly counter of billed calls, a soft
 * warning, and a hard quota stop that refuses live calls for the period while the manual path keeps
 * working. When the RentCast adapter is selected it is refused with the closed-action response until
 * its reviewed gate flip lands; the manual adapter needs no gate and echoes the operator's numbers.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const config = readServerConfig();

    if (config.marketCompProvider === "rentcast") {
      await assertProductionRuntimeActionExecutable(RENTCAST_LISTINGS_ACTION_KEY);
    }

    const body = await parseJsonBody(request, MarketCompsRequestSchema);

    // Local refusals BEFORE any provider work: a missing address (or zip for a trend) never spends
    // a call and never sends a placeholder like the literal "Unknown" (AC-S59-6).
    if (body.operation === "comps" && !body.address) {
      return NextResponse.json(
        {
          error:
            "This lease has no address on file, so a comp lookup would search for nothing. Enter your own comp numbers instead.",
          error_type: "missing_address",
        },
        { status: 400 },
      );
    }
    if (body.operation === "trend" && !body.zipCode) {
      return NextResponse.json(
        {
          error:
            "This lease has no 5-digit zip on file, so a market-trend lookup has nothing to query.",
          error_type: "missing_address",
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
        } satisfies MarketTrendResult);
      }
      const provider = createMarketCompProvider({
        provider: config.marketCompProvider,
        ...(body.manualBasis ? { basis: body.manualBasis } : {}),
      });
      const result = await provider.lookup({ addressLabel: body.address ?? "" });
      return NextResponse.json(result);
    }

    // --- RentCast path: cache → quota stop → one gated live call → meter billed calls. ---
    const store = createRentcastUsageStore(user);
    const monthKey = rentcastMonthKey(Date.now());
    let quota = await readQuota(store, monthKey);

    const nowMs = Date.now();
    const cacheKey =
      body.operation === "trend"
        ? `trend:${body.zipCode}`
        : compCacheKey({
            address: body.address ?? "",
            ...(body.bedrooms !== undefined ? { bedrooms: body.bedrooms } : {}),
            ...(body.bathrooms !== undefined ? { bathrooms: body.bathrooms } : {}),
            ...(body.propertyType ? { propertyType: body.propertyType } : {}),
          });
    const cached = readCompCache<MarketCompResult | MarketTrendResult>(cacheKey, nowMs);
    if (cached) {
      // AC-S59-3: a repeat inside the TTL performs ZERO additional live calls — a cached range
      // stays servable even after the allowance is exhausted, because serving it costs nothing.
      return NextResponse.json({ ...cached, quota, cached: true });
    }

    if (quota.exhausted) {
      // AC-S59-5: an explicit out-of-allowance refusal, no call made, hand entry still available.
      const refusal: MarketCompResult = {
        source: RENTCAST_MARKET_COMP_SOURCE,
        confidence: "Needs Verification",
        reason: "out_of_allowance",
      };
      return NextResponse.json({ ...refusal, quota });
    }

    const provider = new RentCastMarketCompProvider(
      config.rentcastApiKey ? { apiKey: config.rentcastApiKey } : {},
    );
    const lookup = async () =>
      body.operation === "trend"
        ? provider.lookupTrend(body.zipCode as string)
        : provider.lookup({
            addressLabel: body.address as string,
            ...(body.bedrooms !== undefined ? { bedrooms: body.bedrooms } : {}),
            ...(body.bathrooms !== undefined ? { bathrooms: body.bathrooms } : {}),
            ...(body.squareFootage !== undefined
              ? { squareFootage: body.squareFootage }
              : {}),
            ...(body.propertyType ? { propertyType: body.propertyType } : {}),
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
    return NextResponse.json({ ...result, quota });
  } catch (error) {
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
