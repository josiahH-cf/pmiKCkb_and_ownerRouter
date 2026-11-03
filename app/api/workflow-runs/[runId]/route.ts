import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { UpdateWorkflowRunInputSchema } from "@/lib/firestore/schemas";
import {
  getWorkflowRun,
  getWorkflowRunDefinition,
  listWorkflowRunTimeline,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import { assertWorkflowRunAccess } from "@/lib/space-scope-resources";
import { assertWorkflowRunHistoryAvailable } from "@/lib/firestore/workflow-run-definition";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { runId } = await context.params;
    const run = await getWorkflowRun(user, runId);
    assertWorkflowRunAccess(user, run);
    assertWorkflowRunHistoryAvailable(run);
    if (run.definition_version_id !== undefined)
      await getWorkflowRunDefinition(user, run);
    const timeline = await listWorkflowRunTimeline(user, runId);

    return NextResponse.json({ run, timeline });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { runId } = await context.params;
    const input = await parseJsonBody(request, UpdateWorkflowRunInputSchema);
    const existingRun = await getWorkflowRun(user, runId);
    assertWorkflowRunAccess(user, existingRun);
    const run = await updateWorkflowRunOutcome(user, runId, input);
    const timeline = await listWorkflowRunTimeline(user, runId);

    return NextResponse.json({ run, timeline });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
