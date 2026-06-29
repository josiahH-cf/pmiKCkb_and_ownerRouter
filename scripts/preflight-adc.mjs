// ADC freshness preflight. On this managed org, `gcloud auth application-default login` is
// reauth-gated (RAPT), so the Application Default Credentials token silently goes stale and ANY live
// Google read (Sheets via DWD, Firestore, Vertex) fails mid-run with invalid_rapt / invalid_grant —
// the recurring stall. Run this FIRST on a new session and as part of planning, before building any
// step that touches a live Google read; if it fails, reauth before proceeding. Read-only: it only
// mints an access token, no data. CI / no-ADC environments will report "missing" and exit 1 — that is
// expected there, which is why this is a planning preflight, not part of verify.sh / CI.
//
//   npm run preflight:adc

import { pathToFileURL } from "node:url";
import { GoogleAuth } from "google-auth-library";

const REAUTH_COMMAND = "gcloud auth application-default login";

/** Classify an ADC failure so the operator gets the right fix. Pure + exported for tests. */
export function classifyAdcError(message) {
  const text = String(message ?? "").toLowerCase();
  if (
    text.includes("invalid_rapt") ||
    text.includes("reauth") ||
    text.includes("invalid_grant")
  ) {
    return "reauth";
  }
  if (
    text.includes("could not load the default credentials") ||
    text.includes("default credentials")
  ) {
    return "missing";
  }
  return "other";
}

/** The operator-facing fix lines for a given failure kind. Pure + exported for tests. */
export function reauthGuidance(kind) {
  if (kind === "reauth") {
    return [
      "ADC preflight FAILED: Application Default Credentials need reauth (the token is stale).",
      `Fix (interactive, sign in as josiah@pmikcmetro.com, NO --scopes): ${REAUTH_COMMAND}`,
    ];
  }
  if (kind === "missing") {
    return [
      "ADC preflight FAILED: no Application Default Credentials found (or not configured for this org).",
      `Fix (interactive, sign in as josiah@pmikcmetro.com, NO --scopes): ${REAUTH_COMMAND}`,
    ];
  }
  return ["ADC preflight FAILED with an unexpected error (see the message above)."];
}

async function main() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token || !token.token) {
      throw new Error("ADC returned no access token.");
    }
    console.log(
      "ADC preflight OK: Application Default Credentials are fresh — live Google reads (Sheets/Firestore/Vertex) will work.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    for (const line of reauthGuidance(classifyAdcError(message))) {
      console.error(line);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
