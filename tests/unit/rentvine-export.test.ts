import { describe, expect, it } from "vitest";
import {
  LEASE_EXPORT_PAGE_SIZE,
  RentVineClient,
  type RentVineHttpRequest,
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

// S57: a paging stub keyed on the request's page/pageSize params. Returns whatever rows the
// per-page factory produces, so tests can simulate full pages forever, overlapping pages, and
// short final pages.
function pagingClient(
  rowsForPage: (page: number, pageSize: number) => Record<string, unknown>[],
): { client: RentVineClient; requests: URL[] } {
  const requests: URL[] = [];
  const transport: RentVineHttpTransport = {
    async send(request: RentVineHttpRequest): Promise<RentVineHttpResponse> {
      const url = new URL(request.url);
      requests.push(url);
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
      const bodyText = JSON.stringify(rowsForPage(page, pageSize));
      return {
        status: 200,
        headers: {},
        text: async () => bodyText,
        json: async () => JSON.parse(bodyText) as unknown,
      };
    },
  };
  return {
    client: new RentVineClient(
      { baseUrl: BASE_URL, apiKey: "demo-key", apiSecret: "demo-secret" },
      transport,
    ),
    requests,
  };
}

function exportRow(id: number): Record<string, unknown> {
  return { lease: { leaseID: id } };
}

describe("listAllLeasesExport (S57 complete paged read)", () => {
  it("pages with an explicit pageSize until a short page and reports complete:true", async () => {
    // 7 distinct rows served 3 per page: pages 1-2 full, page 3 short (1 row) ends the read.
    const { client, requests } = pagingClient((page, pageSize) => {
      const start = (page - 1) * pageSize;
      return Array.from({ length: Math.max(0, Math.min(pageSize, 7 - start)) }, (_, i) =>
        exportRow(start + i + 1),
      );
    });
    const result = await client.listAllLeasesExport({ pageSize: 3 });
    expect(result.complete).toBe(true);
    expect(result.pages).toBe(3);
    expect(result.rows).toHaveLength(7);
    // Every request carried the explicit paging params (never the bare default page).
    for (const url of requests) {
      expect(url.searchParams.get("pageSize")).toBe("3");
      expect(url.searchParams.get("page")).toBeTruthy();
    }
  });

  it("uses the default portfolio-scale pageSize when none is given", async () => {
    const { client, requests } = pagingClient(() => [exportRow(1)]);
    const result = await client.listAllLeasesExport();
    expect(result.complete).toBe(true);
    expect(requests[0].searchParams.get("pageSize")).toBe(String(LEASE_EXPORT_PAGE_SIZE));
  });

  // AC-S57-3: a transport returning exactly pageSize rows on every page never ends on a short
  // page; the reader stops at the page cap and NEVER reports a short set as complete.
  it("stops at the page cap with complete:false when every page comes back full", async () => {
    const { client } = pagingClient((page, pageSize) =>
      Array.from({ length: pageSize }, (_, i) =>
        exportRow((page - 1) * pageSize + i + 1),
      ),
    );
    const result = await client.listAllLeasesExport({ pageSize: 5, maxPages: 4 });
    expect(result.complete).toBe(false);
    expect(result.pages).toBe(4);
    expect(result.rows).toHaveLength(20);
  });

  // AC-S57-4: page/pageSize interaction is observed behavior, not contract — overlapping pages
  // must not produce duplicate lease ids.
  it("deduplicates overlapping pages by lease id", async () => {
    // Page 1: ids 1..5. Page 2: ids 4..8 (overlap of 2). Page 3: short → complete.
    const { client } = pagingClient((page) => {
      if (page === 1) return [1, 2, 3, 4, 5].map(exportRow);
      if (page === 2) return [4, 5, 6, 7, 8].map(exportRow);
      return [];
    });
    const result = await client.listAllLeasesExport({ pageSize: 5 });
    expect(result.complete).toBe(true);
    const ids = result.rows.map((row) => (row.lease as { leaseID: number }).leaseID);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps id-less rows instead of collapsing them into one another", async () => {
    const { client } = pagingClient((page) =>
      page === 1 ? [{ lease: {} }, { lease: {} }, exportRow(1)] : [],
    );
    const result = await client.listAllLeasesExport({ pageSize: 3 });
    expect(result.rows).toHaveLength(3);
  });

  it("refuses a non-positive pageSize or maxPages", async () => {
    const { client } = pagingClient(() => []);
    await expect(client.listAllLeasesExport({ pageSize: 0 })).rejects.toThrow(
      /positive integer pageSize/,
    );
    await expect(client.listAllLeasesExport({ maxPages: 0 })).rejects.toThrow(
      /positive integer maxPages/,
    );
  });

  it("forwards extra params while owning page and pageSize", async () => {
    const { client, requests } = pagingClient(() => [exportRow(1)]);
    await client.listAllLeasesExport({
      pageSize: 3,
      params: { status: "active", pageSize: 999_999, page: 42 },
    });
    // The pager's own paging values win over params trying to override them.
    expect(requests[0].searchParams.get("pageSize")).toBe("3");
    expect(requests[0].searchParams.get("page")).toBe("1");
    expect(requests[0].searchParams.get("status")).toBe("active");
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
