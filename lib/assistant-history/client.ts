// S148 browser helpers for the owner-scoped history routes. Each helper returns a typed outcome
// instead of throwing, so a failed history read or write is shown as exactly that and never as an
// empty history or a saved answer. Every response names its owner key; a response for another
// sign-in (a stale tab after an account change) is discarded by the caller.

import type { ConversationAnswer } from "@/lib/assistant/conversation";
import type { AskResponse } from "@/lib/schemas";

export interface HistoryConversationSummary {
  readonly conversationId: string;
  readonly conversationKey: string;
  readonly title: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly turnCount: number;
  readonly lastState: "submitted" | "completed" | "failed" | "interrupted";
}

export interface HistoryPage {
  readonly ownerKey: string;
  readonly persisted: boolean;
  readonly conversations: readonly HistoryConversationSummary[];
  readonly nextCursor: string | null;
}

export type HistoryPageOutcome =
  | { readonly status: "ok"; readonly page: HistoryPage }
  | { readonly status: "failed" };

export interface RestoredTurn {
  readonly turnId: string;
  readonly operationId: string;
  readonly seq: number;
  readonly question: string;
  readonly displayState: "completed" | "failed" | "interrupted" | "in_progress";
  readonly assistant: ConversationAnswer | null;
  readonly knowledge: AskResponse | null;
  readonly answeredAtIso: string | null;
  readonly createdAtIso: string;
  readonly accessChanged: boolean;
  readonly rerunOf: string | null;
}

export interface RestoredConversation {
  readonly ownerKey: string;
  readonly conversation: HistoryConversationSummary;
  readonly turns: readonly RestoredTurn[];
}

export type TurnSaveOutcome =
  | { readonly status: "saved"; readonly conversationId: string }
  | { readonly status: "failed" };

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchHistoryPage(
  cursor: string | null,
): Promise<HistoryPageOutcome> {
  try {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`/api/assistant/history${query}`, { cache: "no-store" });
    if (!response.ok) return { status: "failed" };
    const page = await readJson<HistoryPage>(response);
    return page ? { status: "ok", page } : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}

export async function fetchConversation(
  conversationId: string,
): Promise<RestoredConversation | null> {
  try {
    const response = await fetch(
      `/api/assistant/history/${encodeURIComponent(conversationId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return await readJson<RestoredConversation>(response);
  } catch {
    return null;
  }
}

/** Record the submitted question. Best effort: the finishing save records it if this one fails. */
export async function beginHistoryTurn(input: {
  operationId: string;
  conversationKey: string;
  question: string;
}): Promise<boolean> {
  try {
    const response = await fetch("/api/assistant/history/turns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface FinishTurnPayload {
  readonly conversationKey: string;
  readonly question: string;
  readonly state: "completed" | "failed" | "interrupted";
  readonly assistant: ConversationAnswer | null;
  readonly knowledge: AskResponse | null;
}

/** Save what was shown for one operation. Safe to retry: it never asks the model again. */
export async function finishHistoryTurn(
  operationId: string,
  payload: FinishTurnPayload,
): Promise<TurnSaveOutcome> {
  try {
    const response = await fetch(
      `/api/assistant/history/turns/${encodeURIComponent(operationId)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          // Only what was shown is stored: a replay marker is not part of the answer.
          assistant: payload.assistant ? withoutReplayMarker(payload.assistant) : null,
        }),
      },
    );
    if (!response.ok) return { status: "failed" };
    const body = await readJson<{ conversationId: string }>(response);
    return body
      ? { status: "saved", conversationId: body.conversationId }
      : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}

function withoutReplayMarker(answer: ConversationAnswer): ConversationAnswer {
  const copy = { ...answer } as ConversationAnswer & { replayed?: boolean };
  delete copy.replayed;
  return copy;
}
