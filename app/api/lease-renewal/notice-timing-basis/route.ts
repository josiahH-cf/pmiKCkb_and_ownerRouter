import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertTimingBasisStaff,
  readMoveOutTimingBasisSelection,
  selectMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import { SelectNoticeTimingBasisInputSchema } from "@/lib/lease-renewal/notice-timing-decision";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

const headers = { "Cache-Control": "private, no-store" };

// S125: GET is a genuine read. PATCH selects only the server-resolved documented decision.
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertTimingBasisStaff(actor, false);
    const raw = new URL(request.url).searchParams.get("operationId");
    const parsed = raw === null ? null : z.string().uuid().safeParse(raw);
    if (parsed && !parsed.success)
      throw new EditableLayerError("operationId must be a UUID.", 400);
    const operationId = parsed?.success ? parsed.data : undefined;
    return NextResponse.json(await readMoveOutTimingBasisSelection(actor, operationId), {
      headers,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("select_notice_timing_basis"),
      "renewals",
    );
    assertTimingBasisStaff(actor, true);
    const input = await parseJsonBody(request, SelectNoticeTimingBasisInputSchema);
    const result = await selectMoveOutTimingBasis(actor, input);
    return NextResponse.json(
      {
        timingBasis: { state: "saved", record: result.record },
        duplicate: result.duplicate,
      },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
