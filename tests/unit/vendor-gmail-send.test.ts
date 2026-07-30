import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import { FirestoreVendorStore, VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import { VendorGmailService, type VendorSendConfirmation } from "@/lib/vendor/gmail";
import { VENDOR_OAUTH_SCOPES } from "@/lib/vendor/model";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const principal = {
  uid: "uid-a",
  vendorId: "vendor-a",
  email: "trade@example.com",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: 1,
  dataMode: "live" as const,
};

function harness(sendResult: "success" | "ambiguous" = "success") {
  let confirmation: VendorSendConfirmation | undefined;
  const sendReply =
    sendResult === "success"
      ? vi.fn().mockResolvedValue({ messageId: "sent-1", threadId: "thread-a" })
      : vi.fn().mockRejectedValue(new Error("network lost"));
  const client = {
    getLinkedThread: vi.fn(),
    createReplyDraft: vi.fn(),
    applyApprovedLabel: vi.fn(),
    sendReply,
    reconcileByMessageId: vi.fn(),
  };
  const state = {
    createConfirmation: async (record: VendorSendConfirmation) =>
      void (confirmation = record),
    claimConfirmation: vi.fn(async ({ id, actorUid, payloadHash, nowMs }) => {
      if (
        !confirmation ||
        confirmation.id !== id ||
        confirmation.actorUid !== actorUid ||
        confirmation.payloadHash !== payloadHash
      )
        return "mismatch" as const;
      if (confirmation.state === "sent") return "duplicate" as const;
      if (confirmation.state === "ambiguous") return "ambiguous" as const;
      if (confirmation.expiresAtMs <= nowMs) return "expired" as const;
      confirmation.state = "sending";
      return "claimed" as const;
    }),
    markConfirmation: vi.fn(async ({ state: next }) => {
      if (confirmation) confirmation.state = next;
    }),
  };
  const service = new VendorGmailService(principal, principal.email, {
    assignments: {
      isVendorActive: async () => true,
      listAssignedTickets: async () => [],
      getAssignedTicket: async () => ({
        id: "ticket-a",
        status: "Open",
        priority: "Normal",
        summary: "Synthetic",
        unitLabel: null,
        updatedAt: "2026-07-14T00:00:00.000Z",
      }),
      isThreadLinked: async () => true,
      getGmailLaneContext: async () => ({
        vendor: "live",
        assignment: "live",
        ticket: "live",
        thread: "live",
      }),
    },
    provider: { getClient: vi.fn().mockResolvedValue(client) },
    confirmations: state,
    now: () => 1_000,
  });
  return { service, sendReply, state };
}

describe("Vendor exact-confirmed reply", () => {
  it("binds actor/mailbox/ticket/thread/body and consumes one attempt", async () => {
    const { service, sendReply } = harness();
    const prepared = await service.prepareReply(
      "ticket-a",
      "thread-a",
      "Exact synthetic reply",
    );
    const input = {
      confirmationToken: prepared.confirmationToken,
      ticketId: prepared.ticketId,
      threadId: prepared.threadId,
      body: prepared.body,
      messageId: prepared.messageId,
    };
    await expect(service.sendConfirmed(input)).resolves.toMatchObject({
      duplicate: false,
    });
    await expect(service.sendConfirmed(input)).resolves.toMatchObject({
      duplicate: true,
    });
    expect(sendReply).toHaveBeenCalledTimes(1);
  });

  it("refuses payload drift before provider and never retries ambiguity", async () => {
    const first = harness();
    const prepared = await first.service.prepareReply(
      "ticket-a",
      "thread-a",
      "Exact reply",
    );
    await expect(
      first.service.sendConfirmed({
        confirmationToken: prepared.confirmationToken,
        ticketId: prepared.ticketId,
        threadId: prepared.threadId,
        body: "Changed reply",
        messageId: prepared.messageId,
      }),
    ).rejects.toBeDefined();
    expect(first.sendReply).not.toHaveBeenCalled();

    const ambiguous = harness("ambiguous");
    const second = await ambiguous.service.prepareReply(
      "ticket-a",
      "thread-a",
      "Exact reply",
    );
    const input = {
      confirmationToken: second.confirmationToken,
      ticketId: second.ticketId,
      threadId: second.threadId,
      body: second.body,
      messageId: second.messageId,
    };
    await expect(ambiguous.service.sendConfirmed(input)).rejects.toThrow("ambiguous");
    await expect(ambiguous.service.sendConfirmed(input)).rejects.toThrow("Reconcile");
    expect(ambiguous.sendReply).toHaveBeenCalledTimes(1);
  });

  it("binds the generated RFC message id and permits a pre-authorized Admin on the same assignment", async () => {
    const first = harness();
    const prepared = await first.service.prepareReply(
      "ticket-a",
      "thread-a",
      "Exact reply",
    );
    await expect(
      first.service.sendConfirmed({
        confirmationToken: prepared.confirmationToken,
        ticketId: prepared.ticketId,
        threadId: prepared.threadId,
        body: prepared.body,
        messageId: "<drift@example.invalid>",
      }),
    ).rejects.toBeDefined();
    expect(first.sendReply).not.toHaveBeenCalled();

    const sendReply = vi
      .fn()
      .mockResolvedValue({ messageId: "sent-admin", threadId: "thread-a" });
    let record: VendorSendConfirmation | undefined;
    const service = new VendorGmailService(
      {
        uid: "admin-1",
        email: "admin@pmikcmetro.com",
        vendorId: "vendor-a",
        isAdmin: true,
        dataMode: "live",
      },
      "trade@example.com",
      {
        assignments: {
          isVendorActive: async () => true,
          listAssignedTickets: async () => [],
          getAssignedTicket: async () => ({
            id: "ticket-a",
            status: "Open",
            priority: "Normal",
            summary: "Synthetic",
            unitLabel: null,
            updatedAt: "2026-07-14T00:00:00.000Z",
          }),
          isThreadLinked: async () => true,
          getGmailLaneContext: async () => ({
            vendor: "live",
            assignment: "live",
            ticket: "live",
            thread: "live",
          }),
        },
        provider: {
          getClient: vi.fn().mockResolvedValue({
            getLinkedThread: vi.fn(),
            createReplyDraft: vi.fn(),
            applyApprovedLabel: vi.fn(),
            sendReply,
            reconcileByMessageId: vi.fn(),
          }),
        },
        confirmations: {
          createConfirmation: async (value) => void (record = value),
          claimConfirmation: async ({ id, actorUid, payloadHash }) =>
            record?.id === id &&
            record.actorUid === actorUid &&
            record.payloadHash === payloadHash
              ? "claimed"
              : "mismatch",
          markConfirmation: vi.fn(),
        },
        now: () => 1_000,
      },
    );
    const adminPrepared = await service.prepareReply(
      "ticket-a",
      "thread-a",
      "Exact Admin reply",
    );
    await expect(
      service.sendConfirmed({
        confirmationToken: adminPrepared.confirmationToken,
        ticketId: adminPrepared.ticketId,
        threadId: adminPrepared.threadId,
        body: adminPrepared.body,
        messageId: adminPrepared.messageId,
      }),
    ).resolves.toMatchObject({ status: "sent" });
    expect(sendReply).toHaveBeenCalledTimes(1);
  });

  it("refuses a confirmed send when disable wins after client construction", async () => {
    const fake = new FakeTransactionalFirestore();
    const vendorPath = `${VENDOR_COLLECTIONS.vendors}/${principal.vendorId}`;
    const connectionPath = `${VENDOR_COLLECTIONS.connections}/${principal.vendorId}`;
    fake.seed(vendorPath, {
      id: principal.vendorId,
      uid: principal.uid,
      email: principal.email,
      status: "active",
      inviteVersion: 1,
      data_mode: "live",
      createdAt: "2026-07-30T12:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
    });
    fake.seed(`${VENDOR_COLLECTIONS.assignments}/ticket-a`, {
      ticket_id: "ticket-a",
      vendor_id: principal.vendorId,
      active: true,
      data_mode: "live",
    });
    fake.seed("maintenance_tickets/ticket-a", {
      id: "ticket-a",
      status: "Waiting on Vendor",
      priority: "Normal",
      summary: "Live repair",
      data_mode: "live",
      updated_at: "2026-07-30T12:00:00.000Z",
    });
    fake.seed(
      `${VENDOR_COLLECTIONS.threadLinks}/${principal.vendorId}:ticket-a:thread-a`,
      {
        ticket_id: "ticket-a",
        vendor_id: principal.vendorId,
        thread_id: "thread-a",
        active: true,
        data_mode: "live",
      },
    );
    fake.seed(connectionPath, {
      vendorId: principal.vendorId,
      mailboxEmail: principal.email,
      provider: "google",
      status: "connected",
      scopes: VENDOR_OAUTH_SCOPES,
      tokenSecretRef: "projects/p/secrets/vendor-a",
      dataMode: "live",
      connectedAt: "2026-07-30T12:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    const sendReply = vi
      .fn()
      .mockResolvedValue({ messageId: "sent-1", threadId: "thread-a" });
    let clientCount = 0;
    const service = new VendorGmailService(principal, principal.email, {
      assignments: store,
      confirmations: store,
      provider: {
        getClient: vi.fn(async () => {
          clientCount += 1;
          if (clientCount === 2) {
            fake.seed(vendorPath, {
              ...(fake.store.get(vendorPath) ?? {}),
              status: "disabled",
              disabledAt: "2026-07-30T12:05:00.000Z",
              updatedAt: "2026-07-30T12:05:00.000Z",
            });
            fake.seed(connectionPath, {
              ...(fake.store.get(connectionPath) ?? {}),
              status: "revocation_pending",
              updatedAt: "2026-07-30T12:05:00.000Z",
            });
          }
          return {
            getLinkedThread: vi.fn(),
            createReplyDraft: vi.fn(),
            applyApprovedLabel: vi.fn(),
            sendReply,
            reconcileByMessageId: vi.fn(),
          };
        }),
      },
      now: () => 1_000,
    });
    const prepared = await service.prepareReply("ticket-a", "thread-a", "Exact reply");

    await expect(
      service.sendConfirmed({
        confirmationToken: prepared.confirmationToken,
        ticketId: prepared.ticketId,
        threadId: prepared.threadId,
        body: prepared.body,
        messageId: prepared.messageId,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(sendReply).not.toHaveBeenCalled();
    expect(
      fake.store.get(
        `${VENDOR_COLLECTIONS.confirmations}/${createHash("sha256")
          .update(prepared.confirmationToken)
          .digest("hex")}`,
      ),
    ).toMatchObject({ state: "pending" });
  });
});
