// S246 R-S246-9: the shared collection link. A desk URL that names a collection opens the table
// narrowed to that collection's saved leases; this is the one server read behind it. It reads the
// app-owned collection record only: no provider, no source read and no write.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { RenewalSharedCollectionStore } from "@/lib/firestore/renewal-shared-collections";
import type { RenewalDeskCollectionView } from "@/lib/lease-renewal/desk-query-v2";

/**
 * One shared collection's name and saved lease ids for the desk's collection filter. Null when
 * the collection does not exist, cannot be read or is outside this account's access; the desk
 * then lists no lease under it and says the collection could not be read.
 */
export async function readDeskCollectionView(
  actor: AuthenticatedUser,
  collectionId: string,
): Promise<RenewalDeskCollectionView | null> {
  try {
    const collection = await new RenewalSharedCollectionStore().get(actor, collectionId);
    if (!collection || !Array.isArray(collection.members)) return null;
    return {
      name: String(collection.name ?? ""),
      memberIds: [
        ...new Set(
          collection.members
            .map((member) => member?.leaseId)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        ),
      ],
    };
  } catch {
    return null;
  }
}
