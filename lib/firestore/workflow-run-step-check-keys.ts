export const WORKFLOW_RUN_STEP_CHECK_COLLECTIONS = {
  checks: "workflow_run_step_checks",
  activity: "workflow_run_step_check_activity",
} as const;

/** Deterministic, Firestore-safe document id derived from (run_id, step_id). */
export function stepCheckDocId(runId: string, stepId: string): string {
  return `${runId}:${stepId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}
