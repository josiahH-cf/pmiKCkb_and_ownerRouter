import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { WorkAccountabilityStore } from "@/lib/firestore/work-accountability";
import { WorkRetentionExecutionSchema } from "@/lib/work-accountability/schemas";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const query = new URL(request.url).searchParams;
    const asOf = query.get("as_of") ?? undefined;
    const rawLimit = query.get("limit");
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    const plan = await new WorkAccountabilityStore().previewRetention(actor, {
      ...(asOf ? { as_of: asOf } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return NextResponse.json({ plan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    assertMutationAllowed(requireEnvironmentDescriptor());
    const input = await parseJsonBody(request, WorkRetentionExecutionSchema);
    const receipt = await new WorkAccountabilityStore().executeRetention(actor, input);
    return NextResponse.json({ receipt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
