import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import {
  fakeOperationalContext,
  renewalsRead,
  workRead,
  task,
} from "@/tests/helpers/operational-context-fake";

// S148 against the Firestore emulator through the real store and the real route handlers. Every
// answer stored here is a real S138 answer over fixture records (synthetic values only). The model
// provider and operational context are counted seams: no test here reaches a model or a provider.

const projectId = "pmi-kc-kb-s148-history-test";
const state = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  user: null as unknown as AuthenticatedUser,
  modelProviders: 0,
  interpretCalls: 0,
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => state.user,
}));
vi.mock("@/lib/llm/model-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/model-provider")>()),
  createModelProvider: () => {
    state.modelProviders += 1;
    return { generateText: async () => ({ text: "{}" }) };
  },
}));
vi.mock("@/lib/assistant/interpret", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/interpret")>()),
  interpretWithModel: async () => {
    state.interpretCalls += 1;
    return null;
  },
}));
// The model path is selected (not the local rehearsal's deterministic-only mode), so every model
// seam below is reachable and counted.
vi.mock("@/lib/config/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server")>()),
  readServerConfig: () => ({
    askDemoMode: false,
    modelProvider: "gemini",
    geminiClassifyModel: "test-classify-model",
    localModelName: "test-local-model",
  }),
}));
vi.mock("@/lib/operational-context/server-context", async () => {
  const fake = await import("@/tests/helpers/operational-context-fake");
  return {
    createServerOperationalContext: () =>
      fake.fakeOperationalContext({
        reads: {
          renewals: fake.renewalsRead([
            { id: "L-1", endDateIso: "2026-10-02" },
            { id: "L-2", endDateIso: "2026-10-03" },
          ]),
        },
      }),
  };
});

import { GET as listRoute } from "@/app/api/assistant/history/route";
import { GET as openRoute } from "@/app/api/assistant/history/[conversationId]/route";
import { POST as beginRoute } from "@/app/api/assistant/history/turns/route";
import { PUT as finishRoute } from "@/app/api/assistant/history/turns/[operationId]/route";
import { POST as queryRoute } from "@/app/api/assistant/query/route";
import { resetOperationDedupe } from "@/lib/api/assistant-operation-dedupe";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  listAssistantConversations,
  readAssistantConversation,
  turnIdFor,
} from "@/lib/firestore/assistant-history-read";
import {
  beginAssistantTurn,
  conversationIdFor,
  finalizeAssistantTurn,
} from "@/lib/firestore/assistant-history";

