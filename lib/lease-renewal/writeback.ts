// Phase-2 write-back safety core — MOCK / DESIGN ONLY (connector design §4.1-4.4).
//
// There is NO live Google Sheets call here and no executable write path: this module models the
// structural cell map, the approval state machine, and the re-anchor + compare-and-set +
// read-after-write mechanism against an in-memory MockSheet so the safety properties can be
// tested deterministically. The real feature stays gated behind the `Planned` registry entry, the
// §4.0 admin feature flag (off by default), per-console-user permissions, and a per-write human
// button-press. `Blocked` is always preferred over a partial or wrong write. Pure logic + an
// in-memory test double; no I/O, no external system.

export type WriteBackState =
  | "Proposed"
  | "Awaiting Approval"
  | "Approved"
  | "Writing"
  | "Verifying"
  | "Written"
  | "Returned for Revision"
  | "Blocked";

export type WriteBackEvent =
  | "submit"
  | "approve"
  | "return"
  | "block"
  | "beginWrite"
  | "verify"
  | "confirm"
  | "resubmit";

const TRANSITIONS: Record<
  WriteBackState,
  Partial<Record<WriteBackEvent, WriteBackState>>
> = {
  Proposed: { submit: "Awaiting Approval", block: "Blocked" },
  "Awaiting Approval": {
    approve: "Approved",
    return: "Returned for Revision",
    block: "Blocked",
  },
  Approved: { beginWrite: "Writing", block: "Blocked" },
  Writing: { verify: "Verifying", block: "Blocked" },
  Verifying: { confirm: "Written", block: "Blocked" },
  Written: {},
  "Returned for Revision": { resubmit: "Awaiting Approval", block: "Blocked" },
  Blocked: {},
};

/** Strict state-machine transition. Throws on an undefined transition (a programming error). */
export function transitionWriteBack(
  state: WriteBackState,
  event: WriteBackEvent,
): WriteBackState {
  const next = TRANSITIONS[state][event];
  if (!next) {
    throw new Error(`Invalid write-back transition: ${state} -(${event})-> ?`);
  }
  return next;
}

export interface WriteTarget {
  /** Tab identified by content fingerprint, not position. */
  tab_fingerprint: string;
  tab_name: string;
  tab_number: number | null;
  /** Structural locator captured at read — the row identity, re-resolved before write. */
  sheet_row_index: number;
  /** Content signature of the row's anchor columns, captured at read (drives re-anchor). */
  row_signature: string;
  column_anchor: string;
  a1_cell: string;
  /** SECONDARY compare-and-set guard, NOT the row identity. */
  expected_prior_value: string;
  new_value: string;
}

export interface WriteBackResult {
  state: Extract<WriteBackState, "Written" | "Blocked">;
  reason?: string;
  /** Preserved on Blocked for the failed-automation record; never blind-retried. */
  attempted?: { a1_cell: string; new_value: string };
}

const CREDENTIAL_TAB_NUMBERS = new Set([4, 7]);

/** Build a write target, refusing credential tabs (4 & 7) and divider/scaffold rows by construction. */
export function buildWriteTarget(input: WriteTarget): WriteTarget {
  if (input.tab_number !== null && CREDENTIAL_TAB_NUMBERS.has(input.tab_number)) {
    throw new Error(
      `Credential tab ${input.tab_number} is excluded from the cell map by construction`,
    );
  }
  if (
    /^-+$/.test(input.expected_prior_value.trim()) ||
    input.expected_prior_value.trim() === "."
  ) {
    throw new Error("Divider/scaffold rows are non-writable");
  }
  return input;
}

/** Minimal in-memory sheet double. Rows are column-keyed; a configurable signature identifies a row. */
export class MockSheet {
  rows: Record<string, string>[];
  signatureColumns: string[];
  /** When true, writeCell is a no-op — simulates a write that did not persist (read-after-write fails). */
  failWrites: boolean;

  constructor(
    rows: Record<string, string>[],
    signatureColumns: string[],
    failWrites = false,
  ) {
    this.rows = rows.map((row) => ({ ...row }));
    this.signatureColumns = signatureColumns;
    this.failWrites = failWrites;
  }

  rowSignature(index: number): string {
    const row = this.rows[index] ?? {};
    return this.signatureColumns.map((column) => row[column] ?? "").join("|");
  }

  /** Re-resolve the structural row anchor by signature. Returns the unique index, or a failure. */
  reanchor(signature: string): number | "missing" | "ambiguous" {
    const matches: number[] = [];
    for (let index = 0; index < this.rows.length; index++) {
      if (this.rowSignature(index) === signature) matches.push(index);
    }
    if (matches.length === 0) return "missing";
    if (matches.length > 1) return "ambiguous";
    return matches[0];
  }

  readCell(index: number, column: string): string {
    return this.rows[index]?.[column] ?? "";
  }

  writeCell(index: number, column: string, value: string): void {
    if (this.failWrites) return;
    if (this.rows[index]) this.rows[index][column] = value;
  }

  insertRow(index: number, row: Record<string, string>): void {
    this.rows.splice(index, 0, { ...row });
  }
}

/**
 * Execute an already-approved single-cell write-back against the mock sheet, following §4.3:
 * re-anchor by structural signature, compare-and-set on the prior value, write one cell, then
 * read-after-write. Any uncertainty returns Blocked (never a guessed or partial write).
 */
export function executeApprovedWriteBack(
  sheet: MockSheet,
  target: WriteTarget,
): WriteBackResult {
  const blocked = (reason: string): WriteBackResult => ({
    state: "Blocked",
    reason,
    attempted: { a1_cell: target.a1_cell, new_value: target.new_value },
  });

  // 1. Re-resolve the structural row anchor immediately before write (rows can shift).
  const anchored = sheet.reanchor(target.row_signature);
  if (anchored === "missing") return blocked("row changed since approval");
  if (anchored === "ambiguous") return blocked("row anchor no longer resolves uniquely");

  // 2. Pre-write compare-and-set on the secondary guard.
  if (sheet.readCell(anchored, target.column_anchor) !== target.expected_prior_value) {
    return blocked("prior value mismatch (compare-and-set)");
  }

  // 3. Write the single cell deterministically.
  sheet.writeCell(anchored, target.column_anchor, target.new_value);

  // 4. Read-after-write verification.
  if (sheet.readCell(anchored, target.column_anchor) !== target.new_value) {
    return blocked("read-after-write mismatch");
  }

  return { state: "Written" };
}
