import { afterEach, describe, expect, it } from "vitest";

import {
  GmailPushAuthError,
  setGmailPushOidcVerifierForTest,
  verifyPubSubPushRequest,
  type GmailPushConfig,
} from "@/lib/gmail-hub/pubsub";
import { processGmailPushNotification } from "@/lib/gmail-hub/service";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";

const mailbox = "josiah@pmikcmetro.com";
const config: GmailPushConfig = {
  topicName: "projects/pmi-kc-kb-prod/topics/gmail-inbox",
  expectedAudience: "https://example.test/api/gmail-hub/pubsub",
  pushServiceAccount: "gmail-push@pmi-kc-kb-prod.iam.gserviceaccount.com",
  allowedDomain: "pmikcmetro.com",
};

function pushRequest(notification: unknown, overrides: Record<string, unknown> = {}) {
  return new Request(config.expectedAudience, {
    method: "POST",
    headers: { authorization: "Bearer signed-oidc" },
    body: JSON.stringify({
      message: {
        data: Buffer.from(JSON.stringify(notification), "utf8").toString("base64url"),
        messageId: "pubsub-1",
      },
      subscription: "projects/pmi-kc-kb-prod/subscriptions/gmail-push",
      ...overrides,
    }),
  });
}

class HistoryClient extends GmailRuntimeClient {
  historyCalls = 0;
  failHistory404 = false;
  alwaysMoreHistory = false;
  threadCalls = 0;
  listThreadCalls = 0;

  constructor() {
    super({
      subject: mailbox,
      transport: {
        async send() {
          throw new Error("unexpected transport call");
        },
      },
      getToken: async () => "unused",
    });
  }

  override async listHistory() {
    this.historyCalls += 1;
    if (this.failHistory404) {
      throw new GmailRuntimeError("expired history", 404, false);
    }
    return {
      historyId: "150",
      messagesAdded: [{ id: "message-1", threadId: "thread-1" }],
      ...(this.alwaysMoreHistory ? { nextPageToken: `page-${this.historyCalls}` } : {}),
    };
  }

  override async getProfile() {
    return {
      emailAddress: mailbox,
      messagesTotal: 10,
      threadsTotal: 5,
      historyId: "200",
    };
  }

  override async listThreads() {
    this.listThreadCalls += 1;
    return {
      threads: [{ id: "thread-1", snippet: "Synthetic" }],
      resultSizeEstimate: 1,
    };
  }

  override async getThread(): Promise<never> {
    this.threadCalls += 1;
    throw new Error("Push processing must not fetch Gmail thread content.");
  }
}

async function seedLinkedCommunication(store: MemoryGmailStateStore) {
  await store.saveCommunicationLink({
    id: "communication-1",
    actor_uid: "user-josiah",
    mailbox_key: gmailMailboxKey(mailbox),
    lane: "maintenance",
    entity_type: "maintenance_ticket",
    entity_id: "ticket-1",
    purpose: "maintenance_owner",
    origin_action_key: "gmail.mailbox.read",
    source_refs: ["maintenance_ticket:ticket-1"],
    gmail_thread_id: "thread-1",
    status: "linked",
    created_at_ms: 1,
    updated_at_ms: 1,
    expires_at_ms: Number.MAX_SAFE_INTEGER,
  });
}

afterEach(() => setGmailPushOidcVerifierForTest(null));

