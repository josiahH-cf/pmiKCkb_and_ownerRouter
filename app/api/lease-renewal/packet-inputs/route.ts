import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { readChargePolicy } from "@/lib/firestore/lease-charge-policy";
import { getPacketInputs, savePacketInputs } from "@/lib/firestore/lease-packet-inputs";
import { resolveLivePacketInput } from "@/lib/lease-documents/live-input";
import { SavePacketInputsSchema } from "@/lib/lease-documents/packet-inputs";
import { buildPacketInputsView } from "@/lib/lease-documents/packet-inputs-view";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S66 (AC-S66-4): the app-owned renewal packet inputs of one lease. It writes only the app's own
// record and append-only activity; the actor comes from the server session, never the body. No
// RentVine, Sheet or Dotloop call happens here, and saving creates no packet snapshot, approval
// or provider action.

export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const parsedLeaseId = z
      .string()
      .regex(/^[1-9]\d*$/)
      .safeParse(new URL(request.url).searchParams.get("leaseId"));
    if (!parsedLeaseId.success)
      throw new EditableLayerError("leaseId must be a RentVine lease id.", 400);
    const leaseId = parsedLeaseId.data;
    const [record, policy] = await Promise.all([
      getPacketInputs(actor, leaseId),
      readChargePolicy(),
    ]);
    // The current sources, calculated charges and open questions come from the same reader the
    // packet evaluation uses. When a source is unavailable the saved inputs stay editable.
    let resolved: Awaited<ReturnType<typeof resolveLivePacketInput>> | null = null;
    let unavailableReason: string | undefined;
    try {
      resolved = await resolveLivePacketInput(
        actor,
        leaseId,
        leaseId,
        new Date().toISOString(),
      );
    } catch (error) {
      unavailableReason =
        error instanceof EditableLayerError
          ? error.message
          : "Current lease sources are unavailable. Saved inputs stay editable.";
    }
    return NextResponse.json(
      buildPacketInputsView({ record, policy, resolved, unavailableReason }),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_packet_inputs"),
      "renewals",
    );
    const input = await parseJsonBody(request, SavePacketInputsSchema);
    return NextResponse.json(await savePacketInputs(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
