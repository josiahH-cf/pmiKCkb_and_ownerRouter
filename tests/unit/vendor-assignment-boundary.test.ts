import { describe, expect, it } from "vitest";

import {
  listVendorTickets,
  requireAssignedThread,
  requireAssignedTicket,
  type VendorAssignmentRepository,
} from "@/lib/vendor/assignment";

const principal = {
  uid: "uid-a",
  vendorId: "vendor-a",
  email: "a@example.com",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: 1,
};

function repository(): VendorAssignmentRepository {
  return {
    isVendorActive: async (vendorId, uid) => vendorId === "vendor-a" && uid === "uid-a",
    listAssignedTickets: async (vendorId) =>
      vendorId === "vendor-a"
        ? [
            {
              id: "ticket-a",
              status: "Open",
              priority: "Normal",
              summary: "Synthetic assigned repair",
              unitLabel: "Synthetic unit",
              updatedAt: "2026-07-14T00:00:00.000Z",
            },
          ]
        : [],
    getAssignedTicket: async (vendorId, ticketId) =>
      vendorId === "vendor-a" && ticketId === "ticket-a"
        ? (await repository().listAssignedTickets(vendorId))[0]
        : null,
    isThreadLinked: async ({ vendorId, ticketId, threadId }) =>
      vendorId === "vendor-a" && ticketId === "ticket-a" && threadId === "thread-a",
  };
}

describe("Vendor assigned-ticket boundary", () => {
  it("returns only assigned bounded projections", async () => {
    expect(await listVendorTickets(principal, repository())).toHaveLength(1);
    await expect(
      requireAssignedTicket(principal, "ticket-a", repository()),
    ).resolves.toMatchObject({
      id: "ticket-a",
    });
  });

  it("returns the same 404 for guessed ticket and thread ids", async () => {
    await expect(
      requireAssignedTicket(principal, "ticket-b", repository()),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      requireAssignedThread(
        principal,
        { ticketId: "ticket-a", threadId: "thread-b" },
        repository(),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
