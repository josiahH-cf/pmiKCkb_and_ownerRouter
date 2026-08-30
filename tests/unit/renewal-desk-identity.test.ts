import { describe, expect, it } from "vitest";

import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";

describe("S78 source-backed renewal desk identity", () => {
  it("projects the measured export address, property, every tenant, and every portfolio owner", () => {
    const [view] = leaseViewsFromExport([
      {
        lease: {
          leaseID: 4821,
          tenants: [{ firstName: "Jordan", lastName: "Maple" }, { name: "Riley Maple" }],
        },
        property: {
          name: "Maple Court",
          streetNumber: "4821",
          streetName: "Maple Ct",
          address2: "Unit 4",
        },
        portfolio: {
          owners: [
            { companyName: "Maple Holdings LLC" },
            { firstName: "Avery", lastName: "Owner" },
          ],
        },
        unit: { rent: "1250.00" },
      },
    ]);

    expect(projectRenewalDeskIdentity(view)).toEqual({
      address: {
        label: "4821 Maple Ct Unit 4",
        sourceRef: "rentvine:lease:4821:property.address",
      },
      property: {
        label: "Maple Court",
        sourceRef: "rentvine:lease:4821:property.name",
      },
      tenants: [
        {
          label: "Jordan Maple",
          sourceRef: "rentvine:lease:4821:tenants[0].firstName+lastName",
        },
        {
          label: "Riley Maple",
          sourceRef: "rentvine:lease:4821:tenants[1].name",
        },
      ],
      owners: [
        {
          label: "Maple Holdings LLC",
          sourceRef: "rentvine:lease:4821:portfolio.owners[0].companyName",
        },
        {
          label: "Avery Owner",
          sourceRef: "rentvine:lease:4821:portfolio.owners[1].firstName+lastName",
        },
      ],
    });
  });

  it("never promotes an email, address fragment, lease id, or neighboring value into a party name", () => {
    const view = {
      leaseID: "no-names",
      tenant: { email: "resident@example.invalid" },
      owners: [{ email: "owner@example.invalid" }],
      property: {
        streetNumber: "9",
        streetName: "Truth St",
        owner: { email: "neighbor@example.invalid" },
      },
      nearbyOwnerName: "Wrong Neighbor",
    };

    const first = projectRenewalDeskIdentity(view);
    const second = projectRenewalDeskIdentity(structuredClone(view));

    expect(first.tenants).toEqual([]);
    expect(first.owners).toEqual([]);
    expect(first.address?.label).toBe("9 Truth St");
    expect(first).toEqual(second);
    expect([...first.tenants, ...first.owners].map((fact) => fact.label)).not.toEqual(
      expect.arrayContaining([
        "resident@example.invalid",
        "owner@example.invalid",
        "neighbor@example.invalid",
        "Wrong Neighbor",
        "no-names",
      ]),
    );
  });

  it("deduplicates normalized displayed names while retaining exact first-source provenance", () => {
    const identity = projectRenewalDeskIdentity({
      leaseID: "dedupe",
      tenants: [{ name: "Taylor Reed" }, { name: " taylor reed " }],
      portfolio: {
        owners: [{ name: "Owner One" }, { displayName: "owner one" }],
      },
    });

    expect(identity.tenants).toEqual([
      {
        label: "Taylor Reed",
        sourceRef: "rentvine:lease:dedupe:tenants[0].name",
      },
    ]);
    expect(identity.owners).toEqual([
      {
        label: "Owner One",
        sourceRef: "rentvine:lease:dedupe:portfolio.owners[0].name",
      },
    ]);
  });

  it("does not mix lower-precedence owner shapes into the authoritative portfolio roster", () => {
    const identity = projectRenewalDeskIdentity({
      leaseID: "owner-precedence",
      portfolio: { owners: [{ name: "Current Portfolio Owner" }] },
      property: { owners: [{ name: "Stale Property Owner" }] },
      owners: [{ name: "Stale Lease Owner" }],
      ownerName: "Stale Flat Owner",
    });

    expect(identity.owners).toEqual([
      {
        label: "Current Portfolio Owner",
        sourceRef: "rentvine:lease:owner-precedence:portfolio.owners[0].name",
      },
    ]);
  });
});
