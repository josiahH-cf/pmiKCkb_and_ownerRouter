// S120 (R120.2): the managed sender's own saved signature, retained once per actor and reused for
// that same sender across leases and cycles. It is written only as a side effect of that actor
// saving a preparation that carries their signature, is read only for the signed-in actor, and is
// never an identity service, a Gmail signature integration or another sender's authorization.

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  MessagePreparationInputsSchema,
  type MessagePreparationRecord,
} from "@/lib/lease-renewal/renewal-message-preparation";

export const RENEWAL_SENDER_SIGNATURE_COLLECTION = "renewal_sender_signatures";

export const RetainedSenderSignatureSchema = z
  .object({
    schemaVersion: z.literal("renewal-sender-signature/v1"),
    actorUid: z.string().min(1),
    email: z.string().email(),
    signature: MessagePreparationInputsSchema.shape.signature.unwrap(),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: z.string().uuid(),
    channel: z.enum(["owner", "tenant"]),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type RetainedSenderSignature = z.infer<typeof RetainedSenderSignatureSchema>;

/** The signed-in actor's own retained signature, or null when none matches their identity. */
export async function getRetainedSenderSignature(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<RetainedSenderSignature | null> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Renewals staff access is required.", 403);
  const snapshot = await db
    .collection(RENEWAL_SENDER_SIGNATURE_COLLECTION)
    .doc(actor.uid)
    .get();
  if (!snapshot.exists) return null;
  const parsed = RetainedSenderSignatureSchema.safeParse(snapshot.data());
  if (
    !parsed.success ||
    parsed.data.actorUid !== actor.uid ||
    parsed.data.email.toLowerCase() !== actor.email.toLowerCase()
  )
    return null;
  return parsed.data;
}

/**
 * Retain the signature a preparation record binds to this actor. Called inside the preparation
 * save transaction so the retained value never disagrees with a saved record; a record whose
 * signature belongs to another sender, or carries none, retains nothing.
 */
export function retainSenderSignature(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  record: MessagePreparationRecord,
) {
  if (record.signatureActorUid !== actor.uid || !record.inputs.signature) return;
  const retained = RetainedSenderSignatureSchema.parse({
    schemaVersion: "renewal-sender-signature/v1",
    actorUid: actor.uid,
    email: actor.email,
    signature: record.inputs.signature,
    leaseId: record.leaseId,
    cycleId: record.cycleId,
    channel: record.channel,
    updatedAt: record.updatedAt,
  });
  transaction.set(
    db.collection(RENEWAL_SENDER_SIGNATURE_COLLECTION).doc(actor.uid),
    retained,
  );
}
