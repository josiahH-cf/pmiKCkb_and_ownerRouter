import { describe, expect, it, vi } from "vitest";

import type {
  VendorTestMailboxConfirmation,
  VendorTestMailboxRecord,
  VendorTestMailboxStore,
} from "@/lib/vendor/test-mailbox";
import {
  projectVendorTestMailboxHandoff,
  VendorTestMailboxService,
} from "@/lib/vendor/test-mailbox";

const principal = {
  uid: "uid-test-summit",
  vendorId: "vendor:test-summit-plumbing",
  email: "service@summit-plumbing.example.invalid",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: 1,
  dataMode: "test" as const,
};

function harness(assigned = true) {
  let mailbox: VendorTestMailboxRecord | null = null;
  const confirmations = new Map<string, VendorTestMailboxConfirmation>();
  const saveTestMailbox = vi.fn(
    async (input: {
      actorUid: string;
      record: VendorTestMailboxRecord;
      expectedUpdatedAt: string | null;
    }) => {
      mailbox = structuredClone(input.record);
      return structuredClone(input.record);
    },
  );
  const store: VendorTestMailboxStore = {
    getTestMailbox: async () => (mailbox ? structuredClone(mailbox) : null),
    saveTestMailbox,
    createTestMailboxConfirmation: async (record) => {
      confirmations.set(record.id, structuredClone(record));
      return true;
    },
    commitTestMailboxReply: async (input) => {
      const confirmation = confirmations.get(input.confirmationId);
      if (!confirmation || !mailbox) return { outcome: "mismatch" };
      if (
        confirmation.id !== input.confirmationId ||
        confirmation.actorUid !== input.actorUid ||
        confirmation.vendorId !== input.vendorId ||
        confirmation.ticketId !== input.ticketId ||
        confirmation.threadId !== input.threadId ||
        confirmation.messageId !== input.messageId ||
        confirmation.payloadHash !== input.payloadHash ||
        mailbox.vendorId !== input.vendorId ||
        mailbox.ticketId !== input.ticketId ||
        mailbox.threadId !== input.threadId
      ) {
        return { outcome: "mismatch" };
      }
      if (confirmation.state === "sent") {
        return { outcome: "duplicate", mailbox: structuredClone(mailbox) };
      }
      if (confirmation.state === "ambiguous" || confirmation.state === "sending") {
        return { outcome: "ambiguous" };
      }
      if (confirmation.state !== "pending") return { outcome: "mismatch" };
      if (confirmation.expiresAtMs <= input.nowMs) return { outcome: "expired" };

      const existing = mailbox.messages.find((message) => message.id === input.messageId);
      if (existing) {
        if (existing.body !== input.body) return { outcome: "ambiguous" };
        confirmation.state = "sent";
        return { outcome: "duplicate", mailbox: structuredClone(mailbox) };
      }
      mailbox = {
        ...mailbox,
        snippet: input.body.slice(0, 240),
        draftBody: "",
        messages: [
          ...mailbox.messages,
          {
            id: input.messageId,
            direction: "vendor_reply",
            body: input.body,
            createdAt: input.nowIso,
          },
        ],
        updatedAt: input.nowIso,
      };
      confirmation.state = "sent";
      return { outcome: "sent", mailbox: structuredClone(mailbox) };
    },
  };
  const getAssignedTicket = vi.fn(async ({ ticketId }: { ticketId: string }) =>
    assigned && ticketId === "ticket:test-maple-leak"
      ? {
          id: ticketId,
          status: "Waiting on Vendor",
          priority: "Normal",
          summary: "Invented sink leak at Maple 204",
          unitLabel: "Maple 204 · Test unit",
          updatedAt: "2026-07-15T12:00:00.000Z",
          dataMode: "test" as const,
        }
      : null,
  );
  const service = new VendorTestMailboxService(principal, {
    assignments: {
      isVendorActive: async (_id, _uid, _email, mode) => mode === "test",
      listAssignedTickets: async () => [],
      getAssignedTicket,
      isThreadLinked: async () => false,
    },
    store,
    now: () => Date.parse("2026-07-15T12:00:00.000Z"),
  });
  return { service, saveTestMailbox, getAssignedTicket };
}

