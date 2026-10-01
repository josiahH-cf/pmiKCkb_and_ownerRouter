import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import type { TypedSourceRead } from "@/lib/operational-context/types";
import {
  fakeOperationalContext,
  renewalsRead,
  task,
  workRead,
} from "@/tests/helpers/operational-context-fake";

// S149/S150 against the Firestore emulator through the real store and route handlers. Answers are
// real S138 answers over synthetic fixtures. The model provider, the interpreter and the server
// operational context are counted seams; the clock is controlled so a month rollover is real.

const projectId = "pmi-kc-kb-s149-saved-test";
const LEASES = [
  { id: "L-SEP", endDateIso: "2026-09-25" },
  { id: "L-OCT-A", endDateIso: "2026-10-05" },
  { id: "L-OCT-B", endDateIso: "2026-10-28" },
  { id: "L-NOV", endDateIso: "2026-11-12" },
];

const state = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  user: null as unknown as AuthenticatedUser,
  modelProviders: 0,
  interpretCalls: 0,
  contexts: 0,
  renewals: null as unknown,
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
    createServerOperationalContext: (user: AuthenticatedUser, now: Date) => {
      state.contexts += 1;
      return fake.fakeOperationalContext({
        actorUid: user.uid,
        nowIso: now.toISOString(),
        reads: {
          renewals:
            (state.renewals as TypedSourceRead<"renewals">) ?? fake.renewalsRead(LEASES),
          work: fake.workRead([
            fake.task({ id: "t-mine", assignee_uid: user.uid }),
            fake.task({ id: "t-other", assignee_uid: "uid-other" }),
          ]),
        },
      });
    },
  };
});

import {
  GET as listSavedRoute,
  POST as saveRoute,
} from "@/app/api/assistant/saved/route";
import { PATCH as patchRoute } from "@/app/api/assistant/saved/[savedId]/route";
import { POST as runRoute } from "@/app/api/assistant/saved/[savedId]/run/route";
import { GET as openRoute } from "@/app/api/assistant/history/[conversationId]/route";
import { POST as queryRoute } from "@/app/api/assistant/query/route";
import { resetOperationDedupe } from "@/lib/api/assistant-operation-dedupe";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
} from "@/lib/firestore/assistant-history-read";
import { finalizeAssistantTurn } from "@/lib/firestore/assistant-history";
import type { SavedQuestionView } from "@/lib/assistant-history/saved-types";

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

const SEPTEMBER = "2026-09-30T17:00:00.000Z";
const OCTOBER = "2026-10-15T17:00:00.000Z";
const DECEMBER = "2026-12-02T17:00:00.000Z";
const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

function request(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A real S138 answer at `nowIso`, finished into history the way the Dashboard saves it. */
async function answerAndRecord(
  user: AuthenticatedUser,
  op: string,
  conversationKey: string,
  question: string,
  nowIso: string,
  conversation: ConversationAnswer["conversation"] | null = null,
): Promise<ConversationAnswer> {
  const context = fakeOperationalContext({
    actorUid: user.uid,
    nowIso,
    reads: {
      renewals: renewalsRead(LEASES),
      work: workRead([
        task({ id: "t-mine", assignee_uid: user.uid }),
        task({ id: "t-other", assignee_uid: "uid-other" }),
      ]),
    },
  });
  const answer = await runAssistantConversation(
    { question, conversation },
    { nowIso, actorKey: conversationActorKey(user.uid), context, interpret: null },
  );
  await finalizeAssistantTurn(
    user,
    op,
    { conversationKey, question, state: "completed", assistant: answer, knowledge: null },
    db,
    () => new Date(nowIso),
  );
  return answer;
}

async function save(op: string, label?: string) {
  const response = await saveRoute(
    request("/api/assistant/saved", "POST", {
      operationId: op,
      ...(label ? { label } : {}),
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as { created: boolean; item: SavedQuestionView },
  };
}

async function run(savedId: string, op: string) {
  const response = await runRoute(
    request(`/api/assistant/saved/${savedId}/run`, "POST", { operationId: op }),
    { params: Promise.resolve({ savedId }) },
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      conversationId: string;
      replayed: boolean;
      turn: {
        turnId: string;
        assistant: ConversationAnswer;
        rerunOf: string;
        answeredAtIso: string;
      };
      item: SavedQuestionView;
      error_type?: string;
    },
  };
}

async function patch(savedId: string, body: unknown) {
  const response = await patchRoute(
    request(`/api/assistant/saved/${savedId}`, "PATCH", body),
    {
      params: Promise.resolve({ savedId }),
    },
  );
  return {
    status: response.status,
    body: (await response.json()) as { changed: boolean; item: SavedQuestionView },
  };
}

async function savedDocs(user: AuthenticatedUser) {
  return db
    .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
    .doc(historyOwnerKey(user.uid))
    .collection(ASSISTANT_HISTORY_COLLECTIONS.saved)
    .get();
}

const leaseIds = (answer: ConversationAnswer) =>
  answer.groups.flatMap((group) => group.items.map((item) => item.ref.id));

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s149-saved-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  state.user = owner;
  state.modelProviders = 0;
  state.interpretCalls = 0;
  state.contexts = 0;
  state.renewals = null;
  resetOperationDedupe();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await testEnv.cleanup();
  await deleteApp(app);
});

