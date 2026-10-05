import { describe, expect, it } from "vitest";
import { canonicalDeskPreferenceView } from "@/lib/lease-renewal/desk-preferences";
import {
  clearRenewalDeskFilters,
  DEFAULT_RENEWAL_DESK_QUERY_V2,
} from "@/lib/lease-renewal/desk-query-v2";

describe("S177 deliberate private view semantics", () => {
  it("retains deliberate q and lease search in the canonical account view", () => {
    expect(
      canonicalDeskPreferenceView(
        "v=2&q=Jane+Doe&lease=123+Sample+St&sort=end_date&direction=desc&scope=all",
      ),
    ).toBe("v=2&q=Jane+Doe&lease=123+Sample+St&sort=end_date&direction=desc&scope=all");
  });
  it("preserves Clear filters' current sort while removing every filter", () => {
    expect(
      clearRenewalDeskFilters({
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        q: "Jane",
        lease: "123",
        scope: "all",
        sort: "end_date",
        direction: "desc",
      }),
    ).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "end_date", direction: "desc" });
  });
});
