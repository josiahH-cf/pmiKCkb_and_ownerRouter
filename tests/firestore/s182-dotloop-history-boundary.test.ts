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
import { DOTLOOP_ORIGIN_REMOVED_TEXT } from "@/lib/ai-boundary/dotloop-origin";
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
// keeps a Dotloop-derived branch, the person's PMI facts and own history stay, and reopening the
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
    await finalizeAssistantTurn(
      owner,
      OP(1),
      {
        conversationKey: OP(1),
        question: "What leases are due this week?",
        state: "completed",
        assistant: leaked,
        knowledge: null,
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
    expect(raw).not.toContain("dotloop.com");
    expect(raw).toContain(DOTLOOP_ORIGIN_REMOVED_TEXT);

    // Reopening is model-free, owner-scoped, and keeps the independent PMI items.
    const reopened = await readAssistantConversation(
      owner,
      conversationIdFor(owner.uid, OP(1)),
      db,
    );
    const items = reopened?.turns[0].assistant?.groups[0].items ?? [];
    expect(items.map((item) => item.href)).toEqual(
      answer.groups[0].items.map((item) => item.href),
    );
    expect(items[0].detail).toBe(DOTLOOP_ORIGIN_REMOVED_TEXT);
    expect(items[0].title).toBe(answer.groups[0].items[0].title);
    expect(JSON.stringify(items[1])).toBe(JSON.stringify(answer.groups[0].items[1]));
    expect(state.modelProviders).toBe(0);
    await expect(
      readAssistantConversation(other, conversationIdFor(owner.uid, OP(1)), db),
    ).resolves.toBeNull();
  });
});
