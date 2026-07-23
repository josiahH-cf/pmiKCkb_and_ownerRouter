// S39.3 — the concrete internal transactional Gmail sender. Sends AS the existing internal transactional
// sender identity (KB_APPROVAL_SENDER) over the ALREADY-APPROVED Gmail send scope via keyless DWD; no new
// external scope, credential, or endpoint. It sends ONE message to the (already internal-domain-verified)
// recipient the executor resolved — it performs no recipient resolution or gate check itself (the executor
// owns the gate, the SYSTEM-read recipient lock, and the internal-domain re-assert before it is ever called).
//
// Fail-closed: an absent sender identity refuses (the executor records delivered:false rather than sending
// as an unexpected mailbox). The `from` is pinned to the DWD subject, so Gmail's own From===subject check is
// an additional guard that this only ever sends as the configured internal identity.

import { GmailRuntimeClient, createRfcMessageId } from "@/lib/gmail-runtime/client";
import {
  InternalTransactionalError,
  type InternalTransactionalSender,
} from "@/lib/notifications/internal-transactional";

/** A narrow slice of the Gmail runtime this sender needs; the real client satisfies it (tests inject a fake). */
export interface InternalGmailSendClient {
  readonly subject: string;
  sendMessage(input: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    messageId: string;
    references: string[];
  }): Promise<unknown>;
}

export class GmailInternalTransactionalSender implements InternalTransactionalSender {
  constructor(
    private readonly senderAddress: string | undefined,
    private readonly createClient: (subject: string) => InternalGmailSendClient = (
      subject,
    ) => new GmailRuntimeClient({ subject }),
  ) {}

  async send(input: { to: string; subject: string; body: string }): Promise<void> {
    const from = (this.senderAddress ?? "").trim().toLowerCase();
    if (from === "") {
      throw new InternalTransactionalError(
        "No internal transactional sender identity is configured (KB_APPROVAL_SENDER); refusing to send.",
      );
    }
    const client = this.createClient(from);
    await client.sendMessage({
      from,
      to: [input.to],
      cc: [],
      bcc: [],
      subject: input.subject,
      body: input.body,
      // The RFC Message-ID domain comes from the internal SENDER mailbox (server-verified), not the email
      // subject line — createRfcMessageId validates the address and builds <uuid@pmikcmetro.com>.
      messageId: createRfcMessageId(from),
      references: [],
    });
  }
}
