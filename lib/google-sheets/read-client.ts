// Read-only Google Sheets reader for the lease-renewal control sheet (Phase-1 live Sheet read).
//
// Identity: ADC as `josiah@pmikcmetro.com` with the read-only Sheets scope (never the personal
// account; never a service-account key). Mirrors the repo's GmailApiSender pattern — the live API
// class is INJECTED behind a `SheetsValuesReader` interface so unit tests use a fake; the live path
// is exercised only with real ADC + the approved sheet id (the same posture as Gmail send).
//
// Read-only: GET spreadsheet metadata (tab titles) and GET values:batchGet. No write scope, no write
// method. Credential tabs 4 & 7 are excluded downstream by ingest Stage B's content-signature guard.

import { GoogleAuth, Impersonated, type AuthClient } from "google-auth-library";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
// Relative (not "@/") so the read-only `tsx` smoke can load this module without a path-alias
// resolver; type-only "@/" imports are erased and stay fine.
import { batchGetToTables, type SheetsBatchGetResponse } from "./sheet-to-grids";

export const SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export interface SheetsValuesReader {
  listTabTitles(spreadsheetId: string): Promise<string[]>;
  batchGet(spreadsheetId: string, ranges: string[]): Promise<SheetsBatchGetResponse>;
  /**
   * Optional read-only FORMULA read (valueRenderOption=FORMULA) so hyperlink cells surface as
   * `=HYPERLINK("url","text")`. Required only for the RentVine-id link join; GoogleSheetsApiReader
   * implements it.
   */
  batchGetFormulas?(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<SheetsBatchGetResponse>;
}

/**
 * Live reader over the Sheets REST API. Not unit-tested (live-only).
 *
 * Auth: the read-only Sheets scope. On a managed Workspace domain the user OAuth flow is blocked from
 * the (sensitive) Sheets scope, so when `impersonateServiceAccount` (env `SHEETS_IMPERSONATE_SA`) is
 * set the reader impersonates that service account instead — the sheet is shared with the SA and the
 * human only needs Token Creator on it. Keyless, and the same identity Cloud Run uses via its attached
 * SA. Unset → plain ADC with the Sheets scope (used where that scope is permitted).
 */
export class GoogleSheetsApiReader implements SheetsValuesReader {
  private authClientPromise: Promise<AuthClient> | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(
    private readonly impersonateServiceAccount:
      | string
      | undefined = process.env.SHEETS_IMPERSONATE_SA?.trim() || undefined,
    /**
     * Domain-wide-delegation subject. When set (with a service account), the reader reads AS this
     * domain user instead of as the SA — needed when the managed domain blocks the external SA from
     * opening the file even though it is shared. The SA's client id must be authorized for the Sheets
     * scope in Admin console → Security → API controls → Domain-wide delegation.
     */
    private readonly dwdSubject:
      | string
      | undefined = process.env.SHEETS_DWD_SUBJECT?.trim() || undefined,
  ) {}

  private getAuthClient(): Promise<AuthClient> {
    if (!this.authClientPromise) {
      const target = this.impersonateServiceAccount;
      this.authClientPromise = target
        ? (async (): Promise<AuthClient> => {
            const sourceClient = await new GoogleAuth({
              scopes: [CLOUD_PLATFORM_SCOPE],
            }).getClient();
            return new Impersonated({
              sourceClient,
              targetPrincipal: target,
              targetScopes: [SHEETS_READONLY_SCOPE],
              lifetime: 3600,
            });
          })()
        : new GoogleAuth({ scopes: [SHEETS_READONLY_SCOPE] }).getClient();
    }
    return this.authClientPromise;
  }

  /**
   * Keyless domain-wide delegation: have the SA sign a JWT asserting the subject user (via
   * iamcredentials.signJwt — the human holds Token Creator on the SA), then exchange it for an access
   * token scoped to Sheets read-only and acting as that user. No key file, no stored token.
   */
  private async mintDwdToken(saEmail: string, subject: string): Promise<string> {
    const sourceClient = await new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
    }).getClient();
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      iss: saEmail,
      sub: subject,
      scope: SHEETS_READONLY_SCOPE,
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
        `DWD token exchange failed (HTTP ${tokenResponse.status}): ${tokenData.error ?? ""} ${tokenData.error_description ?? ""}`.trim(),
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
              const client = await this.getAuthClient();
              const headers = await client.getRequestHeaders();
              const token = headers.get("Authorization") ?? headers.get("authorization");
              if (!token) {
                throw new Error("Sheets read failed before request: missing auth token.");
              }
              return String(token);
            })();
    }
    return this.tokenPromise;
  }

  async listTabTitles(spreadsheetId: string): Promise<string[]> {
    const token = await this.authToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
      { headers: { Authorization: token } },
    );
    if (!response.ok) {
      throw new Error(`Sheets metadata read failed (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as {
      sheets?: { properties?: { title?: string } }[];
    };
    return (body.sheets ?? [])
      .map((sheet) => sheet.properties?.title ?? "")
      .filter((title) => title !== "");
  }

  async batchGet(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<SheetsBatchGetResponse> {
    const token = await this.authToken();
    const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&");
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
      { headers: { Authorization: token } },
    );
    if (!response.ok) {
      throw new Error(`Sheets values read failed (HTTP ${response.status}).`);
    }
    return (await response.json()) as SheetsBatchGetResponse;
  }

  /**
   * Read the same ranges with `valueRenderOption=FORMULA` (read-only) so cells that hyperlink back to
   * RentVine surface as `=HYPERLINK("url","text")`. Pair with `valuesToGridWithLinks` to recover the
   * per-row RentVine join id. Not part of the injected `SheetsValuesReader` interface (live-only).
   */
  async batchGetFormulas(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<SheetsBatchGetResponse> {
    const token = await this.authToken();
    const query = [
      ...ranges.map((range) => `ranges=${encodeURIComponent(range)}`),
      "valueRenderOption=FORMULA",
    ].join("&");
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
      { headers: { Authorization: token } },
    );
    if (!response.ok) {
      throw new Error(`Sheets formula read failed (HTTP ${response.status}).`);
    }
    return (await response.json()) as SheetsBatchGetResponse;
  }
}

export interface ReadRenewalSheetOptions {
  reader: SheetsValuesReader;
  spreadsheetId: string;
  /**
   * In-scope tab titles to read. If omitted, every tab title is listed and read; credential tabs
   * (4 & 7) are excluded downstream by ingest Stage B's content-signature guard, not here.
   */
  tabTitles?: string[];
}

export interface RenewalSheetRead {
  titles: string[];
  tables: RawGrid[];
}

/** Read the in-scope tabs of the renewal sheet into RawGrid[] (read-only). One metadata + one batchGet. */
export async function readRenewalSheetGrids(
  options: ReadRenewalSheetOptions,
): Promise<RenewalSheetRead> {
  const titles =
    options.tabTitles ?? (await options.reader.listTabTitles(options.spreadsheetId));
  const response = await options.reader.batchGet(options.spreadsheetId, titles);
  return { titles, tables: batchGetToTables(response) };
}
