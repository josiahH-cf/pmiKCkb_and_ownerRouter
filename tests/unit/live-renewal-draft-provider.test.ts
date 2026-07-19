import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import {
  LiveRenewalGmailDraftProvider,
  type RenewalDraftGmailClient,
} from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { LeaseGmailExecutor } from "@/lib/lease-renewal/execution/providers";

const MAILBOX = "workflow@pmikcmetro.com";

function fakeClient(overrides: Partial<RenewalDraftGmailClient> = {}) {
  const createDraft = vi.fn(async () => ({ draftId: "draft-live-1" }));
  const client: RenewalDraftGmailClient = {
    subject: MAILBOX,
    createDraft,
    ...overrides,
  };
  return { client, createDraft };
}

const draftValues = {
  workflow_context: "renewal:lease-live-1",
  template_ref: "tenant-renewal:v1.0",
  from: MAILBOX,
  to: "resident@example.invalid",
  subject: "Your lease renewal",
  body: `${DRAFT_BANNER}\n\nAn owner-approved renewal notice body.`,
  recipient_source_ref: "rentvine:lease-live-1:tenant-email",
  mailbox_source_ref: "session:workflow-mailbox",
  draft_banner_present: true,
};

const draftInput = {
  workflowId: "renewal-live-1",
  actionId: "draft-1",
  actionKey: "gmail.renewal_notice.draft_create",
  values: draftValues,
  sourceRefs: ["source:live-renewal-run"],
};

describe("LiveRenewalGmailDraftProvider", () => {
  it("creates a real unsent draft for a draft operation and echoes the reviewed payload", async () => {
    const { client, createDraft } = fakeClient();
    const provider = new LiveRenewalGmailDraftProvider(client);

    const readback = await provider.execute({
      operation: "draft",
      artifactRef: "tenant-renewal:v1.0",
      recipient: "resident@example.invalid",
      sender: MAILBOX,
      subject: "Your lease renewal",
      body: `${DRAFT_BANNER}\n\nBody`,
      idempotencyKey: "idem-1",
    });

    expect(createDraft).toHaveBeenCalledWith({
      to: "resident@example.invalid",
      subject: "Your lease renewal",
      body: `${DRAFT_BANNER}\n\nBody`,
    });
    expect(readback.providerRef).toBe("draft-live-1");
    expect(readback.payload).toEqual({
      operation: "draft",
      artifactRef: "tenant-renewal:v1.0",
      recipient: "resident@example.invalid",
      sender: MAILBOX,
      subject: "Your lease renewal",
      body: `${DRAFT_BANNER}\n\nBody`,
    });
    // The idempotency envelope is never leaked into the readback payload.
    expect(JSON.stringify(readback.payload)).not.toContain("idem-1");
  });

  it("drives the full governed LeaseGmailExecutor to a real draft end-to-end", async () => {
    const { client, createDraft } = fakeClient();
    const executor = new LeaseGmailExecutor(new LiveRenewalGmailDraftProvider(client));

    const receipt = await executor.execute(draftInput);

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(createDraft).toHaveBeenCalledWith({
      to: draftValues.to,
      subject: draftValues.subject,
      body: draftValues.body,
    });
    expect(receipt.providerRef).toBe("draft-live-1");
    expect(receipt.outcome).toBe("succeeded");
    // The receipt never carries the raw recipient or body.
    expect(JSON.stringify(receipt)).not.toContain(draftValues.to);
    expect(JSON.stringify(receipt)).not.toContain("renewal notice body");
  });

  it.each(["send", "reply", "portal", "sms", "label"] as const)(
    "hard-refuses the non-draft %s operation and never touches Gmail",
    async (operation) => {
      const { client, createDraft } = fakeClient();
      const provider = new LiveRenewalGmailDraftProvider(client);

      await expect(
        provider.execute({
          operation,
          recipient: "resident@example.invalid",
          subject: "s",
          body: `${DRAFT_BANNER}\n\nb`,
          idempotencyKey: "idem-2",
        }),
      ).rejects.toThrow(/only creates unsent drafts/i);
      expect(createDraft).not.toHaveBeenCalled();
    },
  );

  it("refuses a draft body without the verbatim banner", async () => {
    const { client, createDraft } = fakeClient();
    const provider = new LiveRenewalGmailDraftProvider(client);

    await expect(
      provider.execute({
        operation: "draft",
        recipient: "resident@example.invalid",
        subject: "s",
        body: "Unbannered body",
        idempotencyKey: "idem-3",
      }),
    ).rejects.toThrow(/banner/i);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("refuses a sender that is not the authenticated mailbox", async () => {
    const { client, createDraft } = fakeClient();
    const provider = new LiveRenewalGmailDraftProvider(client);

    await expect(
      provider.execute({
        operation: "draft",
        recipient: "resident@example.invalid",
        sender: "someone-else@pmikcmetro.com",
        subject: "s",
        body: `${DRAFT_BANNER}\n\nb`,
        idempotencyKey: "idem-4",
      }),
    ).rejects.toThrow(/authenticated Gmail mailbox/i);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("requires recipient, subject, and body", async () => {
    const { client } = fakeClient();
    const provider = new LiveRenewalGmailDraftProvider(client);
    const good = {
      operation: "draft" as const,
      recipient: "resident@example.invalid",
      subject: "s",
      body: `${DRAFT_BANNER}\n\nb`,
      idempotencyKey: "idem-5",
    };

    await expect(provider.execute({ ...good, recipient: "  " })).rejects.toThrow(
      /recipient is required/i,
    );
    await expect(provider.execute({ ...good, subject: "" })).rejects.toThrow(
      /subject is required/i,
    );
    await expect(provider.execute({ ...good, body: "" })).rejects.toThrow(
      /body is required/i,
    );
  });

  it("never reconciles a phantom send and never verifies SMS consent", async () => {
    const { client } = fakeClient();
    const provider = new LiveRenewalGmailDraftProvider(client);

    await expect(provider.reconcile()).resolves.toBeNull();
    await expect(provider.verifySmsConsent()).rejects.toThrow(/never performs SMS/i);
  });

  it("produces a stable idempotency key for the same governed draft input", () => {
    // Sanity check that the executor's identity contract is exercised by this action shape.
    expect(externalActionIdempotencyKey(draftInput)).toBe(
      externalActionIdempotencyKey({ ...draftInput }),
    );
  });
});
