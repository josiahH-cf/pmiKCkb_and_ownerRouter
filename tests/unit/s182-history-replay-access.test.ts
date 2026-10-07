// S182 / S148 (fail-first): every path that returns a stored answer applies the viewer's current
// access the same way reopening a conversation does. A duplicate delivery replayed by the query
// route and a completed run replayed by the saved-question Run route used to return the stored
// answer as it was produced, so a person whose role narrowed could read records through a replay
// that the history view hides. Both replays are reads; nothing is re-run or re-read.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AccessBasis,
  StoredAssistantAnswer,
} from "@/lib/assistant-history/stored-answer";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { StoredTurnRecord } from "@/lib/firestore/assistant-history-read";
import type { SavedQuestionRecord } from "@/lib/firestore/assistant-saved-questions";

const state = vi.hoisted(() => ({
  user: null as unknown as AuthenticatedUser,
  replay: null as unknown,
  turn: null as unknown,
  saved: null as unknown,
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => state.user,
}));
vi.mock("@/lib/firestore/assistant-history-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/assistant-history-read")>()),
  readCompletedTurnAnswer: async () => state.replay,
  readTurnByOperation: async () => state.turn,
}));
vi.mock("@/lib/firestore/assistant-saved-questions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/assistant-saved-questions")>()),
  readSavedQuestion: async () => state.saved,
}));
vi.mock("@/lib/firestore/assistant-history", () => ({
  recordRerunTurn: async () => {
    throw new Error("A replay never records a new run.");
  },
}));
vi.mock("@/lib/config/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server")>()),
  readServerConfig: () => ({
    askDemoMode: true,
    modelProvider: "gemini",
    geminiClassifyModel: "test-classify-model",
    localModelName: "test-local-model",
  }),
}));
vi.mock("@/lib/operational-context/server-context", async () => {
  const fake = await import("@/tests/helpers/operational-context-fake");
  return { createServerOperationalContext: () => fake.fakeOperationalContext() };
});

import { POST as queryRoute } from "@/app/api/assistant/query/route";
import { POST as runRoute } from "@/app/api/assistant/saved/[savedId]/run/route";
import { resetOperationDedupe } from "@/lib/api/assistant-operation-dedupe";
import { StoredAssistantAnswerSchema } from "@/lib/assistant-history/stored-answer";
import {
  conversationActorKey,
  runAssistantConversation,
} from "@/lib/assistant/conversation";
import {
  fakeOperationalContext,
  renewalsRead,
  TEST_NOW,
} from "@/tests/helpers/operational-context-fake";

const formerAdmin: AuthenticatedUser = {
  uid: "person-1",
  email: "person-1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const ADMIN_BASIS: AccessBasis = { role: "Admin", scopes: null };
const QUESTION = "What leases are due this week?";
const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SAVED_ID = "a".repeat(32);

/** An answer the person received while they were an Admin. */
async function adminAnswer(): Promise<StoredAssistantAnswer> {
  const context = fakeOperationalContext({
    actorUid: formerAdmin.uid,
    reads: {
      renewals: renewalsRead([
        { id: "L-1", endDateIso: "2026-10-02" },
        { id: "L-2", endDateIso: "2026-10-03" },
      ]),
    },
  });
  return StoredAssistantAnswerSchema.parse(
    await runAssistantConversation(
      { question: QUESTION, conversation: null },
      {
        nowIso: context.nowIso,
        actorKey: conversationActorKey(formerAdmin.uid),
        context,
        interpret: null,
      },
    ),
  );
}

function expectRecordsHidden(answer: StoredAssistantAnswer) {
  expect(answer.groups.length).toBeGreaterThan(0);
  for (const group of answer.groups) {
    expect(group.items).toEqual([]);
    expect(group.hiddenForAccess).toBe(true);
  }
  expect(JSON.stringify(answer)).not.toContain("L-1");
}

beforeEach(() => {
  state.user = formerAdmin;
  state.replay = null;
  state.turn = null;
  state.saved = null;
  resetOperationDedupe();
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("S182 history replays apply the viewer's current access", () => {
  it("the query route replays a duplicate delivery with the narrowed view", async () => {
    const answer = await adminAnswer();
    state.replay = { question: QUESTION, answer, accessBasis: ADMIN_BASIS };
    const response = await queryRoute(
      new Request("http://localhost/api/assistant/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: QUESTION,
          conversation: null,
          operationId: OP(1),
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as StoredAssistantAnswer & { replayed: boolean };
    expect(body.replayed).toBe(true);
    expectRecordsHidden(body);
  });

  it("the Run route replays a completed run with the narrowed view", async () => {
    const answer = await adminAnswer();
    const saved: SavedQuestionRecord = {
      owner_uid: formerAdmin.uid,
      saved_id: SAVED_ID,
      turn_id: "b".repeat(32),
      operation_id: OP(2),
      conversation_id: "c".repeat(32),
      conversation_key: OP(2),
      question: QUESTION,
      label: QUESTION,
      plan: answer.execution!.plan,
      related_refs: [],
      detail_ref: null,
      original_range: null,
      context_before: null,
      pinned: false,
      pinned_at: null,
      record_version: 1,
      created_at: TEST_NOW,
      updated_at: TEST_NOW,
      last_turn_id: "d".repeat(32),
      last_operation_id: OP(3),
      last_answered_at: TEST_NOW,
      access_basis: ADMIN_BASIS,
    };
    const turn: StoredTurnRecord = {
      owner_uid: formerAdmin.uid,
      turn_id: "d".repeat(32),
      operation_id: OP(3),
      conversation_id: "c".repeat(32),
      seq: 2,
      state: "completed",
      question: QUESTION,
      assistant: answer,
      knowledge: null,
      answered_at: TEST_NOW,
      created_at: TEST_NOW,
      updated_at: TEST_NOW,
      access_basis: ADMIN_BASIS,
      rerun_of: SAVED_ID,
    };
    state.saved = saved;
    state.turn = turn;
    const response = await runRoute(
      new Request(`http://localhost/api/assistant/saved/${SAVED_ID}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: OP(3) }),
      }),
      { params: Promise.resolve({ savedId: SAVED_ID }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      replayed: boolean;
      turn: { assistant: StoredAssistantAnswer; accessChanged: boolean };
    };
    expect(body.replayed).toBe(true);
    expect(body.turn.accessChanged).toBe(true);
    expectRecordsHidden(body.turn.assistant);
  });
});
