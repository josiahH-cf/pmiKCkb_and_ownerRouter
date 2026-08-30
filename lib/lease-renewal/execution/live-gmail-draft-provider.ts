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
import { decodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import type {
  WorkflowMessagePayload,
  WorkflowMessageProvider,
  WorkflowMessageReadback,
} from "@/lib/lease-renewal/execution/providers";
import {
  sameRenewalDraftAttachmentIdentity,
  type ResolvedRenewalDraftAttachment,
} from "@/lib/lease-renewal/execution/renewal-draft-attachment";

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
    attachment?: {
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
    };
  }): Promise<{ draftId: string; messageId?: string }>;
  /** Exact created-id raw readback. Required only for the S79 attachment path. */
  getDraftById?(
    draftId: string,
  ): Promise<{ draftId: string; messageId?: string; raw: string }>;
  /**
   * Read-only lookup of an already-created draft by its exact RFC Message-ID. Required for
   * reconciliation: without it, an attempt whose outcome was never recorded could only be resolved
   * by drafting again.
   */
  findDraftByRfcMessageId?(
    rfcMessageId: string,
  ): Promise<{ draftId: string; messageId?: string; raw?: string } | null>;
}

type WorkflowMessageExecuteInput = WorkflowMessagePayload & {
  expectedRfcMessageId?: string;
  idempotencyKey: string;
};

export class LiveRenewalGmailDraftProvider implements WorkflowMessageProvider {
  constructor(
    private readonly client: RenewalDraftGmailClient,
    private readonly resolvedAttachment?: ResolvedRenewalDraftAttachment,
  ) {}

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

    if (
      input.attachment &&
      (!this.resolvedAttachment ||
        !sameRenewalDraftAttachmentIdentity(input.attachment, this.resolvedAttachment))
    ) {
      throw new ExternalExecutionError(
        "The exact reviewed screenshot bytes are unavailable or changed.",
        "blocked",
      );
    }
    if (!input.attachment && this.resolvedAttachment) {
      throw new ExternalExecutionError(
        "Unreviewed attachment bytes cannot be added to this draft.",
        "blocked",
      );
    }

    const created = await this.client.createDraft({
      to: recipient,
      ...(cc.length ? { cc } : {}),
      subject,
      body,
      ...(input.expectedRfcMessageId ? { messageId: input.expectedRfcMessageId } : {}),
      ...(this.resolvedAttachment
        ? {
            attachment: {
              filename: this.resolvedAttachment.filename,
              mimeType: this.resolvedAttachment.mimeType,
              bytes: this.resolvedAttachment.bytes,
            },
          }
        : {}),
    });

    const { expectedRfcMessageId, idempotencyKey, ...payload } = input;
    void idempotencyKey;
    if (input.attachment) {
      if (!this.client.getDraftById) {
        throw new ExternalExecutionError(
          "Gmail created the draft but exact attachment readback is unavailable.",
          "ambiguous",
        );
      }
      try {
        const fetched = await this.client.getDraftById(created.draftId);
        if (
          fetched.draftId !== created.draftId ||
          (created.messageId !== undefined &&
            fetched.messageId !== undefined &&
            fetched.messageId !== created.messageId)
        ) {
          throw new Error("Gmail returned a different draft or message id.");
        }
        return {
          providerRef: fetched.draftId,
          ...(expectedRfcMessageId ? { rfcMessageId: expectedRfcMessageId } : {}),
          payload: payloadFromRawDraft(
            payload,
            fetched.raw,
            expectedRfcMessageId,
            this.resolvedAttachment,
          ),
        };
      } catch (error) {
        if (error instanceof ExternalExecutionError) throw error;
        throw new ExternalExecutionError(
          "Gmail created the draft but its exact attachment MIME could not be verified.",
          "ambiguous",
        );
      }
    }

    // Text-only compatibility stays byte- and behavior-compatible; S79's stronger MIME readback is
    // activated only by the narrow governed attachment identity.
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
    if (input.expectedPayload.attachment) {
      if (!found.raw) {
        throw new ExternalExecutionError(
          "The exact draft was found, but Gmail did not return attachment MIME for reconciliation.",
          "ambiguous",
        );
      }
      return {
        providerRef: found.draftId,
        rfcMessageId,
        payload: payloadFromRawDraft(input.expectedPayload, found.raw, rfcMessageId),
      };
    }
    // Legacy text-only reconciliation remains identity-based for byte compatibility; attachment
    // reconciliation can never take this path.
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

function payloadFromRawDraft(
  expected: WorkflowMessagePayload,
  raw: string,
  expectedRfcMessageId?: string,
  exactBytes?: ResolvedRenewalDraftAttachment,
): WorkflowMessagePayload {
  const decoded = decodeRawDraft(raw);
  const attachment = expected.attachment;
  const expectedCc = (expected.cc ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    decoded.to !== expected.recipient ||
    decoded.subject !== expected.subject ||
    decoded.body !== expected.body ||
    (expected.sender !== undefined && decoded.from !== expected.sender) ||
    decoded.cc.length !== expectedCc.length ||
    decoded.cc.some((value, index) => value !== expectedCc[index]) ||
    (expectedRfcMessageId !== undefined && decoded.messageId !== expectedRfcMessageId)
  ) {
    throw new ExternalExecutionError(
      "The provider-returned draft headers or text did not match the exact reviewed payload.",
      "ambiguous",
    );
  }
  if (
    !attachment ||
    !decoded.attachment ||
    decoded.attachment.filename !== attachment.filename ||
    decoded.attachment.mimeType !== attachment.mimeType ||
    decoded.attachment.sizeBytes !== attachment.sizeBytes ||
    decoded.attachment.sha256Checksum !== attachment.sha256Checksum ||
    (exactBytes !== undefined &&
      !Buffer.from(decoded.attachment.bytes).equals(Buffer.from(exactBytes.bytes)))
  ) {
    throw new ExternalExecutionError(
      "The provider-returned draft attachment did not match the exact reviewed receipt.",
      "ambiguous",
    );
  }
  return {
    operation: expected.operation,
    ...(expected.artifactRef ? { artifactRef: expected.artifactRef } : {}),
    recipient: decoded.to,
    ...(decoded.cc.length ? { cc: decoded.cc.join(", ") } : {}),
    ...(decoded.from ? { sender: decoded.from } : {}),
    subject: decoded.subject,
    body: decoded.body,
    attachment,
  };
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
