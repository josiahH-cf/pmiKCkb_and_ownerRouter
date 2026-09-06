import { describe, expect, it, vi } from "vitest";

import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  CONTRACTUAL_BASE_RENT_SOURCE_PATH,
  RENTCAST_QUERY_POLICY,
  buildMarketCompQueryBasis,
} from "@/lib/lease-renewal/market-comp-query-basis";
import { RentCastMarketCompProvider } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

const RAW_EXPORT_ROW = {
  lease: {
    leaseID: "L1",
    endDate: "2026-10-31",
    tenants: [{ name: "Tenant" }],
  },
  unit: {
    rent: 1250,
    size: "1400",
    beds: 3,
    fullBaths: 2,
    halfBaths: 1,
    postalCode: "64118",
  },
  property: {
    streetNumber: "104",
    streetName: "NE Lindsay Ave",
    city: "Kansas City",
    stateID: "mo",
    postalCode: "64118",
    propertyTypeID: 7,
  },
};

describe("S59 measured export to RentCast query basis", () => {
  it("preserves measured fields, maps only supported facts, and names every omission", () => {
    const view = leaseViewsFromExport([RAW_EXPORT_ROW])[0];
    // S102: the contractual base rent comes from the lease detail, never from `unit.rent`.
    applyLeaseDetailToView(view, {
      baseRentAmount: 1250,
      rentAmount: 1250,
      isMonthToMonth: "0",
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: false,
    });
    const basis = buildMarketCompQueryBasis(view, "L1");

    expect(basis).toMatchObject({
      leaseId: "L1",
      addressLabel: "104 NE Lindsay Ave, Kansas City, MO 64118",
      policy: RENTCAST_QUERY_POLICY,
      query: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
      baseRent: {
        status: "verified",
        value: 1250,
        sourcePath: CONTRACTUAL_BASE_RENT_SOURCE_PATH,
      },
      trendPostalCode: "64118",
    });
    expect(basis.attributes).toEqual([
      {
        field: "bedrooms",
        label: "Bedrooms",
        status: "sent",
        value: 3,
        sourcePath: "unit.beds",
      },
      {
        field: "bathrooms",
        label: "Bathrooms",
        status: "sent",
        value: 2.5,
        sourcePath: "unit.fullBaths + 0.5 × unit.halfBaths",
      },
      {
        field: "squareFootage",
        label: "Square footage",
        status: "sent",
        value: 1400,
        sourcePath: "unit.size",
      },
      {
        field: "propertyType",
        label: "Property type",
        status: "omitted",
        reason: "RentVine propertyTypeID has no approved RentCast mapping.",
      },
    ]);
    expect(basis.query).not.toHaveProperty("propertyType");
  });

  it("omits the base rent when the lease detail is absent, even with unit.rent present (S102)", () => {
    const view = leaseViewsFromExport([RAW_EXPORT_ROW])[0];
    const basis = buildMarketCompQueryBasis(view, "L1");
    expect(basis.baseRent).toMatchObject({ status: "omitted" });
    expect(JSON.stringify(basis.baseRent)).not.toContain("1250");
  });

  it("names an unusable unit.size omission instead of rounding or guessing", () => {
    const row = {
      ...RAW_EXPORT_ROW,
      unit: { ...RAW_EXPORT_ROW.unit, size: "unknown" },
    };
    const basis = buildMarketCompQueryBasis(leaseViewsFromExport([row])[0], "L1");
    expect(basis.query).not.toHaveProperty("squareFootage");
    expect(basis.attributes).toContainEqual({
      field: "squareFootage",
      label: "Square footage",
      status: "omitted",
      reason: "No usable positive integer unit.size value is available.",
    });
  });

  it("refuses a partial street-only address instead of sending an ambiguous provider query", () => {
    const row = {
      ...RAW_EXPORT_ROW,
      property: { ...RAW_EXPORT_ROW.property, city: undefined },
    };
    expect(() => buildMarketCompQueryBasis(leaseViewsFromExport([row])[0], "L1")).toThrow(
      /complete RentVine street, city, state, and postal address/i,
    );
  });

  it("takes the contractual base rent from the lease detail, never from unit.rent (S102)", () => {
    // The unit's listed rent is a unit attribute. With the lease detail applied the basis must carry
    // the tenant's contractual rent, and a lease-level lookalike on the export row never qualifies.
    const [view] = leaseViewsFromExport([
      { ...RAW_EXPORT_ROW, unit: { ...RAW_EXPORT_ROW.unit, rent: "1300.00" } },
    ]);
    applyLeaseDetailToView(view, {
      baseRentAmount: 1050,
      rentAmount: 1050,
      isMonthToMonth: "0",
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: false,
    });
    expect(buildMarketCompQueryBasis(view, "L1").baseRent).toEqual({
      status: "verified",
      value: 1050,
      sourcePath: CONTRACTUAL_BASE_RENT_SOURCE_PATH,
    });

    const lookalike = {
      ...RAW_EXPORT_ROW,
      lease: { ...RAW_EXPORT_ROW.lease, currentRent: 999 },
      unit: { ...RAW_EXPORT_ROW.unit, rent: undefined },
    };
    expect(
      buildMarketCompQueryBasis(leaseViewsFromExport([lookalike])[0], "L1").baseRent,
    ).toEqual({
      status: "omitted",
      reason:
        "Contractual base rent is unavailable: the RentVine lease detail carries no positive baseRentAmount.",
    });
  });

  it("drives one provider request from the exact basis without a browser-owned fact", async () => {
    const basis = buildMarketCompQueryBasis(
      leaseViewsFromExport([RAW_EXPORT_ROW])[0],
      "L1",
    );
    const get = vi.fn(async (url: string, headers: Record<string, string>) => {
      void url;
      void headers;
      return {
        status: 200,
        json: async () => ({
          rent: 1550,
          rentRangeLow: 1450,
          rentRangeHigh: 1650,
          comparables: [{ price: 1500 }, { price: 1550 }, { price: 1600 }],
        }),
      };
    });
    const provider = new RentCastMarketCompProvider(
      {
        apiKey: "fixture-key",
        maxRadiusMiles: basis.policy.maxRadiusMiles,
        compCount: basis.policy.requestedCompCount,
        lookupSubjectAttributes: basis.policy.lookupSubjectAttributes,
      },
      { transport: { get }, nowIso: () => "2026-08-29T12:00:00.000Z" },
    );

    await provider.lookup({ addressLabel: basis.addressLabel, ...basis.query });

    expect(get).toHaveBeenCalledTimes(1);
    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain("address=104+NE+Lindsay+Ave%2C+Kansas+City%2C+MO+64118");
    expect(url).toContain("bedrooms=3");
    expect(url).toContain("bathrooms=2.5");
    expect(url).toContain("squareFootage=1400");
    expect(url).toContain("maxRadius=2");
    expect(url).toContain("compCount=15");
    expect(url).toContain("lookupSubjectAttributes=true");
    expect(url).not.toContain("propertyType=");
  });
});
