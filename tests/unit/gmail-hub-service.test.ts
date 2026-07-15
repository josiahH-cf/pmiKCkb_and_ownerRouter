import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { hashConfirmationToken } from "@/lib/gmail-hub/contracts";
import { WORKFLOW_REPLY_POLICY_REF } from "@/lib/gmail-hub/governed-artifacts";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import {
  GmailAmbiguousSendError,
  GmailHubError,
  GmailHubGateError,
  GmailHubService,
} from "@/lib/gmail-hub/service";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
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

function context(actionKey: string): WorkflowCommunicationContext {
  return {
    lane: "maintenance",
    entityType: "maintenance_ticket",
    entityId: "ticket-synthetic-1",
    purpose: "maintenance_owner",
    actionKey,
    sourceRefs: ["maintenance_ticket:ticket-synthetic-1"],
    templateRef: "maintenance-owner:v1.0",
    replyPolicyRef: WORKFLOW_REPLY_POLICY_REF,
  };
}

function reply(body: string) {
  return {
    context: context("gmail.thread.reply"),
    message: { kind: "reply" as const, threadId: "thread-1", body },
  };
}

class FakeGmailClient extends GmailRuntimeClient {
  profileCalls = 0;
  draftCalls = 0;
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
        from: "Dan Example <dan@example.com>",
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

  override async createDraft() {
    this.draftCalls += 1;
    return {
      draftId: "draft-1",
      messageId: "draft-message-1",
      threadId: "thread-1",
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
    approveTemplates?: boolean;
  } = {},
) {
  const client = options.client ?? new FakeGmailClient();
  const store = options.store ?? new MemoryGmailStateStore();
  const linkAnchorMs = options.now?.() ?? Date.now();
  store.communicationLinks.set("link-1", {
    id: "link-1",
    actor_uid: actor.uid,
    mailbox_key: gmailMailboxKey(actor.email),
    lane: "maintenance",
    entity_type: "maintenance_ticket",
    entity_id: "ticket-synthetic-1",
    purpose: "maintenance_owner",
    origin_action_key: "gmail.mailbox.read",
    source_refs: ["maintenance_ticket:ticket-synthetic-1"],
    template_ref: "maintenance-owner:v1.0",
    reply_policy_ref: WORKFLOW_REPLY_POLICY_REF,
    gmail_thread_id: "thread-1",
    status: "linked",
    created_at_ms: linkAnchorMs,
    updated_at_ms: linkAnchorMs,
    ...communicationsRetentionFields("workflow_link", linkAnchorMs),
  });
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
      isApprovedWorkflowTemplate: () => options.approveTemplates ?? true,
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
    expect(isActionExecutable("gmail.message.send")).toBe(false);
    expect(isActionExecutable("gmail.thread.reply")).toBe(true);
  });
});

describe("GmailHubService draft gate", () => {
  it("blocks the default-seed draft action before calling the Gmail client", async () => {
    const client = new FakeGmailClient();
    const hub = new GmailHubService(actor, {
      client,
      store: new MemoryGmailStateStore(),
      isActionExecutable,
    });

    await expect(
      hub.createDraft({
        context: context("gmail.draft.create"),
        message: {
          kind: "reply",
          threadId: "thread-1",
          body: `${DRAFT_BANNER}\n\nSynthetic draft body`,
        },
      }),
    ).rejects.toBeInstanceOf(GmailHubGateError);
    expect(client.draftCalls).toBe(0);
  });
});

