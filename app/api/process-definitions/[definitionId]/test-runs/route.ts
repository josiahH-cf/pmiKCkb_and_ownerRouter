import { createdJson, apiErrorResponse, parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { StartWorkflowTestRunInputSchema } from "@/lib/firestore/schemas";
import { startWorkflowTestRun } from "@/lib/firestore/workflows";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { definitionId } = await context.params;
    const input = await parseOptionalJsonBody(request, StartWorkflowTestRunInputSchema);
    const run = await startWorkflowTestRun(user, definitionId, input);

    return createdJson({ run });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
