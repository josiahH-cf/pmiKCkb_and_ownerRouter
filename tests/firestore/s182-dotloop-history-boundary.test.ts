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
} from "@/lib/assistant/conversation";
import { DOTLOOP_REFERENCE_REMOVED_TEXT } from "@/lib/ai-boundary/dotloop-origin";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  readAssistantConversation,
} from "@/lib/firestore/assistant-history-read";
import {
  conversationIdFor,
  finalizeAssistantTurn,
} from "@/lib/firestore/assistant-history";
import {
  fakeOperationalContext,
  renewalsRead,
} from "@/tests/helpers/operational-context-fake";

// S182 AC-S182-4 / AC-S182-5 against the emulator through the real S148 store: a saved answer never
// keeps a Dotloop resource address or app Dotloop reference, only those characters are cut, a help
// article and its working link stay, the person's PMI facts and own history stay, and reopening the
// history is model-free and owner-scoped.

const projectId = "pmi-kc-kb-s182-history-test";
const state = vi.hoisted(() => ({ modelProviders: 0 }));
vi.mock("@/lib/llm/model-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/model-provider")>()),
  createModelProvider: () => {
    state.modelProviders += 1;
    return { generateText: async () => ({ text: "{}" }) };
  },
}));

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
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  state.modelProviders = 0;
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
