import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getProcessDefinition,
  listWorkflowRuns,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import { UpdateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { processDefinitionPublicationContent } from "@/lib/publication/process-definition-content";
import {
  assertProcessDefinitionAccess,
  assertProcessDefinitionRecordAccess,
} from "@/lib/space-scope-resources";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { definitionId } = await context.params;
    const definition = await getProcessDefinition(user, definitionId);
    assertProcessDefinitionRecordAccess(user, definition);
    const runs = await listWorkflowRuns(user, { definitionId });

    const reviewed = processDefinitionPublicationContent(definition);
    return NextResponse.json(
      {
        definition,
        runs,
        publicationReview: {
          revision: definition.revision,
          contentHash: reviewed.contentHash,
          byteSize: reviewed.content.byteLength,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { definitionId } = await context.params;
    assertProcessDefinitionAccess(user, definitionId);
    const input = await parseJsonBody(request, UpdateProcessDefinitionInputSchema);
    const definition = await updateProcessDefinition(user, definitionId, input);
    const runs = await listWorkflowRuns(user, { definitionId });

    return NextResponse.json({ definition, runs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
