// S148 read side of the owner-scoped Dashboard history. This module performs reads only: the
// Dashboard query route imports it to replay a completed turn by operation id and must stay a read
// (S138/S110 bans, verification read set, mutation-free release assurance). Every path is under the
// signed-in user's own key, derived here from the session uid, and every record is re-checked
// against that uid, so another user's or a guessed id resolves to nothing.

import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type {
  AccessBasis,
  StoredAssistantAnswer,
  StoredKnowledgeAnswer,
} from "@/lib/assistant-history/stored-answer";
import { getAdminFirestore } from "@/lib/firestore/admin";

export const ASSISTANT_HISTORY_COLLECTIONS = Object.freeze({
  users: "assistant_history_users",
  conversations: "conversations",
  turns: "turns",
  saved: "saved_questions",
} as const);

export type StoredTurnState = "submitted" | "completed" | "failed" | "interrupted";

export interface StoredTurnRecord {
  readonly owner_uid: string;
  readonly turn_id: string;
  readonly operation_id: string;
  readonly conversation_id: string;
  readonly seq: number;
  readonly state: StoredTurnState;
  readonly question: string;
  readonly assistant: StoredAssistantAnswer | null;
  readonly knowledge: StoredKnowledgeAnswer | null;
  readonly answered_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly access_basis: AccessBasis;
  /** S150: set on a structured rerun turn, naming the saved question it ran. */
  readonly rerun_of?: string;
}

export interface StoredConversationRecord {
  readonly owner_uid: string;
  readonly conversation_id: string;
  readonly conversation_key: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly sort_key: string;
  readonly turn_count: number;
  readonly last_state: StoredTurnState;
  readonly record_version: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The per-user history key. Derived on the server from the session uid; never sent by a client. */
export function historyOwnerKey(uid: string): string {
  return hash(`assistant-history/v1:owner:${uid}`).slice(0, 40);
}

/** One turn's id: the same operation always names the same turn for the same user. */
export function turnIdFor(uid: string, operationId: string): string {
  return hash(`assistant-history/v1:turn:${uid}:${operationId}`).slice(0, 32);
}

function userRoot(db: Firestore, user: AuthenticatedUser) {
  return db
    .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
    .doc(historyOwnerKey(user.uid));
}

/**
 * The completed operational answer for one of this user's operations, or null. Used only to replay
 * a duplicate delivery of the same submission without asking the model again.
 */
export async function readCompletedTurnAnswer(
  user: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
): Promise<{ question: string; answer: StoredAssistantAnswer } | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(operationId)) return null;
  const snapshot = await userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .doc(turnIdFor(user.uid, operationId))
    .get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() as StoredTurnRecord;
  if (record.owner_uid !== user.uid || record.state !== "completed" || !record.assistant)
    return null;
  return { question: record.question, answer: record.assistant };
}

export interface ConversationSummary {
  readonly conversationId: string;
  readonly conversationKey: string;
  readonly title: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly turnCount: number;
  readonly lastState: StoredTurnState;
}

export const HISTORY_PAGE_SIZE = 20;

function toSummary(record: StoredConversationRecord): ConversationSummary {
  return {
    conversationId: record.conversation_id,
    conversationKey: record.conversation_key,
    title: record.title,
    createdAtIso: record.created_at,
    updatedAtIso: record.updated_at,
    turnCount: record.turn_count,
    lastState: record.last_state,
  };
}

/** One page of this user's conversations, newest first. `nextCursor` is null on the last page. */
export async function listAssistantConversations(
  user: AuthenticatedUser,
  options: { cursor?: string | null; limit?: number } = {},
  db: Firestore = getAdminFirestore(),
): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? HISTORY_PAGE_SIZE, 1), 50);
  let query = userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
    .orderBy("sort_key", "desc");
  if (options.cursor) query = query.startAfter(options.cursor);
  const snapshot = await query.limit(limit + 1).get();
  const records = snapshot.docs
    .map((doc) => doc.data() as StoredConversationRecord)
    .filter((record) => record.owner_uid === user.uid);
  const page = records.slice(0, limit);
  return {
    conversations: page.map(toSummary),
    nextCursor: records.length > limit ? (page.at(-1)?.sort_key ?? null) : null,
  };
}

/** A submitted turn older than this is shown as interrupted; it never shows as an answer. */
export const INTERRUPTED_AFTER_MS = 3 * 60_000;

export type StoredTurnDisplayState =
  | "completed"
  | "failed"
  | "interrupted"
  | "in_progress";

export interface StoredTurnView {
  readonly turnId: string;
  readonly operationId: string;
  readonly seq: number;
  readonly question: string;
  readonly displayState: StoredTurnDisplayState;
  readonly assistant: StoredAssistantAnswer | null;
  readonly knowledge: StoredKnowledgeAnswer | null;
  readonly answeredAtIso: string | null;
  readonly createdAtIso: string;
  readonly accessBasis: AccessBasis;
  readonly rerunOf: string | null;
}

export function displayStateOf(
  record: StoredTurnRecord,
  now: Date,
): StoredTurnDisplayState {
  if (record.state === "submitted") {
    return now.getTime() - Date.parse(record.created_at) > INTERRUPTED_AFTER_MS
      ? "interrupted"
      : "in_progress";
  }
  return record.state;
}

/** One of this user's conversations with its turns in order, or null when it is not theirs. */
export async function readAssistantConversation(
  user: AuthenticatedUser,
  conversationId: string,
  db: Firestore = getAdminFirestore(),
  now: Date = new Date(),
): Promise<{ conversation: ConversationSummary; turns: StoredTurnView[] } | null> {
  if (!/^[a-f0-9]{32}$/.test(conversationId)) return null;
  const root = userRoot(db, user);
  const snapshot = await root
    .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
    .doc(conversationId)
    .get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() as StoredConversationRecord;
  if (record.owner_uid !== user.uid) return null;
  const turns = await root
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .where("conversation_id", "==", conversationId)
    .get();
  const views = turns.docs
    .map((doc) => doc.data() as StoredTurnRecord)
    .filter((turn) => turn.owner_uid === user.uid)
    .sort(
      (left, right) =>
        left.seq - right.seq || left.created_at.localeCompare(right.created_at),
    )
    .map(
      (turn): StoredTurnView => ({
        turnId: turn.turn_id,
        operationId: turn.operation_id,
        seq: turn.seq,
        question: turn.question,
        displayState: displayStateOf(turn, now),
        assistant: turn.state === "completed" ? turn.assistant : null,
        knowledge: turn.state === "completed" ? turn.knowledge : null,
        answeredAtIso: turn.answered_at,
        createdAtIso: turn.created_at,
        accessBasis: turn.access_basis,
        rerunOf: turn.rerun_of ?? null,
      }),
    );
  return { conversation: toSummary(record), turns: views };
}

/** S150: one of this user's turns by operation id, or null. A read, used to replay a current run. */
export async function readTurnByOperation(
  user: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
): Promise<StoredTurnRecord | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(operationId)) return null;
  const snapshot = await userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .doc(turnIdFor(user.uid, operationId))
    .get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() as StoredTurnRecord;
  return record.owner_uid === user.uid ? record : null;
}
