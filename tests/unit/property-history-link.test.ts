import { describe, expect, it } from "vitest";

import {
  buildPropertyHistoryHref,
  normalizeRenewalReturnTo,
} from "@/lib/lease-renewal/property-history-link";

describe("property history navigation", () => {
  it("builds an encoded history destination with a safe renewal return path", () => {
    expect(
      buildPropertyHistoryHref(
        "1207 walnut street unit 2",
        "/lease-renewal/runs/run 1?flag=current_rent",
      ),
    ).toBe(
      "/lease-renewal/property/1207%20walnut%20street%20unit%202?returnTo=%2Flease-renewal%2Fruns%2Frun%201%3Fflag%3Dcurrent_rent",
    );
  });

  it("never constructs a destination for a missing property mapping", () => {
    expect(buildPropertyHistoryHref(undefined, "/lease-renewal")).toBeNull();
    expect(buildPropertyHistoryHref(null, "/lease-renewal")).toBeNull();
    expect(buildPropertyHistoryHref("   ", "/lease-renewal")).toBeNull();
  });

  it("drops external, protocol-relative, and malformed return destinations", () => {
    expect(normalizeRenewalReturnTo("https://example.com")).toBeNull();
    expect(normalizeRenewalReturnTo("//example.com/lease-renewal")).toBeNull();
    expect(normalizeRenewalReturnTo("/lease-renewal\nunsafe")).toBeNull();
    expect(buildPropertyHistoryHref("key", "https://example.com")).toBe(
      "/lease-renewal/property/key",
    );
  });
});
