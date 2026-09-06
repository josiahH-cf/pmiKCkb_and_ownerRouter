// S51: pure classification of one authenticated canary route visit.
//
// A denied route is proven by the redirect chain, not by where the browser finally lands. The page
// guard answers a forbidden request with a redirect to `/sign-in?error=forbidden`, and the sign-in
// page then sends a signed-in person on to `/`, so a real Editor never rests on `/sign-in`. The
// only honest evidence of a denial is therefore: (1) the chain contains the exact same-origin
// `/sign-in?error=forbidden` hop and (2) the denied path itself never became the final document.

export interface DeniedRouteObservation {
  /** The exact candidate or canonical origin under assurance. */
  readonly origin: string;
  /** The manifest path that must be denied, e.g. `/admin`. */
  readonly deniedPath: string;
  /** Every request URL in navigation order, ending with the URL of the final response. */
  readonly hopUrls: readonly string[];
}

export type DeniedRouteOutcome =
  | { readonly passed: true }
  | { readonly passed: false; readonly diagnostic: "auth_mismatch" };

function sameOriginUrl(value: string, origin: string): URL | null {
  try {
    const url = new URL(value);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
}

function isForbiddenSignInHop(url: URL): boolean {
  return url.pathname === "/sign-in" && url.searchParams.get("error") === "forbidden";
}

function isDeniedDocument(url: URL, deniedPath: string): boolean {
  return url.pathname === deniedPath || url.pathname.startsWith(`${deniedPath}/`);
}

/**
 * Classify a denied-route visit. Passing requires an exact forbidden sign-in hop on the assured
 * origin and a final document that is neither the denied path nor an off-origin location. An empty
 * chain, a chain that never hit the forbidden hop, a final landing on the denied path, or a
 * cross-origin hop all fail closed as `auth_mismatch`.
 */
export function classifyDeniedRouteOutcome(
  observation: DeniedRouteObservation,
): DeniedRouteOutcome {
  const { origin, deniedPath, hopUrls } = observation;
  if (hopUrls.length === 0) return { passed: false, diagnostic: "auth_mismatch" };
  const hops: URL[] = [];
  for (const hop of hopUrls) {
    const url = sameOriginUrl(hop, origin);
    if (!url) return { passed: false, diagnostic: "auth_mismatch" };
    hops.push(url);
  }
  const final = hops[hops.length - 1]!;
  if (isDeniedDocument(final, deniedPath)) {
    return { passed: false, diagnostic: "auth_mismatch" };
  }
  return hops.some(isForbiddenSignInHop)
    ? { passed: true }
    : { passed: false, diagnostic: "auth_mismatch" };
}
