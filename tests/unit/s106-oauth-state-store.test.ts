// S106 AC-S106-2 (fail-first): the stored authorization state is single use and bound to the Admin
// who started it. Another actor's callback burns it, an expired state never connects, and no
// outcome can be replayed.

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import {
  DOTLOOP_OAUTH_STATES_COLLECTION,
  FirestoreDotloopOAuthStateStore,
} from "@/lib/firestore/dotloop-oauth-states";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const STATE = "0f1e2d3c-4b5a-4968-8776-655443322110";
const minted = "2026-10-07T12:00:00.000Z";
const later = "2026-10-07T12:05:00.000Z";

async function mintedStore() {
  const db = new FakeTransactionalFirestore();
  const store = new FirestoreDotloopOAuthStateStore(db as unknown as Firestore);
  await store.mint({ state: STATE, actorUid: "admin-1", nowIso: minted });
  return { db, store };
}

describe("S106 single-use, actor-bound authorization state (AC-S106-2)", () => {
  it("returns the starting actor once and refuses the replay", async () => {
    const { db, store } = await mintedStore();
    await expect(
      store.consume({ state: STATE, nowIso: later, actorUid: "admin-1" }),
    ).resolves.toEqual({ actorUid: "admin-1" });
    await expect(
      store.consume({ state: STATE, nowIso: later, actorUid: "admin-1" }),
    ).resolves.toBeNull();
    expect(db.read(`${DOTLOOP_OAUTH_STATES_COLLECTION}/${STATE}`)).toMatchObject({
      consumed_at: later,
      consume_outcome: "consumed",
    });
  });

  it("burns a state presented by another signed-in actor", async () => {
    const { db, store } = await mintedStore();
    await expect(
      store.consume({ state: STATE, nowIso: later, actorUid: "admin-2" }),
    ).resolves.toBeNull();
    await expect(
      store.consume({ state: STATE, nowIso: later, actorUid: "admin-1" }),
    ).resolves.toBeNull();
    expect(db.read(`${DOTLOOP_OAUTH_STATES_COLLECTION}/${STATE}`)).toMatchObject({
      consume_outcome: "other_actor",
    });
  });

  it("never connects from an expired state", async () => {
    const { store } = await mintedStore();
    await expect(
      store.consume({
        state: STATE,
        nowIso: "2026-10-07T12:16:00.000Z",
        actorUid: "admin-1",
      }),
    ).resolves.toBeNull();
  });

  it("refuses malformed state and a missing actor without a read", async () => {
    const { store } = await mintedStore();
    await expect(
      store.consume({ state: "short", nowIso: later, actorUid: "admin-1" }),
    ).resolves.toBeNull();
    await expect(
      store.consume({ state: STATE, nowIso: later, actorUid: "" }),
    ).resolves.toBeNull();
  });
});
