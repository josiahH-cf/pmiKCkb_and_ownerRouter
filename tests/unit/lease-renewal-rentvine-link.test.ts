import { describe, expect, it } from "vitest";
import {
  parseRentvineRef,
  rentvineJoinIdFromCell,
  rentvineRefId,
} from "@/lib/lease-renewal/rentvine-link";

describe("parseRentvineRef", () => {
  it("parses a path-routed lease url", () => {
    expect(
      parseRentvineRef("https://pmikcmetro.rentvine.com/manager/leases/123"),
    ).toEqual({
      raw: "https://pmikcmetro.rentvine.com/manager/leases/123",
      leaseId: "123",
    });
  });

  it("parses a hash-routed lease url and a unit url", () => {
    expect(parseRentvineRef("https://pmikcmetro.rentvine.com/#/leases/77")?.leaseId).toBe(
      "77",
    );
    expect(parseRentvineRef("https://pmikcmetro.rentvine.com/units/456")?.unitId).toBe(
      "456",
    );
  });

  it("parses a query-string id", () => {
    expect(parseRentvineRef("https://x.rentvine.com/app?leaseID=999")?.leaseId).toBe(
      "999",
    );
  });

  it("returns null when there is no rentvine id", () => {
    expect(parseRentvineRef("https://example.com/whatever")).toBeNull();
    expect(parseRentvineRef("")).toBeNull();
  });
});

describe("rentvineRefId", () => {
  it("prefers the lease id, namespaced", () => {
    expect(rentvineRefId({ raw: "", leaseId: "123", unitId: "456" })).toBe("lease:123");
    expect(rentvineRefId({ raw: "", unitId: "456" })).toBe("unit:456");
    expect(rentvineRefId(null)).toBeNull();
  });
});

describe("rentvineJoinIdFromCell", () => {
  it("extracts from a HYPERLINK formula cell", () => {
    expect(
      rentvineJoinIdFromCell(
        '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/123","Guy")',
      ),
    ).toBe("lease:123");
  });

  it("extracts from a bare url cell", () => {
    expect(rentvineJoinIdFromCell("https://pmikcmetro.rentvine.com/leases/123")).toBe(
      "lease:123",
    );
  });

  it("returns null for a plain text cell", () => {
    expect(rentvineJoinIdFromCell("Guy and Jimmy")).toBeNull();
    expect(rentvineJoinIdFromCell("")).toBeNull();
  });
});
