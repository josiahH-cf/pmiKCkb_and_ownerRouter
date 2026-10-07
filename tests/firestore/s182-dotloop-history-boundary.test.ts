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
} from "@/lib/assistant/conversation";
import { DOTLOOP_REFERENCE_REMOVED_TEXT } from "@/lib/ai-boundary/dotloop-origin";
import type { TypedSourceRead } from "@/lib/operational-context/types";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  readAssistantConversation,
  readTurnByOperation,
} from "@/lib/firestore/assistant-history-read";
import {
  conversationIdFor,
  finalizeAssistantTurn,
  recordRerunTurn,
} from "@/lib/firestore/assistant-history";
import { saveQuestion } from "@/lib/firestore/assistant-saved-questions";
import {
  fakeOperationalContext,
  renewalsRead,
  TEST_NOW,
} from "@/tests/helpers/operational-context-fake";

// S182 AC-S182-4 / AC-S182-5 against the emulator through the real S148/S150 stores: a saved answer
// or a saved question's current run never keeps a Dotloop resource address or app Dotloop
// reference, only those characters are cut, a help article and its working link stay, the
// person's PMI facts and own history stay, and reopening the history is model-free and
// owner-scoped.

const projectId = "pmi-kc-kb-s182-history-test";
const state = vi.hoisted(() => ({
  modelProviders: 0,
  db: null as unknown as Firestore,
  user: null as unknown as AuthenticatedUser,
  renewals: null as unknown,
}));
vi.mock("@/lib/llm/model-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/model-provider")>()),
  createModelProvider: () => {
    state.modelProviders += 1;
    return { generateText: async () => ({ text: "{}" }) };
  },
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => state.user,
}));
vi.mock("@/lib/operational-context/server-context", async () => {
  const fake = await import("@/tests/helpers/operational-context-fake");
  return {
    createServerOperationalContext: (user: AuthenticatedUser, now: Date) =>
      fake.fakeOperationalContext({
        actorUid: user.uid,
        nowIso: now.toISOString(),
        reads: { renewals: state.renewals as TypedSourceRead<"renewals"> },
      }),
  };
});

import { POST as runRoute } from "@/app/api/assistant/saved/[savedId]/run/route";
import { resetOperationDedupe } from "@/lib/api/assistant-operation-dedupe";

const owner: AuthenticatedUser = {
  uid: "owner-182",
  email: "owner182@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const other: AuthenticatedUser = {
  uid: "other-182",
  email: "other182@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LOOP = "https://www.dotloop.com/m/loop?viewId=SENTINEL-LOOP-7731";
const HELP_ARTICLE =
  "https://support.dotloop.com/hc/en-us/articles/115005451128-Adding-Documents-to-a-Loop";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s182-history-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  state.modelProviders = 0;
  state.user = owner;
  state.renewals = null;
  resetOperationDedupe();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await testEnv.cleanup();
  await deleteApp(app);
});

describe("S182 saved assistant history excludes Dotloop-derived content", () => {
  it("keeps the PMI answer and drops a leaked Dotloop branch before persistence", async () => {
    const context = fakeOperationalContext({
      actorUid: owner.uid,
      reads: {
        renewals: renewalsRead([
          { id: "L-1", endDateIso: "2026-10-02", tenants: ["Jordan Fixture"] },
          { id: "L-2", endDateIso: "2026-10-03" },
        ]),
      },
    });
    const answer = await runAssistantConversation(
      { question: "What leases are due this week?", conversation: null },
      {
        nowIso: context.nowIso,
        actorKey: conversationActorKey(owner.uid),
        context,
        interpret: null,
      },
    );
    expect(answer.groups[0].items.length).toBe(2);
    // A forged or leaked provider value in a submitted answer: one item's detail carries a loop
    // address and a group note carries a Dotloop receipt reference.
    const leaked = {
      ...answer,
      groups: [
        {
          ...answer.groups[0],
          items: [
            { ...answer.groups[0].items[0], detail: `Loop ${LOOP}` },
            answer.groups[0].items[1],
          ],
        },
        ...answer.groups.slice(1),
      ],
    };
    // The knowledge part cites a Dotloop help article (kept whole) and a loop (dropped).
    const knowledge = {
      question: "How do I add documents to a loop?",
      source_state: "Verified Source",
      answer: `Follow ${HELP_ARTICLE} to add the documents.`,
      handling_steps: [],
      citations: [
        { source_id: "kb-help", title: "Adding Documents to a Loop", url: HELP_ARTICLE },
        { source_id: "kb-loop", title: "The renewal loop", url: LOOP },
      ],
      draft: "",
    };
    await finalizeAssistantTurn(
      owner,
      OP(1),
      {
        conversationKey: OP(1),
        question: "What leases are due this week?",
        state: "completed",
        assistant: leaked,
        knowledge,
      },
      db,
    );

    const stored = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(owner.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.turns)
      .get();
    const raw = JSON.stringify(stored.docs.map((doc) => doc.data()));
    expect(raw).not.toContain("SENTINEL-LOOP-7731");
    expect(raw).not.toContain("www.dotloop.com/m/");

    // Reopening is model-free, owner-scoped, and keeps the independent PMI items.
    const reopened = await readAssistantConversation(
      owner,
      conversationIdFor(owner.uid, OP(1)),
      db,
    );
    const turn = reopened?.turns[0];
    expect(turn?.question).toBe("What leases are due this week?");
    // The help article answer is kept word for word, and its citation stays a working link.
    expect(turn?.knowledge?.answer).toBe(knowledge.answer);
    expect(turn?.knowledge?.citations).toEqual([knowledge.citations[0]]);
    const items = turn?.assistant?.groups[0].items ?? [];
    expect(items.map((item) => item.href)).toEqual(
      answer.groups[0].items.map((item) => item.href),
    );
    // Only the loop address itself is cut from the item's detail.
    expect(items[0].detail).toBe(`Loop ${DOTLOOP_REFERENCE_REMOVED_TEXT}`);
    expect(items[0].title).toBe(answer.groups[0].items[0].title);
    expect(JSON.stringify(items[1])).toBe(JSON.stringify(answer.groups[0].items[1]));
    expect(state.modelProviders).toBe(0);
    await expect(
      readAssistantConversation(other, conversationIdFor(owner.uid, OP(1)), db),
    ).resolves.toBeNull();
  });
});

