import { createHash, randomBytes } from "node:crypto";

import { executionEvidenceMarker, resolveDataMode } from "@/lib/data-mode";

import {
  requireAssignedTicket,
  type VendorAssignmentRepository,
} from "@/lib/vendor/assignment";
import {
  VendorBoundaryError,
  type VendorPrincipal,
  vendorPrincipalDataMode,
} from "@/lib/vendor/model";

export const VENDOR_TEST_MAILBOX_LABELS = [
  "PMI/Vendor/Waiting",
  "PMI/Vendor/Complete",
] as const;

export type VendorTestMailboxLabel = (typeof VENDOR_TEST_MAILBOX_LABELS)[number];

export interface VendorTestMailboxMessage {
  id: string;
  direction: "vendor_reply";
  body: string;
  createdAt: string;
}

export interface VendorTestMailboxRecord {
  id: string;
  vendorId: string;
  ticketId: string;
  threadId: string;
  data_mode: "test";
  liveEvidenceEligible: false;
  subject: string;
  snippet: string;
  label: VendorTestMailboxLabel;
  draftBody: string;
  messages: VendorTestMailboxMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface VendorTestMailboxConfirmation {
  id: string;
  actorUid: string;
  vendorId: string;
  ticketId: string;
  threadId: string;
  payloadHash: string;
  messageId: string;
  expiresAtMs: number;
  state: "pending" | "sending" | "sent" | "ambiguous" | "failed";
  data_mode: "test";
  liveEvidenceEligible: false;
}

export type VendorTestMailboxReplyCommitResult =
  | {
      outcome: "sent" | "duplicate";
      mailbox: VendorTestMailboxRecord;
    }
  | {
      outcome: "expired" | "mismatch" | "ambiguous";
    };

export interface VendorTestMailboxStore {
  getTestMailbox(
    vendorId: string,
    ticketId: string,
  ): Promise<VendorTestMailboxRecord | null>;
  saveTestMailbox(record: VendorTestMailboxRecord): Promise<void>;
  createTestMailboxConfirmation(record: VendorTestMailboxConfirmation): Promise<void>;
  commitTestMailboxReply(input: {
    confirmationId: string;
    actorUid: string;
    vendorId: string;
    ticketId: string;
    threadId: string;
    payloadHash: string;
    messageId: string;
    body: string;
    nowMs: number;
    nowIso: string;
  }): Promise<VendorTestMailboxReplyCommitResult>;
}

const CONFIRMATION_MS = 10 * 60 * 1000;
export const VENDOR_TEST_MAILBOX_MAX_MESSAGES = 100;

function boundedBody(body: string) {
  const value = body.trim();
  if (!value || value.length > 20_000) {
    throw new VendorBoundaryError("Review a bounded Test reply before continuing.", 400);
  }
  return value;
}

function payloadHash(input: {
  actorUid: string;
  vendorId: string;
  ticketId: string;
  threadId: string;
  body: string;
  messageId: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class VendorTestMailboxService {
  constructor(
    private readonly principal: VendorPrincipal,
    private readonly dependencies: {
      assignments: VendorAssignmentRepository;
      store: VendorTestMailboxStore;
      now?: () => number;
    },
  ) {
    if (vendorPrincipalDataMode(principal) !== "test") {
      throw new VendorBoundaryError(
        "The simulated mailbox is available only in the Test workspace.",
        403,
      );
    }
  }

  private now() {
    return (this.dependencies.now ?? Date.now)();
  }

  private async mailbox(ticketId: string) {
    const ticket = await requireAssignedTicket(
      this.principal,
      ticketId,
      this.dependencies.assignments,
    );
    const existing = await this.dependencies.store.getTestMailbox(
      this.principal.vendorId,
      ticketId,
    );
    if (existing) {
      if (
        resolveDataMode(existing) !== "test" ||
        existing.liveEvidenceEligible !== false ||
        existing.vendorId !== this.principal.vendorId ||
        existing.ticketId !== ticketId
      ) {
        throw new VendorBoundaryError("Test mailbox boundary is invalid.", 409);
      }
      return existing;
    }

    const createdAt = new Date(this.now()).toISOString();
    const record: VendorTestMailboxRecord = {
      id: `${this.principal.vendorId}:${ticketId}`,
      vendorId: this.principal.vendorId,
      ticketId,
      threadId: `test-thread:${ticketId}`,
      data_mode: "test",
      liveEvidenceEligible: false,
      subject: ticket.summary,
      snippet:
        "Simulated assigned-ticket thread. Replies stay inside the production Test workspace.",
      label: "PMI/Vendor/Waiting",
      draftBody: "",
      messages: [],
      createdAt,
      updatedAt: createdAt,
    };
    await this.dependencies.store.saveTestMailbox(record);
    return record;
  }

  async read(ticketId: string) {
    return this.mailbox(ticketId);
  }

  async saveDraft(ticketId: string, body: string) {
    const record = await this.mailbox(ticketId);
    const updated = {
      ...record,
      draftBody: boundedBody(body),
      updatedAt: new Date(this.now()).toISOString(),
    };
    await this.dependencies.store.saveTestMailbox(updated);
    return {
      mailbox: updated,
      receipt: testReceipt("vendor.test_mailbox.draft", ticketId, record.threadId),
    };
  }

  async applyLabel(ticketId: string, label: VendorTestMailboxLabel) {
    if (!VENDOR_TEST_MAILBOX_LABELS.includes(label)) {
      throw new VendorBoundaryError("Choose an approved Test mailbox label.", 400);
    }
    const record = await this.mailbox(ticketId);
    const updated = {
      ...record,
      label,
      updatedAt: new Date(this.now()).toISOString(),
    };
    await this.dependencies.store.saveTestMailbox(updated);
    return {
      mailbox: updated,
      receipt: testReceipt("vendor.test_mailbox.label", ticketId, record.threadId),
    };
  }

  async prepareReply(ticketId: string, body: string) {
    const record = await this.mailbox(ticketId);
    const normalizedBody = boundedBody(body);
    const confirmationToken = randomBytes(32).toString("base64url");
    const id = createHash("sha256").update(confirmationToken).digest("hex");
    const messageId = `<test-vendor-${randomBytes(16).toString("hex")}@example.invalid>`;
    const confirmation: VendorTestMailboxConfirmation = {
      id,
      actorUid: this.principal.uid,
      vendorId: this.principal.vendorId,
      ticketId,
      threadId: record.threadId,
      payloadHash: payloadHash({
        actorUid: this.principal.uid,
        vendorId: this.principal.vendorId,
        ticketId,
        threadId: record.threadId,
        body: normalizedBody,
        messageId,
      }),
      messageId,
      expiresAtMs: this.now() + CONFIRMATION_MS,
      state: "pending",
      data_mode: "test",
      liveEvidenceEligible: false,
    };
    await this.dependencies.store.createTestMailboxConfirmation(confirmation);
    return {
      confirmationToken,
      ticketId,
      threadId: record.threadId,
      body: normalizedBody,
      messageId,
      callout: {
        ...executionEvidenceMarker("test"),
        action: "Simulate Vendor reply",
        target: `Test ticket ${ticketId} · ${record.threadId}`,
        externalEffect: false as const,
        exactEffect:
          "Append this invented reply to the production Test workspace. No email or external provider is contacted.",
      },
    };
  }

  async confirmReply(input: {
    confirmationToken: string;
    ticketId: string;
    threadId: string;
    body: string;
    messageId: string;
  }) {
    const record = await this.mailbox(input.ticketId);
    if (record.threadId !== input.threadId) {
      throw new VendorBoundaryError("Test mailbox thread is unavailable.", 404);
    }
    const normalizedBody = boundedBody(input.body);
    const id = createHash("sha256").update(input.confirmationToken).digest("hex");
    const hash = payloadHash({
      actorUid: this.principal.uid,
      vendorId: this.principal.vendorId,
      ticketId: input.ticketId,
      threadId: input.threadId,
      body: normalizedBody,
      messageId: input.messageId,
    });
    let commit: VendorTestMailboxReplyCommitResult;
    try {
      const nowMs = this.now();
      commit = await this.dependencies.store.commitTestMailboxReply({
        confirmationId: id,
        actorUid: this.principal.uid,
        vendorId: this.principal.vendorId,
        ticketId: input.ticketId,
        threadId: input.threadId,
        payloadHash: hash,
        messageId: input.messageId,
        body: normalizedBody,
        nowMs,
        nowIso: new Date(nowMs).toISOString(),
      });
    } catch {
      throw new VendorBoundaryError(
        "The simulated reply outcome is ambiguous. Reconcile before retrying.",
        409,
      );
    }
    if (commit.outcome === "duplicate") {
      return {
        status: "simulated" as const,
        duplicate: true,
        receipt: testReceipt("vendor.test_mailbox.reply", input.ticketId, input.threadId),
      };
    }
    if (commit.outcome === "ambiguous") {
      throw new VendorBoundaryError(
        "The simulated reply outcome is ambiguous. Reconcile before retrying.",
        409,
      );
    }
    if (commit.outcome !== "sent") {
      throw new VendorBoundaryError(
        "The exact Test reply confirmation is unavailable.",
        409,
      );
    }
    return {
      status: "simulated" as const,
      duplicate: false,
      mailbox: commit.mailbox,
      receipt: testReceipt("vendor.test_mailbox.reply", input.ticketId, input.threadId),
    };
  }
}

function testReceipt(action: string, ticketId: string, threadId: string) {
  return {
    action,
    ticketId,
    threadId,
    ...executionEvidenceMarker("test"),
    externalEffect: false as const,
  };
}
