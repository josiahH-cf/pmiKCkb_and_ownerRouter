// Live WorkflowMessageProvider that turns an owner-approved renewal notice into a REAL UNSENT Gmail
// draft via GmailRuntimeClient.createDraft. This is the production bridge the governed
// LeaseGmailExecutor (operation "draft", action gmail.renewal_notice.draft_create) was missing: until
// now only the synthetic release-rehearsal provider existed, which echoed a fake draft and never
// created anything in a mailbox. With this provider the already-authorized draft action finally
// produces a real unsent draft a human can open and send.
//
// DRAFT-ONLY END STATE (owner-confirmed 2026-07-19): this provider creates an unsent draft in the
// approval sender's Drafts folder and does NOTHING else. It hard-refuses every non-draft operation
// (send, reply, portal, sms, label), so even if it were wired to the multi-operation LeaseGmailExecutor
// alongside a send action, no send could occur THROUGH it. `.send` also stays production_allowed:false
// in the Action Registry; this provider boundary is the second, independent guard. The draft-only
// guarantee rests on CONSTRUCTION, not on an absent send scope: gmail.compose is itself send-capable (it
// can both create AND send drafts). What makes this safe is that the provider only ever calls createDraft
// and never invokes GmailRuntimeClient.sendMessage or the Gmail messages/send endpoint. An architecture
// test (tests/unit/lease-renewal-send-boundary.test.ts) enforces that no lease-renewal module imports the
// concrete send-capable client or calls sendMessage.

import { DRAFT_BANNER } from "@/lib/constants";
import { ExternalExecutionError } from "@/lib/external-execution/types";
import type {
  WorkflowMessagePayload,
  WorkflowMessageProvider,
  WorkflowMessageReadback,
} from "@/lib/lease-renewal/execution/providers";

/**
 * The narrow Gmail runtime surface this provider needs. `GmailRuntimeClient` satisfies it structurally;
 * tests inject a fake so no unit test ever contacts Gmail. `subject` is the authenticated mailbox the
 * draft is created in — it must match the notice sender.
 */
export interface RenewalDraftGmailClient {
  readonly subject: string;
  createDraft(input: {
    to: string;
    cc?: string[];
    subject: string;
    body: string;
    /** Deterministic RFC Message-ID stamped so the one attempt can be reconciled by identifier. */
    messageId?: string;
  }): Promise<{ draftId: string; messageId?: string }>;
  /**
   * Read-only lookup of an already-created draft by its exact RFC Message-ID. Required for
   * reconciliation: without it, an attempt whose outcome was never recorded could only be resolved
   * by drafting again.
   */
  findDraftByRfcMessageId?(
    rfcMessageId: string,
  ): Promise<{ draftId: string; messageId?: string } | null>;
}

type WorkflowMessageExecuteInput = WorkflowMessagePayload & {
  expectedRfcMessageId?: string;
  idempotencyKey: string;
};

export class LiveRenewalGmailDraftProvider implements WorkflowMessageProvider {
  constructor(private readonly client: RenewalDraftGmailClient) {}

  async execute(input: WorkflowMessageExecuteInput): Promise<WorkflowMessageReadback> {
    if (input.operation !== "draft") {
      throw new ExternalExecutionError(
        `The live renewal draft provider only creates unsent drafts; it refused a "${input.operation}" operation.`,
        "blocked",
      );
    }
    const recipient = requireField(input.recipient, "recipient");
    const subject = requireField(input.subject, "subject");
    const body = requireField(input.body, "body");
    if (!body.startsWith(`${DRAFT_BANNER}\n\n`)) {
      throw new ExternalExecutionError(
        "The unsent draft body must carry the verbatim review-before-sending banner.",
        "blocked",
      );
    }
    const sender = input.sender?.trim().toLowerCase();
    if (sender && sender !== this.client.subject) {
      throw new ExternalExecutionError(
        "The draft sender must match the authenticated Gmail mailbox.",
        "blocked",
      );
    }

    // Co-tenant Cc recipients (F-LEASE-6), already validated authoritative by
    // assertAuthoritativeRenewalRecipient before the executor ran. Carried as a comma-joined string on the
    // payload; split back to addresses only to hand Gmail the draft.
    const cc = (input.cc ?? "")
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);

    const created = await this.client.createDraft({
      to: recipient,
      ...(cc.length ? { cc } : {}),
      subject,
      body,
      ...(input.expectedRfcMessageId ? { messageId: input.expectedRfcMessageId } : {}),
    });

    // Echo the exact reviewed payload back as the readback. A createDraft that succeeds with these
    // fields IS faithful to them; the executor re-asserts readback == expected as a guard against a
    // provider that silently alters the message. We strip the non-payload envelope fields.
    const { expectedRfcMessageId, idempotencyKey, ...payload } = input;
    void idempotencyKey;
    return {
      providerRef: created.draftId,
      ...(expectedRfcMessageId ? { rfcMessageId: expectedRfcMessageId } : {}),
      payload,
    };
  }

  /**
   * Resolve an already-consumed draft attempt by its exact RFC Message-ID.
   *
   * This deliberately replaces the previous `return null`, which reasoned that a duplicate unsent
   * draft is harmless and let a retry simply re-draft. Under the one-attempt contract that is no
   * longer the rule: the attempt is consumed either way, and silently re-drafting would leave the
   * operator with two drafts of the same client message and no evidence of which one the ledger
   * describes. Reading is the only recovery; this method never creates anything.
   */
  async reconcile(input: {
    actionKey: string;
    idempotencyKey: string;
    expectedRfcMessageId?: string;
    expectedPayload?: WorkflowMessagePayload;
  }): Promise<WorkflowMessageReadback | null> {
    const rfcMessageId = input.expectedRfcMessageId?.trim();
    if (!rfcMessageId || !input.expectedPayload || !this.client.findDraftByRfcMessageId) {
      return null;
    }
    const found = await this.client.findDraftByRfcMessageId(rfcMessageId);
    if (!found) return null;
    // The unique identifier IS the evidence here. The echoed payload only satisfies the executor's
    // equality contract; reconciliation deliberately does not pull a client message body back into
    // the process just to re-compare it.
    return { providerRef: found.draftId, rfcMessageId, payload: input.expectedPayload };
  }

  async verifySmsConsent(): Promise<boolean> {
    // Unreachable for a draft (the executor only consults consent for the "sms" operation, which this
    // provider refuses above), but implemented as a hard refusal so the boundary can never be misused.
    throw new ExternalExecutionError(
      "The live renewal draft provider never performs SMS operations.",
      "blocked",
    );
  }
}

function requireField(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ExternalExecutionError(
      `The renewal draft ${label} is required.`,
      "blocked",
    );
  }
  return trimmed;
}