describe("Vendor Test mailbox", () => {
  it("persists an invented assigned-thread reply only after exact confirmation", async () => {
    const { service } = harness();
    const mailbox = await service.read("ticket:test-maple-leak");
    expect(mailbox).toMatchObject({
      data_mode: "test",
      liveEvidenceEligible: false,
      threadId: "test-thread:ticket:test-maple-leak",
    });
    const prepared = await service.prepareReply(
      "ticket:test-maple-leak",
      "I can visit the invented unit tomorrow at 9 AM.",
    );
    expect(prepared.callout).toMatchObject({
      dataMode: "test",
      externalEffect: false,
      liveEvidenceEligible: false,
    });
    const input = {
      confirmationToken: prepared.confirmationToken,
      ticketId: prepared.ticketId,
      threadId: prepared.threadId,
      body: prepared.body,
      messageId: prepared.messageId,
    };
    await expect(service.confirmReply(input)).resolves.toMatchObject({
      status: "simulated",
      duplicate: false,
      receipt: { liveEvidenceEligible: false },
    });
    await expect(service.confirmReply(input)).resolves.toMatchObject({
      duplicate: true,
    });
    await expect(service.read("ticket:test-maple-leak")).resolves.toMatchObject({
      messages: [{ body: "I can visit the invented unit tomorrow at 9 AM." }],
    });
  });

  it("hides an unassigned ticket before any Test mailbox write", async () => {
    const { service, saveTestMailbox } = harness(false);
    await expect(service.read("ticket:guessed-live-ticket")).rejects.toMatchObject({
      status: 404,
    });
    expect(saveTestMailbox).not.toHaveBeenCalled();
  });

  it("projects bodyless staff handoff state and reconstructs legacy label history", () => {
    const legacy = {
      id: "vendor:test-summit-plumbing:ticket:test-maple-leak",
      vendorId: "vendor:test-summit-plumbing",
      ticketId: "ticket:test-maple-leak",
      threadId: "test-thread:ticket:test-maple-leak",
      data_mode: "test",
      liveEvidenceEligible: false,
      subject: "Invented sink leak",
      snippet: "Private simulated snippet",
      label: "PMI/Vendor/Complete",
      draftBody: "Private simulated draft",
      messages: [
        {
          id: "private-message-id",
          direction: "vendor_reply",
          body: "Private simulated reply",
          createdAt: "2026-07-15T12:01:00.000Z",
        },
      ],
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:02:00.000Z",
    } as VendorTestMailboxRecord;

    const handoff = projectVendorTestMailboxHandoff(legacy);

    expect(handoff).toMatchObject({
      ticketId: "ticket:test-maple-leak",
      data_mode: "test",
      currentState: "Complete",
      draftPresent: true,
      replyCount: 1,
      externalProvider: false,
      liveEvidenceEligible: false,
      labelHistory: [{ state: "Waiting" }, { state: "Complete" }],
    });
    expect(JSON.stringify(handoff)).not.toContain("Private simulated");
    expect(JSON.stringify(handoff)).not.toContain("private-message-id");
    expect(JSON.stringify(handoff)).not.toContain("test-thread");
    expect(JSON.stringify(handoff)).not.toContain("vendor:test-summit-plumbing");
  });

  it("appends bounded bodyless label history on every supported state action", async () => {
    const { service } = harness();
    await service.read("ticket:test-maple-leak");
    await service.applyLabel("ticket:test-maple-leak", "PMI/Vendor/Waiting");
    await service.applyLabel("ticket:test-maple-leak", "PMI/Vendor/Complete");

    await expect(service.read("ticket:test-maple-leak")).resolves.toMatchObject({
      label: "PMI/Vendor/Complete",
      labelHistory: [
        { label: "PMI/Vendor/Waiting" },
        { label: "PMI/Vendor/Waiting" },
        { label: "PMI/Vendor/Complete" },
      ],
    });
  });

  it("atomically preserves two distinct concurrent exact-confirmed replies", async () => {
    const { service } = harness();
    await service.read("ticket:test-maple-leak");
    const prepared = await Promise.all([
      service.prepareReply(
        "ticket:test-maple-leak",
        "I can inspect the invented unit tomorrow at 9 AM.",
      ),
      service.prepareReply(
        "ticket:test-maple-leak",
        "I can bring the invented replacement valve tomorrow at 10 AM.",
      ),
    ]);
    const inputs = prepared.map((reply) => ({
      confirmationToken: reply.confirmationToken,
      ticketId: reply.ticketId,
      threadId: reply.threadId,
      body: reply.body,
      messageId: reply.messageId,
    }));

    await expect(
      Promise.all(inputs.map((input) => service.confirmReply(input))),
    ).resolves.toMatchObject([
      { status: "simulated", duplicate: false },
      { status: "simulated", duplicate: false },
    ]);
    const afterConcurrentConfirm = await service.read("ticket:test-maple-leak");
    expect(afterConcurrentConfirm.messages.map((message) => message.body).sort()).toEqual(
      inputs.map((input) => input.body).sort(),
    );

    await expect(
      Promise.all(inputs.map((input) => service.confirmReply(input))),
    ).resolves.toMatchObject([{ duplicate: true }, { duplicate: true }]);
    await expect(service.read("ticket:test-maple-leak")).resolves.toMatchObject({
      messages: [{}, {}],
    });
  });

  it("cannot be constructed for a Live Vendor principal", () => {
    expect(
      () =>
        new VendorTestMailboxService(
          { ...principal, dataMode: "live" },
          {
            assignments: {
              isVendorActive: vi.fn(),
              listAssignedTickets: vi.fn(),
              getAssignedTicket: vi.fn(),
              isThreadLinked: vi.fn(),
            },
            store: {} as VendorTestMailboxStore,
          },
        ),
    ).toThrow("only in the Test workspace");
  });
});
