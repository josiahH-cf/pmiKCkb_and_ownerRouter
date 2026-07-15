import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import { FirestoreVendorStore, VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import {
  listVendorTickets,
  requireAssignedThread,
  requireAssignedTicket,
  type VendorAssignmentRepository,
} from "@/lib/vendor/assignment";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

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
    isVendorActive: async (vendorId, uid, email) =>
      vendorId === "vendor-a" && uid === "uid-a" && email === "a@example.com",
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

  it("rejects a changed verified email even when uid and Vendor claim are unchanged", async () => {
    await expect(
      listVendorTickets({ ...principal, email: "changed@example.com" }, repository()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("binds Firestore activation and every active check to the invited email", async () => {
    const fake = new FakeFirestore();
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/vendor-a`, {
      id: "vendor-a",
      uid: "uid-a",
      email: "A@Example.com",
      status: "pending_setup",
      inviteVersion: 1,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);

    await expect(
      store.activateVendor(
        "vendor-a",
        "uid-a",
        "a@example.com",
        "2026-07-14T01:00:00.000Z",
      ),
    ).resolves.toBe(true);
    await expect(
      store.isVendorActive("vendor-a", "uid-a", "A@example.com"),
    ).resolves.toBe(true);
    await expect(
      store.isVendorActive("vendor-a", "uid-a", "changed@example.com"),
    ).resolves.toBe(false);
    await expect(
      store.activateVendor(
        "vendor-a",
        "uid-a",
        "changed@example.com",
        "2026-07-14T02:00:00.000Z",
      ),
    ).resolves.toBe(false);
  });

  it("binds a Test Vendor assignment to Test assignment and ticket records", async () => {
    const fake = new FakeFirestore();
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/vendor:test-summit-plumbing`, {
      id: "vendor:test-summit-plumbing",
      uid: "uid-test-summit",
      email: "service@summit-plumbing.example.invalid",
      status: "active",
      inviteVersion: 1,
      data_mode: "test",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    });
    fake.seed(`${VENDOR_COLLECTIONS.assignments}/ticket:test-maple-leak`, {
      ticket_id: "ticket:test-maple-leak",
      vendor_id: "vendor:test-summit-plumbing",
      active: true,
      data_mode: "test",
    });
    fake.seed("maintenance_tickets/ticket:test-maple-leak", {
      id: "ticket:test-maple-leak",
      data_mode: "test",
      status: "Waiting on Vendor",
      priority: "Normal",
      priority_provenance: "operator-set",
      summary: "Invented leak at Maple 204",
      description: "Invented test data",
      unit: { unitId: "unit:test-maple-204", label: "Maple 204 · Test unit" },
      photo_refs: [],
      reporter: { kind: "staff" },
      labels: [],
      space_id: "maintenance",
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-15T00:00:00.000Z",
    });
    fake.seed(
      `${VENDOR_COLLECTIONS.threadLinks}/vendor:test-summit-plumbing:ticket:test-maple-leak:thread:test-maple-leak`,
      {
        ticket_id: "ticket:test-maple-leak",
        vendor_id: "vendor:test-summit-plumbing",
        thread_id: "thread:test-maple-leak",
        active: true,
        data_mode: "test",
      },
    );
    const store = new FirestoreVendorStore(fake as unknown as Firestore);

    await expect(
      store.isVendorActive(
        "vendor:test-summit-plumbing",
        "uid-test-summit",
        "service@summit-plumbing.example.invalid",
        "test",
      ),
    ).resolves.toBe(true);
    await expect(
      store.isVendorActive(
        "vendor:test-summit-plumbing",
        "uid-test-summit",
        "service@summit-plumbing.example.invalid",
        "live",
      ),
    ).resolves.toBe(false);
    await expect(
      store.getAssignedTicket("vendor:test-summit-plumbing", "ticket:test-maple-leak"),
    ).resolves.toMatchObject({ id: "ticket:test-maple-leak", dataMode: "test" });
    await expect(
      store.getGmailLaneContext({
        vendorId: "vendor:test-summit-plumbing",
        ticketId: "ticket:test-maple-leak",
        threadId: "thread:test-maple-leak",
      }),
    ).resolves.toEqual({
      vendor: "test",
      assignment: "test",
      ticket: "test",
      thread: "test",
    });

    fake.seed("maintenance_tickets/ticket:test-maple-leak", {
      ...(fake.store.get("maintenance_tickets/ticket:test-maple-leak") ?? {}),
      data_mode: "live",
    });
    await expect(
      store.getAssignedTicket("vendor:test-summit-plumbing", "ticket:test-maple-leak"),
    ).resolves.toBeNull();
    await expect(
      store.getGmailLaneContext({
        vendorId: "vendor:test-summit-plumbing",
        ticketId: "ticket:test-maple-leak",
        threadId: "thread:test-maple-leak",
      }),
    ).resolves.toMatchObject({ vendor: "test", ticket: "live", thread: "test" });
  });
});
