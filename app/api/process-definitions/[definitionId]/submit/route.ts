import { NextResponse } from "next/server";
import { apiErrorResponse, parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { SubmitProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  listWorkflowRuns,
  submitProcessDefinitionForApproval,
} from "@/lib/firestore/workflows";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { definitionId } = await context.params;
    const input = await parseOptionalJsonBody(
      request,
      SubmitProcessDefinitionInputSchema,
    );
    const definition = await submitProcessDefinitionForApproval(
      user,
      definitionId,
      input,
    );
    const runs = await listWorkflowRuns(user, { definitionId });

    return NextResponse.json({ definition, runs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
