import { NextResponse } from "next/server";

import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  SetWorkflowRunStepCheckInputSchema,
  listStepChecksForRun,
  setWorkflowRunStepCheck,
} from "@/lib/firestore/workflow-run-step-checks";
import { getWorkflowRun } from "@/lib/firestore/workflows";
import { assertWorkflowRunAccess } from "@/lib/space-scope-resources";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// The run id comes from the path; the body carries only step_id / status / reason.
const StepCheckBodySchema = SetWorkflowRunStepCheckInputSchema.omit({ run_id: true });

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { runId } = await context.params;
    const body = await parseJsonBody(request, StepCheckBodySchema);
    assertWorkflowRunAccess(user, await getWorkflowRun(user, runId));
    const check = await setWorkflowRunStepCheck(user, { ...body, run_id: runId });
    return createdJson({ check });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { runId } = await context.params;
    assertWorkflowRunAccess(user, await getWorkflowRun(user, runId));
    const checks = await listStepChecksForRun(user, runId);
    return NextResponse.json({ checks });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
