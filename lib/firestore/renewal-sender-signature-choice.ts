import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  SenderSignatureChoiceSchema,
  SaveSenderSignatureChoiceSchema,
  type SenderSignatureChoice,
  type SenderSignatureEvidence,
} from "@/lib/lease-renewal/sender-signature-choice";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";

function ref(db: Firestore, actorUid: string) {
  return db.collection("renewal_sender_signature_choices").doc(actorUid);
}

function read(value: unknown, actor: Pick<AuthenticatedUser, "uid" | "email">) {
  const choice = SenderSignatureChoiceSchema.parse(value);
  if (choice.actorUid !== actor.uid || choice.email !== actor.email.toLowerCase())
    throw new EditableLayerError(
      "The saved signature belongs to a different managed sender.",
      409,
    );
  return choice;
}

export async function readSenderSignatureChoice(
  actor: AuthenticatedUser,
  db = getAdminFirestore(),
) {
  const doc = await ref(db, actor.uid).get();
  return doc.exists ? read(doc.data(), actor) : null;
}

export function senderSignatureEvidence(
  choice: SenderSignatureChoice,
): SenderSignatureEvidence {
  return {
    uid: choice.actorUid,
    email: choice.email,
    revision: choice.revision,
    choice: choice.signature ? "filled" : "blank",
    contentHash: hashExecutionPreview({ signature: choice.signature }),
  };
}

/** A new Gmail draft claim must see the signature version its exact preview reviewed. */
export async function assertSenderSignatureChoice(
  tx: Transaction,
  db: Firestore,
  actor: Pick<AuthenticatedUser, "uid" | "email">,
  expected: SenderSignatureEvidence | undefined,
) {
  const doc = await tx.get(ref(db, actor.uid));
  const choice = doc.exists ? read(doc.data(), actor) : null;
  if (
    (choice?.revision ?? 0) !== (expected?.revision ?? 0) ||
    (choice &&
      hashExecutionPreview(senderSignatureEvidence(choice)) !==
        hashExecutionPreview({ ...expected }))
  )
    throw new EditableLayerError(
      "Your signature changed after preview. Review the current message again.",
      409,
    );
}

export async function saveSenderSignatureChoice(
  actor: AuthenticatedUser,
  raw: z.input<typeof SaveSenderSignatureChoiceSchema>,
  db = getAdminFirestore(),
) {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    isVerificationAccount(actor) ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com")
  )
    throw new EditableLayerError(
      "The current managed sender must save their own signature.",
      403,
    );
  const input = SaveSenderSignatureChoiceSchema.parse(raw);
  const head = ref(db, actor.uid);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(head);
    const current = snapshot.exists ? read(snapshot.data(), actor) : null;
    if (current?.operationId === input.operationId) {
      if (
        hashExecutionPreview({ signature: current.signature }) !==
        hashExecutionPreview({ signature: input.signature })
      )
        throw new EditableLayerError(
          "This save already names a different signature.",
          409,
        );
      return;
    }
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(
        "The saved signature changed. Reload its current version before saving again.",
        409,
      );
    const choice: SenderSignatureChoice = {
      actorUid: actor.uid,
      email: actor.email.toLowerCase(),
      revision: input.expectedRevision + 1,
      operationId: input.operationId,
      updatedAt: new Date().toISOString(),
      signature: input.signature,
    };
    tx.set(head, choice);
  });
  const confirmed = await readSenderSignatureChoice(actor, db);
  if (confirmed?.operationId !== input.operationId)
    throw new EditableLayerError(
      "Read the current signature before trying another save.",
      409,
    );
  return confirmed;
}
