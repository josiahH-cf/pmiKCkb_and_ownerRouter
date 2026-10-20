import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import {
  projectLeaseSearchEntities,
  projectMaintenanceSearchEntities,
} from "@/lib/search/source-projections";
import { readPartyFilterKeyConfig } from "@/lib/lease-renewal/party-filter-key";
import type { RawLease } from "@/lib/integrations/rentvine/client";
const time = "2026-10-09T15:00:00Z",
  config = readPartyFilterKeyConfig({
    RENEWAL_DESK_PARTY_FILTER_KEY: randomBytes(32).toString("base64url"),
  });
const view = (leaseID: number, contactID?: number): RawLease => ({
  leaseID,
  unit: { unitID: leaseID + 100, address: "East 123 Fixture Lane" },
  property: {
    propertyID: 55,
    name: "Fixture property",
    owners: [{ contactID, name: "Miller" }],
  },
  tenants: [{ contactID: leaseID + 1000, name: "Resident Miller" }],
  description: "EXCLUDED_PRIVATE_BODY",
});
it("projects verified person IDs and distinct equal names into related-lease views without inventing missing associations", () => {
  const records = projectLeaseSearchEntities(
    [view(1, 101), view(2, 102), view(3)],
    time,
    config,
  );
  const owners = records.filter((e) => e.type === "owner");
  expect(owners.map((e) => e.id)).toEqual(["101", "102"]);
  expect(owners[0].href).toMatch(
    /^\/lease-renewal\/live\/desk\?v=2&scope=all&ownerKey=p2_/,
  );
  expect(owners[1].href).not.toBe(owners[0].href);
  expect(
    records
      .find((e) => e.type === "lease" && e.id === "3")
      ?.relations.some((r) => r.type === "owner"),
  ).toBe(false);
  expect(records.filter((e) => e.type === "resident")).toHaveLength(3);
  expect(records.filter((e) => e.type === "property")).toHaveLength(1);
  expect(records.filter((e) => e.type === "unit")).toHaveLength(3);
  expect(records.find((e) => e.type === "lease" && e.id === "2")?.href).toBe(
    "/lease-renewal/live/desk/lease/2",
  );
  expect(JSON.stringify(records)).not.toContain("EXCLUDED_PRIVATE_BODY");
});
it("omits retired ticket projections without reading or fabricating a destination", () => {
  expect(
    projectMaintenanceSearchEntities(
      [
        {
          id: "retained-fixture",
          summary: "Fixture",
          unit: null,
          status: "Open",
          updated_at: time,
        },
      ],
      time,
    ),
  ).toEqual([]);
});
