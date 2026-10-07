import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  currentPacketHandoff,
  prepareNormalPacketAction,
  finishNormalPacketAction,
  refreshNormalPacketLink,
  reviewExistingDotloopLoop,
  linkReviewedDotloopLoop,
  unlinkDotloopLoop,
} from "@/lib/lease-renewal/execution/normal-packet-action";
const leaseId = z.string().regex(/^[1-9]\d*$/);
// A Dotloop loop id; the server reads it through the company connection before anything is saved.
const loopId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const linkRevision = z.number().int().nonnegative();
const Command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("readback"), leaseId }).strict(),
  // S34: review an existing loop, link it to this lease, or correct the lease's link.
  z.object({ kind: z.literal("loop_review"), leaseId, loopId }).strict(),
  z
    .object({
      kind: z.literal("loop_link"),
      leaseId,
      loopId,
      observationHash: z.string().regex(/^[a-f0-9]{64}$/),
      reason: z.string().trim().min(3).max(500),
      expectedLinkRevision: linkRevision,
      reuseAcrossCycles: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("loop_unlink"),
      leaseId,
      expectedLinkRevision: linkRevision,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("preview"),
      leaseId,
      operation: z.enum(["loop_create", "document_upload"]),
      documentRef: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("confirm"),
      leaseId,
      executionId: z.string().min(1).max(240),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("reconcile"),
      leaseId,
      executionId: z.string().min(1).max(240),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const id = leaseId.parse(new URL(request.url).searchParams.get("leaseId"));
    return NextResponse.json(await currentPacketHandoff(actor, id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, Command);
    const actor = await requireCapabilityInSpace(
      body.kind === "confirm"
        ? renewalRoleCapability("execute_document_packet")
        : body.kind === "readback"
          ? renewalRoleCapability("record_packet_readback")
          : body.kind === "loop_review" ||
              body.kind === "loop_link" ||
              body.kind === "loop_unlink"
            ? renewalRoleCapability("link_dotloop_loop")
            : renewalRoleCapability("save_packet_truth"),
      "renewals",
    );
    const result =
      body.kind === "readback"
        ? await refreshNormalPacketLink(actor, body.leaseId)
        : body.kind === "loop_review"
          ? await reviewExistingDotloopLoop(actor, body.leaseId, body.loopId)
          : body.kind === "loop_link"
            ? await linkReviewedDotloopLoop(actor, body)
            : body.kind === "loop_unlink"
              ? await unlinkDotloopLoop(actor, body)
              : body.kind === "preview"
                ? await prepareNormalPacketAction(
                    actor,
                    body.leaseId,
                    body.operation,
                    body.documentRef,
                  )
                : await finishNormalPacketAction(actor, {
                    ...body,
                    reconcile: body.kind === "reconcile",
                  });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
