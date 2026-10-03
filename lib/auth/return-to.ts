// S165: return navigation after sign-in. A signed-out person who opens a link to a page inside the
// app (the common phone case: a lease link shared in chat) is sent to /sign-in by the page guard.
// The guard's redirect target stays exactly "/sign-in", so the place they were going is carried in
// a short-lived, path-only cookie instead of the URL. The value is never trusted: it is validated
// here every time it is written or read, and only a same-origin path inside the staff app is kept.
//
// This module is pure (no next/headers, no Firebase) so the request proxy, the sign-in page and the
// browser can all share one rule.

export const RETURN_TO_COOKIE = "pmi_kc_return_to";
export const RETURN_TO_MAX_AGE_SECONDS = 10 * 60;

const MAX_RETURN_PATH_LENGTH = 1024;

/** Path prefixes that are never a return destination for the staff sign-in. */
const EXCLUDED_PREFIXES = ["/sign-in", "/vendor", "/api", "/_next", "/__"] as const;

/**
 * Returns the value only when it is a plain same-origin path inside the staff app. Anything that
 * could leave the origin (a scheme, "//host", a backslash), a control character, an excluded
 * boundary (sign-in, Vendor, API, framework and auth-helper paths) or the default "/" yields null.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length < 2 || value.length > MAX_RETURN_PATH_LENGTH) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (value.includes("\\") || hasControlOrSpace(value)) {
    return null;
  }

  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);

  // A dot segment (plain or percent-encoded) or an encoded separator could resolve to an
  // excluded path after the browser or the router normalizes it.
  if (
    pathname.includes("//") ||
    /%2f|%5c/i.test(pathname) ||
    pathname.split("/").some((segment) => /^(\.|%2e){1,2}$/i.test(segment))
  ) {
    return null;
  }

  for (const prefix of EXCLUDED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return null;
    }
  }

  return value;
}

/**
 * Decides whether a request is a signed-out person opening an app page in the browser, and if so
 * which path to remember. Only a top-level HTML page GET qualifies: API calls, framework data
 * requests, prefetches, assets and any request that already carries a session are left alone.
 */
export function returnPathForSignedOutRequest(input: {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  readonly hasSession: boolean;
  readonly header: (name: string) => string | null;
}): string | null {
  if (input.hasSession || input.method.toUpperCase() !== "GET") {
    return null;
  }

  if (!(input.header("accept") ?? "").includes("text/html")) {
    return null;
  }

  if (
    input.header("rsc") !== null ||
    input.header("next-router-prefetch") !== null ||
    input.header("next-router-state-tree") !== null
  ) {
    return null;
  }

  const purpose = `${input.header("purpose") ?? ""} ${input.header("sec-purpose") ?? ""}`;
  if (purpose.toLowerCase().includes("prefetch")) {
    return null;
  }

  const lastSegment = input.pathname.slice(input.pathname.lastIndexOf("/") + 1);
  if (lastSegment.includes(".")) {
    return null;
  }

  return safeReturnPath(`${input.pathname}${input.search}`);
}

/** Browser side: remember where the person was before the app sends them to sign in. */
export function rememberReturnPathInBrowser(path: string) {
  const safe = safeReturnPath(path);

  if (!safe || typeof document === "undefined") {
    return;
  }

  try {
    document.cookie = `${RETURN_TO_COOKIE}=${encodeURIComponent(safe)}; Max-Age=${RETURN_TO_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secureSuffix()}`;
  } catch {
    // A browser that refuses the cookie simply returns the person to the Dashboard.
  }
}

/** Browser side: forget the remembered destination once it has been used. */
export function clearReturnPathInBrowser() {
  if (typeof document === "undefined") {
    return;
  }

  try {
    document.cookie = `${RETURN_TO_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secureSuffix()}`;
  } catch {
    // Nothing to clear.
  }
}

function secureSuffix() {
  return typeof window !== "undefined" && window.location.protocol === "https:"
    ? "; Secure"
    : "";
}

function hasControlOrSpace(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}
