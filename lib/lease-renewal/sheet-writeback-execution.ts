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

import { createHash } from "node:crypto";

import type {
  SheetsAnchoredMutationResult,
  SheetsAnchoredMutationWriter,
} from "@/lib/google-sheets/write-client";
import {
  hashSheetCellValue,
  isSheetWritebackEnabled,
} from "@/lib/lease-renewal/sheet-writeback-policy";

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
  idempotencyKey?: string;
  payloadHash?: string;
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
  writer: SheetsAnchoredMutationWriter,
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

  // 6. Atomically bind the unique logical row, exact A1, and empty value before writing.
  const a1 = `${plan.tabName}!${columnLetter(proposedColIndex)}${rowIndex + 1}`;
  const anchorHeaders = sheetRowAnchorHeaders(header, proposedColIndex);
  if (!anchorHeaders) return blocked("the row anchor headers are missing or duplicated");
  if (!writer.mutateAnchoredCellIfMatch) {
    return blocked("the Sheets writer has no stable-row atomic mutation capability");
  }
  if (
    !/^(?:sheet_write|sheet_correction)_[a-f0-9]{48}$/.test(plan.idempotencyKey ?? "") ||
    !/^[a-f0-9]{64}$/.test(plan.payloadHash ?? "")
  ) {
    return blocked("the provider idempotency identity is missing or invalid");
  }
  const mutation = await writer.mutateAnchoredCellIfMatch({
    idempotencyKey: plan.idempotencyKey!,
    payloadHash: plan.payloadHash!,
    target: {
      spreadsheetId: plan.spreadsheetId,
      tabName: plan.tabName,
      a1,
      rowIndex,
      proposedColumnHeader: plan.proposedColumnHeader,
      anchorHeaders,
      rowAnchorHash: hashSheetRowAnchor(anchorHeaders, header, grid[rowIndex] ?? []),
      anchorColumnCount: header.length,
    },
    expectedValue: "",
    replacementValue: plan.proposedValue,
  });
  if (mutation.status === "mismatch") {
    return blocked(mutation.reason);
  }

  // 7. Read-after-write verification.
  const check = await writer.getValues(plan.spreadsheetId, mutation.a1);
  if ((check[0]?.[0] ?? "") !== plan.proposedValue) {
    return blocked("read-after-write mismatch");
  }

  return { status: "written", a1: mutation.a1 };
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
  /** Canonical address-derived property identity; name-only rows are not eligible for live write. */
  propertyKey: string;
  fieldKey: string;
  /** Header of the append-only KB-Proposed column (must already exist on the sheet). */
  proposedColumnHeader: string;
  /** 0-based raw-grid index of the target data row (the pipeline's sourceRowIndex). */
  rowIndex: number;
  proposedValue: string;
  /** Required only by the legacy direct-mutation helpers; route service supplies its own record. */
  idempotencyKey?: string;
  payloadHash?: string;
}

export interface ResolvedWritebackTarget {
  a1: string;
  proposedColumnHeader: string;
  proposedValue: string;
  /** The resolved row's current cell values, so a human can verify it is the right lease before writing. */
  rowValues: string[];
  /**
   * Bodyless identity for the resolved row's named, non-target cells. Header/value pairs are sorted
   * before hashing, so a structural row/blank-column move can be re-anchored without storing row data.
   */
  anchorHeaders: string[];
  rowAnchorHash: string;
  /** Header width at preview time; used to distinguish an unchanged coordinate from a moved one. */
  anchorColumnCount: number;
}

export type ResolveTargetOutcome =
  | { status: "disabled" }
  | { status: "resolved"; target: ResolvedWritebackTarget }
  | { status: "blocked"; reason: string };

/**
 * Find the one canonical row + column holding the target header. A matching value anywhere else in
 * the grid makes the schema ambiguous; choosing the first occurrence could redirect an approved
 * write into an arbitrary operational column.
 */
