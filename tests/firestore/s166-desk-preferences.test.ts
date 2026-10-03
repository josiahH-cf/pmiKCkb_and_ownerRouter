import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S166 against the Firestore emulator through the real store and route: the remembered worklist
// view is durable, belongs to one account, and is unreachable from any client. Synthetic accounts.

const projectId = "pmi-kc-kb-s166-desk-preferences-test";
const state = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  user: null as unknown as AuthenticatedUser,
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => state.user,
  requireCapabilityInSpace: async () => state.user,
}));

import { GET, POST } from "@/app/api/lease-renewal/desk-preferences/route";
import {
  ASSISTANT_HISTORY_COLLECTIONS,
  historyOwnerKey,
  listAssistantConversations,
} from "@/lib/firestore/assistant-history-read";
import { beginAssistantTurn } from "@/lib/firestore/assistant-history";
import {
  RENEWAL_DESK_PREFERENCE_COLLECTION,
  getRenewalDeskPreference,
  renewalDeskPreferenceDocId,
  saveRenewalDeskPreference,
} from "@/lib/firestore/renewal-desk-preferences";
import { resolveRenewalDeskEntry } from "@/lib/lease-renewal/desk-preferences";
import { serializeRenewalDeskQueryV2 } from "@/lib/lease-renewal/desk-query-v2";

const pat: AuthenticatedUser = {
  uid: "s166-pat",
  email: "pat.sample@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const lee: AuthenticatedUser = {
  uid: "s166-lee",
  email: "lee.sample@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const canary: AuthenticatedUser = {
  uid: "s166-canary",
  email: "canary-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

const SAVED = "v=2&sort=end_date&direction=desc&scope=all";
const OP = "00000000-0000-4000-8000-000000000166";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

function post(body: unknown): Request {
  return new Request("http://localhost/api/lease-renewal/desk-preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s166-desk-preferences-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  state.user = pat;
});

afterAll(async () => {
  await testEnv.cleanup();
  await deleteApp(app);
});

describe("S166 durable account worklist view (emulator)", () => {
  it("BEH-S166-5 / BEH-S166-6: a saved view is read back by a clean context for the same account", async () => {
    const response = await POST(
      post({ query: "v=2&direction=desc&sort=end_date&scope=all" }),
    );
    expect(response.status).toBe(200);
    // A different device shares nothing but the account: a second Admin app reads the same store.
    const second = initializeApp({ projectId }, `s166-second-device-${process.pid}`);
    try {
      const stored = await getRenewalDeskPreference({ ...pat }, getFirestore(second));
      expect(stored?.view).toBe(SAVED);
      const entry = resolveRenewalDeskEntry({
        searchParams: {},
        storedView: stored?.view,
      });
      expect(entry.source).toBe("saved");
      expect(serializeRenewalDeskQueryV2(entry.state)).toBe(SAVED);
    } finally {
      await deleteApp(second);
    }
    const raw = await db
      .collection(RENEWAL_DESK_PREFERENCE_COLLECTION)
      .doc(renewalDeskPreferenceDocId(pat.uid))
      .get();
    expect(raw.data()).toMatchObject({
      schemaVersion: "renewal-desk-preference/v1",
      uid: pat.uid,
      view: SAVED,
    });
  });

  it("BEH-S166-7: clearing persists the default across sessions", async () => {
    await saveRenewalDeskPreference(pat, { query: SAVED }, db);
    expect((await POST(post({ query: "v=2" }))).status).toBe(200);
    const stored = await getRenewalDeskPreference(pat, db);
    expect(stored?.view).toBe("");
    expect(
      resolveRenewalDeskEntry({ searchParams: {}, storedView: stored?.view }).source,
    ).toBe("default");
  });

  it("BEH-S166-9: an explicit link is only a read; the stored view is byte-identical afterwards", async () => {
    await saveRenewalDeskPreference(pat, { query: SAVED }, db);
    const ref = db
      .collection(RENEWAL_DESK_PREFERENCE_COLLECTION)
      .doc(renewalDeskPreferenceDocId(pat.uid));
    const before = (await ref.get()).data();
    const stored = await getRenewalDeskPreference(pat, db);
    const entry = resolveRenewalDeskEntry({
      searchParams: new URLSearchParams("v=2&overallStatus=blocked"),
      storedView: stored?.view,
    });
    expect(entry.source).toBe("explicit");
    expect((await ref.get()).data()).toEqual(before);
    // A later deliberate change replaces it.
    await saveRenewalDeskPreference(pat, { query: "v=2&overallStatus=blocked" }, db);
    expect((await getRenewalDeskPreference(pat, db))?.view).toBe(
      "v=2&overallStatus=blocked",
    );
  });

  it("BEH-S166-11 / AC-S166-2: two accounts keep distinct views through the route and neither reads the other's", async () => {
    await POST(post({ query: SAVED }));
    state.user = lee;
    expect(await (await GET()).json()).toEqual({ preference: null });
    await POST(post({ query: "v=2&overallStatus=blocked" }));
    expect(await (await GET()).json()).toMatchObject({
      preference: { view: "v=2&overallStatus=blocked" },
    });
    state.user = pat;
    expect(await (await GET()).json()).toMatchObject({ preference: { view: SAVED } });
    const all = await db.collection(RENEWAL_DESK_PREFERENCE_COLLECTION).get();
    expect(all.size).toBe(2);
  });

  it("AC-S166-2: no client can read or write a remembered view, including the account that owns it", async () => {
    await saveRenewalDeskPreference(pat, { query: SAVED }, db);
    const path = `${RENEWAL_DESK_PREFERENCE_COLLECTION}/${renewalDeskPreferenceDocId(pat.uid)}`;
    for (const context of [
      testEnv.authenticatedContext(pat.uid, {
        email: pat.email,
        hd: "pmikcmetro.com",
        role: "Editor",
      }),
      testEnv.authenticatedContext(lee.uid, {
        email: lee.email,
        hd: "pmikcmetro.com",
        role: "Admin",
      }),
      testEnv.unauthenticatedContext(),
    ]) {
      const client = context.firestore();
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { view: "v=2&scope=all" }));
    }
    expect((await getRenewalDeskPreference(pat, db))?.view).toBe(SAVED);
  });

  it("keeps a verification account effect-free", async () => {
    state.user = canary;
    expect((await POST(post({ query: SAVED }))).status).toBe(403);
    expect((await db.collection(RENEWAL_DESK_PREFERENCE_COLLECTION).get()).size).toBe(0);
    expect(await (await GET()).json()).toEqual({ preference: null });
  });

  it("BEH-S166-13 / AC-S166-2: saving a view leaves each account's AI history owned and unreadable by the other", async () => {
    await beginAssistantTurn(
      pat,
      {
        operationId: OP,
        conversationKey: OP,
        question: "What leases are due this week?",
      },
      db,
    );
    await saveRenewalDeskPreference(pat, { query: SAVED }, db);
    await saveRenewalDeskPreference(lee, { query: "v=2&scope=all" }, db);
    expect((await listAssistantConversations(pat, {}, db)).conversations).toHaveLength(1);
    expect((await listAssistantConversations(lee, {}, db)).conversations).toHaveLength(0);
    const leeHistory = await db
      .collection(ASSISTANT_HISTORY_COLLECTIONS.users)
      .doc(historyOwnerKey(lee.uid))
      .collection(ASSISTANT_HISTORY_COLLECTIONS.conversations)
      .get();
    expect(leeHistory.size).toBe(0);
  });
});
