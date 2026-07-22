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

/** The narrow write surface the append-only executor needs: read a range, overwrite a single range. */
export interface SheetsValuesWriter {
  /** Read one A1 range's values (used for re-anchor + read-after-write). */
  getValues(spreadsheetId: string, range: string): Promise<string[][]>;
  /** Overwrite one A1 range with the given values (values.update, RAW input). */
  updateValues(spreadsheetId: string, range: string, values: string[][]): Promise<void>;
}

/**
 * Live writer over the Sheets REST API. Not unit-tested (live-only); the executor is tested against a
 * fake SheetsValuesWriter. Auth mirrors the reader: keyless DWD (the SA signs a JWT asserting the subject
 * user, exchanged for a token scoped to Sheets read/WRITE), or plain ADC with the write scope where the
 * user OAuth flow is permitted. Fail-closed: without the write scope granted, token/exchange throws.
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
      { headers: { Authorization: token } },
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
      },
    );
    if (!response.ok) {
      throw new Error(`Sheets values write failed (HTTP ${response.status}).`);
    }
  }
}
