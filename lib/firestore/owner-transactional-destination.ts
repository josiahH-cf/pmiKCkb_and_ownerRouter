// Owner transactional/notice destination store (D-1 support). A single admin-editable Firestore doc
// holding the owner-INTERNAL destination address — where owner-notice drafts are addressed once a real
// send path is activated. (Reported issues route only to the in-app support queue, never here.) Absence
// resolves to the seeded default.
//
// GOVERNANCE: this is an internal owner address only. It is NEVER the authoritative recipient for a
// tenant or owner-of-record notice — those recipients still flow through the governed executor's
// verified `recipient_source_ref`/`mailbox_source_ref`, never a free-form admin field. Reads and
// writes require the manageAdmin capability. Nothing here sends or drafts anything.

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { DEFAULT_OWNER_TRANSACTIONAL_EMAIL } from "@/lib/constants";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  UpdateOwnerTransactionalDestinationInputSchema,
  type UpdateOwnerTransactionalDestinationInput,
} from "@/lib/firestore/schemas";
import type { OwnerTransactionalDestinationRecord } from "@/lib/firestore/types";

const COLLECTION = "owner_transactional_destination";
const DOC_ID = "default";

/** The seeded value used until an Admin saves an override. */
export function defaultOwnerTransactionalDestination(): OwnerTransactionalDestinationRecord {
  return {
    id: DOC_ID,
    destination_email: DEFAULT_OWNER_TRANSACTIONAL_EMAIL,
    updated_at: "default",
  };
}

export async function readOwnerTransactionalDestination(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<OwnerTransactionalDestinationRecord> {
  assertAdmin(actor);
  const snapshot = await db.collection(COLLECTION).doc(DOC_ID).get();
  const data = snapshot.data();
  return data ? readRecord(snapshot.id, data) : defaultOwnerTransactionalDestination();
}

export async function updateOwnerTransactionalDestination(
  actor: AuthenticatedUser,
  input: UpdateOwnerTransactionalDestinationInput,
  db: Firestore = getAdminFirestore(),
): Promise<OwnerTransactionalDestinationRecord> {
  assertAdmin(actor);
  const parsed = UpdateOwnerTransactionalDestinationInputSchema.parse(input);
  await db.collection(COLLECTION).doc(DOC_ID).set({
    destination_email: parsed.destination_email,
    updated_at: FieldValue.serverTimestamp(),
    updated_by_uid: actor.uid,
  });
  const saved = await db.collection(COLLECTION).doc(DOC_ID).get();
  return readRecord(saved.id, saved.data()!);
}

function assertAdmin(actor: AuthenticatedUser) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Only Admins can view or change the owner transactional destination.",
      403,
    );
  }
}

function readRecord(
  id: string,
  data: Record<string, unknown>,
): OwnerTransactionalDestinationRecord {
  const email = data.destination_email;
  return {
    id,
    destination_email:
      typeof email === "string" && email.trim()
        ? email
        : DEFAULT_OWNER_TRANSACTIONAL_EMAIL,
    updated_at: toIsoOrDefault(data.updated_at),
    ...(typeof data.updated_by_uid === "string"
      ? { updated_by_uid: data.updated_by_uid }
      : {}),
  };
}

/** Firestore Timestamp → ISO string; pass through existing strings; anything else → "default". */
function toIsoOrDefault(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : "default";
}
