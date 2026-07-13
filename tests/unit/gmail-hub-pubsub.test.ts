import { afterEach, describe, expect, it } from "vitest";

import {
  GmailPushAuthError,
  setGmailPushOidcVerifierForTest,
  verifyPubSubPushRequest,
  type GmailPushConfig,
} from "@/lib/gmail-hub/pubsub";
import { processGmailPushNotification } from "@/lib/gmail-hub/service";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";

const mailbox = "josiah@pmikcmetro.com";
const config: GmailPushConfig = {
  topicName: "projects/pmi-kc-kb-prod/topics/gmail-inbox",
  expectedAudience: "https://example.test/api/gmail-hub/pubsub",
  pushServiceAccount: "gmail-push@pmi-kc-kb-prod.iam.gserviceaccount.com",
  pilotUsers: [mailbox],
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
    return {
      threads: [{ id: "thread-1", snippet: "Synthetic" }],
      resultSizeEstimate: 1,
    };
  }
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

  it("accepts only a verified pilot mailbox notification", async () => {
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

  it("performs only the bounded recent-inbox resync after history expiration", async () => {
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
      addedCount: 1,
      historyId: "200",
    });
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("200");
  });

  it("falls back to a bounded recent-inbox resync instead of skipping excess history pages", async () => {
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
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("200");
  });

  it("rejects missing bearer authentication", async () => {
    const request = pushRequest({ emailAddress: mailbox, historyId: "101" });
    request.headers.delete("authorization");
    await expect(verifyPubSubPushRequest(request, config)).rejects.toBeInstanceOf(
      GmailPushAuthError,
    );
  });
});
