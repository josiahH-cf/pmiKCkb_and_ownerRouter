import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type { AskLogRecord } from "@/lib/firestore/types";
import type { AskRequest, AskResponse } from "@/lib/schemas";

const COLLECTIONS = {
  askLogs: "ask_logs",
} as const;

export interface AskLogWriteInput {
  groundingSourceIds: string[];
  request: AskRequest;
  response: AskResponse;
  user: AuthenticatedUser;
}

export interface AskLogWriter {
  write(input: AskLogWriteInput): Promise<void>;
}

export class FirestoreAskLogWriter implements AskLogWriter {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async write(input: AskLogWriteInput) {
    const id = uuidv7();
    const record: Omit<AskLogRecord, "created_at"> & {
      created_at: FieldValue;
    } = {
      answer: input.response.answer,
      citations: input.response.citations,
      draft: input.response.draft,
      escalation_owner: input.response.escalation_owner,
      grounding_source_ids: input.groundingSourceIds,
      id,
      question: input.request.question,
      space_id: input.request.space,
      source_state: input.response.source_state,
      user_uid: input.user.uid,
      created_at: FieldValue.serverTimestamp(),
    };

    await this.db.collection(COLLECTIONS.askLogs).doc(id).set(stripUndefined(record));
  }
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
