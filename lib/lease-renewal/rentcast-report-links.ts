/**
 * S118 (R118.5): RentCast's documented dynamic report links, checked against the provider's
 * help articles on 2026-09-16. A link is navigation to RentCast's own report for the subject,
 * never a receipt of a saved API result: report settings and access depend on the viewer's
 * RentCast plan (the radius setting and market reports need Pro). Only documented parameters
 * with supported values are sent; every omission is named so the difference is visible, and no
 * value is clamped or guessed to fit the link.
 */
export const RENTCAST_PROPERTY_REPORT_URL = "https://rentcast.io/s/p";
export const RENTCAST_MARKET_REPORT_URL = "https://rentcast.io/s/m";

/** Documented `type` values. RentVine's propertyTypeID has no established mapping onto them. */
export const RENTCAST_REPORT_PROPERTY_TYPES = [
  "single-family",
  "condo",
  "townhouse",
  "manufactured",
  "multi-family",
  "apartment",
] as const;

export const RENTCAST_REPORT_NOTE =
  "Opens RentCast's own report for this address. Its settings and results can differ from the saved lookup, the radius setting and market reports need a RentCast Pro plan, and opening it makes no lookup from this app.";

type ReportParam = "address" | "type" | "bedrooms" | "bathrooms" | "area" | "radius";

export interface RentcastReportSentParam {
  param: ReportParam;
  value: string;
  label: string;
}

export interface RentcastReportOmission {
  param: Exclude<ReportParam, "address">;
  reason: string;
}

export type RentcastPropertyReportLink =
  | {
      status: "available";
      url: string;
      sent: RentcastReportSentParam[];
      omitted: RentcastReportOmission[];
      note: string;
    }
  | { status: "unavailable"; reason: string };

export type RentcastMarketReportLink =
  | { status: "available"; url: string; zip: string; note: string }
  | { status: "unavailable"; reason: string };

export interface RentcastPropertyReportInput {
  addressLabel?: string | null;
  query?: {
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    propertyType?: string;
  };
  radiusMiles?: number | null;
}

function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

export function buildRentcastPropertyReportLink(
  input: RentcastPropertyReportInput,
): RentcastPropertyReportLink {
  const address = (input.addressLabel ?? "").trim();
  if (address === "")
    return {
      status: "unavailable",
      reason:
        "This lease has no complete RentVine address, so there is no property report to open.",
    };
  const sent: RentcastReportSentParam[] = [
    { param: "address", value: address, label: "Address" },
  ];
  const omitted: RentcastReportOmission[] = [];
  const query = input.query ?? {};

  const type = query.propertyType;
  if (
    typeof type === "string" &&
    (RENTCAST_REPORT_PROPERTY_TYPES as readonly string[]).includes(type)
  ) {
    sent.push({ param: "type", value: type, label: "Property type" });
  } else {
    omitted.push({
      param: "type",
      reason:
        "Property type: not sent. RentVine's property type has no established RentCast mapping, so the report assumes single-family unless you change it there.",
    });
  }

  const bedrooms = query.bedrooms;
  if (bedrooms === undefined) {
    omitted.push({
      param: "bedrooms",
      reason: "Bedrooms: not sent. No usable count is on file.",
    });
  } else if (Number.isInteger(bedrooms) && bedrooms >= 0 && bedrooms <= 6) {
    sent.push({ param: "bedrooms", value: String(bedrooms), label: "Bedrooms" });
  } else {
    omitted.push({
      param: "bedrooms",
      reason: `Bedrooms: ${bedrooms} on file is outside the report's supported 0 to 6, so it is not sent.`,
    });
  }

  const bathrooms = query.bathrooms;
  if (bathrooms === undefined) {
    omitted.push({
      param: "bathrooms",
      reason: "Bathrooms: not sent. No usable count is on file.",
    });
  } else if (
    Number.isFinite(bathrooms) &&
    bathrooms >= 1 &&
    bathrooms <= 4 &&
    isHalfStep(bathrooms)
  ) {
    sent.push({ param: "bathrooms", value: String(bathrooms), label: "Bathrooms" });
  } else {
    omitted.push({
      param: "bathrooms",
      reason: `Bathrooms: ${bathrooms} on file is outside the report's supported 1 to 4 in half steps, so it is not sent.`,
    });
  }

  const area = query.squareFootage;
  if (area === undefined) {
    omitted.push({
      param: "area",
      reason: "Living area: not sent. No usable square footage is on file.",
    });
  } else if (Number.isInteger(area) && area > 0) {
    sent.push({ param: "area", value: String(area), label: "Living area (sq ft)" });
  } else {
    omitted.push({
      param: "area",
      reason: `Living area: ${area} on file is not a positive whole number of square feet, so it is not sent.`,
    });
  }

  const radius = input.radiusMiles;
  if (radius === undefined || radius === null) {
    omitted.push({
      param: "radius",
      reason: "Radius: not sent. The report uses RentCast's own default.",
    });
  } else if (Number.isFinite(radius) && radius >= 0.1) {
    sent.push({
      param: "radius",
      value: String(radius),
      label: "Comp search radius (miles; applied by RentCast Pro)",
    });
  } else {
    omitted.push({
      param: "radius",
      reason: `Radius: ${radius} is below the report's 0.1 mile minimum, so it is not sent.`,
    });
  }

  const url = `${RENTCAST_PROPERTY_REPORT_URL}?${sent
    .map((entry) => `${entry.param}=${encodeURIComponent(entry.value)}`)
    .join("&")}`;
  return { status: "available", url, sent, omitted, note: RENTCAST_REPORT_NOTE };
}

export function buildRentcastMarketReportLink(
  zip: string | null | undefined,
): RentcastMarketReportLink {
  const value = (zip ?? "").trim();
  if (!/^\d{5}$/.test(value))
    return {
      status: "unavailable",
      reason:
        "This lease has no five-digit zip on file, so there is no market report to open.",
    };
  return {
    status: "available",
    url: `${RENTCAST_MARKET_REPORT_URL}?zip=${value}`,
    zip: value,
    note: "Opens RentCast's market report for this zip; viewing it needs a RentCast Pro plan and it is not the saved trend result.",
  };
}
