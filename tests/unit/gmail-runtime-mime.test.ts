import { describe, expect, it } from "vitest";

import {
  htmlToSafeText,
  parseGmailMessage,
  parseGmailThread,
} from "@/lib/gmail-runtime/mime";
import { encodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import { GMAIL_RUNTIME_LIMITS } from "@/lib/gmail-runtime/types";

const encoded = (value: string) => Buffer.from(value, "utf8").toString("base64url");

function apiMessage(id: string, body: string, mimeType = "text/plain") {
  return {
    id,
    threadId: "thread-1",
    labelIds: ["INBOX"],
    payload: {
      mimeType,
      headers: [
        { name: "From", value: "Sender <sender@example.com>" },
        { name: "To", value: "josiah@pmikcmetro.com" },
        { name: "Subject", value: "Synthetic thread" },
        { name: "Message-ID", value: `<${id}@example.com>` },
      ],
      body: { data: encoded(body), size: body.length },
    },
  };
}

describe("defensive Gmail MIME parsing (AC-S19-3)", () => {
  it("prefers plain text and never exposes attachment contents", () => {
    const parsed = parseGmailMessage({
      id: "message-1",
      threadId: "thread-1",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "Subject", value: "Safe" },
          { name: "Message-ID", value: "<message-1@example.com>" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: encoded("Visible text") } },
          {
            mimeType: "application/pdf",
            filename: "invoice.pdf",
            body: { attachmentId: "secret-attachment-id", size: 1234 },
          },
        ],
      },
    });

    expect(parsed.bodyText).toBe("Visible text");
    expect(parsed.attachments).toEqual([
      { filename: "invoice.pdf", mimeType: "application/pdf", size: 1234 },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("secret-attachment-id");
  });

  it("turns HTML into inert text and strips active/embedded markup", () => {
    const unsafe =
      '<p>Hello <strong>there</strong></p><script>alert("secret")</script>' +
      '<iframe src="https://evil.example"></iframe><a href="javascript:bad()">link</a>';
    const parsed = parseGmailMessage(apiMessage("message-html", unsafe, "text/html"));

    expect(parsed.bodyText).toContain("Hello there");
    expect(parsed.bodyText).toContain("link");
    expect(parsed.bodyText).not.toMatch(/script|iframe|javascript|alert|<|>/i);
    expect(htmlToSafeText("<style>.x{}</style><p>Safe&nbsp;text</p>")).toBe("Safe text");
  });

  it("caps per-message and per-thread output", () => {
    const oversized = "x".repeat(GMAIL_RUNTIME_LIMITS.maxBodyCharacters + 5_000);
    const message = parseGmailMessage(apiMessage("message-large", oversized));
    expect(message.bodyText).toHaveLength(GMAIL_RUNTIME_LIMITS.maxBodyCharacters);
    expect(message.bodyTruncated).toBe(true);

    const messages = Array.from(
      { length: GMAIL_RUNTIME_LIMITS.maxThreadMessages + 5 },
      (_, index) => apiMessage(`message-${index}`, oversized),
    );
    const thread = parseGmailThread({ id: "thread-1", messages });
    expect(thread.messages).toHaveLength(GMAIL_RUNTIME_LIMITS.maxThreadMessages);
    expect(
      thread.messages.reduce((total, item) => total + item.bodyText.length, 0),
    ).toBeLessThanOrEqual(GMAIL_RUNTIME_LIMITS.maxThreadBodyCharacters);
    expect(thread.truncated).toBe(true);
  });
});

describe("encodeRawDraft Cc header (F-LEASE-6)", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

  it("emits a Cc header with all co-tenant addresses when cc is present", () => {
    const raw = encodeRawDraft({
      to: "primary@northend-apts.com",
      cc: ["co1@northend-apts.com", "co2@northend-apts.com"],
      subject: "Your lease renewal",
      body: "Body",
      from: "workflow@pmikcmetro.com",
    });
    const text = decode(raw);
    expect(text).toContain("To: primary@northend-apts.com");
    expect(text).toContain("Cc: co1@northend-apts.com, co2@northend-apts.com");
  });

  it("emits no Cc header when cc is absent or empty", () => {
    const withoutCc = decode(
      encodeRawDraft({ to: "only@northend-apts.com", subject: "S", body: "B" }),
    );
    expect(withoutCc).not.toContain("Cc:");
    const emptyCc = decode(
      encodeRawDraft({
        to: "only@northend-apts.com",
        cc: ["   "],
        subject: "S",
        body: "B",
      }),
    );
    expect(emptyCc).not.toContain("Cc:");
  });

  it("rejects a Cc value that smuggles a header break", () => {
    expect(() =>
      encodeRawDraft({
        to: "a@northend-apts.com",
        cc: ["b@northend-apts.com\r\nBcc: sneaky@evil.com"],
        subject: "S",
        body: "B",
      }),
    ).toThrow(/invalid header/i);
  });
});
