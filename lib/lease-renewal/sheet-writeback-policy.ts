import { createHash } from "node:crypto";

/** The feature flag env var. Off unless explicitly set to "true". */
export const SHEET_WRITEBACK_FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";

/** True only when an Admin has explicitly enabled live Sheet write-back. Default false. */
export function isSheetWritebackEnabled(): boolean {
  return process.env[SHEET_WRITEBACK_FLAG]?.trim() === "true";
}

/**
 * S128 (F08): operating-Sheet mutations are paused by explicit owner policy whenever the reviewed
 * write switch is not enabled. This is the same server-owned flag used at every mutation entry point;
 * it is the proactive read the UI shows so an operator sees the pause before attempting a write. It
 * never affects reads, source comparisons, app-owned saves, or read-only receipt reconciliation.
 */
export function isOperatingSheetWritebackPaused(): boolean {
  return !isSheetWritebackEnabled();
}

/** SHA-256 of the exact UTF-8 cell value, without trimming or normalization. */
export function hashSheetCellValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
