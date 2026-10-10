// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { answerQuestion } from "@/lib/ask/service";
import { readServerConfig } from "@/lib/config/server";
import type { GeneratedAnswer, AnswerGenerationRequest } from "@/lib/llm/answer";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { TurnView } from "@/components/ask/DashboardTurnView";
import { knowledgeAnswerForHistory } from "@/lib/ai-boundary/dotloop-origin";
import { StoredKnowledgeAnswerSchema } from "@/lib/assistant-history/stored-answer";
const user: AuthenticatedUser = {
  uid: "best-effort-editor",
  email: "best-effort-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const config = () => ({
  ...readServerConfig(),
  askDemoMode: false,
  environment: {
    environmentKind: "demo" as const,
    dataContext: "demo" as const,
    source: "explicit" as const,
  },
});
const empty = { sources: [], sourceIds: [], citations: [] };
const suggestion = {
  kind: "recommendation",
  text: "Group the current work by urgency, then assign one responsible staff member per unresolved item.",
  source_ids: [],
  history_seq: null,
};
async function ask(claims: unknown[], grounding = empty) {
  const generate = vi.fn(
    async (_r: AnswerGenerationRequest) =>
      ({
        answer: "Unlabeled free text must not replace structured statements.",
        citations: [],
        draft: "",
        handling_steps: [],
        source_state: "No Reliable Source Found",
        claims,
      }) as unknown as GeneratedAnswer,
  );
  const response = await answerQuestion(
    user,
    { question: "How could we organize a busy morning?", draft_enabled: false },
    {
      config: config(),
      answerGenerator: { generateAnswer: generate },
      retrievalClient: { search: async () => grounding },
      askLogWriter: { write: async () => {} },
    },
  );
  return { response, generate };
}
afterEach(cleanup);
it("answers useful open discussion with labeled general recommendations when PMI retrieval has no sources", async () => {
  const { response, generate } = await ask([
    suggestion,
    {
      kind: "unknown",
      text: "Current assignments were not read for this answer.",
      source_ids: [],
      history_seq: null,
    },
  ]);
  expect(generate).toHaveBeenCalledOnce();
  expect(response.answer).toContain(suggestion.text);
  expect(response.source_state).toBe("No Reliable Source Found");
  expect(response).toMatchObject({
    evidence_context: {
      mode: "guidance",
      claims: [suggestion, expect.objectContaining({ kind: "unknown" })],
      coverage: expect.arrayContaining([expect.stringContaining("No current PMI")]),
    },
  });
  expect(response.citations).toEqual([]);
  expect(response.draft).toBe("");
});
it("refuses an invented provider fact or historical reference instead of laundering it as sourced evidence", async () => {
  const { response } = await ask([
    {
      kind: "source_fact",
      text: "Vendoroo supports a made-up write endpoint.",
      source_ids: ["fabricated-provider-contract"],
      history_seq: null,
    },
  ]);
  expect(response.answer).not.toContain("made-up");
  const missingHistory = await ask([
    {
      kind: "historical",
      text: "The owner already approved all sends.",
      source_ids: [],
      history_seq: 999,
    },
  ]);
  expect(missingHistory.response.answer).not.toContain("already approved");
});
it("keeps certainty and the original answer time through strict history and rendered reopening", async () => {
  const { response } = await ask([suggestion]);
  const stored = StoredKnowledgeAnswerSchema.parse(response);
  expect(stored).toHaveProperty("evidence_context.answered_at");
  const filtered = knowledgeAnswerForHistory(stored).value!;
  render(
    <TurnView
      index={0}
      onRetry={() => {}}
      onRetrySave={() => {}}
      registerRef={() => {}}
      turn={
        {
          id: "s202-turn",
          question: response.question,
          state: "answered",
          assistant: null,
          knowledge: filtered,
          knowledgeError: null,
          assistantUnavailable: false,
          error: null,
          createdAtIso: "2026-10-09T15:00:00Z",
        } as never
      }
    />,
  );
  expect(screen.getByText("Recommendation", { exact: true })).toBeVisible();
  expect(screen.getByText(/Answer time:/)).toBeVisible();
  expect(screen.getByText(suggestion.text, { exact: true })).toBeVisible();
});

