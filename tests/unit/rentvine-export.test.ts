import { describe, expect, it } from "vitest";
import {
  RentVineClient,
  type RentVineHttpResponse,
  type RentVineHttpTransport,
} from "@/lib/integrations/rentvine/client";
import {
  leaseCurrentRent,
  leaseEndDateIso,
  leaseTenantName,
  leaseViewsFromExport,
  mapLeasesToNonSheetCandidates,
} from "@/lib/integrations/rentvine/lease-mapper";
import { resolveRenewalRecipient } from "@/lib/lease-renewal/recipient-resolution";

const BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
const READ_TS = "2026-06-20T00:00:00.000Z";

function clientReturning(status: number, body: unknown): RentVineClient {
  const bodyText = JSON.stringify(body);
  const transport: RentVineHttpTransport = {
    async send(): Promise<RentVineHttpResponse> {
      return {
        status,
        headers: {},
        text: async () => bodyText,
        json: async () => JSON.parse(bodyText) as unknown,
      };
    },
  };
  return new RentVineClient(
    { baseUrl: BASE_URL, apiKey: "demo-key", apiSecret: "demo-secret" },
    transport,
  );
}

// Shaped like the live /leases/export response (KEY names confirmed live; values synthetic): tenant
// names live on lease.tenants[].name and the contractual rent on unit.rent.
const EXPORT_ROW = {
  lease: {
    leaseID: 1,
    endDate: "2026-08-31",
    tenants: [{ name: "Jordan Maple", email: "tenant@example.com" }],
  },
  property: { streetName: "100 Birchwood Ln" },
  unit: { rent: "1250.00", streetName: "100 Birchwood Ln" },
  balances: { unpaidRentAmount: "0.00" },
};

describe("listLeasesExport + leaseViewsFromExport", () => {
  it("reads export rows raw with the appends preserved", async () => {
    const client = clientReturning(200, [EXPORT_ROW]);
    const rows = await client.listLeasesExport({ limit: 1 });
    expect(rows).toHaveLength(1);
    expect((rows[0].unit as Record<string, unknown>).rent).toBe("1250.00");
  });

  it("flattens an export row: lifts unit.rent to currentRent and keeps tenants[]", () => {
    const views = leaseViewsFromExport([EXPORT_ROW]);
    expect(views[0].currentRent).toBe("1250.00");
    expect(views[0].endDate).toBe("2026-08-31");
    expect(Array.isArray(views[0].tenants)).toBe(true);
  });

  it("maps a flattened export view (tenant from tenants[0].name, rent from unit.rent)", () => {
    const views = leaseViewsFromExport([EXPORT_ROW]);
    const result = mapLeasesToNonSheetCandidates(views, { readTimestamp: READ_TS });

    expect(result.skipped).toBe(0);
    expect(result.candidates[0].joinValue).toBe("Jordan Maple");
    expect(result.candidates[0].fields.lease_end_date.value).toBe("2026-08-31");
    expect(result.candidates[0].fields.current_rent.value).toBe(1250);
    expect(result.resolvedKeys.tenantName).toBe("tenants[0].name");
    expect(result.resolvedKeys.currentRent).toBe("currentRent");
  });

  it("preserves property/portfolio siblings so the owner channel resolves from an export row", () => {
    const rowWithOwner = {
      lease: {
        leaseID: 7,
        endDate: "2026-09-30",
        tenants: [{ name: "Ada Rowan", email: "tenant7@northend-apts.com" }],
      },
      property: {
        streetName: "200 Cedar Ct",
        owner: { name: "Cedar Holdings LLC", email: "owner7@cedar-holdings.com" },
      },
      unit: { rent: "1400.00" },
    };
    const [view] = leaseViewsFromExport([rowWithOwner]);
    expect((view.property as Record<string, unknown>).owner).toBeDefined();

    const owner = resolveRenewalRecipient({ lease: view, channel: "owner" });
    expect(owner.verified).toBe(true);
    expect(owner.to).toBe("owner7@cedar-holdings.com");
    expect(owner.recipientSourceRef).toBe("rentvine:lease:7:property.owner.email");

    // Tenant still resolves from the same view.
    expect(resolveRenewalRecipient({ lease: view, channel: "tenant" }).to).toBe(
      "tenant7@northend-apts.com",
    );
  });

  it("owner channel stays Needs-Verification when the export carries no owner contact", () => {
    // EXPORT_ROW's property has only streetName — an address is NOT an owner email.
    const [view] = leaseViewsFromExport([EXPORT_ROW]);
    expect(resolveRenewalRecipient({ lease: view, channel: "owner" }).verified).toBe(
      false,
    );
  });

  it("SKIPS a malformed (null/primitive) export row instead of throwing on the whole read", () => {
    const views = leaseViewsFromExport([EXPORT_ROW, null, 42, "oops", undefined]);
    // The one good row survives; the bad elements are dropped, not fatal.
    expect(views).toHaveLength(1);
    expect(views[0].leaseID).toBe(1);
  });
});

describe("decoupled lease-fact extractors", () => {
  it("read current rent + lease-end WITHOUT requiring a tenant name (owner-channel need)", () => {
    // A lease with a rent + end date but no resolvable tenant name — the candidate mapper would skip it.
    const lease = { leaseID: 5, endDate: "2026-09-30", currentRent: "1400.00" };
    expect(
      mapLeasesToNonSheetCandidates([lease], { readTimestamp: READ_TS }).candidates,
    ).toHaveLength(0);
    expect(leaseTenantName(lease)).toBeUndefined();
    expect(leaseEndDateIso(lease)).toBe("2026-09-30");
    expect(leaseCurrentRent(lease)).toBe(1400);
  });

  it("resolves a tenant name from tenants[0] and coerces rent/date", () => {
    const lease = {
      leaseID: 6,
      endDate: "9/30/2026",
      unit: undefined,
      currentRent: 1250,
      tenants: [{ name: "Jordan Maple" }],
    };
    expect(leaseTenantName(lease)).toBe("Jordan Maple");
    expect(leaseEndDateIso(lease)).toBe("2026-09-30");
    expect(leaseCurrentRent(lease)).toBe(1250);
  });
});
