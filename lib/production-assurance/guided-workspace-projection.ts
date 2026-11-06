/**
 * Independent read-only oracle for the default lease page's visible stage. It reads rendered
 * facts, with its own literals, and imports no application path or stage projection. The source
 * reconciliation continues to compare every loaded lease in the complete desk table.
 */
export interface IndependentGuidedWorkspaceSnapshot {
  readonly stageLines: number;
  readonly stageText: string;
  readonly stageCurrentStep: string | null;
  readonly pathCurrentStep: string | null;
  readonly nowStep: string | null;
  readonly nextSteps: number;
  readonly nextStepText: string;
}

export function countIndependentGuidedWorkspaceMismatches(
  snapshot: IndependentGuidedWorkspaceSnapshot,
): number {
  return (
    (snapshot.stageLines === 1 && snapshot.stageText.trim() ? 0 : 1) +
    (snapshot.stageCurrentStep &&
    snapshot.stageCurrentStep === snapshot.pathCurrentStep &&
    snapshot.stageCurrentStep === snapshot.nowStep
      ? 0
      : 1) +
    (snapshot.nextSteps === 1 && /^Next step: \S/.test(snapshot.nextStepText.trim())
      ? 0
      : 1)
  );
}
