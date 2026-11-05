// S246 R-S246-1 / R-S246-12: what RentVine reports for one lease, read from the documented lease
// status table (`primaryLeaseStatusID`: 1 pending, 2 active, 3 closed). A status name is display
// text and never decides anything. Pure: it reads the table and lease already loaded for this
// generation and makes no provider call.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseDetailOf } from "@/lib/integrations/rentvine/lease-mapper";
import {
  findLeaseStatus,
  type LeaseStatusTableRead,
} from "@/lib/lease-renewal/move-out-disposition";
import type { RentvineLeaseStatusFact } from "@/lib/lease-renewal/renewal-target";

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

const PRIMARY_STATE: Readonly<Record<string, "pending" | "active" | "closed">> = {
  "1": "pending",
  "2": "active",
  "3": "closed",
};

/**
 * The lease's RentVine status from the status table. The lease's `leaseStatusID` (the lease detail
 * first, then the export row) must resolve to exactly one table row whose documented primary
 * status is 1, 2 or 3; anything else is unavailable, never a guess.
 */
export function projectRentvineLeaseStatus(
  lease: RawLease,
  statusTable: LeaseStatusTableRead,
): RentvineLeaseStatusFact {
  if (statusTable.status !== "available")
    return { state: "unavailable", cause: "status_table_unavailable", name: null };
  const detail = leaseDetailOf(lease);
  const statusId =
    (detail?.status === "available" ? cleanText(detail.leaseStatusId) : null) ??
    cleanText(lease.leaseStatusID) ??
    cleanText(lease.leaseStatusId);
  if (statusId === null)
    return { state: "unavailable", cause: "lease_status_missing", name: null };
  const status = findLeaseStatus(statusTable.statuses, statusId);
  if (!status) return { state: "unavailable", cause: "status_unresolved", name: null };
  const state = PRIMARY_STATE[status.primaryLeaseStatusID ?? ""];
  if (!state)
    return {
      state: "unavailable",
      cause: "primary_status_unreadable",
      name: status.name,
    };
  return { state, name: status.name };
}
