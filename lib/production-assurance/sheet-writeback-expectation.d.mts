export type SheetWritebackValue = "true" | "false";
export type SheetWritebackRole =
  | "candidate"
  | "promoted"
  | "predecessor"
  | "recovery_target";
export interface SheetWritebackEvidence {
  /** The captured predecessor's actual value; required for predecessor and recovery_target. */
  readonly predecessorActual?: string | null;
}
export const SHEET_WRITEBACK_FLAG: "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";
export const REVIEWED_CANDIDATE_SHEET_WRITEBACK: SheetWritebackValue;
export const SHEET_WRITEBACK_ROLES: readonly SheetWritebackRole[];
export function isExactSheetWritebackValue(value: unknown): value is SheetWritebackValue;
export function expectedSheetWriteback(
  role: SheetWritebackRole,
  evidence?: SheetWritebackEvidence,
): SheetWritebackValue;
export function readRevisionSheetWriteback(revision: unknown): SheetWritebackValue | null;
export function revisionCarriesSheetWriteback(
  revision: unknown,
  expected: unknown,
): boolean;
