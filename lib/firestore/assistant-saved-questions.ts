// S149 owner-scoped saved and pinned Dashboard questions. Server-only (Admin SDK); firestore.rules
// keeps its catch-all deny. A saved item is created from one of the signed-in user's own completed
// history turns, read on the server: it keeps that turn's question, the merged plan it executed,
// the record references a follow-up was limited to, the concrete period the original run used and
// whether that period is relative or fixed. The client never supplies a plan. Saving is idempotent
// per user and turn (the same wording asked separately stays a separate item); pin and label
// changes are versioned and a repeated change is a no-op. Unpinning keeps the item and its history.

import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import { storedPlanSupport } from "@/lib/assistant/conversation";
import type { SavedQuestionView, SavedRange } from "@/lib/assistant-history/saved-types";
import type { AccessBasis } from "@/lib/assistant-history/stored-answer";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  turnIdFor,
  type StoredConversationRecord,
  type StoredTurnRecord,
} from "@/lib/firestore/assistant-history-read";
import type { OperationalRecordRef } from "@/lib/operational-context/types";

const OperationIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
export const SavedIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
const LabelSchema = z.string().trim().min(1).max(80);

export const SaveQuestionInputSchema = z
  .object({ operationId: OperationIdSchema, label: LabelSchema.optional() })
  .strict();

export const UpdateSavedQuestionInputSchema = z
  .object({
    pinned: z.boolean().optional(),
    label: LabelSchema.optional(),
    /** The version the person saw; a stale version cannot change the item. */
    expectedVersion: z.number().int().min(1),
  })
  .strict()
  .refine((input) => input.pinned !== undefined || input.label !== undefined, {
    message: "Change the pin or the label.",
  });

export interface SavedQuestionRecord {
  readonly owner_uid: string;
  readonly saved_id: string;
  readonly turn_id: string;
  readonly operation_id: string;
  readonly conversation_id: string;
  readonly conversation_key: string;
  readonly question: string;
  readonly label: string;
  /** The merged plan the original answer executed, or null when it executed none. */
  readonly plan: unknown;
  readonly related_refs: readonly OperationalRecordRef[];
  readonly detail_ref: OperationalRecordRef | null;
  /** The concrete period the original run used; shown as history, never reused as current. */
  readonly original_range: SavedRange | null;
  /** The conversation before the saved turn, so asking again keeps a follow-up's meaning. */
  readonly context_before: ConversationContext | null;
  readonly pinned: boolean;
  readonly pinned_at: string | null;
  readonly record_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  /** The newest stored answer for this item: the original turn or its latest current run. */
  readonly last_turn_id: string;
  readonly last_operation_id: string;
  readonly last_answered_at: string;
  readonly access_basis: AccessBasis;
}

export type { SavedQuestionView, SavedRange };

export const MAX_SAVED_QUESTIONS_LISTED = 100;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** One saved item per user and history turn. */
export function savedIdFor(uid: string, turnId: string): string {
  return hash(`assistant-history/v1:saved:${uid}:${turnId}`).slice(0, 32);
}

function userRoot(db: Firestore, user: AuthenticatedUser) {
  return db
    .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
    .doc(historyOwnerKey(user.uid));
}

function savedCollection(db: Firestore, user: AuthenticatedUser) {
  return userRoot(db, user).collection(ASSISTANT_HISTORY_COLLECTIONS.saved);
}

