// The Next Action a workflow run shows. A run stores its first step's title when it starts and that
// stored value never changes as steps are checked or the run closes, so it is only a fallback: a
// closed run has no next action, and an open run with its checklist names its first open step.
// Pure and client-safe; it reads no record and changes nothing.
import type {
  ProcessDefinitionStep,
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowRunStepCheckRecord,
} from "@/lib/firestore/types";

const CLOSED_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>([
  "Completed",
  "Cancelled",
  "Failed",
]);

/** What a closed run shows as its Next Action. */
export const WORKFLOW_RUN_NO_NEXT_ACTION = "None";

/** What an open run shows once every step is Checked or Skipped. */
export const WORKFLOW_RUN_COMPLETE_NEXT_ACTION = "Complete the run";

export function isClosedWorkflowRun(status: WorkflowRunStatus): boolean {
  return CLOSED_RUN_STATUSES.has(status);
}

export interface WorkflowRunChecklist {
  readonly steps: readonly Pick<ProcessDefinitionStep, "id" | "title">[];
  readonly checks: readonly Pick<WorkflowRunStepCheckRecord, "step_id" | "status">[];
}

/**
 * The run's current Next Action: None for a closed run; otherwise the first step that is not
 * Checked or Skipped, or Complete the run when every step is. Without the checklist, an open run
 * keeps the value it stored at start.
 */
export function workflowRunNextAction(
  run: Pick<WorkflowRunRecord, "status" | "next_action">,
  checklist?: WorkflowRunChecklist,
): string {
  if (isClosedWorkflowRun(run.status)) return WORKFLOW_RUN_NO_NEXT_ACTION;
  if (!checklist || checklist.steps.length === 0) return run.next_action;
  const statusByStep = new Map(
    checklist.checks.map((check) => [check.step_id, check.status]),
  );
  const open = checklist.steps.find((step) => {
    const status = statusByStep.get(step.id);
    return status !== "Checked" && status !== "Skipped";
  });
  return open ? open.title : WORKFLOW_RUN_COMPLETE_NEXT_ACTION;
}
