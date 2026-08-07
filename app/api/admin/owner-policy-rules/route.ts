import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  listOwnerPolicyRules,
  upsertOwnerPolicyRule,
} from "@/lib/firestore/owner-policy-rules";
import { leasePortfolioId } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";

// S62: Admin management of owner-policy pricing rules, following the /admin precedent: Admin-only,
// a required plain-English reason, an append-only audit in the store. A rule SUGGESTS a number
// through the S29 approval plane; it never sets the offered rent, never suppresses an owner draft.

const UpsertRuleSchema = z
  .object({
    portfolioId: z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, "A rule keys on the numeric RentVine portfolio id."),
    percent: z.number().finite().gt(0).max(100),
    effectiveFrom: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

/** AC-S62-11: a rule needs a portfolio id that resolves against a live lease view. */
async function portfolioIdResolvesLive(portfolioId: string): Promise<boolean> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return false;
  try {
    const views = await getLiveLeaseViews(config.rentvineClient, Date.now());
    return views.some((view) => leasePortfolioId(view) === portfolioId);
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const rules = await listOwnerPolicyRules(user);
    return NextResponse.json({ rules });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, UpsertRuleSchema);
    const rule = await upsertOwnerPolicyRule(user, input, portfolioIdResolvesLive);
    return NextResponse.json({ rule });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
