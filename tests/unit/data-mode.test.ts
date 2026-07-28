import { describe, expect, it } from "vitest";

import {
  assertNonRoutableTestEmail,
  dataModeLabel,
  executionEvidenceMarker,
  parseExplicitDataMode,
  requireExplicitDataMode,
  requireRecordDataMode,
  resolveStoredDataMode,
} from "@/lib/data-mode";

describe("record data mode", () => {
  // Stage-one compatibility ONLY (S40). This is deliberately the single place a missing value
  // still resolves to Live, because that is what already-stored records mean. S49 deletes it once
  // the migration proves no unclassified record remains.
  it("treats legacy and malformed persisted records as Live on the compatibility read", () => {
    expect(resolveStoredDataMode(undefined)).toBe("live");
    expect(resolveStoredDataMode({})).toBe("live");
    expect(resolveStoredDataMode({ data_mode: "live" })).toBe("live");
    expect(resolveStoredDataMode({ data_mode: "test" })).toBe("test");
    expect(resolveStoredDataMode({ data_mode: "fixture" as never })).toBe("live");
  });

  // AC-S40-1: anything newly written, or any decision that grants authority, fails closed.
  it("refuses an unclassified record on the strict read", () => {
    expect(requireRecordDataMode({ data_mode: "live" })).toBe("live");
    expect(requireRecordDataMode({ data_mode: "test" })).toBe("test");
    for (const record of [
      undefined,
      null,
      {},
      { data_mode: undefined },
      { data_mode: "" as never },
      { data_mode: "demo" as never },
      { data_mode: "LIVE" as never },
      { data_mode: "fixture" as never },
    ]) {
      expect(() => requireRecordDataMode(record)).toThrow(/no data classification/i);
    }
  });

  it("never lets a record name or a browser-shaped value stand in for a classification", () => {
    expect(() =>
      requireRecordDataMode({
        // A name containing TEST must not determine the mode.
        data_mode: undefined,
        name: "TEST — 204 Maple Court Unit 2",
      } as never),
    ).toThrow(/no data classification/i);
    expect(parseExplicitDataMode({ toString: () => "test" })).toBeNull();
    expect(parseExplicitDataMode(["test"])).toBeNull();
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
