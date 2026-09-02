import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  DESK_VIEW_MAX_CODE_UNITS,
  RENEWAL_DESK_ROUTE,
  buildDeskHref,
  buildDeskReturnHref,
  buildWorkspaceHref,
  encodeDeskView,
  parseDeskViewState,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";

const TOKEN_A = `p1_${"a".repeat(43)}`;

const nondefault: RenewalDeskQueryV2State = {
  ...DEFAULT_RENEWAL_DESK_QUERY_V2,
  sort: "base_rent",
  direction: "desc",
  overallStatus: "blocked",
  ownerKey: TOKEN_A,
  lease: "12 Oak & Elm",
};

describe("S82 deskView continuation", () => {
  it("omits deskView entirely for the default desk", () => {
    expect(encodeDeskView({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 })).toBeNull();
    expect(buildWorkspaceHref({ leaseId: "L-1", deskView: null })).toBe(
      "/lease-renewal/live/desk/lease/L-1",
    );
    expect(buildDeskReturnHref(null)).toBe(RENEWAL_DESK_ROUTE);
  });

  it("round-trips a nondefault view byte-for-byte through link, validate, and return", () => {
    const deskView = encodeDeskView(nondefault);
    if (!deskView) throw new Error("Expected a nondefault deskView.");
    expect(validateDeskView(deskView)).toBe(deskView);

    const href = buildWorkspaceHref({
      leaseId: "L-1",
      step: "owner-decision",
      deskView,
    });
    const url = new URL(`https://app.example${href}`);
    expect(url.pathname).toBe("/lease-renewal/live/desk/lease/L-1");
    expect(url.searchParams.get("step")).toBe("owner-decision");
    // The outer URL uses ordinary URLSearchParams encoding exactly once for the deskView value.
    expect(url.searchParams.get("deskView")).toBe(deskView);

    expect(buildDeskReturnHref(deskView)).toBe(`${RENEWAL_DESK_ROUTE}?${deskView}`);
    expect(serializeRenewalDeskQueryV2(parseDeskViewState(deskView))).toBe(deskView);
  });

  it.each([
    ["a leading question mark", `?${serializeRenewalDeskQueryV2(nondefault)}`],
    ["a fragment", `${serializeRenewalDeskQueryV2(nondefault)}#top`],
    ["an absolute path", "/lease-renewal/live/desk?v=2&sort=base_rent"],
    ["an external URL", "https://evil.example/?v=2"],
    ["a protocol-relative URL", "//evil.example/?v=2"],
    ["a repeated key", "v=2&sort=base_rent&sort=due"],
    ["an unknown key", "v=2&sort=base_rent&extra=1"],
    ["an unknown version", "v=3&sort=base_rent"],
    ["a legacy no-version value", "sort=end_date&direction=desc"],
    ["a nested deskView", "v=2&sort=base_rent&deskView=v%3D2"],
    ["a noncanonical key order", "v=2&direction=desc&sort=base_rent"],
    ["a default-valued key", "v=2&sort=base_rent&scope=active"],
    ["a display party label", "v=2&owner=Owner+Alpha"],
    ["an oversized value", `v=2&lease=${"x".repeat(DESK_VIEW_MAX_CODE_UNITS)}`],
  ])("falls back to the default desk for %s", (_label, value) => {
    expect(validateDeskView(value)).toBeNull();
    expect(buildDeskReturnHref(value)).toBe(RENEWAL_DESK_ROUTE);
    expect(parseDeskViewState(value)).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
  });

  it("builds canonical desk hrefs and refuses an unstable lease id", () => {
    expect(buildDeskHref({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 })).toBe(RENEWAL_DESK_ROUTE);
    expect(buildDeskHref(nondefault)).toBe(
      `${RENEWAL_DESK_ROUTE}?${serializeRenewalDeskQueryV2(nondefault)}`,
    );
    expect(() => buildWorkspaceHref({ leaseId: "../etc", deskView: null })).toThrow(
      /lease id/i,
    );
    expect(() => buildWorkspaceHref({ leaseId: "", deskView: null })).toThrow(
      /lease id/i,
    );
  });
});
