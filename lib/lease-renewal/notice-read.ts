import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import type { LiveLeaseSnapshotResult } from "./live-lease-cache";
import type { LeaseStatusTableRead, MoveOutDisposition } from "./move-out-disposition";
import { observeRenewalNotice } from "@/lib/firestore/renewal-notice-safety";
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
    // Bound transactions instead of launching the entire portfolio at once.
    for (let offset = 0; offset < read.snapshot.views.length; offset += 8) {
      const batch = await Promise.all(
        read.snapshot.views.slice(offset, offset + 8).map(async (lease) => {
          const id = leaseViewId(lease);
          if (!id) return null;
          const result = await observeRenewalNotice(
            actor,
            {
              lease,
              statusTable,
              freshness: read.currency.state,
              leaseReadAtMs: read.snapshot.readAtMs,
              observedAtMs,
              noticeAdmitted: read.snapshot.noticeAdmitted,
              admittedLeaseKeys: read.snapshot.noticeAdmission?.leaseKeys,
            },
            db,
          );
          return [id, result.disposition] as [string, MoveOutDisposition];
        }),
      );
      entries.push(
        ...batch.filter((entry): entry is [string, MoveOutDisposition] => entry !== null),
      );
    }
    return new Map(entries);
  };
}
