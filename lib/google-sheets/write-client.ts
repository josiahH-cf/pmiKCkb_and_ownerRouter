// Write-capable Google Sheets client for the lease-renewal APPEND-ONLY write-back (Phase C).
//
// GATED BY CONSTRUCTION. This is only ever reached behind the `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED`
// feature flag (default OFF), a per-write human approval, and the append-only executor's safety dance
// (see sheet-writeback-execution.ts). It requests the read/WRITE Sheets scope, so it is FAIL-CLOSED: if
// the domain-wide-delegation grant does not authorize the write scope, the token exchange (or the write
// call) fails and no write happens. Mirrors GoogleSheetsApiReader's keyless DWD auth exactly, with the
// write scope substituted. It never logs a cell value.

import { GoogleAuth, type AuthClient } from "google-auth-library";

// The read/WRITE Sheets scope. Enabling a live write requires this scope to be added to the SA's
// domain-wide-delegation grant in Admin console → Security → API controls → Domain-wide delegation.
export const SHEETS_READWRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const SHEETS_REQUEST_TIMEOUT_MS = 30_000;

export interface SheetsAnchoredCellReference {
  spreadsheetId: string;
  tabName: string;
  a1: string;
  rowIndex: number;
  proposedColumnHeader: string;
  anchorHeaders: string[];
  rowAnchorHash: string;
  anchorColumnCount: number;
}

export type SheetsAnchoredMutationResult =
  | {
      status: "applied";
      a1: string;
      /** Opaque provider effect identity, stable across mutation response and status reads. */
      effectId: string;
      /** Provider-recorded effect time, stable across retries and reconciliation. */
      appliedAt: string;
      /** SHA-256 digest of the provider's immutable effect result. */
      resultHash: string;
    }
  | { status: "mismatch"; reason: string };

export type SheetsAnchoredMutationStatus =
  | Extract<SheetsAnchoredMutationResult, { status: "applied" }>
  | {
      /**
       * Terminal provider guarantee: this key/payload did not apply and can never apply later.
       * A missing lookup, timeout, blank cell, or 404 is never sufficient for this state.
       */
      status: "not_applied";
      reason: string;
    }
  | { status: "pending"; reason: string }
  | { status: "unknown"; reason: string };

/** The narrow write surface the append-only executor needs. */
export interface SheetsValuesWriter {
  /** Read one A1 range's values (used for re-anchor + read-after-write). */
  getValues(spreadsheetId: string, range: string): Promise<string[][]>;
  /** Overwrite one A1 range with the given values (values.update, RAW input). */
  updateValues(spreadsheetId: string, range: string, values: string[][]): Promise<void>;
  /**
   * Atomically write one exact A1 cell only while it is still empty. The live implementation uses
   * an exact-cell server-side find/replace, so a collaborator edit yields `false`, never overwrite.
   */
  writeValuesIfEmpty?(
    spreadsheetId: string,
    range: string,
    value: string,
  ): Promise<boolean>;
  /**
   * Atomically clear one exact A1 cell only if its whole value still equals `expectedValue`.
   * Optional for read/write-only doubles; correction refuses before reading when it is absent.
   */
  clearValuesIfExactMatch?(
    spreadsheetId: string,
    range: string,
    expectedValue: string,
  ): Promise<boolean>;
  /**
   * Provider-side stable-row transaction required by the live action contract. It must resolve the
   * bodyless row anchor uniquely, require the exact human-confirmed A1/current value and optional
   * prior effect identity, atomically bind the globally scoped idempotency key to the payload hash,
   * apply one replacement, and return immutable effect evidence. Same key + different payload must
   * refuse. A mismatch result is a terminal, key-bound no-effect result: this key can never apply
   * later. A read followed by fixed-A1 CAS does not satisfy this method.
   */
  mutateAnchoredCellIfMatch?(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
    expectedValue: string;
    replacementValue: string;
    /**
     * Correction requires the current cell generation to still be the exact receipted provider
     * effect. Every intervening edit by any collaborator or API must invalidate that generation,
     * including a same-value clear/retype ABA; comparing the cell value alone is insufficient.
     */
    expectedEffectId?: string;
  }): Promise<SheetsAnchoredMutationResult>;
  /**
   * Exact provider-owned status for the same idempotency key + payload hash. `not_applied` is valid
   * only when the provider guarantees the request is terminal/cancelled and cannot complete later.
   * Product cell contents are corroboration, never a substitute for this operation status.
   */
  getAnchoredMutationStatus?(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
  }): Promise<SheetsAnchoredMutationStatus>;
  /**
   * Atomically close the claim-before-provider crash gap. For this exact key + payload, return the
   * existing applied/pending/terminal result; when no provider operation exists, bind the key to a
   * terminal `not_applied` tombstone before returning. Once tombstoned, even a delayed mutation call
   * with the same key must refuse forever. A missing lookup by itself never satisfies this method.
   */
  tombstoneAnchoredMutationIfAbsent?(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
  }): Promise<SheetsAnchoredMutationStatus>;
}

