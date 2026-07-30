import { createHash } from "node:crypto";

/** The feature flag env var. Off unless explicitly set to "true". */
export const SHEET_WRITEBACK_FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";

/** True only when an Admin has explicitly enabled live Sheet write-back. Default false. */
export function isSheetWritebackEnabled(): boolean {
  return process.env[SHEET_WRITEBACK_FLAG]?.trim() === "true";
}

/** SHA-256 of the exact UTF-8 cell value, without trimming or normalization. */
export function hashSheetCellValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
