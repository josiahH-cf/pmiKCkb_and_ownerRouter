import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { hashConfirmationToken } from "@/lib/gmail-hub/contracts";
import { WORKFLOW_REPLY_POLICY_REF } from "@/lib/gmail-hub/governed-artifacts";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import {
  GmailAmbiguousSendError,
  GmailAmbiguousWatchError,
  GmailHubError,
  GmailHubGateError,
  GmailHubService,
} from "@/lib/gmail-hub/service";
import {
  gmailMailboxKey,
  MemoryGmailStateStore,
  type CommunicationIdentity,
  type GmailConfirmationRecord,
} from "@/lib/gmail-hub/state-store";
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

const identityX: CommunicationIdentity = {
  mailboxEmail: actor.email,
  lane: "maintenance",
  entityType: "maintenance_ticket",
  entityId: "ticket-X",
  purpose: "maintenance_owner",
};
const identityY: CommunicationIdentity = { ...identityX, entityId: "ticket-Y" };

function confirmationRecord(
  id: string,
  identity: CommunicationIdentity,
  state: GmailConfirmationRecord["state"],
  nowMs = 1_000,
): GmailConfirmationRecord {
  return {
    id,
    actor_uid: actor.uid,
    mailbox_email: identity.mailboxEmail,
    payload_hash: `hash-${id}`,
    message_id: `<${id}@mail>`,
    message_kind: "reply",
    state,
    usable_until_ms: nowMs + 600_000,
    created_at_ms: nowMs,
    updated_at_ms: nowMs,
    workflow_context_key: `ctx-${id}`,
    workflow_lane: identity.lane,
    workflow_entity_type: identity.entityType,
    workflow_entity_id: identity.entityId,
    workflow_purpose: identity.purpose,
    template_ref: "maintenance-owner:v1.0",
    ...communicationsRetentionFields("confirmation", nowMs),
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
  watchCalls = 0;
  watchError: Error | null = null;
  watchDelay: Promise<void> | null = null;
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

  override async watchMailbox() {
    this.watchCalls += 1;
    if (this.watchDelay) await this.watchDelay;
    if (this.watchError) throw this.watchError;
    return { historyId: "456", expiration: "2000000" };
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

describe("GmailHubService watch confirmation", () => {
  const topicName = "projects/pmi-kc-kb-prod/topics/gmail-replies";
  const attemptKey = "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51";

  it("previews the exact effect and makes one provider attempt with bodyless readback", async () => {
    const { hub, client, store } = service({ now: () => 1_000_000 });

    await expect(hub.watchPreview(topicName)).resolves.toMatchObject({
      mailboxEmail: actor.email,
      topicName,
      currentWatchExpirationMs: null,
      risk: expect.stringContaining("Live Gmail watch mutation"),
    });
    const first = await hub.watchMailbox({
      topicName,
      attemptKey,
      observedExpirationMs: null,
    });
    expect(first).toMatchObject({
      outcome: "completed",
      historyId: "456",
      expiration: "2000000",
      readback: {
        state: "completed",
        mailboxEmail: actor.email,
        expirationMs: 2_000_000,
      },
    });
    expect(client.watchCalls).toBe(1);

    await expect(
      hub.watchMailbox({ topicName, attemptKey, observedExpirationMs: null }),
    ).resolves.toMatchObject({ outcome: "already_completed" });
    expect(client.watchCalls).toBe(1);
    expect(store.audit.map((entry) => entry.action)).toEqual([
      "watch_attempt_claimed",
      "watch_attempt_completed",
    ]);
    expect(JSON.stringify(store.audit)).not.toContain(attemptKey);
    expect(JSON.stringify(store.audit)).not.toContain(topicName);
  });

  it("rejects stale previews before Gmail and consumes ambiguous attempt keys", async () => {
    const stale = service({ now: () => 1_000_000 });
    stale.store.mailboxStates.set(actor.email, {
      mailbox_email: actor.email,
      user_uid: actor.uid,
      history_id: "123",
      watch_expiration_ms: 1_500_000,
      health: "watching",
      updated_at_ms: 900_000,
    });
    await expect(
      stale.hub.watchMailbox({
        topicName,
        attemptKey,
        observedExpirationMs: null,
      }),
    ).rejects.toThrow(/state changed after preview/);
    expect(stale.client.watchCalls).toBe(0);

    const ambiguous = service({ now: () => 1_000_000 });
    ambiguous.client.watchError = new Error("synthetic transport uncertainty");
    await expect(
      ambiguous.hub.watchMailbox({
        topicName,
        attemptKey,
        observedExpirationMs: null,
      }),
    ).rejects.toBeInstanceOf(GmailAmbiguousWatchError);
    await expect(
      ambiguous.hub.watchMailbox({
        topicName,
        attemptKey,
        observedExpirationMs: null,
      }),
    ).rejects.toThrow(/Do not retry that attempt key/);
    expect(ambiguous.client.watchCalls).toBe(1);
    expect(ambiguous.store.mailboxStates.get(actor.email)?.watch_attempt?.state).toBe(
      "ambiguous",
    );
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

  it("refuses a new send while a prior send for the same context is ambiguous (double-send guard)", async () => {
    const client = new FakeGmailClient();
    client.sendError = new GmailRuntimeError("unclear", undefined, true);
    const store = new MemoryGmailStateStore();

    // First attempt: prepare -> send -> ambiguous; reconcile cannot find the message, so it stays ambiguous.
    const first = service({
      client,
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const prepared = await first.hub.prepareSendConfirmation(reply("Ambiguous send"));
    await expect(first.hub.sendConfirmed(prepared)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );
    await expect(
      first.hub.reconcileSend(prepared.confirmationToken, prepared.context),
    ).resolves.toMatchObject({ status: "not_found" });

    // A re-prepare for the SAME context with a DIFFERENT token (so it is not an id collision) is refused.
    // Without the guard this would mint a fresh confirmation and enable a second delivery.
    const second = service({
      client,
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await expect(
      second.hub.prepareSendConfirmation(reply("Retry attempt")),
    ).rejects.toBeInstanceOf(GmailAmbiguousSendError);
    // Only the single original send was ever attempted.
    expect(client.sendCalls).toBe(1);
  });

  it("clears the double-send guard once the ambiguous send reconciles to sent", async () => {
    const client = new FakeGmailClient();
    client.sendError = new GmailRuntimeError("unclear", undefined, true);
    const store = new MemoryGmailStateStore();

    const first = service({
      client,
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const prepared = await first.hub.prepareSendConfirmation(reply("Ambiguous send"));
    await expect(first.hub.sendConfirmed(prepared)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );

    // Reconcile now FINDS the message, so the confirmation resolves to sent (no longer ambiguous).
    client.reconcileResult = {
      messageId: "reconciled-message",
      threadId: "reconciled-thread",
      labelIds: ["SENT"],
    };
    await expect(
      first.hub.reconcileSend(prepared.confirmationToken, prepared.context),
    ).resolves.toMatchObject({ status: "sent" });

    // With no unresolved-ambiguous record for the context, a fresh prepare is allowed again.
    const second = service({
      client,
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await expect(
      second.hub.prepareSendConfirmation(reply("Follow-up")),
    ).resolves.toMatchObject({ confirmationToken: expect.any(String) });
  });

  it("still blocks a re-prepare that VARIES the source refs (guard keys on identity, not context key)", async () => {
    const client = new FakeGmailClient();
    client.sendError = new GmailRuntimeError("unclear", undefined, true);
    const store = new MemoryGmailStateStore();
    const withRefs = (body: string, sourceRefs: string[]) => ({
      context: { ...context("gmail.thread.reply"), sourceRefs },
      message: { kind: "reply" as const, threadId: "thread-1", body },
    });

    // First send with source refs ["ref:a"] goes ambiguous; reconcile cannot find it.
    const first = service({
      client,
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const prepared = await first.hub.prepareSendConfirmation(
      withRefs("First", ["ref:a"]),
    );
    await expect(first.hub.sendConfirmed(prepared)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );
    await expect(
      first.hub.reconcileSend(prepared.confirmationToken, prepared.context),
    ).resolves.toMatchObject({ status: "not_found" });

    // A re-prepare of the SAME communication (same thread/entity) with DIFFERENT source refs derives a
    // different context key but the SAME identity — it must still be refused. (Keying on the context key
    // would let this slip through and double-send.)
    const second = service({
      client,
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await expect(
      second.hub.prepareSendConfirmation(withRefs("Second", ["ref:a", "ref:b"])),
    ).rejects.toBeInstanceOf(GmailAmbiguousSendError);
    expect(client.sendCalls).toBe(1);
  });

  it("blocks a re-prepare while a prior send is stuck in 'sending' (crash mid-send)", async () => {
    const store = new MemoryGmailStateStore();
    const first = service({
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const prepared = await first.hub.prepareSendConfirmation(reply("First"));
    // Simulate a crash after the claim but before the outcome was recorded: leave it in "sending".
    const stuck = store.confirmations.get(
      hashConfirmationToken(prepared.confirmationToken),
    );
    expect(stuck).toBeDefined();
    stuck!.state = "sending";

    const second = service({
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await expect(
      second.hub.prepareSendConfirmation(reply("Second")),
    ).rejects.toBeInstanceOf(GmailAmbiguousSendError);
  });

  it("supersedes a prior concurrent pending so only the newest confirmation can send", async () => {
    // Two prepares for the SAME communication identity, both minted before either is sent (two tabs / two
    // operators / a double-submitted prepare). Each carries its own one-time token, so neither is an id
    // collision and the ambiguous/sending guard does not catch them — only the supersede does.
    const client = new FakeGmailClient();
    const store = new MemoryGmailStateStore();
    const first = service({
      client,
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const preparedOne = await first.hub.prepareSendConfirmation(reply("First copy"));
    const second = service({
      client,
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const preparedTwo = await second.hub.prepareSendConfirmation(reply("Second copy"));

    // Minting the second retired the first: it is superseded, no longer a claimable pending.
    const firstRecord = store.confirmations.get(
      hashConfirmationToken(preparedOne.confirmationToken),
    );
    expect(firstRecord?.state).toBe("superseded");

    // Confirming the retired first is refused with no send; only the newest confirmation delivers, once.
    await expect(first.hub.sendConfirmed(preparedOne)).rejects.toThrow(/replaced/i);
    await expect(second.hub.sendConfirmed(preparedTwo)).resolves.toMatchObject({
      status: "sent",
      duplicate: false,
    });
    expect(client.sendCalls).toBe(1);
  });

  it("refuses a pending send when a sibling send raced into flight (claim-time dedup)", async () => {
    // The concurrent race supersede-at-mint cannot cover: two confirmations for one identity exist, and the
    // first was claimed to "sending" during the second's prepare, so the supersede skipped it. The
    // claim-time identity dedup must still refuse the second, delivering no second copy.
    const store = new MemoryGmailStateStore();
    const first = service({
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const preparedOne = await first.hub.prepareSendConfirmation(reply("First"));
    const second = service({
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const preparedTwo = await second.hub.prepareSendConfirmation(reply("Second"));

    // Simulate that the first confirmation was actually claimed to "sending" (a sibling send now in flight).
    const firstRecord = store.confirmations.get(
      hashConfirmationToken(preparedOne.confirmationToken),
    );
    firstRecord!.state = "sending";

    await expect(second.hub.sendConfirmed(preparedTwo)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );
    expect(second.client.sendCalls).toBe(0);
  });

  it("reconciles a stuck 'sending' confirmation by its RFC Message-ID (not a permanent block)", async () => {
    const client = new FakeGmailClient();
    const store = new MemoryGmailStateStore();
    const first = service({
      client,
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const prepared = await first.hub.prepareSendConfirmation(reply("First"));
    store.confirmations.get(hashConfirmationToken(prepared.confirmationToken))!.state =
      "sending";
    client.reconcileResult = {
      messageId: "found-message",
      threadId: "found-thread",
      labelIds: ["SENT"],
    };

    await expect(
      first.hub.reconcileSend(prepared.confirmationToken, prepared.context),
    ).resolves.toMatchObject({ status: "sent" });
  });

  it("recovers WITHOUT the token: a re-prepare resolves an ambiguous send that actually delivered", async () => {
    const client = new FakeGmailClient();
    client.sendError = new GmailRuntimeError("unclear", undefined, true);
    const store = new MemoryGmailStateStore();

    const first = service({
      client,
      store,
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const prepared = await first.hub.prepareSendConfirmation(reply("First"));
    await expect(first.hub.sendConfirmed(prepared)).rejects.toBeInstanceOf(
      GmailAmbiguousSendError,
    );
    const id = hashConfirmationToken(prepared.confirmationToken);
    expect(store.confirmations.get(id)!.state).toBe("ambiguous");

    // The one-time token is lost (page reload). On re-prepare, the guard re-checks delivery by the prior
    // send's RFC Message-ID (no token needed) and finds it DID deliver: it records that (the block
    // resolves) and refuses this send as a duplicate.
    client.reconcileResult = {
      messageId: "found-message",
      threadId: "found-thread",
      labelIds: ["SENT"],
    };
    const second = service({
      client,
      store,
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await expect(
      second.hub.prepareSendConfirmation(reply("Second")),
    ).rejects.toBeInstanceOf(GmailAmbiguousSendError);
    // The prior confirmation is now resolved to sent, so it no longer blocks future sends, and no second
    // copy was ever delivered.
    expect(store.confirmations.get(id)!.state).toBe("sent");
    expect(client.sendCalls).toBe(1);
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

describe("GmailStateStore supersedePendingSendsForCommunication (concurrent-pending)", () => {
  it("retires only OTHER same-identity pendings, keeping keepId and other identities untouched", async () => {
    const store = new MemoryGmailStateStore();
    await store.createConfirmation(confirmationRecord("keep", identityX, "pending"));
    await store.createConfirmation(confirmationRecord("sibling", identityX, "pending"));
    await store.createConfirmation(confirmationRecord("other", identityY, "pending"));
    await store.createConfirmation(
      confirmationRecord("already-sending", identityX, "sending"),
    );

    await store.supersedePendingSendsForCommunication(identityX, "keep", 2_000);

    expect((await store.getConfirmation("keep"))?.state).toBe("pending");
    expect((await store.getConfirmation("sibling"))?.state).toBe("superseded");
    // A different communication identity is never touched.
    expect((await store.getConfirmation("other"))?.state).toBe("pending");
    // An in-flight send for the same identity is NOT clobbered — it owns the identity and must resolve.
    expect((await store.getConfirmation("already-sending"))?.state).toBe("sending");
  });

  it("makes a superseded confirmation unclaimable (cannot go on to send)", async () => {
    const store = new MemoryGmailStateStore();
    await store.createConfirmation(confirmationRecord("keep", identityX, "pending"));
    const stale = confirmationRecord("stale", identityX, "pending");
    await store.createConfirmation(stale);

    await store.supersedePendingSendsForCommunication(identityX, "keep", 2_000);

    const claim = await store.claimConfirmation({
      id: "stale",
      actorUid: actor.uid,
      payloadHash: stale.payload_hash,
      workflowContextKey: stale.workflow_context_key,
      nowMs: 3_000,
    });
    expect(claim.status).toBe("superseded");
  });
});

describe("GmailStateStore claim-time identity dedup (concurrent-pending)", () => {
  async function claimWaiting(store: MemoryGmailStateStore, id: string) {
    return store.claimConfirmation({
      id,
      actorUid: actor.uid,
      payloadHash: `hash-${id}`,
      workflowContextKey: `ctx-${id}`,
      nowMs: 5_000,
    });
  }

  it("refuses a pending claim while a sibling send is in flight (sending)", async () => {
    const store = new MemoryGmailStateStore();
    await store.createConfirmation(confirmationRecord("in-flight", identityX, "sending"));
    await store.createConfirmation(confirmationRecord("waiting", identityX, "pending"));

    const claim = await claimWaiting(store, "waiting");
    expect(claim.status).toBe("sibling_in_flight");
    // The waiting record is NOT advanced — it stays claimable once the sibling resolves.
    expect((await store.getConfirmation("waiting"))?.state).toBe("pending");
  });

  it("refuses a pending claim while a sibling send is ambiguous", async () => {
    const store = new MemoryGmailStateStore();
    await store.createConfirmation(confirmationRecord("ambig", identityX, "ambiguous"));
    await store.createConfirmation(confirmationRecord("waiting", identityX, "pending"));

    expect((await claimWaiting(store, "waiting")).status).toBe("sibling_in_flight");
  });

  it("allows a follow-up claim after a prior send RESOLVED to sent", async () => {
    const store = new MemoryGmailStateStore();
    await store.createConfirmation(confirmationRecord("done", identityX, "sent"));
    await store.createConfirmation(confirmationRecord("followup", identityX, "pending"));

    expect((await claimWaiting(store, "followup")).status).toBe("claimed");
  });

  it("does not block on an in-flight send for a DIFFERENT identity", async () => {
    const store = new MemoryGmailStateStore();
    await store.createConfirmation(
      confirmationRecord("other-inflight", identityY, "sending"),
    );
    await store.createConfirmation(confirmationRecord("mine", identityX, "pending"));

    expect((await claimWaiting(store, "mine")).status).toBe("claimed");
  });
});
