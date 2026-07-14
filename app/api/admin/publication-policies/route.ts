import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  CreatePublicationPolicySchema,
  createPublicationPolicy,
  listPublicationPolicies,
} from "@/lib/publication/policy";

export async function GET() {
  try {
    const actor = await requireCapability("manageAdmin");
    return NextResponse.json({ policies: await listPublicationPolicies(actor) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, CreatePublicationPolicySchema);
    return createdJson({ policy: await createPublicationPolicy(actor, input) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