describe("authenticated Gmail Pub/Sub push (AC-S19-6)", () => {
  it("validates OIDC audience/service identity before parsing the body", async () => {
    let audience = "";
    setGmailPushOidcVerifierForTest(async (_token, expectedAudience) => {
      audience = expectedAudience;
      return { email: "attacker@example.com", email_verified: true };
    });
    const malformedBody = new Request(config.expectedAudience, {
      method: "POST",
      headers: { authorization: "Bearer signed-oidc" },
      body: "definitely not JSON",
    });

    await expect(verifyPubSubPushRequest(malformedBody, config)).rejects.toMatchObject({
      status: 403,
    });
    expect(audience).toBe(config.expectedAudience);
  });

  it("accepts only a verified pmikcmetro.com mailbox notification", async () => {
    setGmailPushOidcVerifierForTest(async () => ({
      email: config.pushServiceAccount,
      email_verified: true,
    }));
    await expect(
      verifyPubSubPushRequest(
        pushRequest({ emailAddress: mailbox, historyId: "101" }),
        config,
      ),
    ).resolves.toEqual({
      messageId: "pubsub-1",
      mailboxEmail: mailbox,
      historyId: "101",
      subscription: "projects/pmi-kc-kb-prod/subscriptions/gmail-push",
    });

    await expect(
      verifyPubSubPushRequest(
        pushRequest({ emailAddress: "person@gmail.com", historyId: "101" }),
        config,
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it("accepts the official wrapped push aliases and optional metadata", async () => {
    setGmailPushOidcVerifierForTest(async () => ({
      email: config.pushServiceAccount,
      email_verified: true,
    }));
    const notification = { emailAddress: mailbox, historyId: 101 };
    const request = new Request(config.expectedAudience, {
      method: "POST",
      headers: { authorization: "Bearer signed-oidc" },
      body: JSON.stringify({
        deliveryAttempt: 2,
        delivery_attempt: 2,
        message: {
          data: Buffer.from(JSON.stringify(notification), "utf8").toString("base64"),
          messageId: "pubsub-1",
          message_id: "pubsub-1",
          publishTime: "2026-07-13T20:22:00Z",
          publish_time: "2026-07-13T20:22:00Z",
          orderingKey: "",
          ordering_key: "",
          attributes: {},
          futureMetadata: "ignored-after-OIDC",
        },
        subscription: "projects/pmi-kc-kb-prod/subscriptions/gmail-push",
      }),
    });

    await expect(verifyPubSubPushRequest(request, config)).resolves.toMatchObject({
      messageId: "pubsub-1",
      mailboxEmail: mailbox,
      historyId: "101",
    });
  });

  it("deduplicates replay and advances the stored history cursor", async () => {
    const store = new MemoryGmailStateStore();
    const client = new HistoryClient();
    await store.saveMailboxState({
      mailbox_email: mailbox,
      user_uid: "user-josiah",
      history_id: "100",
      health: "watching",
      updated_at_ms: 1,
    });
    const input = {
      messageId: "pubsub-1",
      mailboxEmail: mailbox,
      historyId: "120",
      store,
      client,
      now: () => 2,
    };

    await expect(processGmailPushNotification(input)).resolves.toMatchObject({
      status: "processed",
      historyId: "150",
      addedCount: 1,
    });
    await expect(processGmailPushNotification(input)).resolves.toMatchObject({
      status: "duplicate",
    });
    expect(client.historyCalls).toBe(1);
    expect(client.threadCalls).toBe(0);
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("150");

    await store.completePush({
      messageId: "pubsub-older",
      mailboxEmail: mailbox,
      historyId: "125",
      addedCount: 0,
      mode: "history",
      nowMs: 3,
    });
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("150");
  });

  it("advances only the cursor after history expiration without scanning inbox content", async () => {
    const store = new MemoryGmailStateStore();
    const client = new HistoryClient();
    client.failHistory404 = true;
    await store.saveMailboxState({
      mailbox_email: mailbox,
      user_uid: "user-josiah",
      history_id: "1",
      health: "watching",
      updated_at_ms: 1,
    });

    await expect(
      processGmailPushNotification({
        messageId: "pubsub-expired",
        mailboxEmail: mailbox,
        historyId: "200",
        store,
        client,
        now: () => 2,
      }),
    ).resolves.toEqual({
      status: "bounded_resync",
      addedCount: 0,
      matchedCount: 0,
      historyId: "200",
    });
    expect(client.listThreadCalls).toBe(0);
    expect(client.threadCalls).toBe(0);
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("200");
  });

  it("falls back to cursor-only resync instead of scanning on excess history pages", async () => {
    const store = new MemoryGmailStateStore();
    const client = new HistoryClient();
    client.alwaysMoreHistory = true;
    await store.saveMailboxState({
      mailbox_email: mailbox,
      user_uid: "user-josiah",
      history_id: "1",
      health: "watching",
      updated_at_ms: 1,
    });

    await expect(
      processGmailPushNotification({
        messageId: "pubsub-overflow",
        mailboxEmail: mailbox,
        historyId: "200",
        store,
        client,
        now: () => 2,
      }),
    ).resolves.toMatchObject({ status: "bounded_resync", historyId: "200" });
    expect(client.historyCalls).toBe(5);
    expect(client.listThreadCalls).toBe(0);
    expect(client.threadCalls).toBe(0);
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("200");
  });

  it("creates one bodyless attention update for a linked thread and none for replays", async () => {
    const store = new MemoryGmailStateStore();
    const client = new HistoryClient();
    await store.saveMailboxState({
      mailbox_email: mailbox,
      user_uid: "user-josiah",
      history_id: "100",
      health: "watching",
      updated_at_ms: 1,
    });
    await seedLinkedCommunication(store);

    await expect(
      processGmailPushNotification({
        messageId: "pubsub-linked-1",
        mailboxEmail: mailbox,
        historyId: "120",
        store,
        client,
        now: () => 2,
      }),
    ).resolves.toMatchObject({ matchedCount: 1 });
    await expect(
      processGmailPushNotification({
        messageId: "pubsub-linked-2",
        mailboxEmail: mailbox,
        historyId: "121",
        store,
        client,
        now: () => 3,
      }),
    ).resolves.toMatchObject({ matchedCount: 0 });

    expect(store.communicationLinks.get("communication-1")).toMatchObject({
      status: "attention_required",
      last_message_id: "message-1",
    });
    expect(client.threadCalls).toBe(0);
    expect(JSON.stringify(store.audit)).not.toContain("Synthetic");
  });

  it("rejects missing bearer authentication", async () => {
    const request = pushRequest({ emailAddress: mailbox, historyId: "101" });
    request.headers.delete("authorization");
    await expect(verifyPubSubPushRequest(request, config)).rejects.toBeInstanceOf(
      GmailPushAuthError,
    );
  });
});
