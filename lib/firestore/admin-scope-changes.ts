// Append-only audit log for in-app space-scope changes (S16). Written server-side through the
// Admin SDK boundary only; clients never write, and only an Admin may read. A null scope list plus
// `previous_scope_claim_invalid: false` means the prior claim was absent (the All spaces wildcard);
// the boolean distinguishes a malformed prior claim without persisting its untrusted raw value.

import type { Firestore } from "firebase-admin/firestore";
import type { SpaceScope } from "@/lib/constants";
import { getAdminFirestore } from "@/lib/firestore/admin";

const COLLECTION = "admin_scope_changes";

export interface AdminScopeChangeRecord {
  id: string;
  actor_uid: string;
  actor_email: string;
  target_uid: string;
  target_email: string;
  previous_scopes: readonly SpaceScope[] | null;
  previous_scope_claim_invalid: boolean;
  new_scopes: readonly SpaceScope[] | null;
  reason: string;
  created_at: string;
}

export type AdminScopeChangeInput = Omit<AdminScopeChangeRecord, "id" | "created_at">;

export async function recordAdminScopeChange(
  input: AdminScopeChangeInput,
  createdAtIso: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  await db.collection(COLLECTION).add({ ...input, created_at: createdAtIso });
}

export async function listAdminScopeChanges(
  limit = 25,
  db: Firestore = getAdminFirestore(),
): Promise<AdminScopeChangeRecord[]> {
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<AdminScopeChangeRecord, "id">),
  }));
}
