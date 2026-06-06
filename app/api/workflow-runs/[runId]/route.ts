import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { UpdateWorkflowRunInputSchema } from "@/lib/firestore/schemas";
import {
  getWorkflowRun,
  listWorkflowRunTimeline,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { runId } = await context.params;
    const [run, timeline] = await Promise.all([
      getWorkflowRun(user, runId),
      listWorkflowRunTimeline(user, runId),
    ]);

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
    const run = await updateWorkflowRunOutcome(user, runId, input);
    const timeline = await listWorkflowRunTimeline(user, runId);

    return NextResponse.json({ run, timeline });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
