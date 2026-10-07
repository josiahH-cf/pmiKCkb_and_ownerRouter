// S106: the documented Dotloop authorization URL, shared by the server that builds it and the
// browser control that follows it. Client-safe: no credential, vault or provider import.
//
// Official contract (Public API v2, OAuth 2): GET https://auth.dotloop.com/oauth/authorize with
// response_type=code, client_id, redirect_uri, optional state and optional redirect_on_deny. Scopes
// are configured on the client registration and reported back in the token response; the
// documented authorization request carries no scope parameter, so none is sent.

export const DOTLOOP_OAUTH_AUTHORIZE_URL = "https://auth.dotloop.com/oauth/authorize";

const AUTHORIZE_PARAMETERS = new Set([
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "redirect_on_deny",
]);

/**
 * Build the documented authorize URL. The client secret is never a parameter. `redirect_on_deny`
 * makes a denial return to the application's callback so the operator sees the outcome there.
 */
export function buildDotloopAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(DOTLOOP_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_on_deny", "true");
  return url.toString();
}

/**
 * The browser follows only an exact documented authorization URL: the Dotloop origin and path, a
 * code response, a client id, a state, an https callback on this application's own callback path,
 * and no other parameter. Anything else is refused rather than navigated to.
 */
export function isTrustedDotloopAuthorizeUrl(
  candidate: unknown,
  expectedOrigin?: string,
): candidate is string {
  if (typeof candidate !== "string" || candidate.length > 2_048) return false;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (`${url.origin}${url.pathname}` !== DOTLOOP_OAUTH_AUTHORIZE_URL) return false;
  if (url.username || url.password || url.hash) return false;
  for (const key of url.searchParams.keys()) {
    if (!AUTHORIZE_PARAMETERS.has(key)) return false;
  }
  if (url.searchParams.get("response_type") !== "code") return false;
  if (!url.searchParams.get("client_id")?.trim()) return false;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(url.searchParams.get("state") ?? "")) return false;
  let callback: URL;
  try {
    callback = new URL(url.searchParams.get("redirect_uri") ?? "");
  } catch {
    return false;
  }
  if (callback.protocol !== "https:" && callback.hostname !== "localhost") return false;
  if (callback.pathname !== "/api/connections/dotloop/callback") return false;
  if (expectedOrigin && callback.origin !== expectedOrigin) return false;
  return true;
}
