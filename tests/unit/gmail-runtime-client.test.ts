import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { decodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import {
  GMAIL_COMPOSE_SCOPE,
  GMAIL_LABELS_SCOPE,
  GMAIL_MODIFY_SCOPE,
  GMAIL_READONLY_SCOPE,
} from "@/lib/gmail-runtime/scopes";
import { GmailSubjectError } from "@/lib/gmail-runtime/subject";
import type { GmailHttpRequest } from "@/lib/gmail-runtime/transport";
import type { GmailOutgoingMessage } from "@/lib/gmail-runtime/types";

function fakeTransport(response: { status: number; body?: unknown }) {
  const calls: GmailHttpRequest[] = [];
  return {
    calls,
    transport: {
      async send(request: GmailHttpRequest) {
        calls.push(request);
        return { status: response.status, json: async () => response.body ?? {} };
      },
    },
  };
}

function decodeRaw(body: string | undefined): string {
  const raw = (JSON.parse(body ?? "{}") as { message: { raw: string } }).message.raw;
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function outgoing(overrides: Partial<GmailOutgoingMessage> = {}): GmailOutgoingMessage {
  return {
    from: "josiah@pmikcmetro.com",
    to: ["josiah@pmikcmetro.com"],
    cc: [],
    bcc: [],
    subject: "Safe self test",
    body: "Synthetic body",
    messageId: "<unique-1@pmikcmetro.com>",
    references: [],
    ...overrides,
  };
}

describe("GmailRuntimeClient.createDraft", () => {
  it("accepts server-verified pmikcmetro.com users without a rollout allowlist", () => {
    expect(
      new GmailRuntimeClient({
        subject: " editor@pmikcmetro.com ",
        transport: fakeTransport({ status: 200 }).transport,
        getToken: async () => "token",
      }).subject,
    ).toBe("editor@pmikcmetro.com");
  });

  it("creates an UNSENT draft (drafts endpoint, never /messages/send), preserving DRAFT_BANNER", async () => {
    const { calls, transport } = fakeTransport({ status: 200, body: { id: "draft_1" } });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "test-token",
    });

    const result = await client.createDraft({
      to: "owner@example.com",
      subject: "Renewal notice",
      body: `${DRAFT_BANNER}\n\nHello there`,
    });

    expect(result.draftId).toBe("draft_1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(calls[0].url).not.toContain("/messages/send");
    const decoded = decodeRaw(calls[0].body);
    expect(decoded).toContain(DRAFT_BANNER);
    expect(decoded).toContain("To: owner@example.com");
    expect(decoded).toContain("Subject: Renewal notice");
    expect(decoded).toContain("From: josiah@pmikcmetro.com");
  });

  it("exposes only the bounded v1 surface and no destructive/settings methods", () => {
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: fakeTransport({ status: 200, body: { id: "d" } }).transport,
      getToken: async () => "t",
    });
    const surface = client as unknown as Record<string, unknown>;
    expect(surface.sendMessage).toBeTypeOf("function");
    for (const method of [
      "delete",
      "trash",
      "untrash",
      "forward",
      "createFilter",
      "createDelegate",
      "updateSettings",
    ]) {
      expect(surface[method], method).toBeUndefined();
    }
  });

  it("uses readonly only for reads and compose only for drafts/sends", async () => {
    const scopes: string[] = [];
    const { transport } = fakeTransport({
      status: 200,
      body: {
        id: "draft-scope-test",
        emailAddress: "josiah@pmikcmetro.com",
        historyId: "10",
        messagesTotal: 1,
        threadsTotal: 1,
      },
    });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async (scope) => {
        scopes.push(scope);
        return "token";
      },
    });

    await client.getProfile();
    expect(scopes).toEqual([GMAIL_READONLY_SCOPE]);

    scopes.length = 0;
    await client.createDraft({ to: "josiah@pmikcmetro.com", subject: "s", body: "b" });
    expect(scopes).toEqual([GMAIL_COMPOSE_SCOPE]);
  });

  it("encodes the narrow one-image attachment while still calling only drafts.create", async () => {
    const { calls, transport } = fakeTransport({
      status: 200,
      body: { id: "draft_attachment_1" },
    });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "token",
    });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

    await client.createDraft({
      to: "owner@ownerdomain.com",
      subject: "Owner renewal review",
      body: `${DRAFT_BANNER}\n\nSee attachment.`,
      messageId: "<attachment-client@pmikcmetro.com>",
      attachment: {
        filename: "renewal-comp-client.png",
        mimeType: "image/png",
        bytes,
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    const request = JSON.parse(calls[0].body ?? "{}") as {
      message: { raw: string };
    };
    expect(decodeRawDraft(request.message.raw)).toMatchObject({
      to: "owner@ownerdomain.com",
      from: "josiah@pmikcmetro.com",
      attachment: {
        filename: "renewal-comp-client.png",
        mimeType: "image/png",
        sizeBytes: bytes.byteLength,
      },
    });
  });

  it("reads exact draft-id raw MIME and exact-RFC reconciliation uses that same readback", async () => {
    const raw = Buffer.from(
      "To: owner@ownerdomain.com\r\nSubject: S\r\n\r\nBody",
    ).toString("base64url");
    const calls: GmailHttpRequest[] = [];
    const responses = [
      {
        id: "draft_raw_1",
        message: { id: "message_raw_1", raw },
      },
      {
        drafts: [{ id: "draft_raw_1", message: { id: "message_raw_1" } }],
      },
      {
        id: "draft_raw_1",
        message: { id: "message_raw_1", raw },
      },
    ];
    const scopes: string[] = [];
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: {
        async send(request) {
          calls.push(request);
          return { status: 200, json: async () => responses.shift() ?? {} };
        },
      },
      getToken: async (scope) => {
        scopes.push(scope);
        return "token";
      },
    });

    await expect(client.getDraftById("draft_raw_1")).resolves.toEqual({
      draftId: "draft_raw_1",
      messageId: "message_raw_1",
      raw,
    });
    await expect(
      client.findDraftByRfcMessageId("<attachment-client@pmikcmetro.com>"),
    ).resolves.toEqual({
      draftId: "draft_raw_1",
      messageId: "message_raw_1",
      raw,
    });
    expect(scopes).toEqual([
      GMAIL_READONLY_SCOPE,
      GMAIL_READONLY_SCOPE,
      GMAIL_READONLY_SCOPE,
    ]);
    expect(calls[0].url).toContain("/drafts/draft_raw_1?format=raw");
    expect(calls[1].url).toContain("/drafts?q=rfc822msgid");
    expect(calls[2].url).toContain("/drafts/draft_raw_1?format=raw");
  });

  it("uses compose for one reply send and includes Gmail/RFC threading fields", async () => {
    const scopes: string[] = [];
    const { calls, transport } = fakeTransport({
      status: 200,
      body: { id: "sent-1", threadId: "thread-1", labelIds: ["SENT"] },
    });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async (scope) => {
        scopes.push(scope);
        return "token";
      },
    });
    const result = await client.sendMessage(
      outgoing({
        threadId: "thread-1",
        inReplyTo: "<parent@pmikcmetro.com>",
        references: ["<root@pmikcmetro.com>", "<parent@pmikcmetro.com>"],
      }),
    );

    expect(result).toMatchObject({ messageId: "sent-1", threadId: "thread-1" });
    expect(scopes).toEqual([GMAIL_COMPOSE_SCOPE]);
    expect(calls[0].url).toContain("/messages/send");
    const request = JSON.parse(calls[0].body ?? "{}") as {
      raw: string;
      threadId: string;
    };
    const decoded = Buffer.from(request.raw, "base64url").toString("utf8");
    expect(request.threadId).toBe("thread-1");
    expect(decoded).toContain("Subject: Safe self test");
    expect(decoded).toContain("In-Reply-To: <parent@pmikcmetro.com>");
    expect(decoded).toContain(
      "References: <root@pmikcmetro.com> <parent@pmikcmetro.com>",
    );
  });

  it("resolves an existing user label and applies it as one gmail.modify mutation", async () => {
    const scopes: string[] = [];
    const calls: GmailHttpRequest[] = [];
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: {
        async send(request) {
          calls.push(request);
          if (request.method === "GET" && request.url.endsWith("/labels")) {
            return {
              status: 200,
              json: async () => ({
                labels: [{ id: "Label_1", name: "Waiting on Team", type: "user" }],
              }),
            };
          }
          return {
            status: 200,
            json: async () => ({ id: "thread-1", labelIds: ["INBOX", "Label_1"] }),
          };
        },
      },
      getToken: async (scope) => {
        scopes.push(scope);
        return "token";
      },
    });

    const resolved = await client.resolveExistingUserLabels(["Waiting on Team"]);
    expect(resolved.get("Waiting on Team")).toEqual({
      id: "Label_1",
      name: "Waiting on Team",
      type: "user",
    });
    await expect(
      client.modifyThreadLabels("thread-1", {
        addLabelIds: ["Label_1"],
        removeLabelIds: [],
      }),
    ).resolves.toEqual({ threadId: "thread-1", labelIds: ["INBOX", "Label_1"] });
    // Exactly two calls: one label lookup, one thread mutation. No label creation in between.
    expect(scopes).toEqual([GMAIL_LABELS_SCOPE, GMAIL_MODIFY_SCOPE]);
    expect(calls.at(-1)?.url).toContain("/threads/thread-1/modify");
    expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toEqual({
      addLabelIds: ["Label_1"],
      removeLabelIds: [],
    });
  });

  it("resolves nothing when the governed label is not provisioned and never creates it", async () => {
    const calls: GmailHttpRequest[] = [];
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: {
        async send(request) {
          calls.push(request);
          return { status: 200, json: async () => ({ labels: [] }) };
        },
      },
      getToken: async () => "token",
    });

    await expect(client.resolveExistingUserLabels(["Waiting on Team"])).resolves.toEqual(
      new Map(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
  });

  it("refuses a mutation that would change more than one label", async () => {
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: {
        async send() {
          throw new Error("unexpected transport call");
        },
      },
      getToken: async () => "token",
    });

    await expect(
      client.modifyThreadLabels("thread-1", {
        addLabelIds: ["Label_1"],
        removeLabelIds: ["Label_2"],
      }),
    ).rejects.toThrow(/exactly one label/);
    await expect(
      client.modifyThreadLabels("thread-1", { addLabelIds: [], removeLabelIds: [] }),
    ).rejects.toThrow(/exactly one label/);
  });

  it("reads thread label ids without pulling any message body", async () => {
    const calls: GmailHttpRequest[] = [];
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: {
        async send(request) {
          calls.push(request);
          return {
            status: 200,
            json: async () => ({
              id: "thread-1",
              messages: [
                { id: "m1", labelIds: ["INBOX", "Label_1"] },
                { id: "m2", labelIds: ["INBOX"] },
              ],
            }),
          };
        },
      },
      getToken: async () => "token",
    });

    await expect(client.getThreadLabelIds("thread-1")).resolves.toEqual([
      "INBOX",
      "Label_1",
    ]);
    expect(calls[0]?.url).toContain("format=minimal");
  });

  it("rejects wrong-domain subjects and mismatched From before transport work", async () => {
    const { calls, transport } = fakeTransport({ status: 200, body: {} });
    expect(
      () =>
        new GmailRuntimeClient({
          subject: "person@gmail.com",
          transport,
          getToken: async () => "token",
        }),
    ).toThrow(GmailSubjectError);

    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "token",
    });
    await expect(
      client.sendMessage(outgoing({ from: "dan@pmikcmetro.com" })),
    ).rejects.toMatchObject({ status: 403, ambiguous: false });
    expect(calls).toHaveLength(0);
  });

  it("throws with only the HTTP status on a Gmail error, never leaking the token", async () => {
    const { transport } = fakeTransport({ status: 403 });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "SECRET-BEARER-TOKEN",
    });

    await expect(
      client.createDraft({ to: "o@example.com", subject: "s", body: "b" }),
    ).rejects.toBeInstanceOf(GmailRuntimeError);

    try {
      await client.createDraft({ to: "o@example.com", subject: "s", body: "b" });
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as GmailRuntimeError).status).toBe(403);
      expect(String(error)).not.toContain("SECRET-BEARER-TOKEN");
    }
  });

  it("refuses duplicate exact RFC Message-ID matches instead of selecting the first", async () => {
    const { calls, transport } = fakeTransport({
      status: 200,
      body: {
        messages: [
          { id: "sent-1", threadId: "thread-1" },
          { id: "sent-2", threadId: "thread-2" },
        ],
      },
    });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "token",
    });

    await expect(
      client.findMessageByRfcMessageId("<exact-once@pmikcmetro.com>"),
    ).rejects.toMatchObject({ status: 409, ambiguous: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("q=rfc822msgid%3A%3Cexact-once%40pmikcmetro.com%3E");
    expect(calls[0]?.url).toContain("maxResults=2");
    expect(calls[0]?.url).toContain("includeSpamTrash=true");
  });
});