function excerpt(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function notFound() {
  return new EditableLayerError("That saved question was not found.", 404);
}

export function toSavedQuestionView(record: SavedQuestionRecord): SavedQuestionView {
  const structured = storedPlanSupport(record.plan, record.detail_ref).supported;
  return {
    savedId: record.saved_id,
    label: record.label,
    question: record.question,
    conversationId: record.conversation_id,
    conversationKey: record.conversation_key,
    operationId: record.operation_id,
    lastOperationId: record.last_operation_id,
    lastAnsweredAtIso: record.last_answered_at,
    createdAtIso: record.created_at,
    pinned: record.pinned,
    recordVersion: record.record_version,
    structured,
    originalRange: record.original_range,
    contextBefore: structured ? null : record.context_before,
  };
}

/** The saved meaning of one completed turn, read from what that turn actually executed. */
function meaningOf(
  turn: StoredTurnRecord,
): Pick<
  SavedQuestionRecord,
  "plan" | "related_refs" | "detail_ref" | "original_range" | "context_before"
> {
  const execution = turn.assistant?.execution ?? null;
  const range = execution?.range ?? null;
  const context = turn.assistant?.conversation ?? null;
  const last = context?.turns.at(-1);
  return {
    plan: execution?.plan ?? null,
    related_refs: execution ? [...execution.relatedRefs] : [],
    detail_ref: execution?.detailRef ?? null,
    original_range: range
      ? {
          intent: range.intent,
          preset: range.preset,
          month: range.month,
          dateField: range.dateField,
          startIso: range.startIso,
          endIso: range.endIso,
          label: range.label,
        }
      : null,
    // The stored context ends with this turn; what came before it is what a re-ask continues.
    context_before:
      context && last && last.question === turn.question.slice(0, 500)
        ? { ...context, turns: context.turns.slice(0, -1) }
        : null,
  };
}

/**
 * Save one of this user's completed history turns. Idempotent per user and turn: repeating the
 * save returns the existing item and writes nothing.
 */
export async function saveQuestion(
  user: AuthenticatedUser,
  rawInput: unknown,
  db: Firestore = getAdminFirestore(),
  now: () => Date = () => new Date(),
): Promise<{ created: boolean; item: SavedQuestionView }> {
  const input = SaveQuestionInputSchema.parse(rawInput);
  const turnId = turnIdFor(user.uid, input.operationId);
  const savedId = savedIdFor(user.uid, turnId);
  const turnRef = userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .doc(turnId);
  const savedRef = savedCollection(db, user).doc(savedId);
  return db.runTransaction(async (transaction) => {
    const [turnSnapshot, savedSnapshot] = await transaction.getAll(turnRef, savedRef);
    if (savedSnapshot.exists) {
      const existing = savedSnapshot.data() as SavedQuestionRecord;
      if (existing.owner_uid !== user.uid) throw notFound();
      return { created: false, item: toSavedQuestionView(existing) };
    }
    if (!turnSnapshot.exists) {
      throw new EditableLayerError("That answer is not in your history yet.", 404);
    }
    const turn = turnSnapshot.data() as StoredTurnRecord;
    if (turn.owner_uid !== user.uid) throw notFound();
    if (turn.state !== "completed" || (!turn.assistant && !turn.knowledge)) {
      throw new EditableLayerError("Only an answered question can be saved.", 409);
    }
    const conversationSnapshot = await transaction.get(
      userRoot(db, user)
        .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
        .doc(turn.conversation_id),
    );
    const conversation = conversationSnapshot.exists
      ? (conversationSnapshot.data() as StoredConversationRecord)
      : null;
    if (!conversation || conversation.owner_uid !== user.uid) throw notFound();
    const nowIso = now().toISOString();
    // A follow-up's own words rarely carry its meaning, so its default label names the
    // conversation it continued.
    const defaultLabel =
      turn.seq > 1
        ? excerpt(`${conversation.title} · ${turn.question}`)
        : excerpt(turn.question);
    const record: SavedQuestionRecord = {
      owner_uid: user.uid,
      saved_id: savedId,
      turn_id: turnId,
      operation_id: turn.operation_id,
      conversation_id: turn.conversation_id,
      conversation_key: conversation.conversation_key,
      question: turn.question,
      label: input.label ?? defaultLabel,
      ...meaningOf(turn),
      pinned: false,
      pinned_at: null,
      record_version: 1,
      created_at: nowIso,
      updated_at: nowIso,
      last_turn_id: turnId,
      last_operation_id: turn.operation_id,
      last_answered_at: turn.answered_at ?? turn.updated_at,
      access_basis: turn.access_basis,
    };
    transaction.create(savedRef, record);
    return { created: true, item: toSavedQuestionView(record) };
  });
}

/**
 * Pin, unpin or relabel one saved item. A change that is already in place is a no-op whatever its
 * version; any other change must name the current version, so a stale tab cannot overwrite a newer
 * one. Nothing here removes the item or its history.
 */
export async function updateSavedQuestion(
  user: AuthenticatedUser,
  savedId: string,
  rawInput: unknown,
  db: Firestore = getAdminFirestore(),
  now: () => Date = () => new Date(),
): Promise<{ changed: boolean; item: SavedQuestionView }> {
  const id = SavedIdSchema.parse(savedId);
  const input = UpdateSavedQuestionInputSchema.parse(rawInput);
  const ref = savedCollection(db, user).doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw notFound();
    const record = snapshot.data() as SavedQuestionRecord;
    if (record.owner_uid !== user.uid) throw notFound();
    const pinned = input.pinned ?? record.pinned;
    const label = input.label ?? record.label;
    if (pinned === record.pinned && label === record.label) {
      return { changed: false, item: toSavedQuestionView(record) };
    }
    if (input.expectedVersion !== record.record_version) {
      throw new EditableLayerError(
        "This saved question changed in another session. Its latest state is shown.",
        409,
      );
    }
    const nowIso = now().toISOString();
    const next: SavedQuestionRecord = {
      ...record,
      pinned,
      pinned_at: pinned ? (record.pinned ? record.pinned_at : nowIso) : null,
      label,
      record_version: record.record_version + 1,
      updated_at: nowIso,
    };
    transaction.set(ref, next);
    return { changed: true, item: toSavedQuestionView(next) };
  });
}

/** This user's saved items: pinned first (most recently pinned first), then newest saved. */
export async function listSavedQuestions(
  user: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<{ items: SavedQuestionView[]; truncated: boolean }> {
  const snapshot = await savedCollection(db, user)
    .orderBy("created_at", "desc")
    .limit(MAX_SAVED_QUESTIONS_LISTED + 1)
    .get();
  const records = snapshot.docs
    .map((doc) => doc.data() as SavedQuestionRecord)
    .filter((record) => record.owner_uid === user.uid);
  const page = records.slice(0, MAX_SAVED_QUESTIONS_LISTED);
  page.sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (left.pinned && right.pinned)
      return (right.pinned_at ?? "").localeCompare(left.pinned_at ?? "");
    return right.created_at.localeCompare(left.created_at);
  });
  return {
    items: page.map(toSavedQuestionView),
    truncated: records.length > MAX_SAVED_QUESTIONS_LISTED,
  };
}

/** One of this user's saved items, or null when it is not theirs. */
export async function readSavedQuestion(
  user: AuthenticatedUser,
  savedId: string,
  db: Firestore = getAdminFirestore(),
): Promise<SavedQuestionRecord | null> {
  if (!SavedIdSchema.safeParse(savedId).success) return null;
  const snapshot = await savedCollection(db, user).doc(savedId).get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() as SavedQuestionRecord;
  return record.owner_uid === user.uid ? record : null;
}
