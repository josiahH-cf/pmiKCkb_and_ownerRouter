// S139: the accepted refined wording for one renewal message preparation. It lives beside the
// preparation record, keyed by the same lease, cycle and channel identity, and is written only inside
// the preparation save transaction, so it always belongs to exactly one saved revision. A revision
// saved without refined wording deletes it. Old code that does not know this collection ignores it
// and drafts the composed body the person also sees there, so a rollback never sends refined text.

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  STALE_REFINED_BODY_MESSAGE,
  applyRefinedBody,
  type RefinedBody,
  type RefinedBodyState,
} from "@/lib/lease-renewal/refined-message";
import type { RenewalMessageContent } from "@/lib/lease-renewal/renewal-message-content";

export const MESSAGE_BODY_OVERRIDE_COLLECTION = "renewal_message_body_overrides";

export const MessageBodyOverrideRecordSchema = z
  .object({
    schemaVersion: z.literal("renewal-message-body-override/v1"),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: z.string().uuid(),
    channel: z.enum(["owner", "tenant"]),
    /** The preparation revision this wording was saved with. */
    revision: z.number().int().positive(),
    text: z.string().min(1).max(20_000),
    baseHash: z.string().regex(/^[a-f0-9]{64}$/),
    updatedAt: z.string().datetime(),
    updatedByUid: z.string().min(1),
  })
  .strict();
export type MessageBodyOverrideRecord = z.infer<typeof MessageBodyOverrideRecordSchema>;

function identity(leaseId: string, cycleId: string, channel: "owner" | "tenant") {
  return hashExecutionPreview({ leaseId, cycleId, channel });
}

export function messageBodyOverrideRef(
  db: Firestore,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
) {
  return db
    .collection(MESSAGE_BODY_OVERRIDE_COLLECTION)
    .doc(identity(leaseId, cycleId, channel));
}

/** Hash of a composed body; a refinement binds to it so changed facts make the wording stale. */
export function composedBodyHash(plainText: string): string {
  return hashExecutionPreview({ composedPlainText: plainText });
}

export async function getMessageBodyOverride(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
): Promise<MessageBodyOverrideRecord | null> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Renewals staff access is required.", 403);
  const snapshot = await messageBodyOverrideRef(db, leaseId, cycleId, channel).get();
  if (!snapshot.exists) return null;
  const record = MessageBodyOverrideRecordSchema.parse(snapshot.data());
  if (
    record.leaseId !== leaseId ||
    record.cycleId !== cycleId ||
    record.channel !== channel
  )
    throw new EditableLayerError(
      "The saved refined wording belongs to a different lease, cycle or channel.",
      409,
    );
  return record;
}

/**
 * Decide whether saved refined wording is the body for the current composition. It applies only to
 * the revision it was saved with and only while the composed body it started from is unchanged;
 * otherwise it is kept for reference and blocks drafting until a person refines again or returns
 * to the standard wording. An unreadable record blocks too, so refined text is never silently lost.
 */
export function resolveMessageBodyOverride(
  content: RenewalMessageContent,
  savedRevision: number | null,
  override: MessageBodyOverrideRecord | null | "unreadable",
): { content: RenewalMessageContent; state: RefinedBodyState | null; baseHash: string } {
  const baseHash = composedBodyHash(content.plainText);
  if (override === "unreadable") {
    return {
      content: {
        ...content,
        missing: [
          ...content.missing,
          {
            field: "refinedBody",
            message:
              "The saved refined wording could not be read. Reload before drafting.",
          },
        ],
      },
      state: { state: "unreadable" },
      baseHash,
    };
  }
  if (!override || savedRevision === null || override.revision !== savedRevision)
    return { content, state: null, baseHash };
  if (override.baseHash === baseHash)
    return {
      content: applyRefinedBody(content, override.text),
      state: { state: "applied", text: override.text, baseHash: override.baseHash },
      baseHash,
    };
  return {
    content: {
      ...content,
      missing: [
        ...content.missing,
        { field: "refinedBody", message: STALE_REFINED_BODY_MESSAGE },
      ],
    },
    state: { state: "stale", text: override.text, baseHash: override.baseHash },
    baseHash,
  };
}

/** Write (or delete) the refined wording inside the preparation save transaction. */
export function writeMessageBodyOverride(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    channel: "owner" | "tenant";
    revision: number;
    body: RefinedBody | null;
    now: string;
  },
): { textHash: string; baseHash: string } | null {
  const ref = messageBodyOverrideRef(db, input.leaseId, input.cycleId, input.channel);
  if (!input.body) {
    transaction.delete(ref);
    return null;
  }
  const record = MessageBodyOverrideRecordSchema.parse({
    schemaVersion: "renewal-message-body-override/v1",
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    channel: input.channel,
    revision: input.revision,
    text: input.body.text,
    baseHash: input.body.baseHash,
    updatedAt: input.now,
    updatedByUid: actor.uid,
  });
  transaction.set(ref, record);
  return {
    textHash: hashExecutionPreview({ text: record.text }),
    baseHash: record.baseHash,
  };
}
