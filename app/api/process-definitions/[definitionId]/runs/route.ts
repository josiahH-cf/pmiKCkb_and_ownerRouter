import { apiErrorResponse, createdJson, parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { StartWorkflowRunInputSchema } from "@/lib/firestore/schemas";
import { getProcessDefinition, startWorkflowRun } from "@/lib/firestore/workflows";
import {
  assertProcessDefinitionAccess,
  assertProcessDefinitionRecordAccess,
} from "@/lib/space-scope-resources";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

/** Start one human-initiated app-plane workflow run. This executes no provider or system write. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { definitionId } = await context.params;
    if (user.scopes === undefined) {
      assertProcessDefinitionAccess(user, definitionId);
    } else {
      const definition = await getProcessDefinition(user, definitionId);
      assertProcessDefinitionRecordAccess(user, definition);
    }
    const input = await parseOptionalJsonBody(request, StartWorkflowRunInputSchema);
    const run = await startWorkflowRun(user, definitionId, input);
    return createdJson({ run });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