const QUESTION = "What leases are due this week?";
const CLEAN_LEASES = [
  { id: "L-1", endDateIso: "2026-10-02", tenants: ["Jordan Fixture"] },
  { id: "L-2", endDateIso: "2026-10-03" },
];
// The same leases when a provider value has leaked into one renewal blocker.
const LEAKED_LEASES = [
  {
    ...CLEAN_LEASES[0],
    blockers: [`Waiting on loop ${LOOP} (dotloop-receipt:SENTINEL-RECEIPT)`],
  },
  CLEAN_LEASES[1],
];

/** One answered, saved question whose original answer is clean. */
async function savedQuestion(): Promise<string> {
  const context = fakeOperationalContext({
    actorUid: owner.uid,
    reads: { renewals: renewalsRead(CLEAN_LEASES) },
  });
  const answer = await runAssistantConversation(
    { question: QUESTION, conversation: null },
    {
      nowIso: context.nowIso,
      actorKey: conversationActorKey(owner.uid),
      context,
      interpret: null,
    },
  );
  await finalizeAssistantTurn(
    owner,
    OP(10),
    {
      conversationKey: OP(10),
      question: QUESTION,
      state: "completed",
      assistant: answer,
      knowledge: null,
    },
    db,
  );
  const { item } = await saveQuestion(owner, { operationId: OP(10) }, db);
  return item.savedId;
}

describe("S182 a saved question's current run keeps no Dotloop reference", () => {
  it("cuts the leaked address and reference before the run is kept", async () => {
    const savedId = await savedQuestion();
    const context = fakeOperationalContext({
      actorUid: owner.uid,
      reads: { renewals: renewalsRead(LEAKED_LEASES) },
    });
    const current = await runAssistantConversation(
      { question: QUESTION, conversation: null },
      {
        nowIso: context.nowIso,
        actorKey: conversationActorKey(owner.uid),
        context,
        interpret: null,
      },
    );
    expect(JSON.stringify(current)).toContain("SENTINEL-LOOP-7731");
    const written = await recordRerunTurn(
      owner,
      OP(11),
      { savedId, state: "completed", assistant: current },
      db,
    );
    const stored = await readTurnByOperation(owner, OP(11), db);
    for (const record of [written.record, stored]) {
      const raw = JSON.stringify(record);
      expect(raw).not.toContain("SENTINEL-LOOP-7731");
      expect(raw).not.toContain("SENTINEL-RECEIPT");
      expect(record?.assistant?.groups[0].items[0].blockers).toEqual([
        `Waiting on loop ${DOTLOOP_REFERENCE_REMOVED_TEXT} (${DOTLOOP_REFERENCE_REMOVED_TEXT})`,
      ]);
      // The person's saved question is kept as they asked it.
      expect(record?.question).toBe(QUESTION);
    }
  });

  it("returns and keeps a cut answer when the person presses Run", async () => {
    const savedId = await savedQuestion();
    state.renewals = renewalsRead(LEAKED_LEASES);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(TEST_NOW));
    const response = await runRoute(
      new Request(`http://localhost/api/assistant/saved/${savedId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: OP(12) }),
      }),
      { params: Promise.resolve({ savedId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      turn: { assistant: { groups: Array<{ items: Array<{ blockers: string[] }> }> } };
    };
    const stored = await readTurnByOperation(owner, OP(12), db);
    for (const raw of [JSON.stringify(body), JSON.stringify(stored)]) {
      expect(raw).not.toContain("SENTINEL-LOOP-7731");
      expect(raw).not.toContain("SENTINEL-RECEIPT");
    }
    expect(body.turn.assistant.groups[0].items[0].blockers[0]).toContain(
      DOTLOOP_REFERENCE_REMOVED_TEXT,
    );
    expect(state.modelProviders).toBe(0);
  });
});