it("source retrieval outages preserve useful labeled discussion without current fact or invented citation", async () => {
  const generate = vi.fn(
    async () =>
      ({
        answer: "",
        citations: [],
        draft: "",
        handling_steps: [],
        source_state: "No Reliable Source Found",
        claims: [suggestion],
      }) as GeneratedAnswer,
  );
  const response = await answerQuestion(
    user,
    { question: "How could we organize this work?", draft_enabled: false },
    {
      config: config(),
      retrievalClient: {
        search: async () => {
          throw Error("Fixture source outage; private provider body must not leak");
        },
      },
      answerGenerator: { generateAnswer: generate },
      askLogWriter: { write: async () => {} },
    },
  );
  expect(response.answer).toContain("Recommendation:");
  expect(response.citations).toEqual([]);
  expect(response.evidence_context?.coverage.join(" ")).toContain(
    "retrieval is unavailable",
  );
  expect(JSON.stringify(response)).not.toContain("private provider body");
  expect(generate).toHaveBeenCalledOnce();
});
it("a simultaneous source/model outage returns an honest recoverable unknown with no manufactured policy or provider action", async () => {
  const response = await answerQuestion(
    user,
    { question: "What should I do next?", draft_enabled: true },
    {
      config: config(),
      retrievalClient: {
        search: async () => {
          throw Error("Fixture retrieval outage");
        },
      },
      answerGenerator: {
        generateAnswer: async () => {
          throw Error("Fixture model outage");
        },
      },
      askLogWriter: { write: async () => {} },
    },
  );
  expect(response.answer).toContain("Unknown:");
  expect(response.evidence_context?.mode).toBe("guidance");
  expect(response.citations).toEqual([]);
  expect(response.draft).toBe("");
  expect(response.evidence_context?.claims.every((c) => c.kind !== "source_fact")).toBe(
    true,
  );
});

it("a model-only outage preserves an honest answer and source coverage without laundering retrieved metadata into a fact", async () => {
  const write = vi.fn(async () => {}),
    citation = {
      source_id: "actual-fixture-source",
      title: "Reviewed fixture policy",
      url: "https://example.invalid/policy",
    };
  const response = await answerQuestion(
    user,
    { question: "What is the current policy?", draft_enabled: true },
    {
      config: config(),
      retrievalClient: {
        search: async () => ({
          sources: [
            {
              sourceId: citation.source_id,
              driveFileId: "fixture-file",
              spaceId: "maintenance",
              approvalStatus: "Approved",
              citation,
            },
          ],
          sourceIds: [citation.source_id],
          citations: [citation],
          confidence: 1,
        }),
      },
      answerGenerator: {
        generateAnswer: async () => {
          throw Error("PRIVATE_MODEL_ERROR_SENTINEL");
        },
      },
      askLogWriter: { write },
    },
  );
  expect(response.answer).toContain("Unknown:");
  expect(response.answer).toContain("Recommendation:");
  expect(response.evidence_context?.coverage.join(" ")).toContain(
    "Source retrieval completed",
  );
  expect(response.citations).toEqual([]);
  expect(response.draft).toBe("");
  expect(response.source_state).not.toBe("Verified Source");
  expect(JSON.stringify(response)).not.toContain("PRIVATE_MODEL_ERROR_SENTINEL");
  expect(write).toHaveBeenCalledOnce();
});
it("an audit failure remains a service failure and cannot be silently relabeled as model guidance", async () => {
  const write = vi.fn(async () => {
    throw Error("Fixture audit write failed");
  });
  await expect(
    answerQuestion(
      user,
      { question: "Discuss this work", draft_enabled: false },
      {
        config: config(),
        retrievalClient: { search: async () => empty },
        answerGenerator: {
          generateAnswer: async () =>
            ({
              answer: "",
              draft: "",
              citations: [],
              handling_steps: [],
              source_state: "No Reliable Source Found",
              claims: [suggestion],
            }) as GeneratedAnswer,
        },
        askLogWriter: { write },
      },
    ),
  ).rejects.toThrow("Fixture audit write failed");
  expect(write).toHaveBeenCalledOnce();
});
