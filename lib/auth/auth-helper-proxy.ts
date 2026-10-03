// S165: the same-origin Google sign-in helper. Firebase documents serving its sign-in helper
// pages (/__/auth/*) from the app's own origin as the arrangement in which a full-page Google
// redirect can return to the app in browsers that partition cross-site storage. This module only
// decides WHICH fixed upstream address a helper request maps to. It authenticates nobody, carries
// no credential, and is inert until the explicit same-origin key is set.

const HELPER_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FIREBASE_HELPER_DOMAIN = /^[a-z0-9-]+\.firebaseapp\.com$/;
const BARE_HOST = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;

/**
 * Returns the upstream helper address for a proxied request, or null when the request must not be
 * proxied. Null (served as 404) covers: the same-origin key is unset or malformed, the configured
 * helper domain is not this project's Firebase helper domain, or the path is outside the two fixed
 * helper locations.
 */
export function resolveAuthHelperUpstream(input: {
  readonly sameOriginAuthHost: string | null | undefined;
  readonly authDomain: string | null | undefined;
  readonly segments: readonly string[];
  readonly search: string;
}): string | null {
  const declaredHost = (input.sameOriginAuthHost ?? "").trim().toLowerCase();

  if (!BARE_HOST.test(declaredHost)) {
    return null;
  }

  const authDomain = (input.authDomain ?? "").trim().toLowerCase();

  if (!FIREBASE_HELPER_DOMAIN.test(authDomain)) {
    return null;
  }

  const [area, ...rest] = input.segments;
  const isHelperPage =
    area === "auth" &&
    rest.length > 0 &&
    rest.length <= 4 &&
    rest.every((segment) => HELPER_SEGMENT.test(segment) && !segment.includes(".."));
  const isInitConfig =
    area === "firebase" && rest.length === 1 && rest[0] === "init.json";

  if (!isHelperPage && !isInitConfig) {
    return null;
  }

  const search = input.search.startsWith("?") ? input.search : "";
  return `https://${authDomain}/__/${[area, ...rest].join("/")}${search}`;
}

/** Request headers worth forwarding. Cookies and authorization are deliberately absent. */
export const AUTH_HELPER_FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "user-agent",
] as const;

/** Response headers passed back to the browser. Upstream cookies are never relayed. */
export const AUTH_HELPER_RETURNED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
] as const;
