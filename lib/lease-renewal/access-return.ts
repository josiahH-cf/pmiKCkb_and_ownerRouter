// S82's bounded extension of S83's access-return registry: only `renewal_desk` and
// `renewal_workspace` accept query state, and only in privacy-bounded canonical form.
//
// The access-return variant first removes the free-text `q` and `lease` keys from the canonical v2
// state, so no address/property/lease-search text ever nests inside `/admin/access`. The workspace
// variant accepts exactly one allow-listed renewal-v1 `step` plus one canonical `deskView` built
// from the same privacy-bounded state, in canonical query order. Owner/tenant display labels remain
// opaque `p1_` keys throughout. A malformed continuation drops the whole return rather than
// partially restoring a different lease or view.

import {
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_DESK_ROUTE,
  RENEWAL_WORKSPACE_ROUTE_PREFIX,
  isStableLeaseId,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import { RENEWAL_PROCESS_STEP_IDS } from "@/lib/lease-renewal/renewal-process";

const WORKSPACE_STEP_IDS: readonly string[] = RENEWAL_PROCESS_STEP_IDS;

/** The exact visible warning rendered beside Request access when a text filter is active. */
export const ACCESS_RETURN_TEXT_SEARCH_NOTICE =
  "Your text search will be cleared in the access return link.";

/** Remove the two free-text keys; every non-text filter is retained canonically. */
export function privacyBoundedDeskState(
  state: RenewalDeskQueryV2State,
): RenewalDeskQueryV2State {
  return { ...state, q: "", lease: "" };
}

export function accessReturnClearsTextSearch(state: RenewalDeskQueryV2State): boolean {
  return state.q !== "" || state.lease !== "";
}

/** Canonical privacy-bounded desk return route for the current view. */
export function buildRenewalDeskAccessReturn(state: RenewalDeskQueryV2State): string {
  const canonical = serializeRenewalDeskQueryV2(privacyBoundedDeskState(state));
  return canonical === "" ? RENEWAL_DESK_ROUTE : `${RENEWAL_DESK_ROUTE}?${canonical}`;
}

/** Canonical privacy-bounded workspace return route: step first, then deskView. */
export function buildRenewalWorkspaceAccessReturn(input: {
  readonly leaseId: string;
  readonly step?: string;
  readonly state: RenewalDeskQueryV2State;
}): string {
  if (!isStableLeaseId(input.leaseId)) {
    throw new Error("Invalid renewal workspace lease id.");
  }
  if (input.step !== undefined && !WORKSPACE_STEP_IDS.includes(input.step)) {
    throw new Error("Unknown renewal workspace step.");
  }
  const params = new URLSearchParams();
  if (input.step) params.set("step", input.step);
  const deskView = serializeRenewalDeskQueryV2(privacyBoundedDeskState(input.state));
  if (deskView !== "") params.set("deskView", deskView);
  const query = params.toString();
  const path = `${RENEWAL_WORKSPACE_ROUTE_PREFIX}${encodeURIComponent(input.leaseId)}`;
  return query === "" ? path : `${path}?${query}`;
}

function privacyBoundedCanonicalQuery(query: string): boolean {
  const canonical = validateDeskView(query);
  if (canonical === null) return false;
  const state = parseRenewalDeskQueryV2(new URLSearchParams(canonical));
  return state.q === "" && state.lease === "";
}

/**
 * Validate one already-structurally-safe return value that carries a query. Only the two S82
 * destinations accept one; everything else remains path-only in S83's registry.
 */
export function isValidRenewalAccessReturn(value: string): boolean {
  const questionMark = value.indexOf("?");
  if (questionMark === -1) return false;
  const path = value.slice(0, questionMark);
  const query = value.slice(questionMark + 1);
  if (query === "") return false;

  if (path === RENEWAL_DESK_ROUTE) {
    return privacyBoundedCanonicalQuery(query);
  }

  if (path.startsWith(RENEWAL_WORKSPACE_ROUTE_PREFIX)) {
    const segment = path.slice(RENEWAL_WORKSPACE_ROUTE_PREFIX.length);
    if (!isStableLeaseId(segment)) return false;
    if (path !== `${RENEWAL_WORKSPACE_ROUTE_PREFIX}${encodeURIComponent(segment)}`) {
      return false;
    }
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(query);
    } catch {
      return false;
    }
    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length) return false;
    if (!keys.every((key) => key === "step" || key === "deskView")) return false;
    const expectedOrder = keys.includes("step") ? ["step"] : [];
    if (keys.includes("deskView")) expectedOrder.push("deskView");
    if (keys.join(",") !== expectedOrder.join(",")) return false;
    if (keys.length === 0) return false;
    const step = params.get("step");
    if (step !== null && !WORKSPACE_STEP_IDS.includes(step)) return false;
    const deskView = params.get("deskView");
    if (deskView !== null && !privacyBoundedCanonicalQuery(deskView)) return false;
    return true;
  }

  return false;
}
