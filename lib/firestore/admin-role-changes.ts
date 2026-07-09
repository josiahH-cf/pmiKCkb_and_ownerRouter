// Append-only audit log for in-app role changes (console overhaul Slice D). Written server-side
// through the Admin SDK boundary only; clients never write, and only an Admin may read (the Admin
// page reads it server-side). Mirrors the other append-only audit twins (resolution/writeback
// activity): one immutable record per role change, never mutated.

import type { Firestore } from "firebase-admin/firestore";
import type { Role } from "@/lib/auth/roles";
import { getAdminFirestore } from "@/lib/firestore/admin";

const COLLECTION = "admin_role_changes";

export interface AdminRoleChangeRecord {
  id: string;
  actor_uid: string;
  actor_email: string;
  target_uid: string;
  target_email: string;
  previous_role: Role;
  new_role: Role;
  reason: string;
  created_at: string;
}

export type AdminRoleChangeInput = Omit<AdminRoleChangeRecord, "id" | "created_at">;

export async function recordAdminRoleChange(
  input: AdminRoleChangeInput,
  createdAtIso: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  await db.collection(COLLECTION).add({ ...input, created_at: createdAtIso });
}

export async function listAdminRoleChanges(
  limit = 25,
  db: Firestore = getAdminFirestore(),
): Promise<AdminRoleChangeRecord[]> {
  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<AdminRoleChangeRecord, "id">) }))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}