describe("S149 saved questions (emulator)", () => {
  it("ARCH-S149-2: saving is idempotent per turn, and the same wording asked twice stays separate", async () => {
    await answerAndRecord(
      owner,
      OP(1),
      OP(1),
      "What leases are due this month?",
      SEPTEMBER,
    );
    await answerAndRecord(
      owner,
      OP(2),
      OP(2),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const first = await save(OP(1));
    const repeat = await save(OP(1));
    const separate = await save(OP(2));
    expect([first.body.created, repeat.body.created, separate.body.created]).toEqual([
      true,
      false,
      true,
    ]);
    expect(repeat.body.item.savedId).toBe(first.body.item.savedId);
    expect(separate.body.item.savedId).not.toBe(first.body.item.savedId);
    expect((await savedDocs(owner)).size).toBe(2);
    expect(first.body.item).toMatchObject({
      label: "What leases are due this month?",
      structured: true,
      pinned: false,
      recordVersion: 1,
      originalRange: {
        preset: "this_month",
        intent: "relative",
        startIso: "2026-09-01",
        endIso: "2026-09-30",
      },
      contextBefore: null,
    });
    expect(state.modelProviders + state.interpretCalls + state.contexts).toBe(0);
  });

  it("ARCH-S149-1: a saved follow-up keeps its merged plan, not only its words", async () => {
    const first = await answerAndRecord(
      owner,
      OP(3),
      OP(3),
      "What work is assigned to anyone?",
      SEPTEMBER,
    );
    await answerAndRecord(
      owner,
      OP(4),
      OP(3),
      "Only mine",
      SEPTEMBER,
      first.conversation,
    );
    const saved = await save(OP(4));
    expect(saved.body.item.label).toBe("What work is assigned to anyone? · Only mine");
    expect(saved.body.item.structured).toBe(true);
    const doc = (await savedDocs(owner)).docs[0].data() as {
      plan: { subjects: string[]; filters: { assignee: string } };
    };
    expect(doc.plan.subjects).toEqual(["work"]);
    expect(doc.plan.filters.assignee).toBe("me");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(OCTOBER));
    const result = await run(saved.body.item.savedId, OP(5));
    expect(result.status).toBe(200);
    expect(leaseIds(result.body.turn.assistant)).toEqual(["t-mine"]);
  });

  it("only the user's own answered turns can be saved; verification accounts cannot save", async () => {
    await finalizeAssistantTurn(
      owner,
      OP(6),
      {
        conversationKey: OP(6),
        question: "Failed?",
        state: "failed",
        assistant: null,
        knowledge: null,
      },
      db,
    );
    expect((await save(OP(6))).status).toBe(409);
    await answerAndRecord(
      owner,
      OP(7),
      OP(7),
      "What leases are due this month?",
      SEPTEMBER,
    );
    state.user = other;
    expect((await save(OP(7))).status).toBe(404);
    state.user = canary;
    expect((await save(OP(7))).status).toBe(403);
    expect(
      (await savedDocs(owner)).size +
        (await savedDocs(other)).size +
        (await savedDocs(canary)).size,
    ).toBe(0);
  });

  it("AC-S149-2: pin and unpin are versioned and repeatable; unpinning keeps the item", async () => {
    await answerAndRecord(
      owner,
      OP(8),
      OP(8),
      "What leases are due this month?",
      SEPTEMBER,
    );
    await answerAndRecord(
      owner,
      OP(9),
      OP(9),
      "What work is assigned to me today?",
      SEPTEMBER,
    );
    const a = (await save(OP(8))).body.item;
    const b = (await save(OP(9))).body.item;

    const pinned = await patch(a.savedId, { pinned: true, expectedVersion: 1 });
    expect(pinned.body).toMatchObject({
      changed: true,
      item: { pinned: true, recordVersion: 2 },
    });
    // A retried pin from a stale tab is a no-op, not a duplicate or an error.
    const retried = await patch(a.savedId, { pinned: true, expectedVersion: 1 });
    expect(retried.body).toMatchObject({
      changed: false,
      item: { pinned: true, recordVersion: 2 },
    });
    // A stale change in the other direction cannot overwrite the newer state.
    expect((await patch(a.savedId, { pinned: false, expectedVersion: 1 })).status).toBe(
      409,
    );

    const listed = (await (await listSavedRoute()).json()) as {
      items: SavedQuestionView[];
    };
    expect(listed.items.map((item) => [item.savedId, item.pinned])).toEqual([
      [a.savedId, true],
      [b.savedId, false],
    ]);

    const unpinned = await patch(a.savedId, { pinned: false, expectedVersion: 2 });
    expect(unpinned.body.item).toMatchObject({ pinned: false, recordVersion: 3 });
    const relabelled = await patch(a.savedId, {
      label: "Monthly lease check",
      expectedVersion: 3,
    });
    expect(relabelled.body.item).toMatchObject({
      label: "Monthly lease check",
      recordVersion: 4,
    });
    expect((await savedDocs(owner)).size).toBe(2);
    expect(state.modelProviders + state.interpretCalls + state.contexts).toBe(0);
  });

  it("BEH-S149-1 / AC-S150-1: reopening a pinned item's answer later reads stored data only", async () => {
    await answerAndRecord(
      owner,
      OP(10),
      OP(10),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const item = (await save(OP(10))).body.item;
    await patch(item.savedId, { pinned: true, expectedVersion: 1 });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(OCTOBER));
    const listed = (await (await listSavedRoute()).json()) as {
      items: SavedQuestionView[];
    };
    const opened = await openRoute(
      request(`/api/assistant/history/${listed.items[0].conversationId}`, "GET"),
      {
        params: Promise.resolve({ conversationId: listed.items[0].conversationId }),
      },
    );
    const body = (await opened.json()) as {
      turns: {
        operationId: string;
        answeredAtIso: string;
        assistant: ConversationAnswer;
      }[];
    };
    const turn = body.turns.find(
      (entry) => entry.operationId === listed.items[0].lastOperationId,
    )!;
    expect(turn.answeredAtIso).toBe(SEPTEMBER);
    expect(turn.assistant.execution?.range?.startIso).toBe("2026-09-01");
    expect(leaseIds(turn.assistant)).toEqual(["L-SEP"]);
    expect(state.modelProviders + state.interpretCalls + state.contexts).toBe(0);
  });
});

