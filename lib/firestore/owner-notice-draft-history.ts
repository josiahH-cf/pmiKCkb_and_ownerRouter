// S139: which maintenance owner-notice drafts this actor already created for one ticket, read from
// the shared S20 execution ledger. Read-only. The app cannot update an existing Gmail draft, so a
// preview of different wording discloses that creating it adds a separate draft.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY } from "@/lib/maintenance/execution/owner-notice-draft-request";

export async function listCreatedOwnerNoticeDrafts(
  actor: AuthenticatedUser,
  ticketRef: string,
  db: Firestore = getAdminFirestore(),
): Promise<string[]> {
  const snapshot = await db
    .collection("action_executions")
    .where("action_key", "==", MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY)
    .where("scope_ref", "==", `external-workflow:live:${ticketRef}`)
    .where("state", "==", "Succeeded")
    .get();
  return snapshot.docs
    .filter((doc) => actor.role === "Admin" || doc.get("actor_uid") === actor.uid)
    .map((doc) => doc.id);
}
