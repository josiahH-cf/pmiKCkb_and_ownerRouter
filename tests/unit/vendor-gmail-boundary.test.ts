import { describe, expect, it, vi } from "vitest";

import { VendorGmailService } from "@/lib/vendor/gmail";

const principal = {
  uid: "uid-a",
  vendorId: "vendor-a",
  email: "trade@example.com",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: 1,
};

function harness(linked = true) {
  const client = {
    getLinkedThread: vi.fn().mockResolvedValue({
      id: "thread-a",
      subject: "Synthetic repair",
      snippet: "Bounded synthetic snippet",
    }),
    createReplyDraft: vi.fn().mockResolvedValue({ draftId: "draft-1" }),
    applyApprovedLabel: vi.fn().mockResolvedValue(undefined),
    sendReply: vi.fn().mockResolvedValue({ messageId: "sent-1", threadId: "thread-a" }),
    reconcileByMessageId: vi.fn(),
  };
  const service = new VendorGmailService(principal, principal.email, {
    assignments: {
      isVendorActive: async () => true,
      listAssignedTickets: async () => [],
      getAssignedTicket: async (vendorId, ticketId) =>
        vendorId === "vendor-a" && ticketId === "ticket-a"
          ? {
              id: ticketId,
              status: "Open",
              priority: "Normal",
              summary: "Synthetic repair",
              unitLabel: null,
              updatedAt: "2026-07-14T00:00:00.000Z",
            }
          : null,
      isThreadLinked: async ({ threadId }) => linked && threadId === "thread-a",
    },
    provider: { getClient: vi.fn().mockResolvedValue(client) },
    confirmations: {
      createConfirmation: vi.fn(),
      claimConfirmation: vi.fn(),
      markConfirmation: vi.fn(),
    },
  });
  return { service, client };
}

describe("Vendor assigned-thread Gmail boundary", () => {
  it("supports only linked read, reply draft, and approved labels", async () => {
    const { service, client } = harness();
    await expect(service.readLinkedThread("ticket-a", "thread-a")).resolves.toMatchObject(
      {
        id: "thread-a",
      },
    );
    await service.createReplyDraft("ticket-a", "thread-a", "Reviewed synthetic reply");
    await service.applyApprovedLabel("ticket-a", "thread-a", "PMI/Vendor/Waiting");
    expect(client.createReplyDraft).toHaveBeenCalledTimes(1);
    expect(client.applyApprovedLabel).toHaveBeenCalledTimes(1);
    expect(client).not.toHaveProperty("listInbox");
    expect(client).not.toHaveProperty("search");
    expect(client).not.toHaveProperty("composeNew");
    expect(client).not.toHaveProperty("fetchAttachment");
  });

  it("makes zero provider calls for a guessed ticket or thread", async () => {
    const { service, client } = harness(false);
    await expect(service.readLinkedThread("ticket-b", "thread-a")).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.readLinkedThread("ticket-a", "thread-b")).rejects.toMatchObject({
      status: 404,
    });
    expect(client.getLinkedThread).not.toHaveBeenCalled();
  });
});
