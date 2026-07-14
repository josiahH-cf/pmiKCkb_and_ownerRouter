import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  TightenPublicationPolicySchema,
  tightenPublicationPolicy,
} from "@/lib/publication/policy";

interface RouteContext {
  params: Promise<{ policyId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireCapability("manageAdmin");
    const { policyId } = await context.params;
    const input = await parseJsonBody(request, TightenPublicationPolicySchema);
    return NextResponse.json({
      policy: await tightenPublicationPolicy(actor, policyId, input),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
