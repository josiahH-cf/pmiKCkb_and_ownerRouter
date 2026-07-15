import { describe, expect, it, vi } from "vitest";

import {
  VendorGmailService,
  type VendorGmailAssignmentRepository,
  type VendorGmailLaneContext,
} from "@/lib/vendor/gmail";

const principal = {
  uid: "uid-a",
  vendorId: "vendor-a",
  email: "trade@example.com",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: 1,
  dataMode: "live" as const,
};

const liveLanes: VendorGmailLaneContext = {
  vendor: "live",
  assignment: "live",
  ticket: "live",
  thread: "live",
};

function harness(linked = true, lanes: VendorGmailLaneContext = liveLanes) {
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
  const getClient = vi.fn().mockResolvedValue(client);
  const assignments: VendorGmailAssignmentRepository = {
    isVendorActive: async () => true,
    listAssignedTickets: async () => [],
    getAssignedTicket: async ({ vendorId, ticketId }) =>
      vendorId === "vendor-a" && ticketId === "ticket-a"
        ? {
            id: ticketId,
            status: "Open",
            priority: "Normal",
            summary: "Synthetic repair",
            unitLabel: null,
            updatedAt: "2026-07-14T00:00:00.000Z",
            dataMode: lanes.ticket,
          }
        : null,
    isThreadLinked: async ({ threadId }) => linked && threadId === "thread-a",
    getGmailLaneContext: async ({ vendorId, ticketId, threadId }) =>
      linked &&
      vendorId === "vendor-a" &&
      ticketId === "ticket-a" &&
      threadId === "thread-a"
        ? lanes
        : null,
  };
  const service = new VendorGmailService(principal, principal.email, {
    assignments,
    provider: { getClient },
    confirmations: {
      createConfirmation: vi.fn(),
      claimConfirmation: vi.fn(),
      markConfirmation: vi.fn(),
    },
  });
  return { service, client, getClient, assignments };
}

describe("Vendor assigned-thread Gmail boundary", () => {
  it("requires Admin support to declare the Live lane explicitly", () => {
    const { assignments, getClient } = harness();
    expect(
      () =>
        new VendorGmailService(
          {
            uid: "admin-a",
            email: "admin@pmikcmetro.com",
            vendorId: "vendor-a",
            isAdmin: true,
          } as never,
          principal.email,
          {
            assignments,
            provider: { getClient },
            confirmations: {
              createConfirmation: vi.fn(),
              claimConfirmation: vi.fn(),
              markConfirmation: vi.fn(),
            },
          },
        ),
    ).toThrow("Test workspace");
    expect(getClient).not.toHaveBeenCalled();
  });

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

  it.each([
    [
      "Test Vendor",
      { vendor: "test", assignment: "test", ticket: "test", thread: "test" },
    ],
    [
      "Test ticket",
      { vendor: "live", assignment: "live", ticket: "test", thread: "live" },
    ],
    [
      "Test thread",
      { vendor: "live", assignment: "live", ticket: "live", thread: "test" },
    ],
  ] satisfies [string, VendorGmailLaneContext][])(
    "makes zero provider calls when Admin support encounters a persisted %s lane",
    async (_label, lanes) => {
      const { assignments, getClient, client } = harness(true, lanes);
      const adminService = new VendorGmailService(
        {
          uid: "admin-a",
          email: "admin@pmikcmetro.com",
          vendorId: "vendor-a",
          isAdmin: true,
          dataMode: "live",
        },
        principal.email,
        {
          assignments,
          provider: { getClient },
          confirmations: {
            createConfirmation: vi.fn(),
            claimConfirmation: vi.fn(),
            markConfirmation: vi.fn(),
          },
        },
      );
      await expect(
        adminService.readLinkedThread("ticket-a", "thread-a"),
      ).rejects.toMatchObject({ status: 404 });
      expect(getClient).not.toHaveBeenCalled();
      expect(client.getLinkedThread).not.toHaveBeenCalled();
    },
  );
});