describe("S150 running a saved question for current results (emulator)", () => {
  it("ARCH-S150-1 fail-first: asking again pays the model; running the saved plan does not", async () => {
    await answerAndRecord(
      owner,
      OP(20),
      OP(20),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const item = (await save(OP(20))).body.item;

    // Today's path: the same words as a new question go through the model interpreter.
    await queryRoute(
      request("/api/assistant/query", "POST", {
        question: "What leases are due this month?",
        conversation: null,
      }),
    );
    expect([state.modelProviders, state.interpretCalls]).toEqual([1, 1]);

    const result = await run(item.savedId, OP(21));
    expect(result.status).toBe(200);
    expect([state.modelProviders, state.interpretCalls]).toEqual([1, 1]);
    expect(result.body.turn.assistant.interpretedBy).toBe("stored_plan");
  });

  it("BEH-S149-2 / AC-S150-2: next month's run re-evaluates 'this month' and adds a new turn; the old one is untouched", async () => {
    const september = await answerAndRecord(
      owner,
      OP(22),
      OP(22),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const item = (await save(OP(22))).body.item;

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(OCTOBER));
    const result = await run(item.savedId, OP(23));
    expect(result.status).toBe(200);
    expect(leaseIds(result.body.turn.assistant).sort()).toEqual(["L-OCT-A", "L-OCT-B"]);
    expect(result.body.turn.assistant.execution?.range).toMatchObject({
      intent: "relative",
      startIso: "2026-10-01",
      endIso: "2026-10-31",
    });
    expect(result.body.turn.rerunOf).toBe(item.savedId);
    expect(result.body.item).toMatchObject({
      lastOperationId: OP(23),
      lastAnsweredAtIso: OCTOBER,
    });
    expect([state.modelProviders, state.interpretCalls, state.contexts]).toEqual([
      0, 0, 1,
    ]);

    const opened = await openRoute(
      request(`/api/assistant/history/${item.conversationId}`, "GET"),
      {
        params: Promise.resolve({ conversationId: item.conversationId }),
      },
    );
    const conversation = (await opened.json()) as {
      turns: {
        operationId: string;
        rerunOf: string | null;
        assistant: ConversationAnswer;
      }[];
    };
    expect(conversation.turns.map((turn) => [turn.operationId, turn.rerunOf])).toEqual([
      [OP(22), null],
      [OP(23), item.savedId],
    ]);
    expect(leaseIds(conversation.turns[0].assistant)).toEqual(leaseIds(september));
    expect(conversation.turns[0].assistant.execution?.range?.startIso).toBe("2026-09-01");
  });

  it("BEH-S149-2: a named month stays fixed when run months later", async () => {
    await answerAndRecord(
      owner,
      OP(24),
      OP(24),
      "What leases end in 2026-10?",
      SEPTEMBER,
    );
    const item = (await save(OP(24))).body.item;
    expect(item.originalRange).toMatchObject({ intent: "fixed", month: "2026-10" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(DECEMBER));
    const result = await run(item.savedId, OP(25));
    expect(leaseIds(result.body.turn.assistant).sort()).toEqual(["L-OCT-A", "L-OCT-B"]);
  });

  it("AC-S150-4: a duplicate delivery of one run executes once and replays afterwards", async () => {
    await answerAndRecord(
      owner,
      OP(26),
      OP(26),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const item = (await save(OP(26))).body.item;
    const [first, second] = await Promise.all([
      run(item.savedId, OP(27)),
      run(item.savedId, OP(27)),
    ]);
    expect(first.body.turn.turnId).toBe(second.body.turn.turnId);
    expect([first.body.replayed, second.body.replayed].filter(Boolean)).toHaveLength(1);
    const third = await run(item.savedId, OP(27));
    expect(third.body.replayed).toBe(true);
    expect(third.body.turn.turnId).toBe(first.body.turn.turnId);
    expect(state.contexts).toBe(1);
    const turns = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(owner.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
      .get();
    expect(turns.size).toBe(2);
  });

  it("AC-S150-3: a run re-checks current access; a denied source never shows the old records", async () => {
    await answerAndRecord(
      owner,
      OP(28),
      OP(28),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const item = (await save(OP(28))).body.item;
    state.renewals = {
      source: "renewals",
      status: "not_authorized",
      records: [],
      truncated: false,
      asOf: SEPTEMBER,
    };
    const result = await run(item.savedId, OP(29));
    expect(result.status).toBe(200);
    expect(result.body.turn.assistant.groups[0].status).toBe("not_authorized");
    expect(leaseIds(result.body.turn.assistant)).toEqual([]);
  });

  it("a saved question that needs a new answer is never executed as a stored plan", async () => {
    const context = fakeOperationalContext({ actorUid: owner.uid, nowIso: SEPTEMBER });
    const answer = await runAssistantConversation(
      { question: "What maintenance tickets are open?", conversation: null },
      {
        nowIso: SEPTEMBER,
        actorKey: conversationActorKey(owner.uid),
        context,
        interpret: null,
      },
    );
    // Maintenance is answered today but is not a repeatable stored-plan subject.
    expect(answer.execution?.plan.subjects).toEqual(["maintenance"]);
    await finalizeAssistantTurn(
      owner,
      OP(30),
      {
        conversationKey: OP(30),
        question: "What maintenance tickets are open?",
        state: "completed",
        assistant: answer,
        knowledge: null,
      },
      db,
    );
    const item = (await save(OP(30))).body.item;
    expect(item.structured).toBe(false);
    const result = await run(item.savedId, OP(31));
    expect(result.status).toBe(409);
    expect(result.body.error_type).toBe("structured_rerun_unsupported");
    expect(state.contexts).toBe(0);
  });

  it("another user and verification accounts cannot run, pin or list someone else's item", async () => {
    await answerAndRecord(
      owner,
      OP(32),
      OP(32),
      "What leases are due this month?",
      SEPTEMBER,
    );
    const item = (await save(OP(32))).body.item;
    state.user = other;
    expect((await run(item.savedId, OP(33))).status).toBe(404);
    expect((await patch(item.savedId, { pinned: true, expectedVersion: 1 })).status).toBe(
      404,
    );
    expect(
      ((await (await listSavedRoute()).json()) as { items: unknown[] }).items,
    ).toEqual([]);
    state.user = canary;
    expect((await run(item.savedId, OP(34))).status).toBe(403);
    expect((await patch(item.savedId, { pinned: true, expectedVersion: 1 })).status).toBe(
      403,
    );
    expect(state.contexts).toBe(0);
    state.user = owner;
    const mine = (await (await listSavedRoute()).json()) as {
      items: SavedQuestionView[];
    };
    expect(mine.items[0]).toMatchObject({ pinned: false, recordVersion: 1 });
  });
});
