import {
  assembleConversationMemory,
  MAX_CONVERSATION_MEMORY_BYTES,
} from "@/lib/assistant-history/conversation-memory";
import {
  conversationMemoryNote,
  conversationRetrievalQuestion,
} from "@/lib/assistant-history/memory-types";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { StoredTurnView } from "@/lib/firestore/assistant-history-read";
import { describe, it, expect } from "vitest";
import {
  interpretWithModel,
  type ModelInterpreterOptions,
} from "@/lib/assistant/interpret";
describe("S199 answer-dependent interpretation", () => {
  it("passes permitted older answer meaning and its contradictory correction rather than only the last three questions", async () => {
    let payload = "";
    const memory = {
      version: "private-conversation-memory/v1",
      totalTurns: 12,
      omittedTurns: 0,
      compressedTurns: 0,
      turns: [
        {
          turnId: "old-answer",
          seq: 1,
          question: "Explain the MKD policy",
          state: "completed",
          answerTime: "2026-10-01T00:00:00Z",
          meaning: ["The earlier answer suggested 4%."],
          lineage: [],
          execution: null,
        },
        {
          turnId: "correction",
          seq: 3,
          question:
            "Correction: use 3.5%, subject to real membership and agreement evidence.",
          state: "completed",
          answerTime: "2026-10-02T00:00:00Z",
          meaning: [
            "Use the corrected percentage; membership and authority remain unverified.",
          ],
          lineage: [],
          execution: null,
        },
      ],
    };
    await interpretWithModel(
      "Why did you recommend that percentage?",
      [],
      "2026-10-09T15:00:00Z",
      {
        model: "deterministic-provider-fixture",
        provider: {
          generateText: async (input: { userContent: string }) => {
            payload = input.userContent;
            return { text: "{}" };
          },
        },
        memory,
      } as unknown as ModelInterpreterOptions,
    );
    expect(payload).toContain("The earlier answer suggested 4%.");
    expect(payload).toContain("Correction: use 3.5%");
    expect(payload).toContain("membership and authority remain unverified");
  });
});
const staff: AuthenticatedUser = {
  uid: "memory-editor",
  email: "memory-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
function turn(
  seq: number,
  question: string,
  answer: string,
  overrides: Partial<StoredTurnView> = {},
): StoredTurnView {
  return {
    turnId: `turn-${seq}`,
    operationId: `operation-${seq}`,
    seq,
    question,
    displayState: "completed",
    assistant: null,
    knowledge: {
      question,
      source_state: "Verified Source",
      answer,
      handling_steps: [],
      citations: [
        {
          source_id: `approved-policy-${seq}`,
          title: "Independently approved PMI policy",
          url: "https://example.invalid/policy",
        },
      ],
      draft: "",
    },
    answeredAtIso: "2026-10-01T15:00:00Z",
    createdAtIso: "2026-10-01T15:00:00Z",
    accessBasis: { role: "Editor", scopes: null },
    rerunOf: null,
    ...overrides,
  };
}
describe("S199 actual bounded history assembly", () => {
  it("retains older answer meaning, correction, lineage and dates across unrelated turns", () => {
    const turns = [
      turn(1, "Explain MKD pricing", "Earlier suggestion: 4%, not standing authority."),
      turn(
        2,
        "Correction: intended MKD percentage is 3.5%",
        "Membership and agreement evidence remain required.",
      ),
      ...Array.from({ length: 12 }, (_, n) =>
        turn(n + 3, `Unrelated maintenance question ${n}`, "Separate repair discussion."),
      ),
    ];
    const { memory } = assembleConversationMemory(
      staff,
      turns,
      "Why that MKD percentage?",
    );
    const content = JSON.stringify(memory);
    expect(content).toContain("Earlier suggestion: 4%");
    expect(content).toContain("3.5%");
    expect(content).toContain("Membership and agreement evidence remain required");
    expect(memory.turns[0]).toMatchObject({
      answerTime: "2026-10-01T15:00:00Z",
      lineage: [
        { origin: "pmi_history", kind: "knowledge", source: "approved-policy-1" },
      ],
    });
    expect(memory.turns.map((t) => t.seq)).toEqual(
      [...memory.turns.map((t) => t.seq)].sort((a, b) => a - b),
    );
    expect(conversationRetrievalQuestion("Why that MKD percentage?", memory)).toContain(
      "MKD",
    );
  });
  it("excludes unknown answer provenance, Dotloop API markers and newly inaccessible details while retaining independent PMI facts", () => {
    const api = turn(1, "Provider data", "API_ORIGIN_SENTINEL");
    (api.knowledge as unknown as Record<string, unknown>).providerOrigin = "dotloop_api";
    const privateAnswer = turn(2, "Prior protected answer", "ROLE_PROTECTED_SENTINEL", {
      accessBasis: { role: "Admin", scopes: null },
    });
    const pmi = turn(
      3,
      "Independent rent facts",
      "PMI_INDEPENDENT_RENT 1000; API address https://api-gateway.dotloop.com/public/v2/loop/API_URL_SENTINEL",
    );
    pmi.knowledge!.citations.push({
      source_id: "dotloop-marker",
      title: "Provider object",
      url: "https://www.dotloop.com/my/loop/API_CITATION_SENTINEL",
    });
    const { memory, continuation } = assembleConversationMemory(
      staff,
      [api, privateAnswer, pmi],
      "What rent fact remains?",
    );
    const content = JSON.stringify(memory);
    expect(content).not.toMatch(
      /API_ORIGIN_SENTINEL|ROLE_PROTECTED_SENTINEL|API_URL_SENTINEL|API_CITATION_SENTINEL/,
    );
    expect(content).toContain("PMI_INDEPENDENT_RENT 1000");
    expect(content).toContain("provenance contract is unavailable");
    expect(continuation).toBeNull();
  });
  it("bounds larger history while preserving exact explicit corrections and acknowledging compression", () => {
    const turns = Array.from({ length: 100 }, (_, n) =>
      turn(
        n + 1,
        `Earlier topic ${n}`,
        `Historic discussion ${n}: ${"Supporting detail. ".repeat(500)}`,
      ),
    );
    turns[0] = turn(
      1,
      "Correction: keep the agreed 3.5% subject to verified membership",
      "Earlier agreement is not proof of current membership.",
    );
    const { memory } = assembleConversationMemory(staff, turns, "What did we settle on?");
    expect(Buffer.byteLength(JSON.stringify(memory), "utf8")).toBeLessThanOrEqual(
      MAX_CONVERSATION_MEMORY_BYTES,
    );
    expect(JSON.stringify(memory)).toContain(
      "Correction: keep the agreed 3.5% subject to verified membership",
    );
    expect(memory.compressedTurns + memory.omittedTurns).toBeGreaterThan(0);
    expect(conversationMemoryNote(memory)).toContain("review the original answers");
  });
  it("does not turn failed, pending or this operation's unsaved answers into accepted prior meaning", () => {
    const { memory } = assembleConversationMemory(
      staff,
      [
        turn(1, "Pending", "UNACCEPTED_PENDING", { displayState: "in_progress" }),
        turn(2, "Failed", "UNACCEPTED_FAILED", { displayState: "failed" }),
        turn(3, "Current", "CURRENT_OPERATION"),
      ],
      "Current",
      "operation-3",
    );
    expect(JSON.stringify(memory)).not.toMatch(
      /UNACCEPTED_PENDING|UNACCEPTED_FAILED|CURRENT_OPERATION/,
    );
    expect(memory.turns.map((t) => t.state)).toEqual(["in_progress", "failed"]);
  });
});
