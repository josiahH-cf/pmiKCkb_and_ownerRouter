export interface PredecessorExceptionEvidence {
  readonly code: "owner-approved-blocked-legacy-my-work-reconcile-2026-09-10";
  readonly blockedAttempts: 1;
  readonly matchedRequestFailures: 1;
  readonly matchedConsoleErrors: 1;
  readonly dispatchedWrites: 0;
}
export const APPROVED_PREDECESSOR: Readonly<{
  browserPolicy: "owner-admin-2026-09-10";
  canonicalOrigin: string;
  expectedCommit: string;
  expectedRevision: string;
}>;
export const PREDECESSOR_EXCEPTION: PredecessorExceptionEvidence;
export function isApprovedPredecessor(context: object): boolean;
export function isExactPredecessorException(
  evidence: unknown,
): evidence is PredecessorExceptionEvidence;
export function acceptsPredecessorException(baseline: object): boolean;
