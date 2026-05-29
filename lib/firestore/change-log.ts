import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { ChangeLogRecord } from "@/lib/firestore/types";

const COLLECTIONS = {
  changeLog: "change_log",
  placeholders: "placeholders",
  sops: "sops",
  templates: "templates",
} as const;

export async function listSpaceChangeLog(
  actor: AuthenticatedUser,
  spaceId: string,
  db: Firestore = getAdminFirestore(),
) {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "This user is not authorized for the requested editable-layer action.",
      403,
    );
  }

  const entityIds = await readSpaceEntityIds(spaceId, db);

  if (entityIds.size === 0) {
    return [];
  }

  const snapshot = await db.collection(COLLECTIONS.changeLog).get();

  return snapshot.docs
    .map((doc) => readRecord<ChangeLogRecord>(doc.id, doc.data()))
    .filter((record) => entityIds.has(record.entity_id))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 25);
}

async function readSpaceEntityIds(spaceId: string, db: Firestore) {
  const snapshots = await Promise.all([
    db.collection(COLLECTIONS.sops).where("space_id", "==", spaceId).get(),
    db.collection(COLLECTIONS.templates).where("space_id", "==", spaceId).get(),
    db.collection(COLLECTIONS.placeholders).where("space_id", "==", spaceId).get(),
  ]);

  return new Set(snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.id)));
}

function readRecord<T>(id: string, data: Record<string, unknown>) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;

    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        normalizeFirestoreValue(childValue),
      ]),
    );
  }

  return value;
}
