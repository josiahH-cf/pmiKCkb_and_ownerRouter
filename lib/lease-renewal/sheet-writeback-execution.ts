// LIVE append-only Sheet write-back executor (Phase C) — the real write behind Q-WRITEBACK-METHOD (a).
//
// This is the ONLY module that actually writes a value into the team's operational renewal sheet, and it
// is deliberately conservative:
//   • DEFAULT OFF. `isSheetWritebackEnabled()` reads a feature flag that is off unless an admin sets it,
//     so deploying this code writes nothing until the owner turns it on (after granting the DWD write
//     scope). A disabled call returns { status: "disabled" } and never touches the sheet.
//   • APPEND-ONLY into a NEW, human-prepared "KB Proposed — <field>" column. It refuses to write unless
//     that column already exists AND the target cell is EMPTY, so it can never overwrite the team's data.
//   • RE-ANCHOR + COMPARE-AND-SET + READ-AFTER-WRITE. It locates the row by a content signature (not a
//     position), writes only when the row resolves UNIQUELY and the cell is empty, then reads the cell
//     back. Any uncertainty (column missing, row missing/ambiguous, cell non-empty, read-after-write
//     mismatch) returns "blocked" — a wrong or partial write is never preferred over blocking.
//   • PII-safe: it never logs a cell value; the outcome carries only the A1 target and a reason category.
//
// Pure over the injected SheetsValuesWriter (a fake in tests; the live GoogleSheetsApiWriter in prod).

import type { SheetsValuesWriter } from "@/lib/google-sheets/write-client";

/** The feature flag env var. Off unless explicitly set to "true". */
export const SHEET_WRITEBACK_FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";

/** True only when an admin has explicitly enabled the live Sheet write-back. Default false. */
export function isSheetWritebackEnabled(): boolean {
  return process.env[SHEET_WRITEBACK_FLAG]?.trim() === "true";
}

export interface SheetWritebackPlan {
  spreadsheetId: string;
  /** The tab to write into (its title; used verbatim in the A1 range). */
  tabName: string;
  /** Header of the append-only KB-Proposed column. MUST already exist on the sheet. */
  proposedColumnHeader: string;
  /** Headers whose joined row values identify the target row uniquely (the re-anchor signature). */
  signatureColumns: string[];
  /** Expected joined signature of the target row, captured when the proposal was made. */
  rowSignature: string;
  /** The value to append. Must be non-empty (a value is never invented upstream). */
  proposedValue: string;
}

export type SheetWritebackOutcome =
  | { status: "disabled" }
  | { status: "written"; a1: string }
  | { status: "blocked"; reason: string };

const SIGNATURE_DELIMITER = "|";

/**
 * Execute one approved append-only write-back against the live sheet, honoring every guard above.
 * Returns "disabled" when the flag is off (no read, no write), "written" with the A1 target on success,
 * or "blocked" with a reason category on any uncertainty. Never throws for an anchoring problem; a thrown
 * transport error propagates to the caller (which records it as a blocked outcome without a cell value).
 */
export async function executeProposalWriteBack(
  writer: SheetsValuesWriter,
  plan: SheetWritebackPlan,
): Promise<SheetWritebackOutcome> {
  if (!isSheetWritebackEnabled()) return { status: "disabled" };

  const blocked = (reason: string): SheetWritebackOutcome => ({
    status: "blocked",
    reason,
  });

  if (plan.proposedValue.trim() === "") return blocked("no value to append");
  if (plan.signatureColumns.length === 0) return blocked("no signature columns");

  // 1. Load the tab. Row 0 is the header row.
  const grid = await writer.getValues(plan.spreadsheetId, plan.tabName);
  if (grid.length < 2) return blocked("sheet has no data rows");
  const header = grid[0] ?? [];

  // 2. Locate the append-only KB-Proposed column. It must already exist (created once by a human).
  const proposedColIndex = header.findIndex((cell) => cell === plan.proposedColumnHeader);
  if (proposedColIndex === -1) {
    return blocked(
      `the "${plan.proposedColumnHeader}" column was not found on the sheet`,
    );
  }

  // 3. Resolve the signature column indices.
  const signatureIndices = plan.signatureColumns.map((name) => header.indexOf(name));
  if (signatureIndices.some((index) => index === -1)) {
    return blocked("a row-signature column was not found on the sheet");
  }

  // 4. Re-anchor the row by content signature. It must resolve to EXACTLY one data row.
  const matches: number[] = [];
  for (let row = 1; row < grid.length; row++) {
    const signature = signatureIndices
      .map((index) => grid[row]?.[index] ?? "")
      .join(SIGNATURE_DELIMITER);
    if (signature === plan.rowSignature) matches.push(row);
  }
  if (matches.length === 0)
    return blocked("the row changed since the proposal (not found)");
  if (matches.length > 1) return blocked("the row anchor no longer resolves uniquely");
  const rowIndex = matches[0];

  // 5. Append-only compare-and-set: the KB-Proposed cell MUST currently be empty.
  const currentValue = grid[rowIndex]?.[proposedColIndex] ?? "";
  if (currentValue.trim() !== "") {
    return blocked("the KB-Proposed cell already has a value; not overwriting");
  }

  // 6. Write the single cell (A1 is 1-based; the header row makes the data row rowIndex + 1).
  const a1 = `${plan.tabName}!${columnLetter(proposedColIndex)}${rowIndex + 1}`;
  await writer.updateValues(plan.spreadsheetId, a1, [[plan.proposedValue]]);

  // 7. Read-after-write verification.
  const check = await writer.getValues(plan.spreadsheetId, a1);
  if ((check[0]?.[0] ?? "") !== plan.proposedValue) {
    return blocked("read-after-write mismatch");
  }

  return { status: "written", a1 };
}