/**
 * Production action surface: provider reads plus the recoverable stable-row protocol only. Raw
 * fixed-range mutation helpers are deliberately excluded so route/service code cannot call them.
 */
export type SheetsAnchoredMutationWriter = Pick<
  SheetsValuesWriter,
  | "getValues"
  | "mutateAnchoredCellIfMatch"
  | "getAnchoredMutationStatus"
  | "tombstoneAnchoredMutationIfAbsent"
>;

/**
 * Live writer over the Sheets REST API. Not unit-tested (live-only); the executor is tested against a
 * fake SheetsValuesWriter. Auth mirrors the reader: keyless DWD (the SA signs a JWT asserting the subject
 * user, exchanged for a token scoped to Sheets read/WRITE), or plain ADC with the write scope where the
 * user OAuth flow is permitted. Fail-closed: without the write scope granted, token/exchange throws.
 *
 * This class intentionally implements none of `mutateAnchoredCellIfMatch`,
 * `getAnchoredMutationStatus`, or `tombstoneAnchoredMutationIfAbsent`: Google Sheets REST exposes
 * fixed-range/value primitives, but no transaction that also conditions on this product's logical
 * row anchor and no provider-owned idempotency/status/tombstone ledger. The action key must stay
 * closed until a provider seam supplies all three.
 */
export class GoogleSheetsApiWriter implements SheetsValuesWriter {
  private tokenPromise: Promise<string> | null = null;

  constructor(
    private readonly impersonateServiceAccount:
      | string
      | undefined = process.env.SHEETS_IMPERSONATE_SA?.trim() || undefined,
    private readonly dwdSubject:
      | string
      | undefined = process.env.SHEETS_DWD_SUBJECT?.trim() || undefined,
  ) {}

