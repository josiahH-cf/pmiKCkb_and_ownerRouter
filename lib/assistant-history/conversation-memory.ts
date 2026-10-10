// S199 server-owned, current-access history assembly. No client supplies answer meaning or lineage.
// Only the existing private PMI history contracts are admitted; provider stores are never queried.
import { conversationActorKey } from "@/lib/assistant/conversation";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assistantAnswerForHistory,
  knowledgeAnswerForHistory,
} from "@/lib/ai-boundary/dotloop-origin";
import {
  StoredAssistantAnswerSchema,
  StoredKnowledgeAnswerSchema,
  projectStoredAssistantAnswer,
  projectStoredKnowledgeAnswer,
  accessNarrowedSince,
} from "./stored-answer";
import {
  conversationIdFor,
  readAssistantConversation,
  type StoredTurnView,
} from "@/lib/firestore/assistant-history-read";
import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import type {
  ConversationMemory,
  ConversationMemoryTurn,
  ReadConversationMemory,
} from "./memory-types";
export const MAX_CONVERSATION_MEMORY_BYTES = 64_000;
export class ConversationMemoryUnavailable extends Error {
  constructor() {
    super(
      "Earlier conversation context could not be read. Retry this question or explicitly choose a new conversation.",
    );
    this.name = "ConversationMemoryUnavailable";
  }
}
const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const STOP = new Set([
  "what",
  "that",
  "this",
  "with",
  "from",
  "have",
  "they",
  "were",
  "your",
  "about",
  "which",
  "those",
  "please",
  "does",
  "would",
  "should",
  "could",
  "question",
  "answer",
]);
function relevance(text: string, wanted: Set<string>) {
  return [...words(text)].reduce(
    (score, w) => score + (wanted.has(w) && !STOP.has(w) ? 1 : 0),
    0,
  );
}
function decision(question: string) {
  return /\b(correct(?:ion|ed)?|actually|instead|i meant|we agreed|remember|use|keep|change|decided)\b/i.test(
    question,
  );
}
const knowledgeKeys = new Set([
  "question",
  "source_state",
  "answer",
  "handling_steps",
  "citations",
  "draft",
  "escalation_owner",
  "answered_by",
  "context_note",
  "evidence_context",
]);
/** Pure assembly for deterministic evidence. Readback already verifies the thread owner. */
export function assembleConversationMemory(
  user: AuthenticatedUser,
  turns: readonly StoredTurnView[],
  question: string,
  excludeOperationId?: string,
): ReadConversationMemory {
  const wanted = words(question),
    candidates: Array<{
      turn: ConversationMemoryTurn;
      score: number;
      mandatory: boolean;
      compressed: boolean;
    }> = [];
  let continuation: ConversationContext | null = null;
  const original = turns.filter((t) => t.operationId !== excludeOperationId);
  for (const [index, t] of original.entries()) {
    const lineage: ConversationMemoryTurn["lineage"][number][] = [];
    let meaning: string[] = [],
      execution: ConversationMemoryTurn["execution"] = null;
    if (t.displayState === "completed" && !accessNarrowedSince(t.accessBasis, user)) {
      const parsed = StoredAssistantAnswerSchema.safeParse(t.assistant);
      if (parsed.success) {
        const a = assistantAnswerForHistory(
          projectStoredAssistantAnswer(parsed.data, t.accessBasis, user),
        ).value!;
        if (a.conversation.actorKey === conversationActorKey(user.uid))
          continuation = a.conversation;
        meaning.push(
          a.summary,
          ...a.interpretation,
          ...a.groups.flatMap((g) => [
            g.summary,
            ...g.notes,
            ...g.items.flatMap((i) => [
              i.title,
              i.detail,
              ...i.blockers,
              ...(i.facts ?? []),
            ]),
          ]),
        );
        lineage.push(
          ...a.groups.flatMap((g) =>
            g.items.map((i) => ({
              origin: "pmi_history" as const,
              kind: "record" as const,
              source: i.ref.source,
              id: i.ref.id,
            })),
          ),
        );
        execution = a.execution
          ? { ...a.execution, relatedRefs: a.execution.relatedRefs.slice(0, 25) }
          : null;
      }
      const known =
        t.knowledge && Object.keys(t.knowledge).every((k) => knowledgeKeys.has(k));
      const parsedKnowledge = known
        ? StoredKnowledgeAnswerSchema.safeParse(t.knowledge)
        : null;
      if (parsedKnowledge?.success) {
        const projected = projectStoredKnowledgeAnswer(
          parsedKnowledge.data,
          t.accessBasis,
          user,
        );
        const a = knowledgeAnswerForHistory(projected).value;
        if (a) {
          meaning.push(
            `Historical source state: ${a.source_state}`,
            a.answer,
            ...a.handling_steps,
            ...(a.evidence_context
              ? [
                  `Original answer time: ${a.evidence_context.answered_at}`,
                  `Certainty: ${a.evidence_context.mode}`,
                  ...a.evidence_context.coverage,
                ]
              : []),
          );
          lineage.push(
            ...a.citations.map((c) => ({
              origin: "pmi_history" as const,
              kind: "knowledge" as const,
              source: c.source_id,
              id: c.url,
            })),
          );
        }
      }
      if (!parsed.success && !parsedKnowledge?.success)
        meaning = [
          "Earlier answer meaning is excluded because its provenance contract is unavailable.",
        ];
    } else if (t.displayState === "completed")
      meaning = ["Earlier answer details are withheld because current access changed."];
    let compressed = false;
    meaning = meaning.flatMap((part) => {
      if (part.length <= 2000) return [part];
      compressed = true;
      return Array.from({ length: Math.ceil(part.length / 2000) }, (_, n) =>
        part.slice(n * 2000, (n + 1) * 2000),
      );
    });
    // Keep question/correction, answer conclusion and executed filters. Select supporting details
    // by this question's terms rather than taking the last few questions or the first few rows.
    if (meaning.join("\n").length > 6500) {
      const ranked = meaning
        .slice(1)
        .map((text, n) => ({ text, n, score: relevance(text, wanted) }))
        .sort((a, b) => b.score - a.score || a.n - b.n);
      let used = meaning[0].length;
      const kept = [meaning[0]];
      for (const item of ranked) {
        if (used + item.text.length > 6500) continue;
        kept.push(item.text);
        used += item.text.length;
      }
      meaning = kept;
      compressed = true;
    }
    const turn: ConversationMemoryTurn = {
      turnId: t.turnId,
      seq: t.seq,
      question: t.question,
      state: t.displayState,
      answerTime: t.answeredAtIso,
      meaning,
      lineage: lineage.slice(0, 25),
      execution,
    };
    if (lineage.length > 25) compressed = true;
    const mandatory = decision(t.question);
    candidates.push({
      turn,
      score:
        (mandatory ? 1000 : 0) +
        (index >= original.length - 6 ? 300 : 0) +
        relevance(t.question, wanted) * 20 +
        relevance(meaning.join(" "), wanted) * 5 +
        (index === 0 ? 100 : 0),
      mandatory,
      compressed,
    });
  }
  const selected: typeof candidates = [];
  let used = 1024;
  for (const candidate of [...candidates].sort(
    (a, b) => b.score - a.score || b.turn.seq - a.turn.seq,
  )) {
    const bytes = Buffer.byteLength(JSON.stringify(candidate.turn), "utf8");
    if (used + bytes > MAX_CONVERSATION_MEMORY_BYTES) {
      // A correction never disappears silently. Preserve its exact question and provenance; the
      // historical supporting answer is explicitly compressed and cannot supply current facts.
      if (candidate.mandatory) {
        const brief = {
          ...candidate,
          compressed: true,
          turn: {
            ...candidate.turn,
            meaning: ["Supporting historical answer omitted to keep context bounded."],
            execution: null,
            lineage: [],
          },
        };
        const size = Buffer.byteLength(JSON.stringify(brief.turn), "utf8");
        if (used + size > MAX_CONVERSATION_MEMORY_BYTES)
          throw new ConversationMemoryUnavailable();
        selected.push(brief);
        used += size;
      }
      continue;
    }
    selected.push(candidate);
    used += bytes;
  }
  const memory: ConversationMemory = {
    version: "private-conversation-memory/v1",
    totalTurns: original.length,
    omittedTurns: candidates.length - selected.length,
    compressedTurns: selected.filter((c) => c.compressed).length,
    turns: selected.sort((a, b) => a.turn.seq - b.turn.seq).map((c) => c.turn),
  };
  if (Buffer.byteLength(JSON.stringify(memory), "utf8") > MAX_CONVERSATION_MEMORY_BYTES)
    throw new ConversationMemoryUnavailable();
  return { memory, continuation };
}
export async function readConversationMemory(
  user: AuthenticatedUser,
  key: string,
  question: string,
  operationId?: string,
): Promise<ReadConversationMemory> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(key)) throw new ConversationMemoryUnavailable();
  try {
    const found = await readAssistantConversation(user, conversationIdFor(user.uid, key));
    if (!found) {
      if (key === operationId)
        return assembleConversationMemory(user, [], question, operationId);
      throw new ConversationMemoryUnavailable();
    }
    return assembleConversationMemory(user, found.turns, question, operationId);
  } catch {
    throw new ConversationMemoryUnavailable();
  }
}
