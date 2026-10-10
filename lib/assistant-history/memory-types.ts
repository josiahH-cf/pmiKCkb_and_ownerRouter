// Data-only contract: historical context is never current source truth or action authority.
import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import type { AnswerExecution } from "@/lib/assistant/conversation";
export interface ConversationMemoryTurn {
  readonly turnId: string;
  readonly seq: number;
  readonly question: string;
  readonly state: string;
  readonly answerTime: string | null;
  readonly meaning: readonly string[];
  readonly lineage: readonly {
    origin: "pmi_history";
    kind: "record" | "knowledge";
    source: string;
    id: string;
  }[];
  readonly execution: AnswerExecution | null;
}
export interface ConversationMemory {
  readonly version: "private-conversation-memory/v1";
  readonly totalTurns: number;
  readonly omittedTurns: number;
  readonly compressedTurns: number;
  readonly turns: readonly ConversationMemoryTurn[];
}
export interface ReadConversationMemory {
  readonly memory: ConversationMemory;
  readonly continuation: ConversationContext | null;
}

export const conversationMemoryNote = (memory: ConversationMemory) =>
  memory.omittedTurns || memory.compressedTurns
    ? "Some earlier context was summarized or omitted. Open history to review the original answers; clarify any decision that depends on missing detail."
    : undefined;
/** Retrieval hints remain historical question text, never new authoritative facts. */
export function conversationRetrievalQuestion(
  question: string,
  memory?: ConversationMemory,
) {
  if (!memory?.turns.length) return question;
  const wanted = new Set(question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const ranked = memory.turns
    .map((t) => ({
      t,
      score:
        [...wanted].filter((w) =>
          `${t.question} ${t.meaning.join(" ")}`.toLowerCase().includes(w),
        ).length *
          10 +
        (t.lineage.some((l) => l.kind === "knowledge") ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.t.seq - a.t.seq);
  return `${question}\nEarlier staff questions (context only): ${ranked
    .slice(0, 3)
    .map((c) => c.t.question)
    .join("; ")}`.slice(0, 2000);
}
