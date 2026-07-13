import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashConfirmationToken } from "@/lib/gmail-hub/contracts";
import {
  GmailAmbiguousSendError,
  GmailHubError,
  GmailHubService,
} from "@/lib/gmail-hub/service";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import type {
  GmailOutgoingMessage,
  GmailSendResult,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";

const actor: AuthenticatedUser = {
  uid: "user-josiah",
  email: "josiah@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
};

function newMessage(subject: string, body: string, to = [actor.email]) {
  return { kind: "new" as const, to, cc: [], bcc: [], subject, body };
}

class FakeGmailClient extends GmailRuntimeClient {
  profileCalls = 0;
  sendCalls = 0;
  sentPayloads: GmailOutgoingMessage[] = [];
  sendError: Error | null = null;
  sendDelay: Promise<void> | null = null;
  reconcileResult: GmailSendResult | null = null;
  labelsApplied: Array<{ threadId: string; labelName: string }> = [];
  thread: GmailThreadView = {
    id: "thread-1",
    truncated: false,
    messages: [
      {
        id: "message-parent",
        threadId: "thread-1",
        labelIds: ["INBOX"],
        from: actor.email,
        to: [actor.email],
        cc: [],
        bcc: [],
        subject: "Self thread proof",
        date: "Mon, 13 Jul 2026 12:00:00 -0500",
        messageId: "<parent@pmikcmetro.com>",
        references: ["<root@pmikcmetro.com>"],
        bodyText: "Synthetic parent",
        bodyTruncated: false,
        attachments: [],
      },
    ],
  };

  constructor(subject = actor.email) {
    super({
      subject,
      transport: {
        async send() {
          throw new Error("unexpected transport call");
        },
      },
      getToken: async () => "unused",
    });
  }

  override async getThread() {
    return structuredClone(this.thread);
  }

  override async getProfile() {
    this.profileCalls += 1;
    return {
      emailAddress: actor.email,
      messagesTotal: 2,
      threadsTotal: 1,
      historyId: "123",
    };
  }

  override async sendMessage(payload: GmailOutgoingMessage) {
    this.sendCalls += 1;
    this.sentPayloads.push(structuredClone(payload));
    if (this.sendDelay) await this.sendDelay;
    if (this.sendError) throw this.sendError;
    return {
      messageId: "sent-1",
      threadId: payload.threadId ?? "thread-new",
      labelIds: ["SENT"],
    };
  }

  override async findMessageByRfcMessageId() {
    return this.reconcileResult;
  }

  override async applyThreadLabel(threadId: string, labelName: string) {
    this.labelsApplied.push({ threadId, labelName });
    return {
      threadId,
      labelId: "Label_1",
      labelName,
      labelIds: ["INBOX", "Label_1"],
    };
  }
}

function service(
  options: {
    client?: FakeGmailClient;
    store?: MemoryGmailStateStore;
    now?: () => number;
    token?: string;
    gates?: readonly string[];
  } = {},
) {
  const client = options.client ?? new FakeGmailClient();
  const store = options.store ?? new MemoryGmailStateStore();
  const gates = new Set(
    options.gates ?? [
      "gmail.mailbox.read",
      "gmail.draft.create",
      "gmail.message.send",
      "gmail.thread.reply",
      "gmail.label.apply",
    ],
  );
  return {
    client,
    store,
    hub: new GmailHubService(actor, {
      client,
      store,
      isActionExecutable: (action) => gates.has(action),
      now: options.now,
      createToken: () => options.token ?? "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    }),
  };
}

describe("GmailHubService connection", () => {
  it("reports the signed-in mailbox connected through the committed read gate", async () => {
    const client = new FakeGmailClient();
    const hub = new GmailHubService(actor, {
      client,
      store: new MemoryGmailStateStore(),
      isActionExecutable,
    });

    await expect(hub.connection()).resolves.toMatchObject({
      status: "connected",
      mailboxEmail: actor.email,
      profile: { emailAddress: actor.email },
      sync: { health: "manual" },
    });
    expect(client.profileCalls).toBe(1);
    expect(isActionExecutable("gmail.message.send")).toBe(true);
    expect(isActionExecutable("gmail.thread.reply")).toBe(true);
  });
});

describe("GmailHubService exact-message sending (AC-S19-4, AC-S19-5)", () => {
  it("binds a one-time confirmation to the authenticated user's reviewed recipients", async () => {
    const { hub, store } = service();
    const prepared = await hub.prepareSendConfirmation(
      newMessage("External recipient proof", "Synthetic test body", ["dan@example.com"]),
    );

    expect(prepared.payload).toMatchObject({
      from: actor.email,
      to: ["dan@example.com"],
      cc: [],
      bcc: [],
      subject: "External recipient proof",
      body: "Synthetic test body",
    });
    const record = store.confirmations.get(
      hashConfirmationToken(prepared.confirmationToken),
    );
    expect(record).toMatchObject({ actor_uid: actor.uid, state: "pending" });
    expect(JSON.stringify(record)).not.toContain("Synthetic test body");
    expect(JSON.stringify(store.audit)).not.toContain("Synthetic test body");
  });

  it("rejects a missing confirmation or any changed exact payload before Gmail", async () => {
    const { hub, client } = service();
    const prepared = await hub.prepareSendConfirmation(
      newMessage("Self proof", "Exact body"),
    );

    await expect(
      hub.sendConfirmed({
        confirmationToken: "different-token-abcdefghijklmnopqrstuvwxyz012345",
        payload: prepared.payload,
      }),
    ).rejects.toBeInstanceOf(GmailHubError);
    await expect(
      hub.sendConfirmed({
        confirmationToken: prepared.confirmationToken,
        payload: { ...prepared.payload, body: "Changed body" },
      }),
    ).rejects.toBeInstanceOf(GmailHubError);
    expect(client.sendCalls).toBe(0);
  });

  it("cannot use a valid confirmation to change the authenticated From mailbox", async () => {
    const { hub, client } = service();
    const prepared = await hub.prepareSendConfirmation(
      newMessage("Boundary proof", "Authenticated sender only", ["dan@example.com"]),
    );
    await expect(
      hub.sendConfirmed({
        confirmationToken: prepared.confirmationToken,
        payload: {
          ...prepared.payload,
          from: "dan@pmikcmetro.com",
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(client.sendCalls).toBe(0);
  });

  it("consumes no expired confirmation", async () => {
    let now = 1_000;
    const { hub, client } = service({ now: () => now });
    const prepared = await hub.prepareSendConfirmation(
      newMessage("Expiry proof", "Synthetic body"),
    );
    now += 10 * 60 * 1000 + 1;

    await expect(hub.sendConfirmed(prepared)).rejects.toThrow("expired");
    expect(client.sendCalls).toBe(0);
  });

  it("makes exactly one Gmail call across concurrent and repeated confirmations", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new FakeGmailClient();
    client.sendDelay = blocker;
    const { hub } = service({ client });
    const prepared = await hub.prepareSendConfirmation(
      newMessage("Double-click proof", "One attempt only"),
    );

    const first = hub.sendConfirmed(prepared);
    const second = hub.sendConfirmed(prepared);
    await Promise.resolve();
    release();
    const settled = await Promise.allSettled([first, second]);

    expect(client.sendCalls).toBe(1);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(hub.sendConfirmed(prepared)).resolves.toMatchObject({ duplicate: true });
    expect(client.sendCalls).toBe(1);
  });

  it("never retries an ambiguous send and reconciles by its unique RFC Message-ID", async () => {
    const client = new FakeGmailClient();
    client.sendError = new GmailRuntimeError("unclear", undefined, true);
    const { hub, store } = service({ client });
    const prepared = await hub.prepareSendConfirmation(
      newMessage("Ambiguity proof", "Do not retry"),
    );

    await expect(hub.sendConfirmed(prepared)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );
    await expect(hub.sendConfirmed(prepared)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );
    expect(client.sendCalls).toBe(1);

    client.reconcileResult = {
      messageId: "reconciled-message",
      threadId: "reconciled-thread",
      labelIds: ["SENT"],
    };
    await expect(hub.reconcileSend(prepared.confirmationToken)).resolves.toMatchObject({
      status: "sent",
      result: { messageId: "reconciled-message", threadId: "reconciled-thread" },
    });
    const record = store.confirmations.get(
      hashConfirmationToken(prepared.confirmationToken),
    );
    expect(record?.state).toBe("sent");
  });

  it("builds a reply from the live parent with matching subject and RFC thread headers", async () => {
    const { hub } = service();
    const prepared = await hub.prepareSendConfirmation({
      kind: "reply",
      threadId: "thread-1",
      body: "Synthetic reply",
    });

    expect(prepared.payload).toMatchObject({
      threadId: "thread-1",
      subject: "Self thread proof",
      inReplyTo: "<parent@pmikcmetro.com>",
      references: ["<root@pmikcmetro.com>", "<parent@pmikcmetro.com>"],
    });
  });

  it("applies a bounded user label through its separately gated action", async () => {
    const { hub, client } = service();
    await expect(hub.applyThreadLabel("thread-1", "Waiting on Team")).resolves.toEqual({
      threadId: "thread-1",
      labelId: "Label_1",
      labelName: "Waiting on Team",
      labelIds: ["INBOX", "Label_1"],
    });
    expect(client.labelsApplied).toEqual([
      { threadId: "thread-1", labelName: "Waiting on Team" },
    ]);
  });

  it("refuses a Gmail client for any mailbox other than the authenticated actor", () => {
    const client = new FakeGmailClient("dan@pmikcmetro.com");
    expect(
      () =>
        new GmailHubService(actor, {
          client,
          store: new MemoryGmailStateStore(),
          isActionExecutable: () => true,
        }),
    ).toThrow("did not match the signed-in user");
  });
});
