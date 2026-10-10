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
it("opens the actual maintenance ticket focus route and keeps only source-backed canonical relations", () => {
  const records = projectMaintenanceSearchEntities(
    [
      {
        id: "ticket-one",
        summary: "Dripping fixture",
        unit: {
          unitId: "unit:103",
          label: "East 123 Fixture Lane",
        },
        status: "Open",
        updated_at: time,
        property_id: "55",
        vendor_id: "vendor-1",
      },
    ],
    time,
  );
  expect(records[0].href).toBe("/maintenance?ticket_id=ticket-one");
  expect(records[0].relations).toEqual([
    { type: "unit", id: "103", label: "East 123 Fixture Lane" },
    { type: "property", id: "55", label: "Property 55" },
    { type: "vendor", id: "vendor-1", label: "Assigned vendor vendor-1" },
  ]);
  expect(records[0].asOf).toBe(time);
});
