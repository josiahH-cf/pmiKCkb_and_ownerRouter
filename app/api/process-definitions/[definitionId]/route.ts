import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getProcessDefinition,
  listWorkflowRuns,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import { UpdateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { processDefinitionPublicationContent } from "@/lib/publication/process-definition-content";
import { readProcessDefinitionPublication } from "@/lib/publication/process-definition-readback";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  isRetiredMaintenanceWorkflow,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";
import { withoutUnusedGuidanceStaffFields } from "@/lib/processes/guidance-only";
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
    if (isRetiredMaintenanceWorkflow(definition.space_id, definition.id))
      throw new EditableLayerError(MAINTENANCE_RETIREMENT_MESSAGE, 410);
    const publication = await readProcessDefinitionPublication(user, definition);
    const runs = await listWorkflowRuns(user, { definitionId });

    const reviewed = processDefinitionPublicationContent(definition);
    return NextResponse.json(
      {
        definition,
        runs,
        publication,
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
    // S286 R-S286-5: a renewal definition's unused run owner and approver may be sent empty; the
    // stored values are kept. Every other definition parses exactly as before.
    const input = await parseJsonBody(
      request,
      z.preprocess(
        (payload) => withoutUnusedGuidanceStaffFields(definitionId, payload),
        UpdateProcessDefinitionInputSchema,
      ),
    );
    const definition = await updateProcessDefinition(user, definitionId, input);
    const publication = await readProcessDefinitionPublication(user, definition);
    const runs = await listWorkflowRuns(user, { definitionId });

    return NextResponse.json({ definition, runs, publication });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
