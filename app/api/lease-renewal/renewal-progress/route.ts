import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  markRenewalComplete,
  recordOwnerDecision,
} from "@/lib/firestore/lease-renewal-progress";

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
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const body = await parseJsonBody(request, RenewalProgressBodySchema);

    if (body.action === "owner_decision") {
      const progress = await recordOwnerDecision(user, body.leaseId, {
        decision: body.decision,
        offeredRent: body.offeredRent,
        ...(body.charges ? { charges: body.charges } : {}),
        ...(body.infoFormUrl ? { infoFormUrl: body.infoFormUrl } : {}),
      });
      return NextResponse.json({ progress });
    }

    const progress = await markRenewalComplete(user, body.leaseId);
    return NextResponse.json({ progress });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
