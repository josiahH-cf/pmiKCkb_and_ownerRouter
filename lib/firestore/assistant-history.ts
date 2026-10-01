// S148 owner-scoped Dashboard conversation history. Server-only (Admin SDK); the browser never reads
// these documents directly, and firestore.rules keeps its catch-all deny. Every document lives under
// the signed-in user's own key, derived on the server from the session uid, so a guessed, spoofed
// or another user's id resolves to nothing. Turns are append-only documents with a stable id per
// client operation: saving is idempotent, a retry saves the same result, and a late or concurrent
// write can only finish its own turn, never replace a newer one. The query route stays a read; it
// imports only `assistant-history-read.ts`.

import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  turnIdFor,
  type StoredTurnRecord,
} from "@/lib/firestore/assistant-history-read";
import {
  StoredAssistantAnswerSchema,
  StoredKnowledgeAnswerSchema,
} from "@/lib/assistant-history/stored-answer";

export { historyOwnerKey, turnIdFor };

/** A client operation id: one submission of one question. */
export const OperationIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
export const ConversationIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
const QuestionSchema = z.string().trim().min(1).max(500);

/**
 * A conversation is named by the operation id of its first question (`conversationKey`), so the
 * browser can keep asking in it before any save has answered, and a retried or late first save
 * still lands in the same conversation.
 */
export const BeginTurnInputSchema = z
  .object({
    operationId: OperationIdSchema,
    conversationKey: OperationIdSchema,
    question: QuestionSchema,
  })
  .strict();
export type BeginTurnInput = z.infer<typeof BeginTurnInputSchema>;

export const FinalizeTurnInputSchema = z
  .object({
    conversationKey: OperationIdSchema,
    question: QuestionSchema,
    state: z.enum(["completed", "failed", "interrupted"]),
    assistant: StoredAssistantAnswerSchema.nullable(),
    knowledge: StoredKnowledgeAnswerSchema.nullable(),
  })
  .strict()
  .refine((input) => input.state !== "completed" || input.assistant || input.knowledge, {
    message: "A completed turn carries the answer that was shown.",
  })
  .refine(
    (input) => input.state === "completed" || (!input.assistant && !input.knowledge),
    {
      message: "Only a completed turn stores an answer.",
    },
  );
export type FinalizeTurnInput = z.infer<typeof FinalizeTurnInputSchema>;

/** Stored answers stay well under the document limit; anything larger is refused, not truncated. */
export const MAX_STORED_TURN_BYTES = 400_000;

