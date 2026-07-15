import { createHash, randomBytes } from "node:crypto";

import {
  requireAssignedThread,
  type VendorAssignmentRepository,
} from "@/lib/vendor/assignment";
import { VendorBoundaryError, type VendorPrincipal } from "@/lib/vendor/model";

export interface VendorGmailClient {
  getLinkedThread(
    threadId: string,
  ): Promise<{ id: string; subject: string; snippet: string }>;
  createReplyDraft(input: {
    threadId: string;
    body: string;
  }): Promise<{ draftId: string }>;
  applyApprovedLabel(input: { threadId: string; label: string }): Promise<void>;
  sendReply(input: { threadId: string; body: string; messageId: string }): Promise<{
    messageId: string;
    threadId: string;
  }>;
  reconcileByMessageId(
    messageId: string,
  ): Promise<{ messageId: string; threadId: string } | null>;
}

export interface VendorSendConfirmation {
  id: string;
  actorUid: string;
  vendorId: string;
  mailboxEmail: string;
  ticketId: string;
  threadId: string;
  payloadHash: string;
  messageId: string;
  expiresAtMs: number;
  state: "pending" | "sending" | "sent" | "ambiguous" | "failed";
}

export interface VendorGmailStateStore {
  createConfirmation(record: VendorSendConfirmation): Promise<void>;
  claimConfirmation(input: {
    id: string;
    actorUid: string;
    payloadHash: string;
    nowMs: number;
  }): Promise<"claimed" | "expired" | "mismatch" | "duplicate" | "ambiguous">;
  markConfirmation(input: {
    id: string;
    state: "sent" | "ambiguous" | "failed";
    result?: { messageId: string; threadId: string };
  }): Promise<void>;
}

export interface VendorMailboxProvider {
  getClient(input: {
    vendorId: string;
    mailboxEmail: string;
  }): Promise<VendorGmailClient>;
}

export type VendorGmailActor =
  | VendorPrincipal
  | { uid: string; email: string; vendorId: string; isAdmin: true };

const CONFIRMATION_MS = 10 * 60 * 1000;

function payloadHash(input: {
  actorUid: string;
  vendorId: string;
  mailboxEmail: string;
  ticketId: string;
  threadId: string;
  body: string;
  messageId: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function validateBody(body: string) {
  const value = body.trim();
  if (!value || value.length > 20_000) {
    throw new VendorBoundaryError("Review a bounded reply before continuing.", 400);
  }
  return value;
}

export class VendorGmailService {
  constructor(
    private readonly principal: VendorGmailActor,
    private readonly mailboxEmail: string,
    private readonly dependencies: {
      assignments: VendorAssignmentRepository;
      provider: VendorMailboxProvider;
      confirmations: VendorGmailStateStore;
      now?: () => number;
    },
  ) {
    if (
      !("isAdmin" in principal) &&
      mailboxEmail.trim().toLowerCase() !== principal.email
    ) {
      throw new VendorBoundaryError(
        "Vendor mailbox does not match the signed-in account.",
        403,
      );
    }
  }

  private now() {
    return (this.dependencies.now ?? Date.now)();
  }

  private async client(ticketId: string, threadId: string) {
    if ("isAdmin" in this.principal) {
      const ticket = await this.dependencies.assignments.getAssignedTicket(
        this.principal.vendorId,
        ticketId,
      );
      const linked = await this.dependencies.assignments.isThreadLinked({
        vendorId: this.principal.vendorId,
        ticketId,
        threadId,
      });
      if (!ticket || !linked) {
        throw new VendorBoundaryError("Ticket communication not found.", 404);
      }
    } else {
      await requireAssignedThread(
        this.principal,
        { ticketId, threadId },
        this.dependencies.assignments,
      );
    }
    return this.dependencies.provider.getClient({
      vendorId: this.principal.vendorId,
      mailboxEmail: this.mailboxEmail,
    });
  }

  async readLinkedThread(ticketId: string, threadId: string) {
    return (await this.client(ticketId, threadId)).getLinkedThread(threadId);
  }

  async createReplyDraft(ticketId: string, threadId: string, body: string) {
    return (await this.client(ticketId, threadId)).createReplyDraft({
      threadId,
      body: validateBody(body),
    });
  }

  async applyApprovedLabel(
    ticketId: string,
    threadId: string,
    label: "PMI/Vendor/Waiting" | "PMI/Vendor/Complete",
  ) {
    return (await this.client(ticketId, threadId)).applyApprovedLabel({
      threadId,
      label,
    });
  }

  async prepareReply(ticketId: string, threadId: string, body: string) {
    await this.client(ticketId, threadId);
    const normalizedBody = validateBody(body);
    const token = randomBytes(32).toString("base64url");
    const id = createHash("sha256").update(token).digest("hex");
    const messageId = `<vendor-${randomBytes(16).toString("hex")}@pmikc.invalid>`;
    const hash = payloadHash({
      actorUid: this.principal.uid,
      vendorId: this.principal.vendorId,
      mailboxEmail: this.mailboxEmail,
      ticketId,
      threadId,
      body: normalizedBody,
      messageId,
    });
    await this.dependencies.confirmations.createConfirmation({
      id,
      actorUid: this.principal.uid,
      vendorId: this.principal.vendorId,
      mailboxEmail: this.mailboxEmail,
      ticketId,
      threadId,
      payloadHash: hash,
      messageId,
      expiresAtMs: this.now() + CONFIRMATION_MS,
      state: "pending",
    });
    return {
      confirmationToken: token,
      messageId,
      body: normalizedBody,
      ticketId,
      threadId,
    };
  }

  async sendConfirmed(input: {
    confirmationToken: string;
    ticketId: string;
    threadId: string;
    body: string;
    messageId: string;
  }) {
    const client = await this.client(input.ticketId, input.threadId);
    const normalizedBody = validateBody(input.body);
    const id = createHash("sha256").update(input.confirmationToken).digest("hex");
    const hash = payloadHash({
      actorUid: this.principal.uid,
      vendorId: this.principal.vendorId,
      mailboxEmail: this.mailboxEmail,
      ticketId: input.ticketId,
      threadId: input.threadId,
      body: normalizedBody,
      messageId: input.messageId,
    });
    const claim = await this.dependencies.confirmations.claimConfirmation({
      id,
      actorUid: this.principal.uid,
      payloadHash: hash,
      nowMs: this.now(),
    });
    if (claim === "duplicate") return { status: "sent" as const, duplicate: true };
    if (claim === "ambiguous") {
      throw new VendorBoundaryError(
        "The prior send is ambiguous. Reconcile before retrying.",
        409,
      );
    }
    if (claim !== "claimed") {
      throw new VendorBoundaryError("The exact reply confirmation is unavailable.", 409);
    }
    try {
      const result = await client.sendReply({
        threadId: input.threadId,
        body: normalizedBody,
        messageId: input.messageId,
      });
      await this.dependencies.confirmations.markConfirmation({
        id,
        state: "sent",
        result,
      });
      return { status: "sent" as const, duplicate: false, result };
    } catch (error) {
      const ambiguous = !(error instanceof VendorBoundaryError);
      await this.dependencies.confirmations.markConfirmation({
        id,
        state: ambiguous ? "ambiguous" : "failed",
      });
      throw new VendorBoundaryError(
        ambiguous
          ? "The Vendor Gmail outcome is ambiguous. No automatic retry was attempted."
          : "Vendor Gmail refused the reply. The confirmation was consumed.",
        409,
      );
    }
  }
}
