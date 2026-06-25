// Server-only: build the live-review clients (RentVine + Google Sheets) from environment config.
//
// Reads value-bearing config from process.env (RENTVINE_API_* / SHEETS_* / RENEWAL_SHEET_ID). It
// NEVER logs, returns, or embeds those values — only the constructed clients (which hold them
// privately) and the spreadsheet id are returned, and the id is only ever rendered counts-only /
// suffixed elsewhere. No network call happens here: both clients are inert on construction.
//
// The result is a discriminated union so the owner-gated live page degrades to a clear panel when the
// sources are not connected, instead of throwing. Account safety (pmikcmetro only) is enforced here.

import { GoogleSheetsApiReader } from "@/lib/google-sheets/read-client";
import {
  RentVineClient,
  assertRentVineAccount,
  createFetchTransport,
} from "@/lib/integrations/rentvine/client";

const EXPECTED_ACCOUNT = "pmikcmetro";

export type LiveRenewalConfig =
  | {
      ok: true;
      rentvineClient: RentVineClient;
      sheetsReader: GoogleSheetsApiReader;
      spreadsheetId: string;
    }
  | { ok: false; reason: "not_configured" | "account_mismatch" };

type EnvLike = Record<string, string | undefined>;

/**
 * Build the live-review clients from an env map (defaults to process.env). No I/O — pure construction.
 * Returns `not_configured` when any required value is absent (RentVine creds + base url, the Sheets
 * domain-wide-delegation pair, and the renewal sheet id), and `account_mismatch` when the RentVine
 * base url is not the pmikcmetro tenant.
 */
export function buildLiveRenewalConfig(env: EnvLike = process.env): LiveRenewalConfig {
  const baseUrl = env.RENTVINE_API_BASE_URL?.trim();
  const apiKey = env.RENTVINE_API_KEY?.trim();
  const apiSecret = env.RENTVINE_API_SECRET?.trim();
  const spreadsheetId = env.RENEWAL_SHEET_ID?.trim();
  const impersonateSa = env.SHEETS_IMPERSONATE_SA?.trim();
  const dwdSubject = env.SHEETS_DWD_SUBJECT?.trim();

  if (
    !baseUrl ||
    !apiKey ||
    !apiSecret ||
    !spreadsheetId ||
    !impersonateSa ||
    !dwdSubject
  ) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    assertRentVineAccount(baseUrl, EXPECTED_ACCOUNT);
  } catch {
    return { ok: false, reason: "account_mismatch" };
  }

  const rentvineClient = new RentVineClient(
    { baseUrl, apiKey, apiSecret },
    createFetchTransport(),
  );
  const sheetsReader = new GoogleSheetsApiReader(impersonateSa, dwdSubject);

  return { ok: true, rentvineClient, sheetsReader, spreadsheetId };
}
