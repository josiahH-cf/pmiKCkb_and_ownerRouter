import { NextResponse } from "next/server";
import { apiErrorResponse, parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listWorkflowRuns } from "@/lib/firestore/workflows";
import { readProcessDefinitionPublication } from "@/lib/publication/process-definition-readback";
import {
  PublishProcessDefinitionSchema,
  publishProcessDefinition,
} from "@/lib/publication/process-definition";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireCapability("edit");
    const { definitionId } = await context.params;
    const input = await parseOptionalJsonBody(request, PublishProcessDefinitionSchema);
    const result = await publishProcessDefinition(actor, definitionId, input);
    const runs = await listWorkflowRuns(actor, { definitionId });
    const publication = await readProcessDefinitionPublication(actor, result.definition);
    return NextResponse.json({ ...result, runs, publication });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
