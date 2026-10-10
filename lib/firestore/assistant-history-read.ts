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
  readonly pinned?: boolean;
  readonly pin_version?: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The per-user history key. Derived on the server from the session uid; never sent by a client. */
export function historyOwnerKey(uid: string): string {
  return hash(`assistant-history/v1:owner:${uid}`).slice(0, 40);
}

/** The existing deterministic private thread identity; read-side callers never import writers. */
export function conversationIdFor(uid: string, conversationKey: string): string {
  return hash(`assistant-history/v1:conversation:${uid}:${conversationKey}`).slice(0, 32);
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
 * a duplicate delivery of the same submission without asking the model again. The access the
 * answer was produced under comes with it, so the replay applies the viewer's current access.
 */
export async function readCompletedTurnAnswer(
  user: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
): Promise<{
  question: string;
  answer: StoredAssistantAnswer;
  accessBasis: AccessBasis;
} | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(operationId)) return null;
  const snapshot = await userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .doc(turnIdFor(user.uid, operationId))
    .get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() as StoredTurnRecord;
  if (record.owner_uid !== user.uid || record.state !== "completed" || !record.assistant)
    return null;
  return {
    question: record.question,
    answer: record.assistant,
    accessBasis: record.access_basis,
  };
}

export interface ConversationSummary {
  readonly conversationId: string;
  readonly conversationKey: string;
  readonly title: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly turnCount: number;
  readonly lastState: StoredTurnState;
  readonly pinned: boolean;
  readonly pinVersion: number;
}

export const HISTORY_PAGE_SIZE = 20;

export function toSummary(record: StoredConversationRecord): ConversationSummary {
  return {
    conversationId: record.conversation_id,
    conversationKey: record.conversation_key,
    title: record.title,
    createdAtIso: record.created_at,
    updatedAtIso: record.updated_at,
    turnCount: record.turn_count,
    lastState: record.last_state,
    pinned: record.pinned === true,
    pinVersion: record.pin_version ?? 0,
  };
}

/** One page of this user's conversations, newest first. `nextCursor` is null on the last page. */
export async function listAssistantConversations(
  user: AuthenticatedUser,
  options: { cursor?: string | null; limit?: number; pinnedOnly?: boolean } = {},
  db: Firestore = getAdminFirestore(),
): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? HISTORY_PAGE_SIZE, 1), 50);
  let query = userRoot(db, user)
    .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
    .orderBy("sort_key", "desc");
  if (options.pinnedOnly) query = query.where("pinned", "==", true);
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

export const HISTORY_TURN_PAGE_SIZE = 50;

/** A bounded ordered read. The cursor is only a sequence within this owned thread. */
export async function readAssistantConversationPage(
  user: AuthenticatedUser,
  conversationId: string,
  after = 0,
  db: Firestore = getAdminFirestore(),
  now: Date = new Date(),
): Promise<{
  conversation: ConversationSummary;
  turns: StoredTurnView[];
  nextTurnCursor: number | null;
} | null> {
  if (!/^[a-f0-9]{32}$/.test(conversationId) || !Number.isSafeInteger(after) || after < 0)
    return null;
  const root = userRoot(db, user);
  const snapshot = await root
    .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
    .doc(conversationId)
    .get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() as StoredConversationRecord;
  if (record.owner_uid !== user.uid) return null;
  const page = await root
    .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
    .where("conversation_id", "==", conversationId)
    .orderBy("seq", "asc")
    .startAfter(after)
    .limit(HISTORY_TURN_PAGE_SIZE + 1)
    .get();
  const rows = page.docs.map((doc) => doc.data() as StoredTurnRecord);
  // A malformed owner or sequence cannot be hidden by pagination and mistaken for a complete read.
  if (
    rows.some(
      (turn) =>
        turn.owner_uid !== user.uid ||
        turn.conversation_id !== conversationId ||
        !Number.isSafeInteger(turn.seq) ||
        turn.seq <= after,
    )
  )
    throw new Error("Private conversation page could not be read.");
  const accepted = rows.slice(0, HISTORY_TURN_PAGE_SIZE);
  return {
    conversation: toSummary(record),
    nextTurnCursor: rows.length > HISTORY_TURN_PAGE_SIZE ? accepted.at(-1)!.seq : null,
    turns: accepted.map((turn) => ({
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
    })),
  };
}

/** Server context reads every page explicitly; there is no silent fixed turn-count truncation. */
export async function readAssistantConversation(
  user: AuthenticatedUser,
  conversationId: string,
  db: Firestore = getAdminFirestore(),
  now: Date = new Date(),
): Promise<{ conversation: ConversationSummary; turns: StoredTurnView[] } | null> {
  let after = 0;
  const turns: StoredTurnView[] = [];
  let conversation: ConversationSummary | null = null;
  do {
    const page = await readAssistantConversationPage(
      user,
      conversationId,
      after,
      db,
      now,
    );
    if (!page) return null;
    conversation = page.conversation;
    turns.push(...page.turns);
    if (page.nextTurnCursor === null) break;
    if (page.nextTurnCursor <= after)
      throw new Error("Private conversation page did not advance.");
    after = page.nextTurnCursor;
  } while (true);
  return { conversation: conversation!, turns };
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

/** Selection is metadata only. Reading it never infers, selects or creates a thread. */
export interface ActiveConversationSelection {
  readonly conversationId: string | null;
  readonly version: number;
}
export async function readActiveConversationSelection(
  user: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<ActiveConversationSelection> {
  const snapshot = await userRoot(db, user).get();
  if (!snapshot.exists) return { conversationId: null, version: 0 };
  const data = snapshot.data()!;
  if (data.owner_uid !== user.uid)
    throw new Error("Private history selection could not be read.");
  return {
    conversationId:
      typeof data.active_conversation_id === "string"
        ? data.active_conversation_id
        : null,
    version: data.selection_version ?? 0,
  };
}
