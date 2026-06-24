// Map live Rentvine lease records onto the pipeline's NonSheetCandidate contract (Phase-1 live read).
//
// Pure and deterministic: no I/O, no Date.now() (the read timestamp is an INPUT). The exact Rentvine
// JSON key names confirm on the first live call, so the mapping is driven by a CONFIGURABLE field map
// (first-present-key-wins, with alternate-key lists) — when the live keys differ, only
// DEFAULT_RENTVINE_LEASE_FIELD_MAP changes, in one place. A lease missing a usable tenant name or both
// reconcilable fields is SKIPPED and counted (never silently dropped).
//
// The emitted `source` / `source_system` are byte-identical to the synthetic feed so the pipeline's
// §3.4 precedence and reconciliation behave identically to the simulation run.

import type { NonSheetCandidate, NonSheetFieldValue } from "@/lib/lease-renewal/pipeline";
import type { RawLease } from "@/lib/integrations/rentvine/client";

/** Candidate source key names for each reconcilable target; first present (non-empty) wins. */
export interface RentVineLeaseFieldMap {
  tenantName: string[];
  renewalDate: string[];
  currentRent: string[];
}

export const DEFAULT_RENTVINE_LEASE_FIELD_MAP: RentVineLeaseFieldMap = {
  tenantName: [
    "tenantName",
    "primaryTenantName",
    "primaryTenant",
    "leaseName",
    "tenant",
    "name",
  ],
  renewalDate: [
    "endDate",
    "leaseEndDate",
    "leaseTo",
    "expirationDate",
    "dateEnd",
    "moveOutDate",
  ],
  currentRent: [
    "rent",
    "currentRent",
    "rentAmount",
    "totalRent",
    "amount",
    "monthlyRent",
  ],
};

/** Byte-identical to lib/lease-renewal/sample-sheet.ts so §3.4 precedence is unchanged. */
export const RENTVINE_SOURCE = "rentvine";
export const RENTVINE_SOURCE_SYSTEM = "Rentvine (read-authoritative)";

/**
 * Flatten Rentvine lease-EXPORT rows into flat lease "views" the field map can read. Confirmed live:
 * the plain /leases list omits tenant names and carries no rent, so the live read uses /leases/export
 * — where the tenant names live on `lease.tenants[].name` and the contractual rent on `unit.rent`.
 * This lifts `unit.rent` onto the lease view as `currentRent` (without clobbering a real field) and
 * keeps `lease.tenants[]` for the name join. Pure and deterministic.
 */
export function leaseViewsFromExport(rows: Record<string, unknown>[]): RawLease[] {
  return rows.map((row) => {
    const lease = (
      row.lease && typeof row.lease === "object" ? row.lease : row
    ) as Record<string, unknown>;
    const unit = (row.unit && typeof row.unit === "object" ? row.unit : {}) as Record<
      string,
      unknown
    >;
    const view: Record<string, unknown> = { ...lease };
    if (view.currentRent === undefined && unit.rent !== undefined && unit.rent !== null) {
      view.currentRent = unit.rent;
    }
    return view;
  });
}

export interface MapLeasesOptions {
  /** Read timestamp captured at read time; accepted as INPUT, never Date.now(). */
  readTimestamp: string;
  fieldMap?: RentVineLeaseFieldMap;
}

export interface RentVineLeaseMapping {
  candidates: NonSheetCandidate[];
  total: number;
  /** Leases skipped for a missing tenant name or no resolvable reconcilable field. */
  skipped: number;
  /** Which source key resolved each target on the first mapped lease (field NAMES only — diagnostic). */
  resolvedKeys: { tenantName?: string; renewalDate?: string; currentRent?: string };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isPresent(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.trim() === "")
  );
}

function firstPresentKey(
  obj: Record<string, unknown>,
  keys: string[],
): { key: string; value: unknown } | null {
  for (const key of keys) {
    if (key in obj && isPresent(obj[key])) return { key, value: obj[key] };
  }
  return null;
}

/** Resolve a tenant name from the lease, falling back to a nested tenants[] array (export shape). */
function resolveTenant(
  lease: RawLease,
  keys: string[],
): { key: string; value: string } | null {
  const direct = firstPresentKey(lease, keys);
  if (direct) return { key: direct.key, value: String(direct.value).trim() };

  const tenants = lease.tenants;
  if (
    Array.isArray(tenants) &&
    tenants.length > 0 &&
    tenants[0] &&
    typeof tenants[0] === "object"
  ) {
    const first = tenants[0] as Record<string, unknown>;
    const nested = firstPresentKey(first, keys);
    if (nested)
      return { key: `tenants[0].${nested.key}`, value: String(nested.value).trim() };

    const firstName = first.firstName ?? first.first_name;
    const lastName = first.lastName ?? first.last_name;
    if (isPresent(firstName) || isPresent(lastName)) {
      const combined =
        `${isPresent(firstName) ? firstName : ""} ${isPresent(lastName) ? lastName : ""}`.trim();
      if (combined) return { key: "tenants[0].firstName+lastName", value: combined };
    }
  }
  return null;
}

/** Coerce a Rentvine date value to ISO YYYY-MM-DD; null if unparseable. */
function toIsoDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === "") return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (us[3].length === 2) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  return null;
}

/** Coerce a Rentvine rent value to a number; null if not a finite amount. */
function toRentNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const amount = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(amount) && value.trim() !== "" ? amount : null;
  }
  return null;
}

/**
 * Map live Rentvine leases to NonSheetCandidate[] (source "rentvine", joined by tenant name).
 * Deterministic: same input + readTimestamp produces an equal result.
 */
export function mapLeasesToNonSheetCandidates(
  leases: RawLease[],
  options: MapLeasesOptions,
): RentVineLeaseMapping {
  const fieldMap = options.fieldMap ?? DEFAULT_RENTVINE_LEASE_FIELD_MAP;
  const candidates: NonSheetCandidate[] = [];
  const resolvedKeys: RentVineLeaseMapping["resolvedKeys"] = {};
  let skipped = 0;

  for (const lease of leases) {
    const tenant = resolveTenant(lease, fieldMap.tenantName);
    const dateHit = firstPresentKey(lease, fieldMap.renewalDate);
    const rentHit = firstPresentKey(lease, fieldMap.currentRent);
    const renewalIso = dateHit ? toIsoDate(dateHit.value) : null;
    const rentNumber = rentHit ? toRentNumber(rentHit.value) : null;

    if (!tenant || (renewalIso === null && rentNumber === null)) {
      skipped += 1;
      continue;
    }

    if (resolvedKeys.tenantName === undefined) resolvedKeys.tenantName = tenant.key;

    const fields: Record<string, NonSheetFieldValue> = {};
    if (renewalIso !== null && dateHit) {
      fields.renewal_date = {
        value: renewalIso,
        raw: String(dateHit.value),
        confidence: "Verified",
      };
      if (resolvedKeys.renewalDate === undefined) resolvedKeys.renewalDate = dateHit.key;
    }
    if (rentNumber !== null && rentHit) {
      fields.current_rent = {
        value: rentNumber,
        raw: String(rentHit.value),
        confidence: "Verified",
      };
      if (resolvedKeys.currentRent === undefined) resolvedKeys.currentRent = rentHit.key;
    }

    candidates.push({
      source: RENTVINE_SOURCE,
      source_system: RENTVINE_SOURCE_SYSTEM,
      joinKind: "name",
      joinValue: tenant.value,
      read_timestamp: options.readTimestamp,
      fields,
    });
  }

  return { candidates, total: leases.length, skipped, resolvedKeys };
}
