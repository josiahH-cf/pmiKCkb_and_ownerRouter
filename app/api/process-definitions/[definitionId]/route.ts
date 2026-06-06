import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getProcessDefinition,
  listWorkflowRuns,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import { UpdateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { definitionId } = await context.params;
    const [definition, runs] = await Promise.all([
      getProcessDefinition(user, definitionId),
      listWorkflowRuns(user, { definitionId }),
    ]);

    return NextResponse.json({ definition, runs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { definitionId } = await context.params;
    const input = await parseJsonBody(request, UpdateProcessDefinitionInputSchema);
    const definition = await updateProcessDefinition(user, definitionId, input);
    const runs = await listWorkflowRuns(user, { definitionId });

    return NextResponse.json({ definition, runs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
