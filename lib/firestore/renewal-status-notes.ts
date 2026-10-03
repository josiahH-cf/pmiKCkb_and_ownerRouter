// S164: the app-owned store for notes in a lease's Status log. Each note is its own document with
// its own identity and revision, kept apart from the staff status record and its history, so a note
// never moves the status revision and a status change never touches a note. One composition keeps
// one note id across every save and retry; an operation id makes a repeated request return the
// first result instead of writing again. The actor and time come from the server. Notes are never
// rewritten by another person and never removed. No provider, cycle or work record is read or
// written here.

import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RENEWAL_STATUS_NOTE_MAX_LENGTH,
  RENEWAL_STATUS_NOTE_SCHEMA_VERSION,
  normalizeStatusNoteText,
  type RenewalStatusNote,
} from "@/lib/lease-renewal/work-status-notes";

export const RENEWAL_STATUS_NOTE_COLLECTIONS = {
  notes: "lease_renewal_status_notes",
  operations: "lease_renewal_status_note_operations",
} as const;

const leaseId = z.string().regex(/^[1-9]\d*$/);

export const RenewalStatusNoteSchema = z
  .object({
    schemaVersion: z.literal(RENEWAL_STATUS_NOTE_SCHEMA_VERSION),
    leaseId,
    noteId: z.string().uuid(),
    revision: z.number().int().positive(),
    text: z.string().min(1).max(RENEWAL_STATUS_NOTE_MAX_LENGTH),
    recordedAt: z.string().datetime(),
    recordedByUid: z.string().min(1),
    recordedByLabel: z.string().min(1),
    updatedAt: z.string().datetime(),
    eventId: z.string().uuid(),
  })
  .strict();

export const SaveRenewalStatusNoteSchema = z
  .object({
    kind: z.literal("note"),
    leaseId,
    /** The composition's identity, chosen once by the editor and kept for every save of it. */
    noteId: z.string().uuid(),
    text: z.string(),
    /** The note revision the editor last read; 0 when this composition has never been saved. */
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict();
export type SaveRenewalStatusNoteInput = z.input<typeof SaveRenewalStatusNoteSchema>;

function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      write
        ? "Editor access is required to save a note. Continue read-only or ask an Admin to review your role."
        : "Renewal workspace read access is required.",
      403,
    );
}

function parseNote(raw: unknown): RenewalStatusNote {
  return RenewalStatusNoteSchema.parse(raw);
}

/** Every saved note for one lease, oldest first by its first save. */
export async function listRenewalStatusNotes(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalStatusNote[]> {
  assertActor(actor);
  leaseId.parse(id);
  const result = await db
    .collection(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)
    .where("leaseId", "==", id)
    .get();
  return result.docs
    .map((doc) => {
      const note = parseNote(doc.data());
      if (doc.id !== note.noteId)
        throw new EditableLayerError("A saved note identity is invalid.", 409);
      return note;
    })
    .sort(
      (a, b) =>
        a.recordedAt.localeCompare(b.recordedAt) || a.noteId.localeCompare(b.noteId),
    );
}

/**
 * Save one composition. The first save creates the note with the server's actor and time; a later
 * save of the same note id by the same person replaces only its text and keeps that first
 * attribution. Atomic: the same operation id with the same request returns the stored note as a
 * duplicate, a different note revision than the editor read is a real conflict, and empty text
 * stores nothing.
 */
export async function saveRenewalStatusNote(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
): Promise<{
  note: RenewalStatusNote;
  notes: RenewalStatusNote[];
  duplicate: boolean;
}> {
  assertActor(actor, true);
  const input = SaveRenewalStatusNoteSchema.parse(raw);
  const text = normalizeStatusNoteText(input.text);
  if (text === null)
    throw new EditableLayerError("A note needs some text before it can be saved.", 400);
  if (text.length > RENEWAL_STATUS_NOTE_MAX_LENGTH)
    throw new EditableLayerError(
      "A note can hold up to 4,000 characters. Shorten it, or continue in another note.",
      400,
    );
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    leaseId: input.leaseId,
    noteId: input.noteId,
    text,
    expectedRevision: input.expectedRevision,
    operationId: input.operationId,
  });
  const noteRef = db.collection(RENEWAL_STATUS_NOTE_COLLECTIONS.notes).doc(input.noteId);
  const operation = db
    .collection(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)
    .doc(input.operationId);
  const duplicate = await db.runTransaction(async (tx) => {
    const [snapshot, prior] = await Promise.all([tx.get(noteRef), tx.get(operation)]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This note save changed after it was first sent. Your text is kept; save it again.",
          409,
        );
      return true;
    }
    const current = snapshot.exists ? parseNote(snapshot.data()) : null;
    if (current && current.leaseId !== input.leaseId)
      throw new EditableLayerError(
        "This note belongs to another lease. Your text is kept; start another note to save it here.",
        409,
      );
    if (current && current.recordedByUid !== actor.uid)
      throw new EditableLayerError(
        "A saved note is continued only by the person who wrote it. Start another note to add yours.",
        403,
      );
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(
        "This note was saved from another place. Your text is kept; review the saved note before saving again.",
        409,
      );
    if (current) {
      // R-S164-10: no historical edit. A person continues only their most recent note on this
      // lease; every earlier note stays exactly as it was recorded.
      const siblings = await tx.get(
        db
          .collection(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)
          .where("leaseId", "==", input.leaseId),
      );
      const newer = siblings.docs.some((doc) => {
        if (doc.id === input.noteId) return false;
        const other = parseNote(doc.data());
        return (
          other.recordedByUid === actor.uid &&
          (other.recordedAt > current.recordedAt ||
            (other.recordedAt === current.recordedAt && other.noteId > current.noteId))
        );
      });
      if (newer)
        throw new EditableLayerError(
          "An earlier note stays as it was recorded. Your text is kept; start another note to add it.",
          409,
        );
    }
    // Nothing changed: keep the saved note as it is rather than recording an empty save.
    if (current && current.text === text) return true;
    const now = new Date().toISOString();
    const next = RenewalStatusNoteSchema.parse({
      schemaVersion: RENEWAL_STATUS_NOTE_SCHEMA_VERSION,
      leaseId: input.leaseId,
      noteId: input.noteId,
      revision: (current?.revision ?? 0) + 1,
      text,
      recordedAt: current?.recordedAt ?? now,
      recordedByUid: current?.recordedByUid ?? actor.uid,
      recordedByLabel: current?.recordedByLabel ?? actor.email,
      updatedAt: now,
      eventId: input.operationId,
    } satisfies RenewalStatusNote);
    tx.set(noteRef, next);
    tx.create(operation, {
      lease_id: input.leaseId,
      note_id: input.noteId,
      request_hash: requestHash,
      actor_uid: actor.uid,
      actor_label: actor.email,
      recorded_at: now,
      previous_revision: current?.revision ?? 0,
      next_revision: next.revision,
      text_length: text.length,
    });
    return false;
  });
  const notes = await listRenewalStatusNotes(actor, input.leaseId, db);
  const note = notes.find((entry) => entry.noteId === input.noteId);
  if (!note)
    throw new EditableLayerError(
      "The saved note could not be read back. Your text is kept; save it again.",
      409,
    );
  return { note, notes, duplicate };
}