function locateColumn(
  grid: string[][],
  header: string,
): { headerRowIndex: number; colIndex: number } | null {
  const matches: { headerRowIndex: number; colIndex: number }[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let colIndex = 0; colIndex < (grid[row] ?? []).length; colIndex += 1) {
      if (grid[row]?.[colIndex] === header) {
        matches.push({ headerRowIndex: row, colIndex });
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Read-only: resolve the exact cell a write would target, WITHOUT writing. Returns the A1 target, the
 * value, and the whole resolved row so the operator can confirm it is the right lease. Blocks (no write
 * possible) when the KB-Proposed column is absent, the row is outside the sheet, or the cell is already
 * filled (append-only never overwrites). Disabled when the feature flag is off.
 */
export async function resolveWritebackTarget(
  writer: SheetsAnchoredMutationWriter,
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
  const header = grid[headerRowIndex] ?? [];
  if (header.filter((cell) => cell === plan.proposedColumnHeader).length !== 1) {
    return blocked("the KB-Proposed column header does not resolve uniquely");
  }
  if (plan.rowIndex <= headerRowIndex || plan.rowIndex >= grid.length) {
    return blocked("the target row is outside the sheet");
  }
  const rowValues = grid[plan.rowIndex] ?? [];
  if ((rowValues[colIndex] ?? "").trim() !== "") {
    return blocked("the KB-Proposed cell already has a value; not overwriting");
  }
  const anchorHeaders = sheetRowAnchorHeaders(header, colIndex);
  if (!anchorHeaders) {
    return blocked("the row anchor headers are missing or duplicated");
  }
  const anchorColumnCount = header.length;
  const rowAnchorHash = hashSheetRowAnchor(anchorHeaders, header, rowValues);
  const matches = findRowAnchorMatches(
    grid,
    headerRowIndex,
    header,
    anchorHeaders,
    rowAnchorHash,
  );
  if (matches.length !== 1 || matches[0] !== plan.rowIndex) {
    return blocked("the target row identity does not resolve uniquely");
  }
  return {
    status: "resolved",
    target: {
      a1: `${plan.tabName}!${columnLetter(colIndex)}${plan.rowIndex + 1}`,
      proposedColumnHeader: plan.proposedColumnHeader,
      proposedValue: plan.proposedValue,
      rowValues,
      anchorHeaders,
      rowAnchorHash,
      anchorColumnCount,
    },
  };
}

export interface AnchoredSheetWritebackTarget {
  tabName: string;
  a1: string;
  rowIndex: number;
  proposedColumnHeader: string;
  anchorHeaders: string[];
  rowAnchorHash: string;
  anchorColumnCount: number;
}

export type InspectAnchoredWritebackTargetOutcome =
  | {
      status: "resolved";
      currentValue: string;
      a1: string;
      rowIndex: number;
      anchorColumnCount: number;
    }
  | {
      status: "moved";
      currentValue: string;
      a1: string;
      rowIndex: number;
      anchorColumnCount: number;
    }
  | {
      status: "blocked";
      reason: string;
    };

/**
 * Re-read and verify that an A1 coordinate still names the same row/header identity resolved at
 * preview time. A1 alone is not a stable identity when collaborators can insert rows or columns.
 */
export async function inspectAnchoredWritebackTarget(
  writer: SheetsAnchoredMutationWriter,
  spreadsheetId: string,
  target: AnchoredSheetWritebackTarget,
): Promise<InspectAnchoredWritebackTargetOutcome> {
  const blocked = (reason: string): InspectAnchoredWritebackTargetOutcome => ({
    status: "blocked",
    reason,
  });
  const grid = await writer.getValues(spreadsheetId, target.tabName);
  const located = locateColumn(grid, target.proposedColumnHeader);
  if (!located) return blocked("the receipted column is no longer present");
  const { headerRowIndex, colIndex } = located;
  const header = grid[headerRowIndex] ?? [];
  if (header.filter((cell) => cell === target.proposedColumnHeader).length !== 1) {
    return blocked("the receipted column header no longer resolves uniquely");
  }
  if (
    target.anchorHeaders.length === 0 ||
    target.anchorHeaders.includes(target.proposedColumnHeader) ||
    target.anchorHeaders.some(
      (anchorHeader, index) =>
        anchorHeader === "" ||
        target.anchorHeaders.indexOf(anchorHeader) !== index ||
        header.filter((cell) => cell === anchorHeader).length !== 1,
    )
  ) {
    return blocked("the receipted row anchor schema changed");
  }
  const matches = findRowAnchorMatches(
    grid,
    headerRowIndex,
    header,
    target.anchorHeaders,
    target.rowAnchorHash,
  );
  if (matches.length === 0) {
    return blocked("the receipted row identity is no longer present");
  }
  if (matches.length > 1) {
    return {
      status: "blocked",
      reason: "the receipted row identity no longer resolves uniquely",
    };
  }
  const rowIndex = matches[0];
  const a1 = `${target.tabName}!${columnLetter(colIndex)}${rowIndex + 1}`;
  const result = {
    currentValue: grid[rowIndex]?.[colIndex] ?? "",
    a1,
    rowIndex,
    anchorColumnCount: header.length,
  };
  return a1 === target.a1 &&
    rowIndex === target.rowIndex &&
    header.length === target.anchorColumnCount
    ? { status: "resolved", ...result }
    : { status: "moved", ...result };
}

/**
 * Return the sorted, unique, named non-target headers that define a bodyless row anchor.
 */
export function sheetRowAnchorHeaders(
  headerValues: string[],
  targetColumnIndex: number,
): string[] | null {
  if (
    !Number.isInteger(targetColumnIndex) ||
    targetColumnIndex < 0 ||
    targetColumnIndex >= headerValues.length
  ) {
    return null;
  }
  const anchorHeaders = headerValues
    .filter((header, index) => index !== targetColumnIndex && header !== "")
    .sort();
  return anchorHeaders.length > 0 && new Set(anchorHeaders).size === anchorHeaders.length
    ? anchorHeaders
    : null;
}

/**
 * SHA-256 over exact named header/value pairs with the mutable target deliberately excluded.
 * Persisted anchor headers make the hash independent of column order and ignore newly added columns.
 */
export function hashSheetRowAnchor(
  anchorHeaders: string[],
  headerValues: string[],
  rowValues: string[],
): string {
  const anchor = anchorHeaders.map((header): [string, string] => {
    const matches = headerValues.reduce<number[]>(
      (indices, candidate, index) =>
        candidate === header ? [...indices, index] : indices,
      [],
    );
    if (header === "" || matches.length !== 1) {
      throw new Error("Invalid Sheet row anchor schema.");
    }
    return [header, rowValues[matches[0]] ?? ""];
  });
  return createHash("sha256").update(JSON.stringify(anchor), "utf8").digest("hex");
}

function findRowAnchorMatches(
  grid: string[][],
  headerRowIndex: number,
  header: string[],
  anchorHeaders: string[],
  rowAnchorHash: string,
): number[] {
  const matches: number[] = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < grid.length; rowIndex += 1) {
    if (
      hashSheetRowAnchor(anchorHeaders, header, grid[rowIndex] ?? []) === rowAnchorHash
    ) {
      matches.push(rowIndex);
    }
  }
  return matches;
}

/**
 * Perform the guarded single-cell append to the resolved row, then read it back. Re-resolves the target
 * immediately before writing (so a cell filled since the preview blocks), writes once, and verifies with
 * a read-after-write. Flag-gated; any uncertainty returns "blocked". Never overwrites an existing value.
 */
export async function commitWritebackAtRow(
  writer: SheetsAnchoredMutationWriter,
  plan: RowWritebackPlan,
): Promise<SheetWritebackOutcome> {
  const resolved = await resolveWritebackTarget(writer, plan);
  if (resolved.status === "disabled") return { status: "disabled" };
  if (resolved.status === "blocked")
    return { status: "blocked", reason: resolved.reason };

  const { a1 } = resolved.target;
  if (!writer.mutateAnchoredCellIfMatch) {
    return {
      status: "blocked",
      reason: "the Sheets writer has no stable-row atomic mutation capability",
    };
  }
  if (
    !/^(?:sheet_write|sheet_correction)_[a-f0-9]{48}$/.test(plan.idempotencyKey ?? "") ||
    !/^[a-f0-9]{64}$/.test(plan.payloadHash ?? "")
  ) {
    return {
      status: "blocked",
      reason: "the provider idempotency identity is missing or invalid",
    };
  }
  const mutation = await writer.mutateAnchoredCellIfMatch({
    idempotencyKey: plan.idempotencyKey!,
    payloadHash: plan.payloadHash!,
    target: {
      spreadsheetId: plan.spreadsheetId,
      tabName: plan.tabName,
      a1,
      rowIndex: plan.rowIndex,
      proposedColumnHeader: plan.proposedColumnHeader,
      anchorHeaders: resolved.target.anchorHeaders,
      rowAnchorHash: resolved.target.rowAnchorHash,
      anchorColumnCount: resolved.target.anchorColumnCount,
    },
    expectedValue: "",
    replacementValue: plan.proposedValue,
  });
  if (mutation.status === "mismatch") {
    return {
      status: "blocked",
      reason: mutation.reason,
    };
  }
  const check = await inspectAnchoredWritebackTarget(writer, plan.spreadsheetId, {
    tabName: plan.tabName,
    a1,
    rowIndex: plan.rowIndex,
    proposedColumnHeader: plan.proposedColumnHeader,
    anchorHeaders: resolved.target.anchorHeaders,
    rowAnchorHash: resolved.target.rowAnchorHash,
    anchorColumnCount: resolved.target.anchorColumnCount,
  });
  if (check.status === "blocked" || check.currentValue !== plan.proposedValue) {
    return {
      status: "blocked",
      reason:
        check.status === "blocked"
          ? `target identity changed after write: ${check.reason}`
          : "read-after-write mismatch",
    };
  }
  return { status: "written", a1: check.a1 };
}

export interface ExactCellWritebackCorrectionPlan {
  idempotencyKey: string;
  payloadHash: string;
  expectedEffectId: string;
  spreadsheetId: string;
  /** Exact provider cell reference captured by the successful write receipt. */
  a1: string;
  tabName: string;
  rowIndex: number;
  proposedColumnHeader: string;
  anchorHeaders: string[];
  rowAnchorHash: string;
  anchorColumnCount: number;
  /** SHA-256 of the exact value written by that receipt; the plaintext value is not persisted here. */
  expectedValueHash: string;
}

export type SheetWritebackCorrectionOutcome =
  | { status: "disabled" }
  | {
      status: "corrected";
      providerEffect: Extract<SheetsAnchoredMutationResult, { status: "applied" }>;
      readbackWarning?: string;
    }
  | { status: "blocked"; reason: string };

/**
 * Clear only the exact cell/value proven by a successful write receipt. The feature flag is checked
 * before any provider call. A changed or already-empty cell blocks without clearing; a successful
 * clear is an atomic exact-value find/replace and is then read back. A transport error propagates so
 * the service can mark the one attempt ambiguous and reconcile it without blind retry.
 */
export async function correctWritebackAtExactCell(
  writer: SheetsAnchoredMutationWriter,
  plan: ExactCellWritebackCorrectionPlan,
): Promise<SheetWritebackCorrectionOutcome> {
  if (!isSheetWritebackEnabled()) return { status: "disabled" };

  const blocked = (reason: string): SheetWritebackCorrectionOutcome => ({
    status: "blocked",
    reason,
  });
  const a1 = plan.a1.trim();
  const separator = a1.lastIndexOf("!");
  const exactCell = separator > 0 ? a1.slice(separator + 1) : "";
  if (a1 !== plan.a1 || !/^[A-Z]+[1-9]\d*$/.test(exactCell)) {
    return blocked("the correction target is not one exact A1 cell");
  }
  const expectedValueHash = plan.expectedValueHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedValueHash)) {
    return blocked("the correction receipt has an invalid value hash");
  }
  if (!writer.mutateAnchoredCellIfMatch) {
    return blocked("the Sheets writer has no stable-row atomic mutation capability");
  }
  if (
    !/^(?:sheet_write|sheet_correction)_[a-f0-9]{48}$/.test(plan.idempotencyKey) ||
    !/^[a-f0-9]{64}$/.test(plan.payloadHash) ||
    !/^[A-Za-z0-9._:-]{1,200}$/.test(plan.expectedEffectId)
  ) {
    return blocked("the correction provider identity is invalid");
  }

  const anchored = await inspectAnchoredWritebackTarget(writer, plan.spreadsheetId, {
    tabName: plan.tabName,
    a1,
    rowIndex: plan.rowIndex,
    proposedColumnHeader: plan.proposedColumnHeader,
    anchorHeaders: plan.anchorHeaders,
    rowAnchorHash: plan.rowAnchorHash,
    anchorColumnCount: plan.anchorColumnCount,
  });
  if (anchored.status !== "resolved") {
    return blocked(
      anchored.status === "moved"
        ? "the correction target identity moved after preview"
        : `the correction target identity changed: ${anchored.reason}`,
    );
  }
  const current = anchored.currentValue;
  if (current === "") {
    return blocked("the correction target is already empty");
  }
  if (hashSheetCellValue(current) !== expectedValueHash) {
    return blocked("the correction target changed after the write receipt");
  }

  const mutation = await writer.mutateAnchoredCellIfMatch({
    idempotencyKey: plan.idempotencyKey,
    payloadHash: plan.payloadHash,
    target: {
      spreadsheetId: plan.spreadsheetId,
      tabName: plan.tabName,
      a1,
      rowIndex: plan.rowIndex,
      proposedColumnHeader: plan.proposedColumnHeader,
      anchorHeaders: plan.anchorHeaders,
      rowAnchorHash: plan.rowAnchorHash,
      anchorColumnCount: plan.anchorColumnCount,
    },
    expectedValue: current,
    replacementValue: "",
    expectedEffectId: plan.expectedEffectId,
  });
  if (mutation.status === "mismatch") {
    return blocked(mutation.reason);
  }
  let readbackWarning: string | undefined;
  try {
    const check = await inspectAnchoredWritebackTarget(writer, plan.spreadsheetId, {
      tabName: plan.tabName,
      a1,
      rowIndex: plan.rowIndex,
      proposedColumnHeader: plan.proposedColumnHeader,
      anchorHeaders: plan.anchorHeaders,
      rowAnchorHash: plan.rowAnchorHash,
      anchorColumnCount: plan.anchorColumnCount,
    });
    if (check.status === "blocked") {
      readbackWarning = `The provider applied the correction, but current Sheet structure differs (${check.reason}).`;
    } else if (check.a1 !== mutation.a1) {
      readbackWarning =
        "The provider applied the correction, but the logical row has since moved to a different Sheet coordinate.";
    } else if (check.currentValue !== "") {
      readbackWarning =
        "The provider applied the correction, but the current Sheet value has since drifted.";
    }
  } catch {
    readbackWarning =
      "The provider applied the correction; current Sheet corroboration is temporarily unavailable.";
  }
  return {
    status: "corrected",
    providerEffect: mutation,
    ...(readbackWarning ? { readbackWarning } : {}),
  };
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
