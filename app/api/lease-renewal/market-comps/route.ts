import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { createMarketCompProvider } from "@/lib/lease-renewal/market-comp-provider";
import { RENTCAST_LISTINGS_ACTION_KEY } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";
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
    address: z.string().trim().min(1).max(300),
    bedrooms: z.number().int().nonnegative().max(20).optional(),
    bathrooms: z.number().nonnegative().max(20).optional(),
    propertyType: z.string().trim().min(1).max(50).optional(),
    // The operator's OWN entered comp numbers, for the manual pass-through only (RentCast ignores them).
    manualBasis: z
      .object({
        zillowLow: compMoney.optional(),
        zillowHigh: compMoney.optional(),
        pmiNumber: compMoney.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Run the configured market-comp provider for a property address and return a DISPLAY-only comparable-rent
 * result. Reference only: the response never sets or moves the offered rent (that is the operator's
 * decision; the Admin-gated comp-derived SUGGESTED number is the separate S29). When the RentCast adapter
 * is selected it is refused with the closed-action response until its gate is flipped; the manual adapter
 * needs no gate and echoes the operator's own numbers.
 */
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "renewals");
    const config = readServerConfig();

    if (config.marketCompProvider === "rentcast") {
      await assertProductionRuntimeActionExecutable(RENTCAST_LISTINGS_ACTION_KEY);
    }

    const body = await parseJsonBody(request, MarketCompsRequestSchema);
    const lookup = async () => {
      const provider = createMarketCompProvider({
        provider: config.marketCompProvider,
        ...(body.manualBasis ? { basis: body.manualBasis } : {}),
        ...(config.rentcastApiKey ? { rentcastApiKey: config.rentcastApiKey } : {}),
      });
      return provider.lookup({
        addressLabel: body.address,
        ...(body.bedrooms !== undefined ? { bedrooms: body.bedrooms } : {}),
        ...(body.bathrooms !== undefined ? { bathrooms: body.bathrooms } : {}),
        ...(body.propertyType ? { propertyType: body.propertyType } : {}),
      });
    };
    const result =
      config.marketCompProvider === "rentcast"
        ? await runProductionRuntimeGatedAction(RENTCAST_LISTINGS_ACTION_KEY, lookup)
        : await lookup();
    return NextResponse.json(result);
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
