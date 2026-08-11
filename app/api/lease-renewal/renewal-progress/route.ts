import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  markRenewalComplete,
  recordOwnerDecision,
} from "@/lib/firestore/lease-renewal-progress";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  LeaseDataExpiredError,
  requireCurrentLeaseViews,
} from "@/lib/lease-renewal/live-lease-cache";

// A rent/market figure: finite and strictly positive (a $0 renewal offer is never valid).
const positiveMoney = z.number().finite().positive();
// A charge line that may legitimately be zero (e.g. no resident-benefit package).
const chargeMoney = z.number().finite().nonnegative();

const OwnerDecisionActionSchema = z
  .object({
    action: z.literal("owner_decision"),
    leaseId: z.string().trim().min(1).max(120),
    decision: z.enum(["keep_same", "increase", "custom"]),
    offeredRent: positiveMoney,
    charges: z
      .object({ rbp: chargeMoney.optional(), insurance: chargeMoney.optional() })
      .strict()
      .optional(),
    infoFormUrl: z.string().trim().url().optional(),
    // Operator comp basis (all optional; the app never invents a rent figure). S28a adds the stored
    // screenshot Drive ref plus display-only provider attribution, none of which is a rent decision.
    market: z
      .object({
        rangeLow: chargeMoney.optional(),
        rangeHigh: chargeMoney.optional(),
        pmiNumber: chargeMoney.optional(),
        compSource: z.string().trim().min(1).max(100).optional(),
        compRetrievedAt: z.string().trim().min(1).max(40).optional(),
        // S60: the provider-retrieved basis, persisted verbatim beside (never over) the typed
        // fields. The normalizer re-validates coherence; the schema bounds shape and size.
        provider: z
          .object({
            source: z.string().trim().min(1).max(60),
            rangeLow: chargeMoney,
            rangeHigh: chargeMoney,
            pointEstimate: chargeMoney,
            compCount: z.number().int().positive().max(100),
            retrievedAt: z.string().trim().min(1).max(40),
            radiusMiles: chargeMoney.optional(),
            unitFilters: z
              .object({
                bedrooms: chargeMoney.optional(),
                bathrooms: chargeMoney.optional(),
                squareFootage: chargeMoney.optional(),
                propertyType: z.string().trim().min(1).max(50).optional(),
              })
              .strict()
              .optional(),
            comps: z
              .array(
                z
                  .object({
                    rent: chargeMoney,
                    correlation: z.number().min(0).max(1).optional(),
                    distanceMiles: chargeMoney.optional(),
                    bedrooms: chargeMoney.optional(),
                    bathrooms: chargeMoney.optional(),
                    daysOnMarket: chargeMoney.optional(),
                  })
                  .strict(),
              )
              .max(50)
              .optional(),
            trend: z
              .object({
                zipCode: z
                  .string()
                  .trim()
                  .regex(/^\d{5}$/),
                retrievedAt: z.string().trim().min(1).max(40),
                months: z.record(
                  z.string().regex(/^\d{4}-\d{2}$/),
                  z
                    .object({
                      averageRent: chargeMoney.optional(),
                      medianRent: chargeMoney.optional(),
                    })
                    .strict(),
                ),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const MarkCompleteActionSchema = z
  .object({
    action: z.literal("mark_complete"),
    leaseId: z.string().trim().min(1).max(120),
  })
  .strict();

const RenewalProgressBodySchema = z.discriminatedUnion("action", [
  OwnerDecisionActionSchema,
  MarkCompleteActionSchema,
]);

/**
 * Advance a LIVE lease's renewal progress: record the owner's rent decision (unlocks the tenant offer) or
 * mark the renewal complete. Edit-gated in the renewals space. This changes NO system of record — it
 * persists the operator's own forward state in the KB's Firestore; RentVine + the Sheet stay read-only.
 */
export async function POST(request: Request) {
  return createRenewalProgressPostHandler()(request);
}

export interface RenewalProgressRouteDeps {
  requireCapabilityInSpace: typeof requireCapabilityInSpace;
  recordDecision: typeof recordOwnerDecision;
  markComplete: typeof markRenewalComplete;
  /** S58: refuses (LeaseDataExpiredError) when the live lease snapshot is past the hard max age. */
  assertLeaseDataCurrent: () => Promise<void>;
}

/**
 * S58 default currency assertion: when live RentVine is configured, recording a decision requires
 * the shared snapshot to be inside the hard max age (the check itself revalidates an expired entry
 * before refusing). When live RentVine is NOT configured there is no live snapshot to be stale, and
 * the route keeps its existing behavior — progress is the operator's own forward state.
 */
async function defaultAssertLeaseDataCurrent(): Promise<void> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return;
  await requireCurrentLeaseViews(config.rentvineClient, Date.now());
}

const DEFAULT_ROUTE_DEPS: RenewalProgressRouteDeps = {
  requireCapabilityInSpace,
  recordDecision: recordOwnerDecision,
  markComplete: markRenewalComplete,
  assertLeaseDataCurrent: defaultAssertLeaseDataCurrent,
};

export function createRenewalProgressPostHandler(
  overrides: Partial<RenewalProgressRouteDeps> = {},
) {
  const deps = { ...DEFAULT_ROUTE_DEPS, ...overrides };
  return async function handleRenewalProgressPost(request: Request) {
    try {
      const user = await deps.requireCapabilityInSpace("edit", "renewals");
      const body = await parseJsonBody(request, RenewalProgressBodySchema);

      // S58: a decision recorded against data past the hard max age is a decision about a lease
      // that may no longer look like that. Refuse with the explicit reason; record nothing.
      try {
        await deps.assertLeaseDataCurrent();
      } catch (error) {
        if (error instanceof LeaseDataExpiredError) {
          return NextResponse.json(
            { error: error.message, error_type: "lease_data_expired" },
            { status: 409 },
          );
        }
        throw error;
      }

      if (body.action === "owner_decision") {
        // The Firestore transaction derives any screenshot attachment from the exact current receipt.
        // This route never accepts or resolves a caller-supplied Drive reference.
        const progress = await deps.recordDecision(user, body.leaseId, {
          decision: body.decision,
          offeredRent: body.offeredRent,
          ...(body.charges ? { charges: body.charges } : {}),
          ...(body.infoFormUrl ? { infoFormUrl: body.infoFormUrl } : {}),
          ...(body.market ? { market: body.market } : {}),
        });
        return NextResponse.json({ progress });
      }

      const progress = await deps.markComplete(user, body.leaseId);
      return NextResponse.json({ progress });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
