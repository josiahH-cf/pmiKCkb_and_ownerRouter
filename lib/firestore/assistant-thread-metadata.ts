// S199/S200 extend existing private history. Selection/pins never change a turn or a saved question.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  toSummary,
  type StoredConversationRecord,
} from "./assistant-history-read";
const id = z.string().regex(/^[a-f0-9]{32}$/),
  version = z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1);
export const ThreadMetadataCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("select"),
      conversationId: id.nullable(),
      expectedVersion: version,
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("pin"),
      conversationId: id,
      pinned: z.boolean(),
      expectedVersion: version,
      operationId: z.string().uuid(),
    })
    .strict(),
]);
export async function updateAssistantThreadMetadata(
  user: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  now: () => Date = () => new Date(),
) {
  if (isVerificationAccount(user))
    throw new EditableLayerError("History is not saved for verification accounts.", 403);
  assertMutationAllowed(requireEnvironmentDescriptor());
  const input = ThreadMetadataCommandSchema.parse(raw),
    root = db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(user.uid));
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const op = root.collection("metadata_operations").doc(input.operationId);
  const conversationRef = input.conversationId
    ? root
        .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
        .doc(input.conversationId)
    : null;
  return db.runTransaction(async (tx) => {
    const [rootSnapshot, operationSnapshot] = await tx.getAll(root, op);
    const thread = conversationRef ? await tx.get(conversationRef) : null;
    const data = rootSnapshot.data();
    if (data && data.owner_uid !== user.uid)
      throw new EditableLayerError("Private history was not found.", 404);
    const record = thread?.data() as StoredConversationRecord | undefined;
    if (conversationRef && (!record || record.owner_uid !== user.uid))
      throw new EditableLayerError("That conversation was not found.", 404);
    const selection = {
      conversationId: data?.active_conversation_id ?? null,
      version: data?.selection_version ?? 0,
    };
    if (operationSnapshot.exists) {
      if (
        operationSnapshot.get("owner_uid") !== user.uid ||
        operationSnapshot.get("fingerprint") !== fingerprint
      )
        throw new EditableLayerError(
          "This history operation was already used for another choice.",
          409,
        );
      return {
        selection,
        conversation: record ? toSummary(record) : null,
        replayed: true,
      };
    }
    if (input.action === "select") {
      if (input.expectedVersion !== selection.version)
        throw new EditableLayerError(
          "The active conversation changed in another session. Read the current selection before choosing again.",
          409,
        );
      const next = {
        conversationId: input.conversationId,
        version: selection.version + 1,
      };
      tx.set(
        root,
        {
          owner_uid: user.uid,
          active_conversation_id: next.conversationId,
          selection_version: next.version,
          selection_updated_at: now().toISOString(),
        },
        { merge: true },
      );
      tx.create(op, {
        owner_uid: user.uid,
        fingerprint,
        action: input.action,
        created_at: now().toISOString(),
      });
      return {
        selection: next,
        conversation: record ? toSummary(record) : null,
        replayed: false,
      };
    }
    if (input.expectedVersion !== (record!.pin_version ?? 0))
      throw new EditableLayerError(
        "The conversation pin changed in another session. Read its current state before choosing again.",
        409,
      );
    const next = {
      ...record!,
      pinned: input.pinned,
      pin_version: (record!.pin_version ?? 0) + 1,
    };
    tx.update(conversationRef!, { pinned: next.pinned, pin_version: next.pin_version });
    tx.create(op, {
      owner_uid: user.uid,
      fingerprint,
      action: input.action,
      created_at: now().toISOString(),
    });
    return { selection, conversation: toSummary(next), replayed: false };
  });
}
