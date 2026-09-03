// S102 test helper: a fake lease-detail reader derived from export-shaped fixture rows.
//
// Live RentVine carries the tenant's contractual base rent on the lease DETAIL (`baseRentAmount`),
// not on the export row. Legacy fixtures encode the intended rent on `unit.rent`; this helper serves
// that value back as the detail's `baseRentAmount` so existing fixtures keep their meaning under the
// S102 contract. Fixtures may also carry an explicit `lease.baseRentAmount` (or other detail fields)
// to model divergence between the unit's listed rent and the lease rent.

import type { LeaseExportReadResult, RawLease } from "@/lib/integrations/rentvine/client";
import {
  applyLeaseDetailToView,
  leaseIdOfView,
  markLeaseDetailUnavailable,
} from "@/lib/integrations/rentvine/lease-mapper";

type ExportRow = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rowLeaseId(row: ExportRow): string | null {
  const lease = asRecord(row.lease) ?? row;
  for (const key of ["leaseID", "leaseId", "id"]) {
    const value = lease[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

/** The lease-detail record a fixture row implies (unit.rent as base rent unless overridden). */
export function fakeLeaseDetailFromRow(row: ExportRow): Record<string, unknown> {
  const lease = asRecord(row.lease) ?? row;
  const unit = asRecord(row.unit);
  const unitRent = unit?.rent;
  const baseRentAmount =
    lease.baseRentAmount !== undefined
      ? lease.baseRentAmount
      : unitRent === undefined || unitRent === null || String(unitRent).trim() === ""
        ? null
        : Number(String(unitRent).replace(/[$,\s]/g, ""));
  return {
    leaseID: rowLeaseId(row),
    startDate: lease.startDate ?? null,
    endDate: lease.endDate ?? null,
    baseRentAmount,
    rentAmount: lease.rentAmount ?? baseRentAmount,
    isMonthToMonth: lease.isMonthToMonth ?? "0",
    monthToMonthStartDate: lease.monthToMonthStartDate ?? null,
    hasPendingMonthToMonthConversion: lease.hasPendingMonthToMonthConversion ?? false,
  };
}

/**
 * Wrap a fake export reader so it also answers `getLease` from the rows it last returned. Tests
 * that swap the export result per call keep working because the lookup follows the latest read.
 */
export function withFakeLeaseDetail<
  T extends { listAllLeasesExport: (...args: never[]) => Promise<LeaseExportReadResult> },
>(
  client: T,
): T & { getLease(leaseId: string | number): Promise<Record<string, unknown>> } {
  let lastRows: readonly ExportRow[] = [];
  const original = client.listAllLeasesExport.bind(client);
  const wrapped = {
    ...client,
    listAllLeasesExport: async (...args: never[]) => {
      const result = await original(...args);
      lastRows = result.rows;
      return result;
    },
    getLease: async (leaseId: string | number) => {
      const wanted = String(leaseId).trim();
      const row = lastRows.find((candidate) => rowLeaseId(candidate) === wanted);
      if (!row) throw new Error(`fake lease detail: unknown lease ${wanted}`);
      return fakeLeaseDetailFromRow(row);
    },
  };
  return wrapped as T & {
    getLease(leaseId: string | number): Promise<Record<string, unknown>>;
  };
}

/** Apply the implied detail to already-mapped views (for tests that build snapshots directly). */
export function applyFakeLeaseDetail(
  views: readonly RawLease[],
  rows: readonly ExportRow[],
): void {
  const byId = new Map(rows.map((row) => [rowLeaseId(row), row] as const));
  for (const view of views) {
    const id = leaseIdOfView(view);
    const row = id === null ? undefined : byId.get(id);
    if (row) applyLeaseDetailToView(view, fakeLeaseDetailFromRow(row));
    else markLeaseDetailUnavailable(view);
  }
}
