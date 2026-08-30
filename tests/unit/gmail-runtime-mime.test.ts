import { describe, expect, it } from "vitest";

import {
  htmlToSafeText,
  parseGmailMessage,
  parseGmailThread,
} from "@/lib/gmail-runtime/mime";
import { decodeRawDraft, encodeRawDraft } from "@/lib/gmail-runtime/raw-message";
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

describe("receipt-bound renewal draft attachment MIME (ARCH-S79-2)", () => {
  const attachmentBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03,
  ]);

  it("round-trips one ordinary image attachment with the governed text body first", () => {
    const raw = encodeRawDraft({
      to: "owner@northend-apts.com",
      cc: ["co-owner@northend-apts.com"],
      subject: "Renewal coming up",
      body: "DRAFT — REVIEW BEFORE SENDING\n\nSee the attached comp screenshot.",
      from: "workflow@pmikcmetro.com",
      messageId: "<renewal-attachment@pmikcmetro.com>",
      attachment: {
        filename: "renewal-comp-exec_123.png",
        mimeType: "image/png",
        bytes: attachmentBytes,
      },
    });

    const decoded = decodeRawDraft(raw);
    expect(decoded).toMatchObject({
      from: "workflow@pmikcmetro.com",
      to: "owner@northend-apts.com",
      cc: ["co-owner@northend-apts.com"],
      subject: "Renewal coming up",
      messageId: "<renewal-attachment@pmikcmetro.com>",
      body: "DRAFT — REVIEW BEFORE SENDING\n\nSee the attached comp screenshot.",
      attachment: {
        filename: "renewal-comp-exec_123.png",
        mimeType: "image/png",
        sizeBytes: attachmentBytes.byteLength,
      },
    });
    expect(decoded.attachment?.bytes).toEqual(attachmentBytes);

    const wire = Buffer.from(raw, "base64url").toString("utf8");
    expect(wire.indexOf('Content-Type: text/plain; charset="UTF-8"')).toBeLessThan(
      wire.indexOf(
        'Content-Disposition: attachment; filename="renewal-comp-exec_123.png"',
      ),
    );
    expect(wire.match(/Content-Disposition: attachment/g) ?? []).toHaveLength(1);
    expect(wire).not.toMatch(/text\/html|Content-ID|cid:/i);
  });

  it.each([
    ["path traversal", "../secret.png", "image/png", attachmentBytes],
    [
      "header injection",
      "safe.png\r\nBcc: bad@example.com",
      "image/png",
      attachmentBytes,
    ],
    ["unsupported MIME", "safe.svg", "image/svg+xml", attachmentBytes],
    ["MIME/extension mismatch", "safe.jpg", "image/png", attachmentBytes],
    ["empty bytes", "safe.png", "image/png", new Uint8Array()],
    ["oversized bytes", "safe.png", "image/png", new Uint8Array(5 * 1024 * 1024 + 1)],
  ])("refuses %s before constructing MIME", (_label, filename, mimeType, bytes) => {
    expect(() =>
      encodeRawDraft({
        to: "owner@northend-apts.com",
        subject: "Renewal",
        body: "DRAFT — REVIEW BEFORE SENDING\n\nBody",
        attachment: { filename, mimeType, bytes },
      }),
    ).toThrow();
  });

  it("keeps the legacy text-only bytes exactly unchanged", () => {
    const input = {
      to: "only@northend-apts.com",
      cc: ["co@northend-apts.com"],
      subject: "S",
      body: "Line one\nLine two",
      from: "workflow@pmikcmetro.com",
      messageId: "<text-only@pmikcmetro.com>",
    };
    const expected = Buffer.from(
      [
        "From: workflow@pmikcmetro.com",
        "To: only@northend-apts.com",
        "Cc: co@northend-apts.com",
        "Message-ID: <text-only@pmikcmetro.com>",
        "Subject: S",
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        "Line one\nLine two",
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");

    expect(encodeRawDraft(input)).toBe(expected);
  });
});
