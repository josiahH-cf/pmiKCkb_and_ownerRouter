import { describe, expect, it } from "vitest";

import {
  RENTCAST_MARKET_REPORT_URL,
  RENTCAST_PROPERTY_REPORT_URL,
  buildRentcastMarketReportLink,
  buildRentcastPropertyReportLink,
} from "@/lib/lease-renewal/rentcast-report-links";

const ADDRESS = "104 NE Lindsay Ave, Kansas City, MO 64118";

describe("S118 RentCast report links (R118.5)", () => {
  it("AC-S118-5: builds the documented property report link from the resolved subject with correct encoding", () => {
    const link = buildRentcastPropertyReportLink({
      addressLabel: ADDRESS,
      query: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
      radiusMiles: 5,
    });
    expect(link.status).toBe("available");
    if (link.status !== "available") return;
    expect(link.url).toBe(
      `${RENTCAST_PROPERTY_REPORT_URL}?address=104%20NE%20Lindsay%20Ave%2C%20Kansas%20City%2C%20MO%2064118&bedrooms=3&bathrooms=2.5&area=1400&radius=5`,
    );
    expect(link.sent.map((entry) => entry.param)).toEqual([
      "address",
      "bedrooms",
      "bathrooms",
      "area",
      "radius",
    ]);
    // The unmapped property type is a named omission, never a guessed type.
    expect(link.omitted).toEqual([
      { param: "type", reason: expect.stringMatching(/no established RentCast mapping/) },
    ]);
    expect(link.url).not.toContain("type=");
    expect(link.note).toMatch(/RentCast Pro plan/);
  });

  it("AC-S118-5: names unsupported source values instead of clamping them to the link's ranges", () => {
    const link = buildRentcastPropertyReportLink({
      addressLabel: ADDRESS,
      query: {
        bedrooms: 7,
        bathrooms: 4.5,
        squareFootage: 0,
        propertyType: "Single Family",
      },
      radiusMiles: 0.05,
    });
    expect(link.status).toBe("available");
    if (link.status !== "available") return;
    expect(link.url).toBe(
      `${RENTCAST_PROPERTY_REPORT_URL}?address=104%20NE%20Lindsay%20Ave%2C%20Kansas%20City%2C%20MO%2064118`,
    );
    expect(link.omitted.map((entry) => entry.param)).toEqual([
      "type",
      "bedrooms",
      "bathrooms",
      "area",
      "radius",
    ]);
    expect(link.omitted.map((entry) => entry.reason).join("\n")).toMatch(
      /7 on file is outside[\s\S]*4\.5 on file is outside[\s\S]*not a positive whole number[\s\S]*0\.05 is below/,
    );
    // A studio and whole-number bathrooms are documented values and travel unchanged.
    const studio = buildRentcastPropertyReportLink({
      addressLabel: ADDRESS,
      query: { bedrooms: 0, bathrooms: 1 },
    });
    expect(studio.status === "available" ? studio.url : "").toContain(
      "&bedrooms=0&bathrooms=1",
    );
    expect(studio.status === "available" ? studio.url : "").not.toContain("radius=");
  });

  it("AC-S118-5: a missing address is explicit, the zip report needs five digits, and no secret or app value leaks", () => {
    expect(buildRentcastPropertyReportLink({ addressLabel: "   " })).toEqual({
      status: "unavailable",
      reason: expect.stringMatching(/no complete RentVine address/),
    });
    expect(buildRentcastMarketReportLink("64118")).toMatchObject({
      status: "available",
      url: `${RENTCAST_MARKET_REPORT_URL}?zip=64118`,
      zip: "64118",
    });
    for (const zip of ["6411", "64118-1234", "", null, undefined])
      expect(buildRentcastMarketReportLink(zip).status, String(zip)).toBe("unavailable");
    const link = buildRentcastPropertyReportLink({
      addressLabel: ADDRESS,
      query: { bedrooms: 2 },
      radiusMiles: 2,
    });
    const url = link.status === "available" ? link.url : "";
    expect(url.startsWith("https://rentcast.io/s/p?")).toBe(true);
    expect(url).not.toMatch(/api|key|token|secret|lease|www\.rentcast\.io/i);
  });
});