export interface TurnWriteResult {
  readonly conversationId: string;
  readonly turnId: string;
  readonly seq: number;
  readonly state: StoredTurnRecord["state"];
  /** False when the same operation had already been recorded and nothing new was written. */
  readonly created: boolean;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The deterministic id of one user's conversation, from its first question's operation id. */
export function conversationIdFor(uid: string, conversationKey: string): string {
  return hash(`assistant-history/v1:conversation:${uid}:${conversationKey}`).slice(0, 32);
}

function excerpt(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Newest first, ties broken by id, so every page boundary is stable. */
function sortKey(updatedAtIso: string, conversationId: string): string {
  return `${updatedAtIso}|${conversationId}`;
}

function userRoot(db: Firestore, user: AuthenticatedUser) {
  return db
    .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
    .doc(historyOwnerKey(user.uid));
}

function accessBasis(user: AuthenticatedUser) {
  return { role: user.role, scopes: user.scopes ? [...user.scopes].sort() : null };
}

function assertSize(value: unknown) {
  if (JSON.stringify(value).length > MAX_STORED_TURN_BYTES) {
    throw new EditableLayerError("This answer is too large to save to history.", 400);
  }
}

/**
 * Attach a new turn to its conversation inside the caller's transaction. The conversation id is
 * derived from this user and the conversation key, so it can only ever resolve under this user.
 */
async function appendTurn(
  transaction: Transaction,
  db: Firestore,
  user: AuthenticatedUser,
  input: { conversationKey: string; question: string },
  nowIso: string,
): Promise<{ conversationId: string; seq: number }> {
  const conversationId = conversationIdFor(user.uid, input.conversationKey);
  const ref = userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
    .doc(conversationId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) {
    transaction.create(ref, {
      owner_uid: user.uid,
      conversation_id: conversationId,
      conversation_key: input.conversationKey,
      title: excerpt(input.question),
      created_at: nowIso,
      updated_at: nowIso,
      sort_key: sortKey(nowIso, conversationId),
      turn_count: 1,
      last_state: "submitted",
      record_version: 1,
    });
    return { conversationId, seq: 1 };
  }
  const data = snapshot.data() as {
    owner_uid?: string;
    turn_count?: number;
    record_version?: number;
  };
  if (data.owner_uid !== user.uid) throw notFound();
  const seq = (data.turn_count ?? 0) + 1;
  transaction.update(ref, {
    turn_count: seq,
    updated_at: nowIso,
    sort_key: sortKey(nowIso, conversationId),
    last_state: "submitted",
    record_version: (data.record_version ?? 0) + 1,
  });
  return { conversationId, seq };
}

function notFound() {
  return new EditableLayerError("That conversation was not found.", 404);
}

/** Record a submitted question. Idempotent per operation: a repeat returns the existing turn. */
export async function beginAssistantTurn(
  user: AuthenticatedUser,
  rawInput: unknown,
  db: Firestore = getAdminFirestore(),
  now: () => Date = () => new Date(),
): Promise<TurnWriteResult> {
  const input = BeginTurnInputSchema.parse(rawInput);
  const turnId = turnIdFor(user.uid, input.operationId);
  const turnRef = userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .doc(turnId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(turnRef);
    if (existing.exists) {
      const record = existing.data() as StoredTurnRecord;
      if (record.owner_uid !== user.uid) throw notFound();
      return {
        conversationId: record.conversation_id,
        turnId,
        seq: record.seq,
        state: record.state,
        created: false,
      };
    }
    const nowIso = now().toISOString();
    const placed = await appendTurn(transaction, db, user, input, nowIso);
    const record: StoredTurnRecord = {
      owner_uid: user.uid,
      turn_id: turnId,
      operation_id: input.operationId,
      conversation_id: placed.conversationId,
      seq: placed.seq,
      state: "submitted",
      question: input.question,
      assistant: null,
      knowledge: null,
      answered_at: null,
      created_at: nowIso,
      updated_at: nowIso,
      access_basis: accessBasis(user),
    };
    transaction.create(turnRef, record);
    return { ...placed, turnId, state: "submitted" as const, created: true };
  });
}

/**
 * Finish a turn with what the person actually saw. A completed turn is final: a later failure or
 * interruption for the same operation cannot overwrite it, and an identical completion is a no-op.
 * If the earlier begin never landed, this records the turn now with the same deterministic ids.
 */
export async function finalizeAssistantTurn(
  user: AuthenticatedUser,
  operationId: string,
  rawInput: unknown,
  db: Firestore = getAdminFirestore(),
  now: () => Date = () => new Date(),
): Promise<TurnWriteResult> {
  const op = OperationIdSchema.parse(operationId);
  const input = FinalizeTurnInputSchema.parse(rawInput);
  assertSize(input);
  const turnId = turnIdFor(user.uid, op);
  const turnRef = userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .doc(turnId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(turnRef);
    const nowIso = now().toISOString();
    let record: StoredTurnRecord;
    let created = false;
    if (snapshot.exists) {
      record = snapshot.data() as StoredTurnRecord;
      if (record.owner_uid !== user.uid) throw notFound();
      if (record.state === "completed") {
        if (input.state === "completed" && sameAnswer(record, input)) {
          return {
            conversationId: record.conversation_id,
            turnId,
            seq: record.seq,
            state: record.state,
            created: false,
          };
        }
        throw new EditableLayerError(
          "This question already has a saved answer; the saved answer is kept.",
          409,
        );
      }
    } else {
      const placed = await appendTurn(
        transaction,
        db,
        user,
        { conversationKey: input.conversationKey, question: input.question },
        nowIso,
      );
      record = {
        owner_uid: user.uid,
        turn_id: turnId,
        operation_id: op,
        conversation_id: placed.conversationId,
        seq: placed.seq,
        state: "submitted",
        question: input.question,
        assistant: null,
        knowledge: null,
        answered_at: null,
        created_at: nowIso,
        updated_at: nowIso,
        access_basis: accessBasis(user),
      };
      created = true;
    }
    const conversationRef = userRoot(db, user)
      .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
      .doc(record.conversation_id);
    const conversation = created ? null : await transaction.get(conversationRef);
    const next: StoredTurnRecord = {
      ...record,
      state: input.state,
      assistant: input.state === "completed" ? input.assistant : null,
      knowledge: input.state === "completed" ? input.knowledge : null,
      answered_at: input.state === "completed" ? nowIso : null,
      updated_at: nowIso,
      access_basis: accessBasis(user),
    };
    transaction.set(turnRef, next);
    // Only the newest turn speaks for the conversation's summary; finishing an older turn late
    // never moves the conversation's last state backwards.
    const conversationData = conversation?.data() as
      | { turn_count?: number; record_version?: number }
      | undefined;
    if (created || (conversationData && conversationData.turn_count === record.seq)) {
      transaction.set(
        conversationRef,
        {
          last_state: input.state,
          updated_at: nowIso,
          sort_key: sortKey(nowIso, record.conversation_id),
          record_version: (conversationData?.record_version ?? 1) + 1,
        },
        { merge: true },
      );
    }
    return {
      conversationId: record.conversation_id,
      turnId,
      seq: record.seq,
      state: input.state,
      created,
    };
  });
}

function sameAnswer(record: StoredTurnRecord, input: FinalizeTurnInput): boolean {
  return (
    JSON.stringify(record.assistant ?? null) ===
      JSON.stringify(input.assistant ?? null) &&
    JSON.stringify(record.knowledge ?? null) === JSON.stringify(input.knowledge ?? null)
  );
}
