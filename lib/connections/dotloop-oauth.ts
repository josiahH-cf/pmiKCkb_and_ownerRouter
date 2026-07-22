// Dotloop OAuth2 auth-code SCAFFOLDING (Slice 10, D15).
//
// Structure only: it builds the authorize URL and defines the token-exchange + token-vault SEAMS so the
// owner can register the Dotloop app and complete real authorization in the morning. It makes NO live
// Dotloop call and holds NO credentials. Config is loaded by env NAME (presence only); the client secret
// is server-side only and is NEVER placed in a URL, logged, echoed, or returned to the browser. Every
// Dotloop ACTION stays production_allowed:false until authorization is completed and a per-action spec
// is reviewed. Pure/deterministic except the explicit seams (which have no live implementation yet).

import {
  resolveConnectorSecretVault,
  type ConnectorSecretVault,
} from "@/lib/connections/connector-secret-vault";

export const DOTLOOP_OAUTH_AUTHORIZE_URL = "https://auth.dotloop.com/oauth/authorize";
export const DOTLOOP_OAUTH_TOKEN_URL = "https://auth.dotloop.com/oauth/token";

/** Env var NAMES the OAuth app credentials land in (presence only; never rendered, never a value here). */
export const DOTLOOP_OAUTH_ENV = {
  clientId: "DOTLOOP_OAUTH_CLIENT_ID",
  clientSecret: "DOTLOOP_OAUTH_CLIENT_SECRET",
  redirectUri: "DOTLOOP_OAUTH_REDIRECT_URI",
} as const;

export interface DotloopOAuthConfig {
  clientId: string;
  redirectUri: string;
  /** Server-side only. NEVER placed in a URL or returned to the browser. Optional in the read result. */
  clientSecret?: string;
}

export type DotloopOAuthConfigResult =
  | { configured: true; config: DotloopOAuthConfig }
  | { configured: false; missing: string[] };

/**
 * Read the Dotloop OAuth config from env by NAME. Returns configured:false with the missing NAMES when
 * the app credentials are absent, so the connect flow honestly says "authorize in the morning" instead
 * of pretending to be connected. The clientSecret is read but never returned to any browser path.
 */
export function readDotloopOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): DotloopOAuthConfigResult {
  const clientId = env[DOTLOOP_OAUTH_ENV.clientId]?.trim();
  const redirectUri = env[DOTLOOP_OAUTH_ENV.redirectUri]?.trim();
  const clientSecret = env[DOTLOOP_OAUTH_ENV.clientSecret]?.trim();
  const missing: string[] = [];
  if (!clientId) missing.push(DOTLOOP_OAUTH_ENV.clientId);
  if (!redirectUri) missing.push(DOTLOOP_OAUTH_ENV.redirectUri);
  if (!clientSecret) missing.push(DOTLOOP_OAUTH_ENV.clientSecret);
  if (!clientId || !redirectUri) {
    return { configured: false, missing };
  }
  return {
    configured: true,
    config: { clientId, redirectUri, ...(clientSecret ? { clientSecret } : {}) },
  };
}

/**
 * Build the Dotloop authorize URL (auth-code flow). Pure. The URL carries response_type/client_id/
 * redirect_uri/scope/state ONLY — the client SECRET is never a query parameter. `state` is a CSRF nonce
 * the caller mints and verifies on callback.
 */
export function buildDotloopAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const url = new URL(DOTLOOP_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  if (input.scope) url.searchParams.set("scope", input.scope);
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** An OAuth token set, stored as OPAQUE vault refs — never raw token values. */
export interface DotloopTokenSet {
  accessTokenRef: string;
  refreshTokenRef?: string;
  expiresInSeconds?: number;
}

/**
 * The token-exchange + revoke SEAM. No live implementation is wired yet: the owner completes auth in the
 * morning, then a live exchanger (calling DOTLOOP_OAUTH_TOKEN_URL server-side with the client secret and
 * storing tokens via the ConnectorSecretVault) plugs in behind `resolveDotloopTokenExchanger`.
 */
export interface DotloopTokenExchanger {
  exchangeCode(input: {
    code: string;
    config: DotloopOAuthConfig;
    vault: ConnectorSecretVault;
  }): Promise<DotloopTokenSet>;
  revoke(input: { secretRef: string; vault: ConnectorSecretVault }): Promise<void>;
}

/**
 * Honest default: no live exchanger is wired. It refuses (rather than fabricating a token) so the
 * connect flow can never claim a Dotloop connection it does not hold.
 */
export class NotConnectedDotloopTokenExchanger implements DotloopTokenExchanger {
  async exchangeCode(_input: {
    code: string;
    config: DotloopOAuthConfig;
    vault: ConnectorSecretVault;
  }): Promise<DotloopTokenSet> {
    void _input;
    throw new Error(
      "Dotloop is not connected yet. Register the Dotloop OAuth app and complete authorization first.",
    );
  }

  async revoke(input: { secretRef: string; vault: ConnectorSecretVault }): Promise<void> {
    // Best-effort: destroy any stored secret ref. There is no live Dotloop revoke call yet.
    await input.vault.destroySecret(input.secretRef);
  }
}

export function resolveDotloopTokenExchanger(): DotloopTokenExchanger {
  // Seam: a live exchanger plugs in here once the owner has registered the app + authorized.
  return new NotConnectedDotloopTokenExchanger();
}

export type DotloopConnectResult =
  | { status: "authorize_url"; authorizeUrl: string }
  | { status: "credentials_not_configured"; missing: string[] };

/**
 * Begin the Dotloop connect flow (connect hook). When the app credentials are present it returns the
 * authorize URL to redirect the owner to; otherwise it reports which env NAMES are missing so the UI can
 * say "authorize in the morning". Makes NO live call and never returns a secret.
 */
export function beginDotloopConnect(input: {
  state: string;
  scope?: string;
  env?: Record<string, string | undefined>;
}): DotloopConnectResult {
  const result = readDotloopOAuthConfig(input.env ?? process.env);
  if (!result.configured) {
    return { status: "credentials_not_configured", missing: result.missing };
  }
  return {
    status: "authorize_url",
    authorizeUrl: buildDotloopAuthorizeUrl({
      clientId: result.config.clientId,
      redirectUri: result.config.redirectUri,
      state: input.state,
      ...(input.scope ? { scope: input.scope } : {}),
    }),
  };
}

/** Revoke the Dotloop connection (revoke hook): destroy the stored token ref via the vault seam. */
export async function revokeDotloopConnection(input: {
  secretRef: string;
  exchanger?: DotloopTokenExchanger;
  vault?: ConnectorSecretVault;
}): Promise<void> {
  const exchanger = input.exchanger ?? resolveDotloopTokenExchanger();
  const vault = input.vault ?? resolveConnectorSecretVault();
  await exchanger.revoke({ secretRef: input.secretRef, vault });
}
