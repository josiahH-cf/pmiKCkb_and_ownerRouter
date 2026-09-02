// S82 desk-view continuation — carries one canonical `renewal-desk-query/v2` string through every
// internal lease/phase/blocker link so returning restores the exact table view.
//
// The `deskView` value is only the canonical serialized query string, without a leading `?`, route,
// origin, fragment, or nested `deskView`. Reconstruction builds only the canonical internal desk
// route; every malformed, oversized, repeated-key, unknown-key, unknown-version, noncanonical, or
// legacy nested value falls back to the default desk and can never become an open redirect.

import {
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";

export const RENEWAL_DESK_ROUTE = "/lease-renewal/live/desk";
export const RENEWAL_WORKSPACE_ROUTE_PREFIX = "/lease-renewal/live/desk/lease/";
export const DESK_VIEW_PARAM = "deskView";
export const DESK_VIEW_MAX_CODE_UNITS = 8192;

/** The canonical deskView value for a state, or null for the default desk (which omits it). */
export function encodeDeskView(state: RenewalDeskQueryV2State): string | null {
  const canonical = serializeRenewalDeskQueryV2(state);
  return canonical === "" ? null : canonical;
}

/**
 * Validate one decoded deskView value: bounded, single-occurrence known keys only, and a
 * byte-for-byte round trip through the canonical v2 parser/serializer.
 */
export function validateDeskView(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (value.length > DESK_VIEW_MAX_CODE_UNITS) return null;
  if (value.startsWith("?") || value.includes("#")) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(value);
  } catch {
    return null;
  }
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) return null;
    seen.add(key);
  }
  if (seen.has(DESK_VIEW_PARAM)) return null;
  if (params.get("v") !== "2") return null;
  const canonical = serializeRenewalDeskQueryV2(parseRenewalDeskQueryV2(params));
  return canonical === value ? canonical : null;
}

/** Parse the current page's deskView param into desk state; invalid values fall back to default. */
export function parseDeskViewState(
  value: string | null | undefined,
): RenewalDeskQueryV2State {
  const canonical = validateDeskView(value);
  return parseRenewalDeskQueryV2(
    canonical === null ? new URLSearchParams() : new URLSearchParams(canonical),
  );
}

function withDeskView(path: string, deskView: string | null): string {
  if (deskView === null) return path;
  const params = new URLSearchParams();
  params.set(DESK_VIEW_PARAM, deskView);
  return `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`;
}

/** The canonical desk URL for a view state (defaults omit the query string entirely). */
export function buildDeskHref(state: RenewalDeskQueryV2State): string {
  const canonical = serializeRenewalDeskQueryV2(state);
  return canonical === "" ? RENEWAL_DESK_ROUTE : `${RENEWAL_DESK_ROUTE}?${canonical}`;
}

const STABLE_LEASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isStableLeaseId(value: string): boolean {
  return STABLE_LEASE_ID_PATTERN.test(value);
}

export interface WorkspaceHrefInput {
  readonly leaseId: string;
  readonly step?: string;
  readonly deskView: string | null;
}

/** One workspace link carrying an optional allow-listed step plus the canonical continuation. */
export function buildWorkspaceHref(input: WorkspaceHrefInput): string {
  if (!isStableLeaseId(input.leaseId)) {
    throw new Error("Invalid renewal workspace lease id.");
  }
  const params = new URLSearchParams();
  if (input.step) params.set("step", input.step);
  if (input.deskView !== null) params.set(DESK_VIEW_PARAM, input.deskView);
  const query = params.toString();
  const path = `${RENEWAL_WORKSPACE_ROUTE_PREFIX}${encodeURIComponent(input.leaseId)}`;
  return query === "" ? path : `${path}?${query}`;
}

/** The workspace's return link: exactly the canonical internal desk route for the carried view. */
export function buildDeskReturnHref(deskView: string | null | undefined): string {
  const canonical = validateDeskView(deskView);
  return canonical === null ? RENEWAL_DESK_ROUTE : `${RENEWAL_DESK_ROUTE}?${canonical}`;
}

export { withDeskView };