describe("GmailHubService exact-message sending (AC-GW-1, AC-GW-5)", () => {
  it("links one targeted thread and stores only a reason hash", async () => {
    const { hub, store } = service();
    await hub.linkExistingThread({
      context: context("gmail.mailbox.read"),
      threadId: "thread-1",
      reason: "Synthetic owner response for ticket review",
    });
    const saved = [...store.communicationLinks.values()].find(
      (link) => link.id !== "link-1",
    );
    expect(saved?.reason_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(saved)).not.toContain("Synthetic owner response");
  });

  it("binds a one-time confirmation to one linked workflow reply", async () => {
    const { hub, store } = service();
    const prepared = await hub.prepareSendConfirmation(reply("Synthetic test body"));

    expect(prepared.payload).toMatchObject({
      from: actor.email,
      to: ["dan@example.com"],
      cc: [],
      bcc: [],
      subject: "Self thread proof",
      body: "Synthetic test body",
    });
    const record = store.confirmations.get(
      hashConfirmationToken(prepared.confirmationToken),
    );
    expect(record).toMatchObject({
      actor_uid: actor.uid,
      state: "pending",
      workflow_entity_id: "ticket-synthetic-1",
      retention_policy_version: "communications-retention:v1.0",
      retention_class: "confirmation",
      legal_hold: false,
    });
    expect((record?.expires_at_ms ?? 0) - (record?.created_at_ms ?? 0)).toBe(
      30 * 24 * 60 * 60 * 1_000,
    );
    expect((record?.usable_until_ms ?? 0) - (record?.created_at_ms ?? 0)).toBe(
      10 * 60 * 1_000,
    );
    expect(JSON.stringify(record)).not.toContain("Synthetic test body");
    expect(JSON.stringify(store.audit)).not.toContain("Synthetic test body");
  });

  it("invalidates confirmation when policy or source context drifts", async () => {
    const { hub, client } = service();
    const prepared = await hub.prepareSendConfirmation(reply("Exact body"));

    await expect(
      hub.sendConfirmed({
        ...prepared,
        context: {
          ...prepared.context,
          replyPolicyRef: "workflow-reply:v1.1",
        },
      }),
    ).rejects.toBeInstanceOf(GmailHubError);
    await expect(
      hub.sendConfirmed({
        ...prepared,
        context: {
          ...prepared.context,
          sourceRefs: ["maintenance_ticket:changed"],
        },
      }),
    ).rejects.toBeInstanceOf(GmailHubError);
    expect(client.sendCalls).toBe(0);
  });

  it("rejects a missing confirmation or any changed exact payload before Gmail", async () => {
    const { hub, client } = service();
    const prepared = await hub.prepareSendConfirmation(reply("Exact body"));

    await expect(
      hub.sendConfirmed({
        context: prepared.context,
        confirmationToken: "different-token-abcdefghijklmnopqrstuvwxyz012345",
        payload: prepared.payload,
      }),
    ).rejects.toBeInstanceOf(GmailHubError);
    await expect(
      hub.sendConfirmed({
        context: prepared.context,
        confirmationToken: prepared.confirmationToken,
        payload: { ...prepared.payload, body: "Changed body" },
      }),
    ).rejects.toBeInstanceOf(GmailHubError);
    expect(client.sendCalls).toBe(0);
  });

  it("cannot use a valid confirmation to change the authenticated From mailbox", async () => {
    const { hub, client } = service();
    const prepared = await hub.prepareSendConfirmation(
      reply("Authenticated sender only"),
    );
    await expect(
      hub.sendConfirmed({
        context: prepared.context,
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
    const prepared = await hub.prepareSendConfirmation(reply("Synthetic body"));
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
    const prepared = await hub.prepareSendConfirmation(reply("One attempt only"));

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
    const prepared = await hub.prepareSendConfirmation(reply("Do not retry"));

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
    await expect(
      hub.reconcileSend(prepared.confirmationToken, prepared.context),
    ).resolves.toMatchObject({
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
    const prepared = await hub.prepareSendConfirmation(reply("Synthetic reply"));

    expect(prepared.payload).toMatchObject({
      threadId: "thread-1",
      subject: "Self thread proof",
      inReplyTo: "<parent@pmikcmetro.com>",
      references: ["<root@pmikcmetro.com>", "<parent@pmikcmetro.com>"],
    });
  });

  it("applies a bounded user label through its separately gated action", async () => {
    const { hub, client, store } = service();
    await expect(
      hub.applyThreadLabel("thread-1", {
        context: context("gmail.label.apply"),
        label: "Waiting on Team",
        reason: "Waiting for staff review",
        ruleRef: "manual-human-review:v1",
      }),
    ).resolves.toEqual({
      threadId: "thread-1",
      labelId: "Label_1",
      labelName: "Waiting on Team",
      labelIds: ["INBOX", "Label_1"],
    });
    expect(client.labelsApplied).toEqual([
      { threadId: "thread-1", labelName: "Waiting on Team" },
    ]);
    expect(store.audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "label_applied",
          label: "Waiting on Team",
          rule_ref: "manual-human-review:v1",
        }),
      ]),
    );
    expect(JSON.stringify(store.audit)).not.toContain("Waiting for staff review");
  });

  it("rejects generic compose and unlinked reads before Gmail mutation", async () => {
    const { hub, client } = service();
    await expect(
      hub.prepareSendConfirmation({
        context: context("gmail.thread.reply"),
        message: {
          kind: "new",
          to: ["dan@example.com"],
          cc: [],
          bcc: [],
          subject: "Outside boundary",
          body: "Synthetic",
        },
      }),
    ).rejects.toThrow("New-message sending is not exposed");
    await expect(
      hub.getThread("unlinked-thread", context("gmail.mailbox.read")),
    ).rejects.toMatchObject({ status: 403 });
    expect(client.sendCalls).toBe(0);
  });

  it("rejects an unapproved template before reading or sending Gmail", async () => {
    const { hub, client } = service({ approveTemplates: false });
    await expect(hub.prepareSendConfirmation(reply("Synthetic"))).rejects.toThrow(
      "not approved for production use",
    );
    expect(client.sendCalls).toBe(0);
  });

  it("rejects arbitrary labels, rules, and missing reasons before Gmail mutation", async () => {
    const { hub, client } = service();
    for (const input of [
      {
        context: context("gmail.label.apply"),
        label: "Arbitrary label",
        reason: "Human reviewed",
        ruleRef: "manual-human-review:v1",
      },
      {
        context: context("gmail.label.apply"),
        label: "Waiting on Team",
        reason: "",
        ruleRef: "manual-human-review:v1",
      },
      {
        context: context("gmail.label.apply"),
        label: "Waiting on Team",
        reason: "Human reviewed",
        ruleRef: "invented-rule:v1",
      },
    ]) {
      await expect(
        hub.applyThreadLabel("thread-1", input as never),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(client.labelsApplied).toEqual([]);
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
