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
  readonly primaryBeforeContext: boolean;
  readonly primaryLabel: string;
  readonly primaryTarget: string | null;
  readonly primaryTargetPresent: boolean;
  readonly workFieldsOutsideNow: number;
  readonly primaryTop: number;
  readonly primaryBottom: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

export function countIndependentGuidedWorkspaceMismatches(
  snapshot: IndependentGuidedWorkspaceSnapshot,
): number {
  // R-S247-10: these are the first four steps on the ordinary and assisted paths. The canary
  // retains its own viewport; the rehearsal separately measures 1280x800 and 390x800.
  const earlyStep = [
    "check-numbers",
    "compare-market",
    "ask-owner",
    "offer-tenant",
    "assisted-program-contact",
    "assisted-owner-renewal-answer",
    "assisted-rent",
  ].includes(snapshot.nowStep ?? "");
  const primaryInView =
    Number.isFinite(snapshot.primaryTop) &&
    Number.isFinite(snapshot.primaryBottom) &&
    Number.isFinite(snapshot.viewportHeight) &&
    Number.isFinite(snapshot.viewportWidth) &&
    snapshot.viewportHeight > 0 &&
    snapshot.viewportWidth > 0 &&
    snapshot.primaryTop >= 0 &&
    snapshot.primaryBottom >= snapshot.primaryTop &&
    snapshot.primaryBottom <=
      snapshot.viewportHeight * (snapshot.viewportWidth <= 640 ? 2 : 1);
  return (
    (snapshot.stageLines === 1 && snapshot.stageText.trim() ? 0 : 1) +
    (snapshot.stageCurrentStep &&
    snapshot.stageCurrentStep === snapshot.pathCurrentStep &&
    snapshot.stageCurrentStep === snapshot.nowStep
      ? 0
      : 1) +
    (snapshot.nextSteps === 1 && /^Next step: \S/.test(snapshot.nextStepText.trim())
      ? 0
      : 1) +
    (snapshot.primaryBeforeContext ? 0 : 1) +
    (snapshot.primaryLabel.trim() !==
      "Add the owner's email on the owner record in RentVine" ||
    (snapshot.primaryTarget === "renewal-message-owner-recipients" &&
      snapshot.primaryTargetPresent)
      ? 0
      : 1) +
    (snapshot.workFieldsOutsideNow === 0 ? 0 : 1) +
    (!earlyStep || primaryInView ? 0 : 1)
  );
}
