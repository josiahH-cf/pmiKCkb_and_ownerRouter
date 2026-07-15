import { describe, expect, it } from "vitest";

import {
  assertNonRoutableTestEmail,
  dataModeLabel,
  executionEvidenceMarker,
  parseExplicitDataMode,
  requireExplicitDataMode,
  resolveDataMode,
} from "@/lib/data-mode";

describe("record data mode", () => {
  it("treats legacy and malformed persisted records as Live", () => {
    expect(resolveDataMode(undefined)).toBe("live");
    expect(resolveDataMode({})).toBe("live");
    expect(resolveDataMode({ data_mode: "live" })).toBe("live");
    expect(resolveDataMode({ data_mode: "test" })).toBe("test");
    expect(resolveDataMode({ data_mode: "fixture" as never })).toBe("live");
  });

  it("requires an exact explicit value at write boundaries", () => {
    expect(parseExplicitDataMode("live")).toBe("live");
    expect(parseExplicitDataMode("test")).toBe("test");
    expect(parseExplicitDataMode("TEST")).toBeNull();
    expect(() => requireExplicitDataMode(undefined)).toThrow(/exactly live or test/i);
  });

  it("keeps labels and evidence eligibility distinct", () => {
    expect(dataModeLabel("live")).toBe("Live data");
    expect(dataModeLabel("test")).toBe("Test data");
    expect(executionEvidenceMarker("live")).toEqual({
      dataMode: "live",
      liveEvidenceEligible: true,
    });
    expect(executionEvidenceMarker("test")).toEqual({
      dataMode: "test",
      liveEvidenceEligible: false,
    });
  });

  it("admits only reserved non-routable Test mailboxes", () => {
    expect(assertNonRoutableTestEmail(" SERVICE@SUMMIT-PLUMBING.EXAMPLE.INVALID ")).toBe(
      "service@summit-plumbing.example.invalid",
    );
    expect(() => assertNonRoutableTestEmail("vendor@example.com")).toThrow(
      /non-routable/i,
    );
    expect(() => assertNonRoutableTestEmail("vendor@pmikcmetro.com")).toThrow(
      /non-routable/i,
    );
  });
});
