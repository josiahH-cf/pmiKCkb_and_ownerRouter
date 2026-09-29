import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { readAdmittedRenewalNoticeLease } from "@/lib/lease-renewal/admitted-notice-source";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import {
  NoticeReviewCommandSchema,
  observeRenewalNotice,
  saveRenewalNoticeReview,
} from "@/lib/firestore/renewal-notice-safety";
import { EditableLayerError } from "@/lib/firestore/errors";
const identity = z.object({ leaseId: z.string().regex(/^[1-9]\d*$/) }).strict();
async function source(actor: AuthenticatedUser, leaseId: string) {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError("The live lease source is unavailable.", 409);
  const observedAtMs = Date.now();
  const read = await readAdmittedRenewalNoticeLease(
    actor,
    leaseId,
    config.rentvineClient,
    observedAtMs,
  ).catch(() => {
    throw new EditableLayerError(
      "The live notice source is unavailable. Refresh before reviewing notice evidence.",
      409,
    );
  });
  const matches = read.snapshot.views.filter((lease) => leaseViewId(lease) === leaseId);
  if (matches.length !== 1)
    throw new EditableLayerError("The lease identity is missing or ambiguous.", 409);
  return {
    lease: matches[0],
    statusTable: read.statusTable,
    freshness: read.currency.state,
    leaseReadAtMs: read.snapshot.readAtMs,
    observedAtMs,
    noticeAdmitted: read.snapshot.noticeAdmitted,
    admittedLeaseKeys: read.snapshot.noticeAdmission?.leaseKeys,
  };
}
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const input = identity.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await observeRenewalNotice(actor, await source(actor, input.leaseId));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_renewal_progress"),
      "renewals",
    );
    const input = await parseJsonBody(request, NoticeReviewCommandSchema);
    const current = await source(actor, input.leaseId);
    await saveRenewalNoticeReview(actor, input, current);
    return NextResponse.json(await observeRenewalNotice(actor, current), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
