import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  ChangeRenewalCycleDispositionSchema,
  PendingRenewalDispatchError,
  changeRenewalCycleDisposition,
  listRenewalDispositionEvents,
  readRenewalDispositionEvent,
} from "@/lib/firestore/renewal-cycle-dispositions";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { resolveDispositionSourceBasis } from "@/lib/lease-renewal/workspace-cycle-context";

const readQuery = z.object({
  leaseId: z.string().regex(/^[1-9]\d*$/),
  operationId: z.string().uuid().optional(),
});
const privateResponse = { headers: { "Cache-Control": "private, no-store" } };

export async function GET(request: Request) {
  try {
    await requireCapabilityInSpace(renewalRoleCapability("read_workspace"), "renewals");
    const { leaseId, operationId } = readQuery.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(
      operationId
        ? { event: await readRenewalDispositionEvent(leaseId, operationId) }
        : await listRenewalDispositionEvents(leaseId),
      privateResponse,
    );
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
    const input = await parseJsonBody(request, ChangeRenewalCycleDispositionSchema);
    const source = await resolveDispositionSourceBasis(actor, input.leaseId);
    return NextResponse.json(
      { event: await changeRenewalCycleDisposition(actor, input, source) },
      privateResponse,
    );
  } catch (error) {
    if (error instanceof PendingRenewalDispatchError)
      return NextResponse.json(
        {
          error: error.message,
          sequenceId: error.sequenceId,
          executionId: error.executionId,
        },
        { ...privateResponse, status: 409 },
      );
    return apiErrorResponse(error);
  }
}
