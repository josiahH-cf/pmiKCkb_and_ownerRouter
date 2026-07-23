import { describe, expect, it, vi } from "vitest";

import { InternalTransactionalError } from "@/lib/notifications/internal-transactional";
import {
  GmailInternalTransactionalSender,
  type InternalGmailSendClient,
} from "@/lib/notifications/internal-transactional-sender";

describe("GmailInternalTransactionalSender (S39.3 live transport, AC-S39-7)", () => {
  it("sends AS the configured internal identity (from === subject), one recipient, no cc/bcc", async () => {
    const sent: unknown[] = [];
    const fakeClient: InternalGmailSendClient = {
      subject: "ops@pmikcmetro.com",
      sendMessage: async (message) => {
        sent.push(message);
        return { messageId: "m1", threadId: "t1", labelIds: [] };
      },
    };
    const createClient = vi.fn(() => fakeClient);
    const sender = new GmailInternalTransactionalSender(
      "Ops@PMIKCMetro.com",
      createClient,
    );

    await sender.send({
      to: "owner@pmikcmetro.com",
      subject: "New feedback filed on /x",
      body: "metadata only",
    });

    // The client is constructed with the lowercased internal identity as its DWD subject.
    expect(createClient).toHaveBeenCalledWith("ops@pmikcmetro.com");
    expect(sent).toHaveLength(1);
    const message = sent[0] as {
      from: string;
      to: string[];
      cc: string[];
      bcc: string[];
      messageId: string;
    };
    expect(message.from).toBe("ops@pmikcmetro.com");
    expect(message.to).toEqual(["owner@pmikcmetro.com"]);
    expect(message.cc).toEqual([]);
    expect(message.bcc).toEqual([]);
    expect(message.messageId).toMatch(/^<.+@.+>$/); // a real RFC Message-ID
  });

  it("refuses (never sends as an unexpected mailbox) when the sender identity is absent", async () => {
    const createClient = vi.fn();
    const sender = new GmailInternalTransactionalSender(undefined, createClient);
    await expect(
      sender.send({ to: "owner@pmikcmetro.com", subject: "s", body: "b" }),
    ).rejects.toBeInstanceOf(InternalTransactionalError);
    expect(createClient).not.toHaveBeenCalled();
  });
});
