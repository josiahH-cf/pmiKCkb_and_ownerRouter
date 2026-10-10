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

/** Actor-owned bodyless receipts. Cursor is document id, never a provider target. No bulk migration. */
export async function listLegacyOwnerNoticeAttempts(
  actor: AuthenticatedUser,
  ticketRef: string,
  cursor?: string,
  db: Firestore = getAdminFirestore(),
) {
  let query = db
    .collection("action_executions")
    .where("action_key", "==", MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY)
    .where("scope_ref", "==", `external-workflow:live:${ticketRef}`)
    .where("actor_uid", "==", actor.uid)
    .orderBy("__name__")
    .limit(51);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const page = snapshot.docs.slice(0, 50);
  return {
    attempts: page.map((doc) => ({
      executionId: doc.id,
      state: doc.get("state"),
      attemptCount: doc.get("attempt_count"),
      updatedAt: doc.get("updated_at"),
      recoveryAvailable:
        ["Executing", "Needs reconciliation"].includes(doc.get("state")) &&
        doc.get("attempt_count") === 1,
    })),
    cursor: snapshot.size > 50 ? page.at(-1)!.id : null,
  };
}
