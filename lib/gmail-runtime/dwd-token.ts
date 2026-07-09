// Keyless domain-wide-delegation token mint for the per-user Gmail runtime. Identity: acts AS the
// signed-in `pmikcmetro.com` user (the impersonation subject) via a service account that signs a JWT —
// NEVER the personal account, never a key file. Mirrors the Drive/Sheets DWD mints
// (lib/google-drive/drive-dwd.ts): the SA's client id must be authorized for the requested Gmail scope in
// Admin console → Security → API controls → Domain-wide delegation.
//
// Live-only (signJwt + token exchange) and not unit-tested; the client that consumes it takes an injected
// getToken so the client is unit-tested offline without ever minting a real token.

import { GoogleAuth } from "google-auth-library";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export class GmailDwdSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailDwdSetupError";
  }
}

/**
 * Mint a keyless DWD access token for a SINGLE Gmail scope, acting AS the subject user. Throws
 * GmailDwdSetupError when the SA/subject are unset or the exchange is refused (e.g. the Gmail scope is not
 * yet authorized for the SA in Admin console → Domain-wide delegation). The subject is REQUIRED (the
 * signed-in user) so we can never accidentally impersonate a fixed default mailbox.
 */
export async function mintGmailDwdToken(options: {
  subject: string;
  scope: string;
  serviceAccount?: string;
}): Promise<string> {
  const saEmail =
    options.serviceAccount ??
    process.env.GMAIL_DWD_SA?.trim() ??
    process.env.SHEETS_IMPERSONATE_SA?.trim();
  const subject = options.subject?.trim();
  if (!saEmail || !subject) {
    throw new GmailDwdSetupError(
      "Gmail DWD needs a service account (GMAIL_DWD_SA or SHEETS_IMPERSONATE_SA) and the signed-in pmikcmetro.com user as the subject.",
    );
  }

  const sourceClient = await new GoogleAuth({
    scopes: [CLOUD_PLATFORM_SCOPE],
  }).getClient();
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    iss: saEmail,
    sub: subject,
    scope: options.scope,
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
  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new GmailDwdSetupError(
      `Gmail DWD token exchange failed (HTTP ${tokenResponse.status}) — confirm the Gmail scope is authorized for the service account in Admin console → Domain-wide delegation.`,
    );
  }
  return tokenData.access_token;
}
