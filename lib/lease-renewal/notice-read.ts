import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import type { LiveLeaseSnapshotResult } from "./live-lease-cache";
import type { LeaseStatusTableRead, MoveOutDisposition } from "./move-out-disposition";
import {
  observeRenewalNotices,
  NOTICE_OBSERVATION_BATCH_SIZE,
} from "@/lib/firestore/renewal-notice-safety";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";

export type RenewalNoticeObserver = (
  read: LiveLeaseSnapshotResult,
  statuses: LeaseStatusTableRead,
  observedAtMs: number,
) => Promise<ReadonlyMap<string, MoveOutDisposition>>;
/** Called only from authenticated orchestration; the provider cache itself has no persistence. */
export function renewalNoticeObserver(
  actor: AuthenticatedUser,
  db?: Firestore,
): RenewalNoticeObserver {
  return async (read, statusTable, observedAtMs) => {
    const entries: [string, MoveOutDisposition][] = [];
    // At most 32 leases share one atomic marker transaction; portfolio size never sets concurrency.
    for (
      let offset = 0;
      offset < read.snapshot.views.length;
      offset += NOTICE_OBSERVATION_BATCH_SIZE
    ) {
      const leases = read.snapshot.views
        .slice(offset, offset + NOTICE_OBSERVATION_BATCH_SIZE)
        .flatMap((lease) => {
          const id = leaseViewId(lease);
          return id ? [{ id, lease }] : [];
        });
      const results = await observeRenewalNotices(
        actor,
        leases.map(({ lease }) => ({
          lease,
          statusTable,
          freshness: read.currency.state,
          leaseReadAtMs: read.snapshot.readAtMs,
          observedAtMs,
          noticeAdmitted: read.snapshot.noticeAdmitted,
          admittedLeaseKeys: read.snapshot.noticeAdmission?.leaseKeys,
        })),
        db,
      );
      results.forEach((result, index) =>
        entries.push([leases[index].id, result.disposition]),
      );
    }
    return new Map(entries);
  };
}