// ── Row-anchored path (used by the live confirm-target write) ─────────────────────────────────────────
//
// The reconciliation pipeline already stamps each flag with the exact sheet row it read (recordRef
// .sourceRowIndex), so the live write does not guess a row: it writes to THAT row's KB-Proposed cell.
// resolveWritebackTarget is read-only (it powers the human "confirm the target" preview);
// commitWritebackAtRow performs the guarded single-cell append. Both are flag-gated (default off).

export interface RowWritebackPlan {
  spreadsheetId: string;
  tabName: string;
  /** Header of the append-only KB-Proposed column (must already exist on the sheet). */
  proposedColumnHeader: string;
  /** 0-based raw-grid index of the target data row (the pipeline's sourceRowIndex). */
  rowIndex: number;
  proposedValue: string;
}

export interface ResolvedWritebackTarget {
  a1: string;
  proposedColumnHeader: string;
  proposedValue: string;
  /** The resolved row's current cell values, so a human can verify it is the right lease before writing. */
  rowValues: string[];
}

export type ResolveTargetOutcome =
  | { status: "disabled" }
  | { status: "resolved"; target: ResolvedWritebackTarget }
  | { status: "blocked"; reason: string };

/** Find the (first) row + column holding the given header. Returns null when the header is absent. */
function locateColumn(
  grid: string[][],
  header: string,
): { headerRowIndex: number; colIndex: number } | null {
  for (let row = 0; row < grid.length; row++) {
    const colIndex = (grid[row] ?? []).indexOf(header);
    if (colIndex !== -1) return { headerRowIndex: row, colIndex };
  }
  return null;
}

/**
 * Read-only: resolve the exact cell a write would target, WITHOUT writing. Returns the A1 target, the
 * value, and the whole resolved row so the operator can confirm it is the right lease. Blocks (no write
 * possible) when the KB-Proposed column is absent, the row is outside the sheet, or the cell is already
 * filled (append-only never overwrites). Disabled when the feature flag is off.
 */
export async function resolveWritebackTarget(
  writer: SheetsValuesWriter,
  plan: RowWritebackPlan,
): Promise<ResolveTargetOutcome> {
  if (!isSheetWritebackEnabled()) return { status: "disabled" };
  const blocked = (reason: string): ResolveTargetOutcome => ({
    status: "blocked",
    reason,
  });
  if (plan.proposedValue.trim() === "") return blocked("no value to append");

  const grid = await writer.getValues(plan.spreadsheetId, plan.tabName);
  const located = locateColumn(grid, plan.proposedColumnHeader);
  if (!located) {
    return blocked(
      `the "${plan.proposedColumnHeader}" column was not found on the sheet`,
    );
  }
  const { headerRowIndex, colIndex } = located;
  if (plan.rowIndex <= headerRowIndex || plan.rowIndex >= grid.length) {
    return blocked("the target row is outside the sheet");
  }
  const rowValues = grid[plan.rowIndex] ?? [];
  if ((rowValues[colIndex] ?? "").trim() !== "") {
    return blocked("the KB-Proposed cell already has a value; not overwriting");
  }
  return {
    status: "resolved",
    target: {
      a1: `${plan.tabName}!${columnLetter(colIndex)}${plan.rowIndex + 1}`,
      proposedColumnHeader: plan.proposedColumnHeader,
      proposedValue: plan.proposedValue,
      rowValues,
    },
  };
}

/**
 * Perform the guarded single-cell append to the resolved row, then read it back. Re-resolves the target
 * immediately before writing (so a cell filled since the preview blocks), writes once, and verifies with
 * a read-after-write. Flag-gated; any uncertainty returns "blocked". Never overwrites an existing value.
 */
export async function commitWritebackAtRow(
  writer: SheetsValuesWriter,
  plan: RowWritebackPlan,
): Promise<SheetWritebackOutcome> {
  const resolved = await resolveWritebackTarget(writer, plan);
  if (resolved.status === "disabled") return { status: "disabled" };
  if (resolved.status === "blocked")
    return { status: "blocked", reason: resolved.reason };

  const { a1 } = resolved.target;
  await writer.updateValues(plan.spreadsheetId, a1, [[plan.proposedValue]]);
  const check = await writer.getValues(plan.spreadsheetId, a1);
  if ((check[0]?.[0] ?? "") !== plan.proposedValue) {
    return { status: "blocked", reason: "read-after-write mismatch" };
  }
  return { status: "written", a1 };
}

/** 0-based column index → A1 column letters (0 → A, 25 → Z, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}
