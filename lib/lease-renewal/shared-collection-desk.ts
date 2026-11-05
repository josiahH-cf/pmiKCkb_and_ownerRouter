// S246 R-S246-9: the shared collection link. A desk URL that names a collection opens the table
// narrowed to that collection's saved leases; this is the one server read behind it. It reads the
// app-owned collection record and the recorded work cycles only: no provider, no source read and
// no write.
//
// S201: a collection member is a lease AND the cycle it was saved for. The table lists a saved
// lease only while its current cycle is that saved cycle, matched exactly as the collection page
// matches it, so a collection saved for an earlier cycle never lists the lease's current cycle.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { RenewalSharedCollectionStore } from "@/lib/firestore/renewal-shared-collections";
import { listRenewalWorkspaces } from "@/lib/firestore/renewal-workspace";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import type { RenewalDeskCollectionView } from "@/lib/lease-renewal/desk-query-v2";
import { collectionSourceRecords } from "@/lib/lease-renewal/shared-collection-source";
import { projectCollectionStatuses } from "@/lib/lease-renewal/shared-collections";

/**
 * One shared collection's name and the saved leases the table lists for it: those whose current
 * cycle, read from `rows` and the recorded work cycles, is the cycle each was saved for. The saved
 * leases it does not list are counted by why. Null when the collection does not exist, cannot be
 * read or is outside this account's access, or when the recorded cycles cannot be read; the desk
 * then lists no lease under it and says the collection could not be read.
 */
export async function readDeskCollectionView(
  actor: AuthenticatedUser,
  collectionId: string,
  rows: readonly DeskLeaseRow[],
): Promise<RenewalDeskCollectionView | null> {
  try {
    const [collection, cycles] = await Promise.all([
      new RenewalSharedCollectionStore().get(actor, collectionId),
      listRenewalWorkspaces(actor),
    ]);
    if (!collection || !Array.isArray(collection.members)) return null;
    const statuses = projectCollectionStatuses(
      { members: collection.members.filter((member) => member && member.leaseId) },
      { records: collectionSourceRecords(rows, cycles) },
    );
    const count = (state: (typeof statuses)[number]["state"]) =>
      statuses.filter((status) => status.state === state).length;
    const otherCycleCount = count("cycle_changed");
    const outsideReadCount = count("unavailable");
    return {
      name: String(collection.name ?? ""),
      memberIds: [
        ...new Set(
          statuses
            .filter((status) => status.state === "current")
            .map((status) => status.member.leaseId),
        ),
      ],
      ...(otherCycleCount > 0 ? { otherCycleCount } : {}),
      ...(outsideReadCount > 0 ? { outsideReadCount } : {}),
    };
  } catch {
    return null;
  }
}
