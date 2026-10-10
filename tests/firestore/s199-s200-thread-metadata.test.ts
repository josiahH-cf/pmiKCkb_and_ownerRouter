import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  user: null as AuthenticatedUser | null,
  prompts: [] as string[],
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => state.user,
}));
vi.mock("@/lib/llm/model-provider", async (original) => ({
  ...(await original<typeof import("@/lib/llm/model-provider")>()),
  createModelProvider: () => ({
    generateText: async (input: { userContent: string }) => {
      state.prompts.push(input.userContent);
      return { text: "{}" };
    },
  }),
}));
vi.mock("@/lib/config/server", async (original) => ({
  ...(await original<typeof import("@/lib/config/server")>()),
  readServerConfig: () => ({
    askDemoMode: false,
    modelProvider: "gemini",
    geminiClassifyModel: "fixture-model",
    localModelName: "fixture-local",
  }),
}));
vi.mock("@/lib/operational-context/server-context", async () => {
  const f = await import("@/tests/helpers/operational-context-fake");
  return {
    createServerOperationalContext: () =>
      f.fakeOperationalContext({
        actorUid: "metadata-owner",
        reads: { renewals: f.renewalsRead([]) },
      }),
  };
});
import { POST as queryPOST } from "@/app/api/assistant/query/route";
import {
  beginAssistantTurn,
  finalizeAssistantTurn,
} from "@/lib/firestore/assistant-history";
import {
  historyOwnerKey,
  readActiveConversationSelection,
  readAssistantConversation,
  readAssistantConversationPage,
  listAssistantConversations,
} from "@/lib/firestore/assistant-history-read";
import { updateAssistantThreadMetadata } from "@/lib/firestore/assistant-thread-metadata";
import { POST as metadataPOST } from "@/app/api/assistant/history/metadata/route";
import { GET as conversationGET } from "@/app/api/assistant/history/[conversationId]/route";
import { GET as historyGET } from "@/app/api/assistant/history/route";
const owner: AuthenticatedUser = {
    uid: "metadata-owner",
    email: "metadata-owner@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  },
  other: AuthenticatedUser = {
    ...owner,
    uid: "other-staff",
    email: "other@pmikcmetro.com",
  };
let environment: RulesTestEnvironment,
  app: ReturnType<typeof initializeApp>,
  db: Firestore;
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-thread-metadata-test",
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-thread-metadata-test" },
    `thread-metadata-${process.pid}`,
  );
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await environment.clearFirestore();
  state.user = owner;
  state.prompts = [];
});
afterAll(async () => {
  await environment.cleanup();
  await deleteApp(app);
  vi.unstubAllEnvs();
});
async function thread(n: number) {
  const operationId = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    ...(await beginAssistantTurn(
      owner,
      { operationId, conversationKey: operationId, question: `Synthetic thread ${n}` },
      db,
    )),
    key: operationId,
  };
}
const select = (id: string | null, v: number, op = randomUUID()) => ({
  action: "select",
  conversationId: id,
  expectedVersion: v,
  operationId: op,
});
const pin = (id: string, desired: boolean, v: number, op = randomUUID()) => ({
  action: "pin",
  conversationId: id,
  pinned: desired,
  expectedVersion: v,
  operationId: op,
});
describe("S199/S200 actual private metadata transactions", () => {
  it("restores only an owned selection and fences two simultaneous session choices", async () => {
    const a = await thread(1),
      b = await thread(2);
    expect(await readActiveConversationSelection(owner, db)).toEqual({
      conversationId: null,
      version: 0,
    });
    const results = await Promise.allSettled([
      updateAssistantThreadMetadata(owner, select(a.conversationId, 0), db),
      updateAssistantThreadMetadata(owner, select(b.conversationId, 0), db),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const saved = await readActiveConversationSelection(owner, db);
    expect(saved.version).toBe(1);
    expect([a.conversationId, b.conversationId]).toContain(saved.conversationId);
    await expect(
      updateAssistantThreadMetadata(other, select(a.conversationId, 0), db),
    ).rejects.toMatchObject({ status: 404 });
    expect(await readActiveConversationSelection(other, db)).toEqual({
      conversationId: null,
      version: 0,
    });
  });
  it("reconciles a lost selection response without overwriting a later accepted choice", async () => {
    const a = await thread(1),
      b = await thread(2),
      original = select(a.conversationId, 0);
    await updateAssistantThreadMetadata(owner, original, db);
    await updateAssistantThreadMetadata(owner, select(b.conversationId, 1), db);
    expect((await updateAssistantThreadMetadata(owner, original, db)).selection).toEqual({
      conversationId: b.conversationId,
      version: 2,
    });
    await expect(
      updateAssistantThreadMetadata(
        owner,
        { ...original, conversationId: b.conversationId },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("pins the continuing thread, retains later turns and unpins without changing transcript or saved questions", async () => {
    const t = await thread(1),
      root = db.collection("assistant_history_users").doc(historyOwnerKey(owner.uid));
    await root
      .collection("saved_questions")
      .doc("legacy-question")
      .set({ pinned: true, question: "Preserved saved question" });
    const before = await readAssistantConversation(owner, t.conversationId, db),
      command = pin(t.conversationId, true, 0);
    await updateAssistantThreadMetadata(owner, command, db);
    await updateAssistantThreadMetadata(owner, command, db);
    await beginAssistantTurn(
      owner,
      {
        operationId: randomUUID(),
        conversationKey: t.key,
        question: "Later accepted question",
      },
      db,
    );
    const after = await readAssistantConversation(owner, t.conversationId, db);
    expect(after!.turns[0]).toEqual(before!.turns[0]);
    expect(after!.turns).toHaveLength(2);
    expect(after!.conversation).toMatchObject({ pinned: true, pinVersion: 1 });
    await updateAssistantThreadMetadata(owner, pin(t.conversationId, false, 1), db);
    expect((await readAssistantConversation(owner, t.conversationId, db))!.turns).toEqual(
      after!.turns,
    );
    expect(
      (await root.collection("saved_questions").doc("legacy-question").get()).data(),
    ).toEqual({ pinned: true, question: "Preserved saved question" });
    expect((await listAssistantConversations(owner, {}, db)).conversations).toHaveLength(
      1,
    );
  });
  it("uses a separate pin version and preserves the latest state on duplicate recovery", async () => {
    const t = await thread(1),
      original = pin(t.conversationId, true, 0);
    await updateAssistantThreadMetadata(owner, original, db);
    const race = await Promise.allSettled([
      updateAssistantThreadMetadata(owner, pin(t.conversationId, false, 1), db),
      updateAssistantThreadMetadata(owner, pin(t.conversationId, true, 1), db),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const actual = await readAssistantConversation(owner, t.conversationId, db);
    expect(
      (await updateAssistantThreadMetadata(owner, original, db)).conversation,
    ).toEqual(actual!.conversation);
  });
  it("paginates pins and ordinary history and never lists another account's threads", async () => {
    for (let n = 1; n <= 23; n++) {
      const t = await thread(n);
      if (n !== 23)
        await updateAssistantThreadMetadata(owner, pin(t.conversationId, true, 0), db);
    }
    const first = await listAssistantConversations(owner, { pinnedOnly: true }, db);
    expect(first.conversations).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await listAssistantConversations(
      owner,
      { pinnedOnly: true, cursor: first.nextCursor },
      db,
    );
    expect(second.conversations).toHaveLength(2);
    expect(
      new Set(
        [...first.conversations, ...second.conversations].map((c) => c.conversationId),
      ).size,
    ).toBe(22);
    expect(
      (await listAssistantConversations(other, { pinnedOnly: true }, db)).conversations,
    ).toEqual([]);
    const response = await historyGET(
      new Request("http://local.test/api/assistant/history"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ownerKey: historyOwnerKey(owner.uid),
      activeSelection: { conversationId: null, version: 0 },
      pinnedConversations: expect.any(Array),
    });
  });
  it("refuses verification and spoofed metadata at both HTTP and owning-store boundaries", async () => {
    const t = await thread(1);
    state.user = {
      ...owner,
      uid: "canary-editor",
      email: "canary-editor@pmikcmetro.com",
    };
    const request = (body: unknown) =>
      new Request("http://local.test/api/assistant/history/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await metadataPOST(request(select(t.conversationId, 0)))).status).toBe(403);
    await expect(
      updateAssistantThreadMetadata(state.user!, select(t.conversationId, 0), db),
    ).rejects.toMatchObject({ status: 403 });
    state.user = owner;
    expect(
      (
        await metadataPOST(
          request({ ...pin(t.conversationId, true, 0), ownerUid: other.uid }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await readAssistantConversation(owner, t.conversationId, db))!.conversation.pinned,
    ).toBe(false);
  });
  it("assembles prior answer meaning from the actual owned HTTP query and excludes another user's matching client key", async () => {
    const t = await thread(1);
    await finalizeAssistantTurn(
      owner,
      t.key,
      {
        conversationKey: t.key,
        question: "Synthetic thread 1",
        state: "completed",
        assistant: null,
        knowledge: {
          question: "Synthetic thread 1",
          source_state: "Verified Source",
          answer:
            "Earlier proposed 4%; later correction is 3.5%, with membership and agreement still unverified.",
          handling_steps: [],
          citations: [
            {
              source_id: "fixture-approved-policy",
              title: "Synthetic policy source",
              url: "https://example.invalid/policy",
            },
          ],
          draft: "",
        },
      },
      db,
    );
    const op = randomUUID(),
      request = () =>
        new Request("http://local.test/api/assistant/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: "What was that earlier percentage?",
            operationId: op,
            conversationKey: t.key,
          }),
        });
    expect((await queryPOST(request())).status).toBe(200);
    expect(state.prompts).toHaveLength(1);
    expect(state.prompts[0]).toContain("membership and agreement still unverified");
    expect(state.prompts[0]).toContain("3.5%");
    state.user = other;
    expect((await queryPOST(request())).status).toBe(503);
    expect(state.prompts).toHaveLength(1);
  });
  it("refuses reusing a turn operation for changed content before altering its original submitted question", async () => {
    const t = await thread(1);
    await expect(
      beginAssistantTurn(
        owner,
        { operationId: t.key, conversationKey: t.key, question: "Different question" },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      finalizeAssistantTurn(
        owner,
        t.key,
        {
          conversationKey: t.key,
          question: "Different question",
          state: "failed",
          assistant: null,
          knowledge: null,
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await readAssistantConversation(owner, t.conversationId, db))!.turns[0],
    ).toMatchObject({ question: "Synthetic thread 1", displayState: "in_progress" });
  });

  it("reads a long thread in bounded ordered pages, reaches its oldest and newest turns, and checks ownership on each HTTP page", async () => {
    const t = await thread(1),
      root = db.collection("assistant_history_users").doc(historyOwnerKey(owner.uid));
    const first = (await root.collection("turns").get()).docs[0].data();
    const batch = db.batch();
    for (let n = 2; n <= 123; n++)
      batch.set(root.collection("turns").doc(`synthetic-${n}`), {
        ...first,
        turn_id: `synthetic-${n}`,
        operation_id: `synthetic-${n}`,
        seq: n,
        question: `Long thread question ${n}`,
      });
    await batch.commit();
    await root
      .collection("conversations")
      .doc(t.conversationId)
      .update({ turn_count: 123 });
    const page = await readAssistantConversationPage(owner, t.conversationId, 0, db);
    expect(page!.turns).toHaveLength(50);
    expect(page!.nextTurnCursor).toBe(50);
    const second = await readAssistantConversationPage(owner, t.conversationId, 50, db);
    expect(second!.turns[0].seq).toBe(51);
    expect(second!.nextTurnCursor).toBe(100);
    const all = await readAssistantConversation(owner, t.conversationId, db);
    expect(all!.turns.map((turn) => turn.seq)).toEqual(
      Array.from({ length: 123 }, (_, n) => n + 1),
    );
    const req = (query = "") =>
        new Request(
          `http://local.test/api/assistant/history/${t.conversationId}${query}`,
        ),
      context = { params: Promise.resolve({ conversationId: t.conversationId }) };
    const response = await conversationGET(req("?after=100"), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.turns).toHaveLength(23);
    expect(body.nextTurnCursor).toBeNull();
    state.user = other;
    expect((await conversationGET(req("?after=50"), context)).status).toBe(404);
    state.user = owner;
    expect((await conversationGET(req("?after=50&after=100"), context)).status).toBe(400);
  });
});
