import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  listLeaseTestActionReceipts,
  listLeaseTestBusinessEvents,
  listLeaseTestRuns,
} from "@/lib/firestore/lease-renewal-test-runs";
import {
  listMaintenanceTestActionReceipts,
  listMaintenanceTickets,
} from "@/lib/firestore/maintenance-tickets";
import {
  buildLeaseTestOperationalHandoff,
  buildMaintenanceTestOperationalHandoff,
  type TestOperationalHandoff,
} from "@/lib/operations/test-handoffs";

export interface LoadTestOperationalHandoffsOptions {
  lease?: boolean;
  maintenance?: boolean;
  limitPerKind?: number;
}

/** Read-only, non-fatal gather for bodyless Test projections. No provider client is imported here. */
export async function loadTestOperationalHandoffs(
  actor: AuthenticatedUser,
  options: LoadTestOperationalHandoffsOptions,
): Promise<TestOperationalHandoff[]> {
  const limit = options.limitPerKind ?? 5;
  const handoffs: TestOperationalHandoff[] = [];

  if (options.lease) {
    try {
      const [runs, receipts, events] = await Promise.all([
        listLeaseTestRuns(actor),
        listLeaseTestActionReceipts(actor),
        listLeaseTestBusinessEvents(actor),
      ]);
      handoffs.push(
        ...runs
          .slice(0, limit)
          .map((run) => buildLeaseTestOperationalHandoff(run, receipts, events)),
      );
    } catch {
      // Preserve other lanes; absence is explicit in the panel's empty state.
    }
  }

  if (options.maintenance) {
    try {
      const [tickets, receipts] = await Promise.all([
        listMaintenanceTickets(actor),
        listMaintenanceTestActionReceipts(actor),
      ]);
      handoffs.push(
        ...tickets
          .filter((ticket) => ticket.data_mode === "test")
          .slice(0, limit)
          .map((ticket) => buildMaintenanceTestOperationalHandoff(ticket, receipts)),
      );
    } catch {
      // Preserve other lanes; absence is explicit in the panel's empty state.
    }
  }

  return handoffs.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}
