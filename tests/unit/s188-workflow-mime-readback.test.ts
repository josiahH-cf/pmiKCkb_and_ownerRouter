import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import {
  encodeWorkflowMime,
  verifyWorkflowMimeReadback,
  type WorkflowMimeMessage,
} from "@/lib/gmail-runtime/workflow-mime";
import { createGmailFetchTransport } from "@/lib/gmail-runtime/transport";
const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3]);
const message: WorkflowMimeMessage = {
  from: "staff@pmikcmetro.com",
  to: ["owner@example.invalid"],
  cc: [],
  bcc: [],
  subject: "Reviewed subject",
  body: "Reviewed exact body",
  htmlBody: "<p><strong>Reviewed</strong> exact body</p>",
  messageId: "<pmi-synthetic-id@pmikcmetro.com>",
  references: [],
  attachments: [
    {
      filename: "comp.jpg",
      mimeType: "image/jpeg",
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
function client(raw: string, labels = ["SENT"]) {
  const calls: string[] = [];
  return {
    calls,
    client: new GmailRuntimeClient({
      subject: message.from,
      getToken: async () => "test",
      transport: {
        send: async (r) => {
          calls.push(r.url);
          const u = new URL(r.url);
          return {
            status: 200,
            json: async () =>
              u.pathname.endsWith("/messages")
                ? { messages: [{ id: "m1", threadId: "t1" }] }
                : {
                    id: "m1",
                    threadId: "t1",
                    labelIds: labels,
                    internalDate: "1791558000000",
                    raw,
                    payload: {
                      headers: [{ name: "Message-ID", value: message.messageId }],
                    },
                  },
          };
        },
      },
    }),
  };
}
describe("S188 exact workflow send readback", () => {
  it("requires the actual sent message's envelope and exact rich/attachment MIME after RFC lookup", async () => {
    const raw = encodeWorkflowMime(message);
    const f = client(raw);
    expect(await f.client.findWorkflowMessage(message.messageId, message)).toMatchObject({
      messageId: "m1",
      threadId: "t1",
      labelIds: ["SENT"],
    });
    expect(new URL(f.calls[1]).searchParams.get("format")).toBe("raw");
  });
  it.each(["body", "from", "to", "attachment"])(
    "refuses a matching RFC identifier with changed %s",
    async (part) => {
      let wire = Buffer.from(encodeWorkflowMime(message), "base64url").toString("utf8");
      if (part === "from") wire = wire.replace(message.from, "other@pmikcmetro.com");
      if (part === "to") wire = wire.replace(message.to[0], "other@example.invalid");
      if (part === "body")
        wire = wire.replace(
          Buffer.from(message.body).toString("base64"),
          Buffer.from("Altered exact body").toString("base64"),
        );
      if (part === "attachment")
        wire = wire.replace(
          Buffer.from(bytes).toString("base64"),
          Buffer.from(new Uint8Array([255, 216, 255, 224, 4, 5, 6])).toString("base64"),
        );
      await expect(
        client(Buffer.from(wire).toString("base64url")).client.findWorkflowMessage(
          message.messageId,
          message,
        ),
      ).rejects.toThrow(/readback/);
    },
  );
  it("does not treat an incoming copy with the RFC identifier as an outbound effect", async () => {
    await expect(
      client(encodeWorkflowMime(message), ["INBOX"]).client.findWorkflowMessage(
        message.messageId,
        message,
      ),
    ).rejects.toThrow(/readback/);
  });
  it("folds a long Unicode subject into bounded RFC encoded words and verifies it", () => {
    const exact = { ...message, subject: "Renovación 🏠 ".repeat(55) };
    const raw = encodeWorkflowMime(exact);
    const wire = Buffer.from(raw, "base64url").toString("utf8");
    const subject = wire.match(/Subject: ([\s\S]*?)\r\nMessage-ID:/)![1];
    expect(subject.split("\r\n").every((line) => line.length <= 78)).toBe(true);
    const words = subject.match(/=\?UTF-8\?B\?([^?]+)\?=/g)!;
    expect(words.every((word) => word.length <= 75)).toBe(true);
    expect(
      words
        .map((word) => Buffer.from(word.slice(10, -2), "base64").toString("utf8"))
        .join(""),
    ).toBe(exact.subject);
    expect(() => verifyWorkflowMimeReadback(raw, exact)).not.toThrow();
  });
  it("cancels an oversized streaming response before an unbounded aggregate read", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(7));
                c.enqueue(new Uint8Array(7));
              },
              cancel,
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      createGmailFetchTransport(1000, 10).send({
        url: "https://gmail.googleapis.com/test",
        method: "GET",
        headers: {},
      }),
    ).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalledOnce();
  });
});

it("checks exact reply headers when a new occurrence retained its threading", () => {
  const message = {
    from: "fixture@pmikcmetro.com",
    to: ["owner@example.invalid"],
    cc: [],
    bcc: [],
    subject: "Fixture reply",
    body: "Fixture",
    htmlBody: "<p>Fixture</p>",
    attachments: [],
    messageId: "<fixture@pmikcmetro.com>",
    inReplyTo: "<parent@example.invalid>",
    references: ["<parent@example.invalid>"],
    verifyThreading: true,
  };
  const wire = Buffer.from(encodeWorkflowMime(message), "base64url").toString("utf8");
  expect(() =>
    verifyWorkflowMimeReadback(Buffer.from(wire).toString("base64url"), message),
  ).not.toThrow();
  expect(() =>
    verifyWorkflowMimeReadback(
      Buffer.from(
        wire.replace(
          "In-Reply-To: <parent@example.invalid>",
          "In-Reply-To: <other@example.invalid>",
        ),
      ).toString("base64url"),
      message,
    ),
  ).toThrow(/did not match/);
});