const owner: AuthenticatedUser = {
  uid: "owner-1",
  email: "owner1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const other: AuthenticatedUser = {
  uid: "editor-2",
  email: "editor2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const canary: AuthenticatedUser = {
  uid: "canary-admin",
  email: "canary-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

async function answerFor(
  user: AuthenticatedUser,
  question: string,
): Promise<ConversationAnswer> {
  const context = fakeOperationalContext({
    actorUid: user.uid,
    reads: {
      renewals: renewalsRead([
        { id: "L-1", endDateIso: "2026-10-02" },
        { id: "L-2", endDateIso: "2026-10-03" },
      ]),
      work: workRead([task({ id: "t-1" })]),
    },
  });
  return runAssistantConversation(
    { question, conversation: null },
    {
      nowIso: context.nowIso,
      actorKey: conversationActorKey(user.uid),
      context,
      interpret: null,
    },
  );
}

function completed(
  conversationKey: string,
  question: string,
  answer: ConversationAnswer,
) {
  return {
    conversationKey,
    question,
    state: "completed",
    assistant: answer,
    knowledge: null,
  };
}

function request(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s148-history-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  state.user = owner;
  state.modelProviders = 0;
  state.interpretCalls = 0;
  resetOperationDedupe();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterAll(async () => {
  await testEnv.cleanup();
  await deleteApp(app);
});

describe("S148 durable, owner-scoped history (emulator)", () => {
  it("stores a question and its answer under the owner's own key and reopens it in order", async () => {
    const first = await answerFor(owner, "What leases are due this week?");
    await beginAssistantTurn(
      owner,
      {
        operationId: OP(1),
        conversationKey: OP(1),
        question: "What leases are due this week?",
      },
      db,
    );
    await finalizeAssistantTurn(
      owner,
      OP(1),
      completed(OP(1), "What leases are due this week?", first),
      db,
    );
    const follow = await answerFor(owner, "What work is assigned to me today?");
    await finalizeAssistantTurn(
      owner,
      OP(2),
      completed(OP(1), "What work is assigned to me today?", follow),
      db,
    );

    const conversationId = conversationIdFor(owner.uid, OP(1));
    const stored = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(owner.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
      .doc(conversationId)
      .get();
    expect(stored.data()).toMatchObject({ owner_uid: owner.uid, turn_count: 2 });

    const reopened = await readAssistantConversation(owner, conversationId, db);
    expect(first.groups[0].items.length).toBeGreaterThan(0);
    expect(
      reopened?.turns.map((turn) => [turn.seq, turn.question, turn.displayState]),
    ).toEqual([
      [1, "What leases are due this week?", "completed"],
      [2, "What work is assigned to me today?", "completed"],
    ]);
    // The stored answer is exactly what was shown: same records, links and as-of.
    expect(
      reopened?.turns[0].assistant?.groups[0].items.map((item) => item.href),
    ).toEqual(first.groups[0].items.map((item) => item.href));
    expect(reopened?.turns[0].assistant?.groups[0].asOf).toBe(first.groups[0].asOf);
    expect(reopened?.turns[0].assistant?.execution?.plan).toEqual(first.execution?.plan);
  });

  it("is idempotent per operation: a repeated begin or identical save writes nothing new", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    const input = {
      operationId: OP(3),
      conversationKey: OP(3),
      question: "What leases are due this week?",
    };
    expect((await beginAssistantTurn(owner, input, db)).created).toBe(true);
    expect((await beginAssistantTurn(owner, input, db)).created).toBe(false);
    const save = completed(OP(3), input.question, answer);
    await finalizeAssistantTurn(owner, OP(3), save, db);
    expect((await finalizeAssistantTurn(owner, OP(3), save, db)).created).toBe(false);

    const turns = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(owner.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
      .get();
    expect(turns.size).toBe(1);
    const conversation = await readAssistantConversation(
      owner,
      conversationIdFor(owner.uid, OP(3)),
      db,
    );
    expect(conversation?.conversation.turnCount).toBe(1);
  });

  it("never lets a later failure or interruption overwrite a completed answer", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    await finalizeAssistantTurn(
      owner,
      OP(4),
      completed(OP(4), "What leases?", answer),
      db,
    );
    for (const state of ["failed", "interrupted"] as const) {
      await expect(
        finalizeAssistantTurn(
          owner,
          OP(4),
          {
            conversationKey: OP(4),
            question: "What leases?",
            state,
            assistant: null,
            knowledge: null,
          },
          db,
        ),
      ).rejects.toMatchObject({ status: 409 });
    }
    const reopened = await readAssistantConversation(
      owner,
      conversationIdFor(owner.uid, OP(4)),
      db,
    );
    expect(reopened?.turns[0].displayState).toBe("completed");
    expect(reopened?.turns[0].assistant?.summary).toBe(answer.summary);
  });

  it("lets a failed attempt complete on retry of the same operation", async () => {
    await finalizeAssistantTurn(
      owner,
      OP(5),
      {
        conversationKey: OP(5),
        question: "What leases are due this week?",
        state: "failed",
        assistant: null,
        knowledge: null,
      },
      db,
    );
    const conversationId = conversationIdFor(owner.uid, OP(5));
    expect(
      (await readAssistantConversation(owner, conversationId, db))?.turns[0],
    ).toMatchObject({ displayState: "failed", assistant: null });
    const answer = await answerFor(owner, "What leases are due this week?");
    await finalizeAssistantTurn(
      owner,
      OP(5),
      completed(OP(5), "What leases are due this week?", answer),
      db,
    );
    const reopened = await readAssistantConversation(owner, conversationId, db);
    expect(reopened?.turns).toHaveLength(1);
    expect(reopened?.turns[0].displayState).toBe("completed");
  });

  it("keeps both turns when two sessions append to one conversation at once", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    await finalizeAssistantTurn(owner, OP(6), completed(OP(6), "First?", answer), db);
    await Promise.all([
      finalizeAssistantTurn(owner, OP(7), completed(OP(6), "Session A?", answer), db),
      finalizeAssistantTurn(owner, OP(8), completed(OP(6), "Session B?", answer), db),
    ]);
    const reopened = await readAssistantConversation(
      owner,
      conversationIdFor(owner.uid, OP(6)),
      db,
    );
    expect(reopened?.turns.map((turn) => turn.seq)).toEqual([1, 2, 3]);
    expect(new Set(reopened?.turns.map((turn) => turn.question))).toEqual(
      new Set(["First?", "Session A?", "Session B?"]),
    );
    expect(reopened?.conversation.turnCount).toBe(3);
  });

  it("a late answer for an older turn never replaces a newer turn or the conversation's state", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    await beginAssistantTurn(
      owner,
      { operationId: OP(9), conversationKey: OP(9), question: "Older?" },
      db,
    );
    await finalizeAssistantTurn(owner, OP(10), completed(OP(9), "Newer?", answer), db);
    // The older question's answer arrives late.
    await finalizeAssistantTurn(owner, OP(9), completed(OP(9), "Older?", answer), db);
    const reopened = await readAssistantConversation(
      owner,
      conversationIdFor(owner.uid, OP(9)),
      db,
    );
    expect(reopened?.turns.map((turn) => [turn.seq, turn.question])).toEqual([
      [1, "Older?"],
      [2, "Newer?"],
    ]);
    expect(reopened?.turns.every((turn) => turn.displayState === "completed")).toBe(true);
  });

  it("isolates users: another account, a guessed id or a spoofed operation reveals nothing", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    await finalizeAssistantTurn(owner, OP(11), completed(OP(11), "Private?", answer), db);
    const ownersConversation = conversationIdFor(owner.uid, OP(11));

    expect(await readAssistantConversation(other, ownersConversation, db)).toBeNull();
    expect((await listAssistantConversations(other, {}, db)).conversations).toEqual([]);
    // The same operation id under another user names that user's own turn, never the owner's.
    expect(turnIdFor(other.uid, OP(11))).not.toBe(turnIdFor(owner.uid, OP(11)));
    await finalizeAssistantTurn(
      other,
      OP(11),
      {
        conversationKey: OP(11),
        question: "Spoof?",
        state: "failed",
        assistant: null,
        knowledge: null,
      },
      db,
    );
    const ownerView = await readAssistantConversation(owner, ownersConversation, db);
    expect(ownerView?.turns.map((turn) => turn.question)).toEqual(["Private?"]);

    state.user = other;
    const response = await openRoute(
      request(`/api/assistant/history/${ownersConversation}`, "GET"),
      {
        params: Promise.resolve({ conversationId: ownersConversation }),
      },
    );
    expect(response.status).toBe(404);
    const guessed = await openRoute(request("/api/assistant/history/abc", "GET"), {
      params: Promise.resolve({ conversationId: "f".repeat(32) }),
    });
    expect(guessed.status).toBe(404);
  });

  it("pages through every conversation, newest first, without duplicates", async () => {
    let clock = Date.parse("2026-10-01T15:00:00.000Z");
    const now = () => new Date((clock += 1_000));
    for (let index = 1; index <= 25; index += 1) {
      await beginAssistantTurn(
        owner,
        {
          operationId: OP(100 + index),
          conversationKey: OP(100 + index),
          question: `Q${index}?`,
        },
        db,
        now,
      );
    }
    const first = await listAssistantConversations(owner, {}, db);
    expect(first.conversations).toHaveLength(20);
    expect(first.conversations[0].title).toBe("Q25?");
    expect(first.nextCursor).not.toBeNull();
    const second = await listAssistantConversations(
      owner,
      { cursor: first.nextCursor },
      db,
    );
    expect(second.conversations.map((entry) => entry.title)).toEqual([
      "Q5?",
      "Q4?",
      "Q3?",
      "Q2?",
      "Q1?",
    ]);
    expect(second.nextCursor).toBeNull();
    const all = [...first.conversations, ...second.conversations].map(
      (entry) => entry.conversationId,
    );
    expect(new Set(all).size).toBe(25);
  });

  it("shows an unanswered question as interrupted once its request is long gone, never as answered", async () => {
    const created = new Date("2026-10-01T15:00:00.000Z");
    await beginAssistantTurn(
      owner,
      { operationId: OP(12), conversationKey: OP(12), question: "Interrupted?" },
      db,
      () => created,
    );
    const id = conversationIdFor(owner.uid, OP(12));
    const soon = await readAssistantConversation(
      owner,
      id,
      db,
      new Date(created.getTime() + 30_000),
    );
    expect(soon?.turns[0]).toMatchObject({
      displayState: "in_progress",
      assistant: null,
    });
    const later = await readAssistantConversation(
      owner,
      id,
      db,
      new Date(created.getTime() + 10 * 60_000),
    );
    expect(later?.turns[0]).toMatchObject({
      displayState: "interrupted",
      assistant: null,
    });
  });

  it("refuses a stored link that leaves the application and an oversized answer", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    const hostile = {
      ...answer,
      groups: [
        {
          ...answer.groups[0],
          items: [{ ...answer.groups[0].items[0], href: "javascript:alert(1)" }],
        },
      ],
    };
    await expect(
      finalizeAssistantTurn(owner, OP(13), completed(OP(13), "Hostile?", hostile), db),
    ).rejects.toBeTruthy();
    const offsite = {
      ...answer,
      groups: [{ ...answer.groups[0], link: { label: "x", href: "//evil.example" } }],
    };
    await expect(
      finalizeAssistantTurn(owner, OP(14), completed(OP(14), "Offsite?", offsite), db),
    ).rejects.toBeTruthy();
    const turns = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(owner.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
      .get();
    expect(turns.size).toBe(0);
  });
});

