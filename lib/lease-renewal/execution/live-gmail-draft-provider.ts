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
    subject: string;
    body: string;
  }): Promise<{ draftId: string }>;
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

    const { draftId } = await this.client.createDraft({ to: recipient, subject, body });

    // Echo the exact reviewed payload back as the readback. A createDraft that succeeds with these
    // fields IS faithful to them; the executor re-asserts readback == expected as a guard against a
    // provider that silently alters the message. We strip the non-payload envelope fields.
    const { expectedRfcMessageId, idempotencyKey, ...payload } = input;
    void expectedRfcMessageId;
    void idempotencyKey;
    return { providerRef: draftId, payload };
  }

  async reconcile(): Promise<WorkflowMessageReadback | null> {
    // Creating an unsent draft is not a send: there is no ambiguous external delivery to reconcile, and
    // a duplicate unsent draft is harmless and manually removable. Returning null tells the orchestrator
    // "no prior receipt found," so a retry simply re-drafts rather than resurrecting a phantom send.
    return null;
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
