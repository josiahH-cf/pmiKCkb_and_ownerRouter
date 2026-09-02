import { describe, expect, it } from "vitest";

import { validateAccessReturnTarget } from "@/lib/access/handoff";
import {
  ACCESS_RETURN_TEXT_SEARCH_NOTICE,
  accessReturnClearsTextSearch,
  buildRenewalDeskAccessReturn,
  buildRenewalWorkspaceAccessReturn,
  isValidRenewalAccessReturn,
  privacyBoundedDeskState,
} from "@/lib/lease-renewal/access-return";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";

const TOKEN_A = `p1_${"a".repeat(43)}`;
const TOKEN_B = `p1_${"b".repeat(43)}`;

/** Every non-text key at its longest legal value — the serializer's maximum output. */
const MAX_LEGAL_STATE: RenewalDeskQueryV2State = {
  ...DEFAULT_RENEWAL_DESK_QUERY_V2,
  q: "x".repeat(120),
  lease: "y".repeat(120),
  sort: "rent_verification",
  direction: "desc",
  scope: "tracked",
  endDate: "",
  month: "",
  due: "needs_verification",
  ownerKey: TOKEN_A,
  tenantKey: TOKEN_B,
  from: "2026-09-01",
  through: "2026-12-29",
  step: "signatures-follow-up",
  waiting: "document_coordinator",
  conflicts: "without",
  overallStatus: "needs_verification",
  blocked: "not_blocked",
  rentVerification: "needs_verification",
};

describe("S82 privacy-bounded access returns", () => {
  it("removes only the two free-text keys and reports when the notice must render", () => {
    const bounded = privacyBoundedDeskState(MAX_LEGAL_STATE);
    expect(bounded.q).toBe("");
    expect(bounded.lease).toBe("");
    expect(bounded.ownerKey).toBe(TOKEN_A);
    expect(bounded.from).toBe("2026-09-01");
    expect(accessReturnClearsTextSearch(MAX_LEGAL_STATE)).toBe(true);
    expect(accessReturnClearsTextSearch(bounded)).toBe(false);
    expect(ACCESS_RETURN_TEXT_SEARCH_NOTICE).toBe(
      "Your text search will be cleared in the access return link.",
    );
  });

  it("builds desk and workspace returns that the S83 validator accepts verbatim", () => {
    const deskReturn = buildRenewalDeskAccessReturn(MAX_LEGAL_STATE);
    expect(deskReturn).not.toContain("q=");
    expect(deskReturn).not.toContain("lease=");
    expect(validateAccessReturnTarget(deskReturn)).toBe(deskReturn);

    const workspaceReturn = buildRenewalWorkspaceAccessReturn({
      leaseId: "L-42",
      step: "owner-decision",
      state: MAX_LEGAL_STATE,
    });
    expect(workspaceReturn.startsWith("/lease-renewal/live/desk/lease/L-42?step=")).toBe(
      true,
    );
    expect(validateAccessReturnTarget(workspaceReturn)).toBe(workspaceReturn);

    const defaultDesk = buildRenewalDeskAccessReturn({
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
    });
    expect(defaultDesk).toBe("/lease-renewal/live/desk");
    expect(validateAccessReturnTarget(defaultDesk)).toBe(defaultDesk);
  });

  it("keeps the maximum legal once-decoded route far under S83's 32,768-byte bound", () => {
    const workspaceReturn = buildRenewalWorkspaceAccessReturn({
      leaseId: "L".repeat(128),
      step: "signatures-follow-up",
      state: MAX_LEGAL_STATE,
    });
    const decoded = decodeURIComponent(workspaceReturn);
    expect(new TextEncoder().encode(workspaceReturn).byteLength).toBeLessThan(32_768);
    expect(new TextEncoder().encode(decoded).byteLength).toBeLessThan(32_768);
  });

  it.each([
    [
      "a desk return carrying free text",
      `/lease-renewal/live/desk?${serializeRenewalDeskQueryV2({
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        lease: "12 Oak",
      })}`,
    ],
    [
      "a desk return carrying legacy q text",
      `/lease-renewal/live/desk?${serializeRenewalDeskQueryV2({
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        q: "search words",
      })}`,
    ],
    [
      "a noncanonical desk query",
      "/lease-renewal/live/desk?v=2&direction=desc&sort=lease",
    ],
    ["a legacy display-label query", "/lease-renewal/live/desk?owner=Owner+Alpha"],
    ["an empty query", "/lease-renewal/live/desk?"],
    ["another destination with a query", "/work?v=2&sort=lease"],
    ["an approval queue with a query", "/approval-queue?view=access"],
    [
      "a workspace with an unknown step",
      "/lease-renewal/live/desk/lease/L-1?step=not-a-step",
    ],
    [
      "a workspace with reversed key order",
      "/lease-renewal/live/desk/lease/L-1?deskView=v%3D2%26sort%3Dlease&step=owner-decision",
    ],
    [
      "a workspace with an extra key",
      "/lease-renewal/live/desk/lease/L-1?step=owner-decision&x=1",
    ],
    [
      "a workspace deskView carrying text search",
      "/lease-renewal/live/desk/lease/L-1?deskView=v%3D2%26lease%3DOak",
    ],
    [
      "a workspace deskView with a nested deskView",
      "/lease-renewal/live/desk/lease/L-1?deskView=v%3D2%26deskView%3Dv%253D2",
    ],
  ])("rejects %s whole rather than partially restoring", (_label, value) => {
    expect(isValidRenewalAccessReturn(value)).toBe(false);
    expect(() => validateAccessReturnTarget(value)).toThrow(/not an allowed/i);
  });

  it("keeps existing path-only destinations working and still refuses fragments", () => {
    expect(validateAccessReturnTarget("/lease-renewal/live/desk")).toBe(
      "/lease-renewal/live/desk",
    );
    expect(validateAccessReturnTarget("/work")).toBe("/work");
    expect(() => validateAccessReturnTarget("/lease-renewal/live/desk#x")).toThrow(
      /not an allowed/i,
    );
  });
});
