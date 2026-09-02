import { describe, expect, it } from "vitest";

import {
  buildOperatingSheetDestination,
  buildRentvineDestination,
  expectedRentvineHost,
  resolveWorkspacePhaseHref,
} from "@/lib/lease-renewal/desk-destinations";

describe("S82 operating Sheet destination", () => {
  it("builds only from the configured spreadsheet id", () => {
    const destination = buildOperatingSheetDestination(
      "1diy6xQm2X94pJVDT5S-K8g7bKdUaK2-nH2UWuaG5auY",
    );
    expect(destination?.href).toBe(
      "https://docs.google.com/spreadsheets/d/1diy6xQm2X94pJVDT5S-K8g7bKdUaK2-nH2UWuaG5auY",
    );
    expect(destination?.label).toContain("new tab");
  });

  it.each([
    ["missing", undefined],
    ["empty", "  "],
    ["short", "abc"],
    ["path-breaking", "abc/../../evil-234567890123456789"],
    ["query-injecting", "abcdefghijklmnopqrst?x=1"],
  ])("fails closed for a %s spreadsheet id", (_label, id) => {
    expect(buildOperatingSheetDestination(id)).toBeNull();
  });
});

describe("S82 RentVine destination", () => {
  const expectedHost = "pmikcmetro.rentvine.com";

  it("derives the expected host only from an https configured base URL", () => {
    expect(expectedRentvineHost("https://pmikcmetro.rentvine.com/api/manager")).toBe(
      expectedHost,
    );
    expect(expectedRentvineHost("http://pmikcmetro.rentvine.com/api")).toBeNull();
    expect(expectedRentvineHost("not a url")).toBeNull();
    expect(expectedRentvineHost(undefined)).toBeNull();
  });

  it("opens externally only for the exact tenant host and matching parsed lease id", () => {
    const destination = buildRentvineDestination({
      sourceUrl: "https://pmikcmetro.rentvine.com/#/leases/1234",
      expectedHost,
      leaseId: "1234",
    });
    expect(destination?.kind).toBe("external");
    expect(destination?.href).toContain("pmikcmetro.rentvine.com");
  });

  it.each([
    ["a mismatched lease id", "https://pmikcmetro.rentvine.com/#/leases/999", "1234"],
    ["a foreign host", "https://evil.example/#/leases/1234", "1234"],
    [
      "a lookalike host",
      "https://pmikcmetro.rentvine.com.evil.example/#/leases/1234",
      "1234",
    ],
    ["plain http", "http://pmikcmetro.rentvine.com/#/leases/1234", "1234"],
    [
      "embedded credentials",
      "https://user:pw@pmikcmetro.rentvine.com/#/leases/1234",
      "1234",
    ],
    ["no lease id", "https://pmikcmetro.rentvine.com/dashboard", "1234"],
    ["an unparseable value", "notaurl", "1234"],
    ["a missing url", null, "1234"],
  ])("falls back to the in-app comparison for %s", (_label, sourceUrl, leaseId) => {
    expect(buildRentvineDestination({ sourceUrl, expectedHost, leaseId })).toBeNull();
  });

  it("fails closed when no expected host is configured", () => {
    expect(
      buildRentvineDestination({
        sourceUrl: "https://pmikcmetro.rentvine.com/#/leases/1234",
        expectedHost: null,
        leaseId: "1234",
      }),
    ).toBeNull();
  });
});

describe("S82 workspace phase resolution", () => {
  it("builds one guarded internal phase link carrying the desk continuation", () => {
    expect(
      resolveWorkspacePhaseHref({
        leaseId: "L-9",
        stepId: "owner-decision",
        deskView: "v=2&sort=base_rent",
      }),
    ).toBe(
      "/lease-renewal/live/desk/lease/L-9?step=owner-decision&deskView=v%3D2%26sort%3Dbase_rent",
    );
    expect(
      resolveWorkspacePhaseHref({
        leaseId: "L-9",
        stepId: "verify-renewal",
        deskView: null,
      }),
    ).toBe("/lease-renewal/live/desk/lease/L-9?step=verify-renewal");
  });
});
