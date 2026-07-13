import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
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

  it("creates a user label with gmail.labels and applies it with gmail.modify", async () => {
    const scopes: string[] = [];
    const calls: GmailHttpRequest[] = [];
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: {
        async send(request) {
          calls.push(request);
          if (request.method === "GET" && request.url.endsWith("/labels")) {
            return { status: 200, json: async () => ({ labels: [] }) };
          }
          if (request.method === "POST" && request.url.endsWith("/labels")) {
            return {
              status: 200,
              json: async () => ({
                id: "Label_1",
                name: "Waiting on Team",
                type: "user",
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

    await expect(client.applyThreadLabel("thread-1", "Waiting on Team")).resolves.toEqual(
      {
        threadId: "thread-1",
        labelId: "Label_1",
        labelName: "Waiting on Team",
        labelIds: ["INBOX", "Label_1"],
      },
    );
    expect(scopes).toEqual([GMAIL_LABELS_SCOPE, GMAIL_LABELS_SCOPE, GMAIL_MODIFY_SCOPE]);
    expect(calls.at(-1)?.url).toContain("/threads/thread-1/modify");
    expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toEqual({
      addLabelIds: ["Label_1"],
      removeLabelIds: [],
    });
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
});
