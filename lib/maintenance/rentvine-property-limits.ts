// Server-only: read-only RentVine source of per-property maintenance limits for the S108 preapproval
// import (owner decision 2026-10-01, B-MNT1). It pages the documented `properties` list once, keeps
// only the fields the import needs, and degrades to a named status instead of throwing, so the route
// can say exactly why a preview is unavailable. No write and no system-of-record update.

import {
  buildLiveRentVineConfig,
  type LiveRentVineConfig,
} from "@/lib/lease-renewal/live-config";
import { RentVineAuthError, type RawProperty } from "@/lib/integrations/rentvine/client";
import type { RentVinePropertyLimit } from "@/lib/maintenance/rentvine-preapproval-import";

const PAGE_SIZE = 100;
/** 20 pages of 100. A larger portfolio is refused rather than silently truncated. */
const MAX_PAGES = 20;

export type PropertyLimitSourceStatus =
  | "not_configured"
  | "account_mismatch"
  | "auth_error"
  | "read_error"
  | "too_many";

export type PropertyLimitSourceOutcome =
  | { readonly status: "ok"; readonly properties: RentVinePropertyLimit[] }
  | { readonly status: PropertyLimitSourceStatus };

export const PROPERTY_LIMIT_SOURCE_TEXT: Readonly<
  Record<PropertyLimitSourceStatus, string>
> = {
  not_configured:
    "RentVine is not connected in this environment, so its limits cannot be read.",
  account_mismatch: "The configured RentVine account is not PMI KC's account.",
  auth_error:
    "RentVine refused the read. Check the RentVine connection, then preview again.",
  read_error: "RentVine did not answer the property read. Preview again in a moment.",
  too_many:
    "RentVine returned more properties than one import reads. Nothing was imported.",
};

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function activeFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

/** Keep only what the import needs from one RentVine property row. */
export function toRentVinePropertyLimit(row: RawProperty): RentVinePropertyLimit {
  const propertyKey = text(row["propertyID"]) ?? "";
  const address = [text(row["address"]), text(row["city"])].filter(Boolean).join(", ");
  return {
    propertyKey,
    label: text(row["name"]) ?? (address || `Property ${propertyKey || "without an id"}`),
    limitAmount: row["maintenanceLimitAmount"] ?? null,
    maintenanceNotes: text(row["maintenanceNotes"]),
    active: activeFlag(row["isActive"]),
  };
}

export async function loadRentVinePropertyLimits(
  config: LiveRentVineConfig = buildLiveRentVineConfig(),
): Promise<PropertyLimitSourceOutcome> {
  if (!config.ok) return { status: config.reason };
  try {
    const properties: RentVinePropertyLimit[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const rows = await config.rentvineClient.listPropertiesPage(page, PAGE_SIZE);
      properties.push(...rows.map(toRentVinePropertyLimit));
      if (rows.length < PAGE_SIZE) return { status: "ok", properties };
    }
    return { status: "too_many" };
  } catch (error) {
    if (error instanceof RentVineAuthError) return { status: "auth_error" };
    return { status: "read_error" };
  }
}