  private async mintDwdToken(saEmail: string, subject: string): Promise<string> {
    const sourceClient = await new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
    }).getClient();
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      iss: saEmail,
      sub: subject,
      scope: SHEETS_READWRITE_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
    const signResponse = await sourceClient.request<{ signedJwt: string }>({
      url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(saEmail)}:signJwt`,
      method: "POST",
      data: { payload },
    });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signResponse.data.signedJwt,
      }),
    });
    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(
        `DWD write-token exchange failed (HTTP ${tokenResponse.status}): ${tokenData.error ?? ""} ${tokenData.error_description ?? ""}`.trim(),
      );
    }
    return `Bearer ${tokenData.access_token}`;
  }

  private authToken(): Promise<string> {
    if (!this.tokenPromise) {
      this.tokenPromise =
        this.impersonateServiceAccount && this.dwdSubject
          ? this.mintDwdToken(this.impersonateServiceAccount, this.dwdSubject)
          : (async (): Promise<string> => {
              const client: AuthClient = await new GoogleAuth({
                scopes: [SHEETS_READWRITE_SCOPE],
              }).getClient();
              const headers = await client.getRequestHeaders();
              const token = headers.get("Authorization") ?? headers.get("authorization");
              if (!token) {
                throw new Error(
                  "Sheets write failed before request: missing auth token.",
                );
              }
              return String(token);
            })();
    }
    return this.tokenPromise;
  }

  async getValues(spreadsheetId: string, range: string): Promise<string[][]> {
    const token = await this.authToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets values read failed (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as { values?: string[][] };
    return body.values ?? [];
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: string[][],
  ): Promise<void> {
    const token = await this.authToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ range, majorDimension: "ROWS", values }),
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets values write failed (HTTP ${response.status}).`);
    }
  }

  async writeValuesIfEmpty(
    spreadsheetId: string,
    range: string,
    value: string,
  ): Promise<boolean> {
    if (value === "") return false;
    return this.findReplaceExactCell({
      spreadsheetId,
      range,
      find: "^$",
      replacement: quoteRegexReplacement(value),
      searchByRegex: true,
      operationLabel: "conditional write",
    });
  }

  async clearValuesIfExactMatch(
    spreadsheetId: string,
    range: string,
    expectedValue: string,
  ): Promise<boolean> {
    if (expectedValue === "") return false;
    return this.findReplaceExactCell({
      spreadsheetId,
      range,
      find: expectedValue,
      replacement: "",
      searchByRegex: false,
      operationLabel: "conditional clear",
    });
  }

  private async findReplaceExactCell(input: {
    spreadsheetId: string;
    range: string;
    find: string;
    replacement: string;
    searchByRegex: boolean;
    operationLabel: string;
  }): Promise<boolean> {
    const target = parseExactA1Cell(input.range);
    const token = await this.authToken();
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}?fields=${encodeURIComponent("sheets.properties(sheetId,title)")}`,
      {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      },
    );
    if (!metadataResponse.ok) {
      throw new Error(
        `Sheets ${input.operationLabel} target lookup failed (HTTP ${metadataResponse.status}).`,
      );
    }
    const metadata = (await metadataResponse.json()) as {
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    };
    const sheetId = metadata.sheets?.find(
      (sheet) => sheet.properties?.title === target.tabName,
    )?.properties?.sheetId;
    if (typeof sheetId !== "number") {
      throw new Error(`Sheets ${input.operationLabel} target tab was not found.`);
    }

    // Find/replace is the Sheets API's server-side compare-and-set primitive here: the request is
    // scoped to one GridRange, and `matchEntireCell` makes collaborator drift return zero changes.
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          requests: [
            {
              findReplace: {
                find: input.find,
                replacement: input.replacement,
                matchCase: true,
                matchEntireCell: true,
                searchByRegex: input.searchByRegex,
                includeFormulas: false,
                range: {
                  sheetId,
                  startRowIndex: target.rowIndex,
                  endRowIndex: target.rowIndex + 1,
                  startColumnIndex: target.columnIndex,
                  endColumnIndex: target.columnIndex + 1,
                },
              },
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets ${input.operationLabel} failed (HTTP ${response.status}).`);
    }
    const result = (await response.json()) as {
      replies?: { findReplace?: { occurrencesChanged?: number } }[];
    };
    const occurrences = result.replies?.[0]?.findReplace?.occurrencesChanged;
    if (occurrences === 0) return false;
    if (occurrences === 1) return true;
    throw new Error(
      `Sheets ${input.operationLabel} returned an invalid replacement count.`,
    );
  }

  /**
   * Create a brand-new spreadsheet owned by the DWD subject, with one named tab. NOT part of the
   * append-only executor's write surface (not on SheetsValuesWriter) — it exists only so the
   * `smoke:sheet-write` proof can write into a THROWAWAY test sheet, never the operational one.
   * Requires the same `spreadsheets` write scope, so it is fail-closed exactly like the writes.
   */
  async createSpreadsheet(title: string, tabTitle = "Sheet1"): Promise<string> {
    const token = await this.authToken();
    const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: tabTitle } }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Sheets create failed (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as { spreadsheetId?: string };
    if (!body.spreadsheetId) {
      throw new Error("Sheets create returned no spreadsheetId.");
    }
    return body.spreadsheetId;
  }

  /** Numeric sheetId for one tab title (S98 batchUpdate targets need it). */
  async getSheetIdByTitle(spreadsheetId: string, tabTitle: string): Promise<number> {
    const token = await this.authToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent("sheets.properties(sheetId,title)")}`,
      {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets tab lookup failed (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as {
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    };
    const sheetId = body.sheets?.find((sheet) => sheet.properties?.title === tabTitle)
      ?.properties?.sheetId;
    if (typeof sheetId !== "number") {
      throw new Error("Sheets tab was not found.");
    }
    return sheetId;
  }

  /**
   * S98 row append: ONE atomic batchUpdate whose single appendCells request writes the exact row
   * values and the system note on the note column. No range, index, or second mutation exists.
   */
  async appendRowWithNote(input: {
    spreadsheetId: string;
    sheetId: number;
    values: readonly string[];
    noteColumnIndex: number;
    note: string;
  }): Promise<void> {
    const token = await this.authToken();
    const rowData = {
      values: input.values.map((value, index) => ({
        userEnteredValue: { stringValue: value },
        ...(index === input.noteColumnIndex ? { note: input.note } : {}),
      })),
    };
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          requests: [
            {
              appendCells: {
                sheetId: input.sheetId,
                rows: [rowData],
                fields: "userEnteredValue,note",
              },
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets row append failed (HTTP ${response.status}).`);
    }
  }

  /**
   * S98 receipt-bound reversal: ONE deleteDimension ROW request for exactly one row, after the
   * caller has revalidated the unchanged app-appended row.
   */
  async deleteExactRow(input: {
    spreadsheetId: string;
    sheetId: number;
    rowNumber: number;
  }): Promise<void> {
    const token = await this.authToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: input.sheetId,
                  dimension: "ROWS",
                  startIndex: input.rowNumber - 1,
                  endIndex: input.rowNumber,
                },
              },
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets row delete failed (HTTP ${response.status}).`);
    }
  }

  /**
   * Read one column's cell text plus notes for a bounded row window (spreadsheets.get gridData).
   * Locates an app-appended row by its exact note; also powers proof-row exclusion.
   */
  async getColumnNotes(input: {
    spreadsheetId: string;
    tabTitle: string;
    columnIndex: number;
    startRowNumber: number;
    endRowNumber: number;
  }): Promise<{ rowNumber: number; value: string; note: string }[]> {
    const token = await this.authToken();
    const columnLetter = columnIndexToLetter(input.columnIndex);
    const range = `'${input.tabTitle}'!${columnLetter}${input.startRowNumber}:${columnLetter}${input.endRowNumber}`;
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}?ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent("sheets(properties(title),data(startRow,rowData(values(formattedValue,note))))")}`,
      {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets note read failed (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as {
      sheets?: {
        properties?: { title?: string };
        data?: {
          startRow?: number;
          rowData?: { values?: { formattedValue?: string; note?: string }[] }[];
        }[];
      }[];
    };
    const sheet = body.sheets?.find(
      (entry) => entry.properties?.title === input.tabTitle,
    );
    const grid = sheet?.data?.[0];
    const startRow = (grid?.startRow ?? input.startRowNumber - 1) + 1;
    return (grid?.rowData ?? []).map((row, index) => ({
      rowNumber: startRow + index,
      value: row.values?.[0]?.formattedValue ?? "",
      note: row.values?.[0]?.note ?? "",
    }));
  }

  /**
   * S98 exact-cell compare-and-set: replace one cell's exact current text with the new value in a
   * single server-side find/replace scoped to that cell. `false` means the expected value no
   * longer matched (collaborator drift); nothing was changed.
   */
  async replaceCellIfExactMatch(
    spreadsheetId: string,
    range: string,
    expected: string,
    replacement: string,
  ): Promise<boolean> {
    if (expected === "") {
      return this.findReplaceExactCell({
        spreadsheetId,
        range,
        find: "^$",
        replacement: quoteRegexReplacement(replacement),
        searchByRegex: true,
        operationLabel: "exact-cell update",
      });
    }
    return this.findReplaceExactCell({
      spreadsheetId,
      range,
      find: expected,
      replacement,
      searchByRegex: false,
      operationLabel: "exact-cell update",
    });
  }
}

function columnIndexToLetter(index: number): string {
  let value = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}

function quoteRegexReplacement(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("$", "\\$");
}

function parseExactA1Cell(range: string): {
  tabName: string;
  rowIndex: number;
  columnIndex: number;
} {
  const separator = range.lastIndexOf("!");
  const rawTabName = separator > 0 ? range.slice(0, separator) : "";
  const cell = separator > 0 ? range.slice(separator + 1) : "";
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(cell);
  if (!rawTabName || !match) {
    throw new Error("Sheets correction requires one exact tab-qualified A1 cell.");
  }
  const tabName =
    rawTabName.startsWith("'") && rawTabName.endsWith("'")
      ? rawTabName.slice(1, -1).replaceAll("''", "'")
      : rawTabName;
  let columnNumber = 0;
  for (const character of match[1]) {
    columnNumber = columnNumber * 26 + character.charCodeAt(0) - 64;
  }
  return {
    tabName,
    rowIndex: Number(match[2]) - 1,
    columnIndex: columnNumber - 1,
  };
}
