import type { SheetsValuesWriter } from "@/lib/google-sheets/write-client";

export const OPERATING_SHEET_ENV = "RENEWAL_SHEET_ID";
export const REHEARSAL_SHEET_ENV = "RENEWAL_REHEARSAL_SHEET_ID";

type EnvLike = Record<string, string | undefined>;

export interface RenewalSheetLink {
  configured: boolean;
  spreadsheetId?: string;
  url?: string;
}

export interface RenewalSheetBindings {
  operating: RenewalSheetLink;
  rehearsal:
    | { status: "not_configured"; configured: false }
    | { status: "same_as_operating"; configured: false }
    | { status: "ready"; configured: true; spreadsheetId: string; url: string };
}

function sheetLink(spreadsheetId: string | undefined): RenewalSheetLink {
  const id = spreadsheetId?.trim();
  if (!id) return { configured: false };
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { configured: false };
  return {
    configured: true,
    spreadsheetId: id,
    url: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`,
  };
}

/** Resolve separate operating and rehearsal bindings. The rehearsal alias fails closed. */
export function resolveRenewalSheetBindings(
  env: EnvLike = process.env,
): RenewalSheetBindings {
  const operating = sheetLink(env[OPERATING_SHEET_ENV]);
  const rehearsal = sheetLink(env[REHEARSAL_SHEET_ENV]);
  if (!rehearsal.configured) {
    return { operating, rehearsal: { status: "not_configured", configured: false } };
  }
  if (operating.configured && rehearsal.spreadsheetId === operating.spreadsheetId) {
    return { operating, rehearsal: { status: "same_as_operating", configured: false } };
  }
  return {
    operating,
    rehearsal: {
      status: "ready",
      configured: true,
      spreadsheetId: rehearsal.spreadsheetId!,
      url: rehearsal.url!,
    },
  };
}

export type RehearsalSheetProofWriter = Pick<
  SheetsValuesWriter,
  "getValues" | "writeValuesIfEmpty" | "clearValuesIfExactMatch"
>;

export interface RehearsalSheetProofInput {
  operatingSpreadsheetId: string;
  rehearsalSpreadsheetId: string;
  /** One explicit blank cell in the copy, such as `Lease Renewal!ZZ1`. */
  range: string;
  /** Synthetic, non-client marker. */
  marker: string;
}

export type RehearsalSheetProofResult =
  | { status: "proved"; restored: true; range: string }
  | {
      status: "refused";
      restored: boolean;
      reason:
        | "same_as_operating"
        | "invalid_target"
        | "non_synthetic_marker"
        | "cell_not_empty"
        | "write_compare_failed"
        | "readback_mismatch"
        | "rollback_compare_failed"
        | "rollback_readback_failed";
    };

function isExactCell(range: string): boolean {
  return /^'?[^'!]+(?:''[^'!]*)?'?![A-Z]+[1-9]\d*$/.test(range);
}

/**
 * Copy-only, exact-cell write/read/rollback proof. The operating id must be supplied alongside the
 * rehearsal id so an alias can never be treated as safe. The cell must begin empty and finishes
 * empty; any mismatch fails closed. A failed readback attempts only an exact-marker cleanup.
 */
export async function proveRehearsalSheetRoundTrip(
  writer: RehearsalSheetProofWriter,
  input: RehearsalSheetProofInput,
): Promise<RehearsalSheetProofResult> {
  if (input.operatingSpreadsheetId === input.rehearsalSpreadsheetId) {
    return { status: "refused", restored: false, reason: "same_as_operating" };
  }
  if (!isExactCell(input.range)) {
    return { status: "refused", restored: false, reason: "invalid_target" };
  }
  if (!/^PMI_REHEARSAL_PROBE_[A-Z0-9_-]+$/.test(input.marker)) {
    return { status: "refused", restored: false, reason: "non_synthetic_marker" };
  }
  if (!writer.writeValuesIfEmpty || !writer.clearValuesIfExactMatch) {
    return { status: "refused", restored: false, reason: "write_compare_failed" };
  }
  const before = await writer.getValues(input.rehearsalSpreadsheetId, input.range);
  if ((before[0]?.[0] ?? "") !== "") {
    return { status: "refused", restored: false, reason: "cell_not_empty" };
  }
  const written = await writer.writeValuesIfEmpty(
    input.rehearsalSpreadsheetId,
    input.range,
    input.marker,
  );
  if (!written) {
    return { status: "refused", restored: false, reason: "write_compare_failed" };
  }
  const afterWrite = await writer.getValues(input.rehearsalSpreadsheetId, input.range);
  if ((afterWrite[0]?.[0] ?? "") !== input.marker) {
    const restored = await writer.clearValuesIfExactMatch(
      input.rehearsalSpreadsheetId,
      input.range,
      input.marker,
    );
    return { status: "refused", restored, reason: "readback_mismatch" };
  }
  const cleared = await writer.clearValuesIfExactMatch(
    input.rehearsalSpreadsheetId,
    input.range,
    input.marker,
  );
  if (!cleared) {
    return { status: "refused", restored: false, reason: "rollback_compare_failed" };
  }
  const afterRollback = await writer.getValues(input.rehearsalSpreadsheetId, input.range);
  if ((afterRollback[0]?.[0] ?? "") !== "") {
    return { status: "refused", restored: false, reason: "rollback_readback_failed" };
  }
  return { status: "proved", restored: true, range: input.range };
}
