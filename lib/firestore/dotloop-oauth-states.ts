// S106: server-side, single-use CSRF state for the Dotloop authorization-code flow.
//
// The state never leaves the server except as the opaque `state` query parameter, and it can be
// consumed exactly once inside a transaction, so a forged or replayed callback cannot create a
// connection. The record carries no token, no provider payload, and no customer value.

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { DotloopOAuthStateStore } from "@/lib/connections/dotloop-connection-service";

export const DOTLOOP_OAUTH_STATES_COLLECTION = "dotloop_oauth_states";

/** An authorization that is not completed within this window is no longer claimable. */
export const DOTLOOP_OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export const DOTLOOP_OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export class FirestoreDotloopOAuthStateStore implements DotloopOAuthStateStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async mint(input: { state: string; actorUid: string; nowIso: string }): Promise<void> {
    if (!DOTLOOP_OAUTH_STATE_PATTERN.test(input.state)) {
      throw new Error("A Dotloop authorization state must be an opaque bounded token.");
    }
    await this.ref(input.state).create({
      state: input.state,
      actor_uid: input.actorUid,
      created_at: input.nowIso,
      expires_at: new Date(
        Date.parse(input.nowIso) + DOTLOOP_OAUTH_STATE_TTL_MS,
      ).toISOString(),
      consumed_at: null,
      recorded_at: FieldValue.serverTimestamp(),
    });
  }

  /** Consume once. An unknown, expired, or already-consumed state returns null. */
  async consume(input: {
    state: string;
    nowIso: string;
  }): Promise<{ actorUid: string } | null> {
    if (!DOTLOOP_OAUTH_STATE_PATTERN.test(input.state)) return null;
    const ref = this.ref(input.state);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const data = snapshot.data() ?? {};
      if (data.consumed_at) return null;
      const expiresAt = String(data.expires_at ?? "");
      if (expiresAt === "" || input.nowIso > expiresAt) return null;
      const actorUid = String(data.actor_uid ?? "");
      if (actorUid === "") return null;
      transaction.update(ref, { consumed_at: input.nowIso });
      return { actorUid };
    });
  }

  private ref(state: string) {
    return this.db.collection(DOTLOOP_OAUTH_STATES_COLLECTION).doc(state);
  }
}
