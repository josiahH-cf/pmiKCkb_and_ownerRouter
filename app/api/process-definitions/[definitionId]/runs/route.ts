import { apiErrorResponse, createdJson, parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { StartWorkflowRunInputSchema } from "@/lib/firestore/schemas";
import { startWorkflowRun } from "@/lib/firestore/workflows";
import {
  GUIDANCE_ONLY_RUN_START_REFUSAL,
  isGuidanceOnlyProcessDefinitionId,
} from "@/lib/processes/guidance-only";
import { assertProcessDefinitionAccess } from "@/lib/space-scope-resources";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

/** Start one human-initiated app-plane workflow run. This executes no provider or system write. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { definitionId } = await context.params;
    // S286 R-S286-2: a renewal process is guidance; its start is refused before any read or
    // write, whatever the body says. The run start service refuses it too.
    if (isGuidanceOnlyProcessDefinitionId(definitionId))
      throw new EditableLayerError(GUIDANCE_ONLY_RUN_START_REFUSAL, 409);
    assertProcessDefinitionAccess(user, definitionId);
    const input = await parseOptionalJsonBody(request, StartWorkflowRunInputSchema);
    const run = await startWorkflowRun(user, definitionId, input);
    return createdJson({ run });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
