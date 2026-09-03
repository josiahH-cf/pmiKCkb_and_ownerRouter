import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  LEASE_TERM_SOURCE_FINGERPRINT_PATTERN,
  getLeaseTermReview,
  listLeaseTermReviewActivity,
  recordLeaseTermReview,
} from "@/lib/firestore/lease-renewal-term-reviews";
import { RECORDABLE_LEASE_TERMS } from "@/lib/lease-renewal/lease-term";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S103: the app-owned lease term review. It writes only the KB's own record and its append-only
// activity; no RentVine or Sheet effect, no draft, no send, and no timer derives from it.
const BodySchema = z
  .object({
    lease_id: z.string().trim().min(1).max(120),
    term: z.enum(RECORDABLE_LEASE_TERMS),
    anchor_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    reason: z.string().trim().min(3).max(2_000),
    source_fingerprint: z.string().trim().regex(LEASE_TERM_SOURCE_FINGERPRINT_PATTERN),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const leaseId = new URL(request.url).searchParams.get("lease_id")?.trim() ?? "";
    if (!leaseId) {
      return NextResponse.json({ error: "lease_id is required" }, { status: 400 });
    }
    const [review, activity] = await Promise.all([
      getLeaseTermReview(user, leaseId),
      listLeaseTermReviewActivity(user, leaseId),
    ]);
    return NextResponse.json({ review, activity });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("record_term_review"),
      "renewals",
    );
    const input = await parseJsonBody(request, BodySchema);
    const review = await recordLeaseTermReview(user, input);
    return NextResponse.json({ review });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
