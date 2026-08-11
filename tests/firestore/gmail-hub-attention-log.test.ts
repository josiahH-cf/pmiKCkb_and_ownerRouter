import { createHash } from "node:crypto";

import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  GMAIL_HUB_ACTIONS,
  GMAIL_WATCH_GOVERNING_ACTION_KEY,
} from "@/lib/gmail-hub/action-keys";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import {
  FirestoreGmailStateStore,
  GMAIL_STATE_COLLECTIONS,
  gmailMailboxKey,
  type GmailConfirmationRecord,
  type GmailMailboxState,
} from "@/lib/gmail-hub/state-store";
import type { LiveEffectAttentionEmitter } from "@/lib/operations/live-effect-attention-log";

const projectId = "pmi-kc-kb-gmail-hub-attention-log-test";
const actorUid = "managed-operator";
const mailboxEmail = "operator@pmikcmetro.com";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `gmail-hub-attention-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("Gmail reply A2 transition seam", () => {
  it.each(["failed", "ambiguous"] as const)(
    "emits one opaque value-free event after the LIVE %s transition commits",
    async (state) => {
      const id = `resident@example.invalid Tenant Name Unit 123 ${state}`;
      await seedConfirmation(confirmation(id, "sending"));
      const observedStates: string[] = [];
      const emitAttention = vi.fn(async (event) => {
        const committed = await db
          .collection(GMAIL_STATE_COLLECTIONS.confirmations)
          .doc(id)
          .get();
        observedStates.push(String(committed.data()?.state));
        expect(JSON.stringify(event)).not.toMatch(
          /resident@example\.invalid|Tenant Name|Unit 123/,
        );
      });
      const store = gmailStore("live", emitAttention);

      await store.markConfirmationOutcome({
        id,
        actorUid,
        state,
        nowMs: 2_000,
      });

      expect(observedStates).toEqual([state]);
      expect(emitAttention).toHaveBeenCalledWith({
        marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
        action_key: GMAIL_HUB_ACTIONS.reply,
        execution_id: opaqueId("reply", id),
        state,
        data_mode: "live",
      });
      await store.markConfirmationOutcome({
        id,
        actorUid,
        state,
        nowMs: 3_000,
      });
      expect(emitAttention).toHaveBeenCalledTimes(1);
    },
  );

  it("emits once for concurrent replays of the same terminal transition", async () => {
    const id = "concurrent-reply-transition";
    await seedConfirmation(confirmation(id, "sending"));
    const emitAttention = vi.fn();
    const store = gmailStore("live", emitAttention);

    await Promise.all([
      store.markConfirmationOutcome({
        id,
        actorUid,
        state: "failed",
        nowMs: 2_000,
      }),
      store.markConfirmationOutcome({
        id,
        actorUid,
        state: "failed",
        nowMs: 2_001,
      }),
    ]);

    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(store.getConfirmation(id)).resolves.toMatchObject({
      state: "failed",
    });
  });

  it("suppresses Test events while preserving the durable transition", async () => {
    const id = "test-reply-transition";
    await seedConfirmation(confirmation(id, "sending"));
    const emitAttention = vi.fn();
    const store = gmailStore("test", emitAttention);

    await store.markConfirmationOutcome({
      id,
      actorUid,
      state: "ambiguous",
      nowMs: 2_000,
    });

    expect(emitAttention).not.toHaveBeenCalled();
    await expect(store.getConfirmation(id)).resolves.toMatchObject({
      state: "ambiguous",
    });
  });

  it("keeps the committed state when the injected alert sink rejects", async () => {
    const id = "reply-sink-failure";
    await seedConfirmation(confirmation(id, "sending"));
    const emitAttention = vi.fn(async () => {
      throw new Error("fixture alert sink unavailable");
    });
    const store = gmailStore("live", emitAttention);

    await expect(
      store.markConfirmationOutcome({
        id,
        actorUid,
        state: "failed",
        nowMs: 2_000,
      }),
    ).resolves.toBeUndefined();

    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(store.getConfirmation(id)).resolves.toMatchObject({
      state: "failed",
    });
  });

  it("does not emit or mutate without the sending-to-terminal compare-and-set", async () => {
    const id = "unclaimed-reply";
    await seedConfirmation(confirmation(id, "pending"));
    const emitAttention = vi.fn();
    const store = gmailStore("live", emitAttention);

    await store.markConfirmationOutcome({
      id,
      actorUid,
      state: "failed",
      nowMs: 2_000,
    });
    await store.markConfirmationOutcome({
      id,
      actorUid: "different-operator",
      state: "ambiguous",
      nowMs: 2_001,
    });

    expect(emitAttention).not.toHaveBeenCalled();
    await expect(store.getConfirmation(id)).resolves.toMatchObject({
      state: "pending",
    });
  });
});

describe("Gmail watch A2 transition seam", () => {
  it("emits one opaque value-free event after an explicit ambiguous transition commits", async () => {
    const attemptKeyHash = "resident@example.invalid Tenant Name Unit 123";
    await seedMailbox(watchState(attemptKeyHash));
    const observedStates: string[] = [];
    const emitAttention = vi.fn(async (event) => {
      const committed = await db
        .collection(GMAIL_STATE_COLLECTIONS.mailboxState)
        .doc(gmailMailboxKey(mailboxEmail))
        .get();
      observedStates.push(String(committed.data()?.watch_attempt?.state));
      expect(JSON.stringify(event)).not.toMatch(
        /resident@example\.invalid|Tenant Name|Unit 123|operator@pmikcmetro\.com/,
      );
    });
    const store = gmailStore("live", emitAttention);

    await store.markWatchAttemptAmbiguous({
      mailboxEmail,
      actorUid,
      attemptKeyHash,
      nowMs: 2_000,
    });

    expect(observedStates).toEqual(["ambiguous"]);
    expect(emitAttention).toHaveBeenCalledWith({
      marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
      action_key: GMAIL_WATCH_GOVERNING_ACTION_KEY,
      execution_id: opaqueId("watch", attemptKeyHash),
      state: "ambiguous",
      data_mode: "live",
    });
    await store.markWatchAttemptAmbiguous({
      mailboxEmail,
      actorUid,
      attemptKeyHash,
      nowMs: 3_000,
    });
    expect(emitAttention).toHaveBeenCalledTimes(1);
  });

  // Two real emulator transactions can serialize beyond Vitest's five-second default on the
  // supported Windows/WSL mount. Keep the concurrency assertion unchanged and bound only this case.
  it("emits once for concurrent explicit ambiguous transitions", async () => {
    const attemptKeyHash = "concurrent-watch-transition";
    await seedMailbox(watchState(attemptKeyHash));
    const emitAttention = vi.fn();
    const store = gmailStore("live", emitAttention);

    await Promise.all([
      store.markWatchAttemptAmbiguous({
        mailboxEmail,
        actorUid,
        attemptKeyHash,
        nowMs: 2_000,
      }),
      store.markWatchAttemptAmbiguous({
        mailboxEmail,
        actorUid,
        attemptKeyHash,
        nowMs: 2_001,
      }),
    ]);

    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(store.getMailboxState(mailboxEmail)).resolves.toMatchObject({
      watch_attempt: { state: "ambiguous" },
    });
  }, 15_000);

  it.each([
    ["same-key stale replay", "stale-watch-attempt"],
    ["different-key stale replacement", "incoming-watch-attempt"],
  ])("emits for the %s branch inside claimWatchAttempt", async (_name, incomingKey) => {
    const priorAttemptKeyHash = "stale-watch-attempt";
    await seedMailbox(watchState(priorAttemptKeyHash, 1_000));
    const emitAttention = vi.fn();
    const store = gmailStore("live", emitAttention);

    await expect(
      store.claimWatchAttempt({
        mailboxEmail,
        actorUid,
        attemptKeyHash: incomingKey,
        topicHash: "topic-hash",
        observedExpirationMs: 900_000,
        nowMs: 301_000,
      }),
    ).resolves.toMatchObject({ status: "ambiguous" });

    expect(emitAttention).toHaveBeenCalledTimes(1);
    expect(emitAttention).toHaveBeenCalledWith({
      marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
      action_key: GMAIL_HUB_ACTIONS.read,
      execution_id: opaqueId("watch", priorAttemptKeyHash),
      state: "ambiguous",
      data_mode: "live",
    });
  });

  it("suppresses Test events and survives a rejecting Live sink", async () => {
    const testAttempt = "test-watch-transition";
    await seedMailbox(watchState(testAttempt));
    const testEmitter = vi.fn();
    const testStore = gmailStore("test", testEmitter);

    await testStore.markWatchAttemptAmbiguous({
      mailboxEmail,
      actorUid,
      attemptKeyHash: testAttempt,
      nowMs: 2_000,
    });
    expect(testEmitter).not.toHaveBeenCalled();
    await expect(testStore.getMailboxState(mailboxEmail)).resolves.toMatchObject({
      watch_attempt: { state: "ambiguous" },
    });

    await testEnv.clearFirestore();
    const liveAttempt = "watch-sink-failure";
    await seedMailbox(watchState(liveAttempt));
    const rejectingEmitter = vi.fn(async () => {
      throw new Error("fixture alert sink unavailable");
    });
    const liveStore = gmailStore("live", rejectingEmitter);

    await expect(
      liveStore.markWatchAttemptAmbiguous({
        mailboxEmail,
        actorUid,
        attemptKeyHash: liveAttempt,
        nowMs: 2_000,
      }),
    ).resolves.toBeUndefined();
    expect(rejectingEmitter).toHaveBeenCalledTimes(1);
    await expect(liveStore.getMailboxState(mailboxEmail)).resolves.toMatchObject({
      watch_attempt: { state: "ambiguous" },
    });
  });
});

function gmailStore(
  dataMode: "live" | "test",
  emitAttention: LiveEffectAttentionEmitter,
) {
  return new FirestoreGmailStateStore({ db, dataMode, emitAttention });
}

async function seedConfirmation(record: GmailConfirmationRecord) {
  await db.collection(GMAIL_STATE_COLLECTIONS.confirmations).doc(record.id).set(record);
}

function confirmation(
  id: string,
  state: GmailConfirmationRecord["state"],
): GmailConfirmationRecord {
  return {
    id,
    actor_uid: actorUid,
    mailbox_email: mailboxEmail,
    payload_hash: "a".repeat(64),
    message_id: "<synthetic-message@pmikcmetro.com>",
    message_kind: "reply",
    state,
    usable_until_ms: 600_000,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    workflow_context_key: "b".repeat(64),
    workflow_lane: "maintenance",
    workflow_entity_type: "maintenance_ticket",
    workflow_entity_id: "synthetic-ticket",
    workflow_purpose: "maintenance_owner",
    template_ref: "maintenance-owner:v1.0",
    ...communicationsRetentionFields("confirmation", 1_000),
  };
}

async function seedMailbox(state: GmailMailboxState) {
  await db
    .collection(GMAIL_STATE_COLLECTIONS.mailboxState)
    .doc(gmailMailboxKey(state.mailbox_email))
    .set(state);
}

function watchState(attemptKeyHash: string, updatedAtMs = 1_000): GmailMailboxState {
  return {
    mailbox_email: mailboxEmail,
    user_uid: actorUid,
    history_id: "100",
    watch_expiration_ms: 900_000,
    health: "watching",
    updated_at_ms: updatedAtMs,
    watch_attempt: {
      attempt_key_hash: attemptKeyHash,
      topic_hash: "topic-hash",
      state: "claimed",
      claimed_at_ms: updatedAtMs,
      updated_at_ms: updatedAtMs,
    },
  };
}

function opaqueId(kind: "reply" | "watch", source: string) {
  return `gmail_${kind}_${createHash("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 48)}`;
}
