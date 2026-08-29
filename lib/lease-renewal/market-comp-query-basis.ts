import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseAddressLabel, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";

export const RENTCAST_QUERY_POLICY = {
  maxRadiusMiles: 2,
  requestedCompCount: 15,
  lookupSubjectAttributes: true,
  providerVersion: "rentcast-avm-long-term-v1",
} as const;

export const RENTCAST_PUBLIC_SOURCE_URL = "https://www.rentcast.io";

export type MarketCompAttributeField =
  | "bedrooms"
  | "bathrooms"
  | "squareFootage"
  | "propertyType";

export type MarketCompQueryAttribute =
  | {
      field: MarketCompAttributeField;
      label: string;
      status: "sent";
      value: number | string;
      sourcePath: string;
    }
  | {
      field: MarketCompAttributeField;
      label: string;
      status: "omitted";
      reason: string;
    };

export interface MarketCompQueryBasis {
  leaseId: string;
  addressLabel: string;
  policy: typeof RENTCAST_QUERY_POLICY;
  query: {
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    propertyType?: string;
  };
  attributes: MarketCompQueryAttribute[];
  baseRent:
    | { status: "verified"; value: number; sourcePath: "unit.rent" }
    | { status: "omitted"; reason: string };
  trendPostalCode?: string;
}

export type MarketCompQueryResolutionCode =
  | "rentvine_not_configured"
  | "rentvine_account_mismatch"
  | "rentvine_read_failed"
  | "lease_data_expired"
  | "lease_read_incomplete"
  | "lease_not_found"
  | "lease_ambiguous"
  | "missing_address"
  | "missing_postal_code";

export class MarketCompQueryResolutionError extends Error {
  constructor(
    readonly code: MarketCompQueryResolutionCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MarketCompQueryResolutionError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function postalCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().match(/^\d{5}/)?.[0];
}

function nonEmptyText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function twoLetterStateCode(value: unknown): string | undefined {
  const text = nonEmptyText(value);
  return text && /^[A-Za-z]{2}$/.test(text) ? text.toUpperCase() : undefined;
}

function sent(
  field: MarketCompAttributeField,
  label: string,
  value: number | string,
  sourcePath: string,
): MarketCompQueryAttribute {
  return { field, label, status: "sent", value, sourcePath };
}

function omitted(
  field: MarketCompAttributeField,
  label: string,
  reason: string,
): MarketCompQueryAttribute {
  return { field, label, status: "omitted", reason };
}

/**
 * Build the exact provider-query basis from one measured RentVine export view. Only confirmed source
 * paths are mapped. RentVine's official export schema plus the redacted 2026-08-29 complete-read
 * measurement establish `property.stateID` as the two-letter State field and `unit.size` as square
 * footage when it is a positive integer. `property.propertyTypeID` remains an internal id with no
 * approved RentCast mapping, so it is a named omission rather than a guess.
 */
export function buildMarketCompQueryBasis(
  view: RawLease,
  requestedLeaseId: string = leaseViewId(view) ?? "",
): MarketCompQueryBasis {
  const leaseId = leaseViewId(view);
  if (!leaseId || leaseId !== requestedLeaseId.trim()) {
    throw new MarketCompQueryResolutionError(
      "lease_not_found",
      404,
      "The requested lease could not be resolved from the current RentVine export.",
    );
  }
  const streetLine = leaseAddressLabel(view);
  const unit = asRecord(view.unit);
  const property = asRecord(view.property);
  const city = nonEmptyText(property?.city);
  const state = twoLetterStateCode(property?.stateID);
  const zip = postalCode(property?.postalCode) ?? postalCode(unit?.postalCode);
  if (!streetLine || !city || !state || !zip) {
    throw new MarketCompQueryResolutionError(
      "missing_address",
      400,
      "This lease has no complete RentVine street, city, state, and postal address, so no RentCast lookup ran.",
    );
  }
  const addressLabel = `${streetLine}, ${city}, ${state} ${zip}`;

  const bedrooms = nonNegativeInteger(unit?.beds);
  const squareFootage = positiveInteger(unit?.size);
  const fullBaths = nonNegativeInteger(unit?.fullBaths);
  const halfBaths = nonNegativeInteger(unit?.halfBaths);
  const bathrooms =
    fullBaths !== undefined || halfBaths !== undefined
      ? (fullBaths ?? 0) + (halfBaths ?? 0) * 0.5
      : undefined;

  const attributes: MarketCompQueryAttribute[] = [
    bedrooms !== undefined
      ? sent("bedrooms", "Bedrooms", bedrooms, "unit.beds")
      : omitted("bedrooms", "Bedrooms", "No usable unit.beds value is available."),
    bathrooms !== undefined
      ? sent("bathrooms", "Bathrooms", bathrooms, "unit.fullBaths + 0.5 × unit.halfBaths")
      : omitted(
          "bathrooms",
          "Bathrooms",
          "No usable unit.fullBaths/unit.halfBaths values are available.",
        ),
    squareFootage !== undefined
      ? sent("squareFootage", "Square footage", squareFootage, "unit.size")
      : omitted(
          "squareFootage",
          "Square footage",
          "No usable positive integer unit.size value is available.",
        ),
    omitted(
      "propertyType",
      "Property type",
      "RentVine propertyTypeID has no approved RentCast mapping.",
    ),
  ];

  const contractualBaseRent = finiteNumber(unit?.rent);
  return {
    leaseId,
    addressLabel,
    policy: RENTCAST_QUERY_POLICY,
    query: {
      ...(bedrooms !== undefined ? { bedrooms } : {}),
      ...(bathrooms !== undefined ? { bathrooms } : {}),
      ...(squareFootage !== undefined ? { squareFootage } : {}),
    },
    attributes,
    baseRent:
      contractualBaseRent !== undefined && contractualBaseRent > 0
        ? {
            status: "verified",
            value: contractualBaseRent,
            sourcePath: "unit.rent",
          }
        : {
            status: "omitted",
            reason: "Contractual base rent is unavailable from unit.rent.",
          },
    ...(zip ? { trendPostalCode: zip } : {}),
  };
}
