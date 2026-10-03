// S139/S161: the authored wording for one renewal message preparation: the body staff wrote or
// accepted from a refinement, and (S161) a directly edited subject. Each lives beside the
// preparation record, keyed by the same lease, cycle and channel identity, and is written only inside
// the preparation save transaction, so it always belongs to exactly one saved revision. A revision
// saved without authored wording deletes it. The subject has its own new collection so the body
// record keeps the exact shape the previous release reads. Code that does not know a collection
// ignores it and shows the composed text the person also sees there.

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  applyAuthoredSubject,
  applyRefinedBody,
  type RefinedBody,
  type RefinedBodyState,
} from "@/lib/lease-renewal/refined-message";
import type { RenewalMessageContent } from "@/lib/lease-renewal/renewal-message-content";

export const MESSAGE_BODY_OVERRIDE_COLLECTION = "renewal_message_body_overrides";
export const MESSAGE_SUBJECT_OVERRIDE_COLLECTION = "renewal_message_subject_overrides";

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

export const MessageSubjectOverrideRecordSchema = z
  .object({
    schemaVersion: z.literal("renewal-message-subject-override/v1"),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: z.string().uuid(),
    channel: z.enum(["owner", "tenant"]),
    /** The preparation revision this subject was saved with. */
    revision: z.number().int().positive(),
    subject: z.string().min(1).max(300),
    updatedAt: z.string().datetime(),
    updatedByUid: z.string().min(1),
  })
  .strict();
export type MessageSubjectOverrideRecord = z.infer<
  typeof MessageSubjectOverrideRecordSchema
>;

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

export function messageSubjectOverrideRef(
  db: Firestore,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
) {
  return db
    .collection(MESSAGE_SUBJECT_OVERRIDE_COLLECTION)
    .doc(identity(leaseId, cycleId, channel));
}

/** Hash of a composed body; authored wording records which composition it started from. */
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
      "The saved wording belongs to a different lease, work record or channel.",
      409,
    );
  return record;
}

export async function getMessageSubjectOverride(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
): Promise<MessageSubjectOverrideRecord | null> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Renewals staff access is required.", 403);
  const snapshot = await messageSubjectOverrideRef(db, leaseId, cycleId, channel).get();
  if (!snapshot.exists) return null;
  const record = MessageSubjectOverrideRecordSchema.parse(snapshot.data());
  if (
    record.leaseId !== leaseId ||
    record.cycleId !== cycleId ||
    record.channel !== channel
  )
    throw new EditableLayerError(
      "The saved subject belongs to a different lease, work record or channel.",
      409,
    );
  return record;
}

/**
 * Decide whether saved authored wording is the body. It applies to the revision it was saved with,
 * and it stays the body, word for word, when the composed information later changes (S161
 * R-S161-7): the `stale` state only reports that change so the person can choose to start again
 * from the standard wording. An unreadable record is reported as its own state and leaves the
 * composed body in place; the draft step alone waits for it to be read back.
 */
export function resolveMessageBodyOverride(
  content: RenewalMessageContent,
  savedRevision: number | null,
  override: MessageBodyOverrideRecord | null | "unreadable",
): { content: RenewalMessageContent; state: RefinedBodyState | null; baseHash: string } {
  const baseHash = composedBodyHash(content.plainText);
  if (override === "unreadable")
    return { content, state: { state: "unreadable" }, baseHash };
  if (!override || savedRevision === null || override.revision !== savedRevision)
    return { content, state: null, baseHash };
  return {
    content: applyRefinedBody(content, override.text),
    state: {
      state: override.baseHash === baseHash ? "applied" : "stale",
      text: override.text,
      baseHash: override.baseHash,
    },
    baseHash,
  };
}

/** The saved authored subject for exactly this revision, or the composed subject. */
export function resolveMessageSubjectOverride(
  content: RenewalMessageContent,
  savedRevision: number | null,
  override: MessageSubjectOverrideRecord | null,
): { content: RenewalMessageContent; subject: string | null } {
  if (!override || savedRevision === null || override.revision !== savedRevision)
    return { content, subject: null };
  return {
    content: applyAuthoredSubject(content, override.subject),
    subject: override.subject,
  };
}

/** Write (or delete) the authored body inside the preparation save transaction. */
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

/** Write (or delete) the authored subject inside the preparation save transaction. */
export function writeMessageSubjectOverride(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    channel: "owner" | "tenant";
    revision: number;
    subject: string | null;
    now: string;
  },
): { subjectHash: string } | null {
  const ref = messageSubjectOverrideRef(db, input.leaseId, input.cycleId, input.channel);
  if (!input.subject) {
    transaction.delete(ref);
    return null;
  }
  const record = MessageSubjectOverrideRecordSchema.parse({
    schemaVersion: "renewal-message-subject-override/v1",
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    channel: input.channel,
    revision: input.revision,
    subject: input.subject,
    updatedAt: input.now,
    updatedByUid: actor.uid,
  });
  transaction.set(ref, record);
  return { subjectHash: hashExecutionPreview({ subject: record.subject }) };
}
