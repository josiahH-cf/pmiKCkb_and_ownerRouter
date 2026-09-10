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
} from "@/lib/lease-renewal/execution/normal-packet-action";
const leaseId = z.string().regex(/^[1-9]\d*$/);
const Command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("readback"), leaseId }).strict(),
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
          : renewalRoleCapability("save_packet_truth"),
      "renewals",
    );
    const result =
      body.kind === "readback"
        ? await refreshNormalPacketLink(actor, body.leaseId)
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
