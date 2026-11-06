// Types for ledger-check.mjs. The ledger is checked data, so its fields are typed loosely enough
// for a test to falsify any of them; the check itself reports every problem it finds.

export interface LedgerEvidence {
  journey?: string;
  phase?: string;
  check?: string;
  test?: string;
}

export interface LedgerResult {
  state: string;
  reason?: string;
  evidence?: LedgerEvidence[];
}

export interface LedgerRow {
  id: string;
  kind: string;
  observed?: string;
  reported?: string;
  check?: string;
  checkResult?: string;
  owners: string[];
  result: LedgerResult | null;
}

export interface LedgerMatrixRow {
  row: string;
  model: string;
  human: string;
}

export interface DefectLedger {
  suite: string;
  description?: string;
  journey?: { driver: string; command: string; evidence: string };
  humanVerdict: string;
  staffSession: unknown;
  nextStaffSession?: string;
  firstFullCase: { state: string; reason?: string; caseSheetOutsideGit?: boolean };
  approvalHandoff: { state: string; reason?: string; answeredBy?: string | null };
  budgets: { id: string; budget: string }[];
  rows: LedgerRow[];
  matrix: LedgerMatrixRow[];
}

/** A parsed journey.json, as far as the check reads it. */
export interface LedgerJourneyResult {
  runId?: string;
  budgets?: { id: string; passed: boolean }[];
  checks?: { id: string; name?: string; passed: boolean }[];
}

export const LEDGER_PATH: string;
export const SPEC_PATH: string;
export const JOURNEY_DRIVER: string;
export const HUMAN_NOT_RUN: string;
export const OUTSIDE_ITEMS: { observed: string; owners: string[] }[];
export const PHASE_DRIVERS: Record<string, string>;

export function specRows(root?: string): {
  november4: { observed: string; owners: string[] }[];
  reported: { reported: string; check: string; owners: string[] }[];
};
export function definedIds(root?: string): {
  requirements: Set<string>;
  suites: Set<string>;
};
export function journeyStepIds(root?: string): Set<string>;
export function checkDefectLedger(
  ledger: DefectLedger,
  options?: { root?: string; journey?: LedgerJourneyResult | null },
): string[];
export function readDefectLedger(root?: string): DefectLedger;