describe("S148 history routes (real handlers, emulator store)", () => {
  it("saves through POST and PUT, lists and reopens through GET, with zero model calls", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    const begin = await beginRoute(
      request("/api/assistant/history/turns", "POST", {
        operationId: OP(20),
        conversationKey: OP(20),
        question: "What leases are due this week?",
      }),
    );
    expect(begin.status).toBe(200);
    const finish = await finishRoute(
      request(
        `/api/assistant/history/turns/${OP(20)}`,
        "PUT",
        completed(OP(20), "What leases are due this week?", answer),
      ),
      { params: Promise.resolve({ operationId: OP(20) }) },
    );
    expect(finish.status).toBe(200);
    // Retrying the save writes nothing new and asks nothing.
    const retry = await finishRoute(
      request(
        `/api/assistant/history/turns/${OP(20)}`,
        "PUT",
        completed(OP(20), "What leases are due this week?", answer),
      ),
      { params: Promise.resolve({ operationId: OP(20) }) },
    );
    expect(await retry.json()).toMatchObject({ created: false, state: "completed" });

    const list = await listRoute(request("/api/assistant/history", "GET"));
    const listed = (await list.json()) as {
      ownerKey: string;
      conversations: { conversationId: string; title: string }[];
    };
    expect(listed.ownerKey).toBe(historyOwnerKey(owner.uid));
    expect(listed.conversations.map((entry) => entry.title)).toEqual([
      "What leases are due this week?",
    ]);
    const opened = await openRoute(
      request(`/api/assistant/history/${listed.conversations[0].conversationId}`, "GET"),
      {
        params: Promise.resolve({
          conversationId: listed.conversations[0].conversationId,
        }),
      },
    );
    const body = (await opened.json()) as {
      turns: { assistant: ConversationAnswer; accessChanged: boolean }[];
    };
    expect(body.turns[0].accessChanged).toBe(false);
    expect(body.turns[0].assistant.groups[0].items.map((item) => item.ref.id)).toEqual(
      answer.groups[0].items.map((item) => item.ref.id),
    );
    expect(state.modelProviders).toBe(0);
    expect(state.interpretCalls).toBe(0);
  });

  // S167: only a lower role narrows access; a staff session carries no Space allowlist. The answer
  // is stored under the Admin role (access basis scopes: null) and reopened by the same account as
  // an Editor.
  it("hides stored records when the viewer's role has narrowed since the answer", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    await finalizeAssistantTurn(owner, OP(21), completed(OP(21), "Leases?", answer), db);
    state.user = { ...owner, role: "Editor" };
    const conversationId = conversationIdFor(owner.uid, OP(21));
    const opened = await openRoute(
      request(`/api/assistant/history/${conversationId}`, "GET"),
      {
        params: Promise.resolve({ conversationId }),
      },
    );
    const body = (await opened.json()) as {
      turns: { assistant: ConversationAnswer; accessChanged: boolean }[];
    };
    expect(answer.groups[0].items.length).toBeGreaterThan(0);
    expect(body.turns[0].accessChanged).toBe(true);
    expect(
      body.turns[0].assistant.groups.every((group) => group.items.length === 0),
    ).toBe(true);
    // Neither the records nor the references kept for follow-ups and reruns are returned.
    expect(JSON.stringify(body)).not.toContain('"L-1"');
    expect(JSON.stringify(body)).not.toContain('"L-2"');
    expect(body.turns[0].assistant.execution?.relatedRefs).toEqual([]);
  });

  it("never persists a verification account's turn", async () => {
    state.user = canary;
    const begin = await beginRoute(
      request("/api/assistant/history/turns", "POST", {
        operationId: OP(22),
        conversationKey: OP(22),
        question: "Canary?",
      }),
    );
    expect(begin.status).toBe(403);
    const finish = await finishRoute(
      request(`/api/assistant/history/turns/${OP(22)}`, "PUT", {
        conversationKey: OP(22),
        question: "Canary?",
        state: "failed",
        assistant: null,
        knowledge: null,
      }),
      { params: Promise.resolve({ operationId: OP(22) }) },
    );
    expect(finish.status).toBe(403);
    const list = (await (
      await listRoute(request("/api/assistant/history", "GET"))
    ).json()) as {
      persisted: boolean;
      conversations: unknown[];
    };
    expect(list).toMatchObject({ persisted: false, conversations: [] });
    const users = await db.collection(ASSISTANT_HISTORY_COLLECTIONS.users).get();
    const everything = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(canary.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
      .get();
    expect(users.size + everything.size).toBe(0);
  });

  it("replays a completed submission through the read-only query route without a model call", async () => {
    const answer = await answerFor(owner, "What leases are due this week?");
    await finalizeAssistantTurn(
      owner,
      OP(23),
      completed(OP(23), "What leases are due this week?", answer),
      db,
    );
    const response = await queryRoute(
      request("/api/assistant/query", "POST", {
        question: "What leases are due this week?",
        conversation: null,
        operationId: OP(23),
      }),
    );
    const replayed = (await response.json()) as ConversationAnswer & {
      replayed?: boolean;
    };
    expect(replayed.replayed).toBe(true);
    expect(replayed.summary).toBe(answer.summary);
    expect(state.modelProviders).toBe(0);
    expect(state.interpretCalls).toBe(0);
  });

  it("asks the model at most once for duplicate deliveries of one new submission", async () => {
    const body = {
      question: "What leases are due this week?",
      conversation: null,
      operationId: OP(24),
    };
    const [first, second] = await Promise.all([
      queryRoute(request("/api/assistant/query", "POST", body)),
      queryRoute(request("/api/assistant/query", "POST", body)),
    ]);
    const answers = (await Promise.all([
      first.json(),
      second.json(),
    ])) as (ConversationAnswer & {
      replayed?: boolean;
    })[];
    expect(answers.map((answer) => answer.summary)).toEqual([
      answers[0].summary,
      answers[0].summary,
    ]);
    expect(answers.filter((answer) => answer.replayed).length).toBe(1);
    expect(state.modelProviders).toBe(1);
    expect(state.interpretCalls).toBe(1);
  });
});
