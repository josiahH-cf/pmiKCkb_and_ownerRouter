import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import { encodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import {
  LiveRenewalGmailDraftProvider,
  type RenewalDraftGmailClient,
} from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { LeaseGmailExecutor } from "@/lib/lease-renewal/execution/providers";
import {
  TEST_RENEWAL_ATTACHMENT_IDENTITY,
  TEST_RESOLVED_RENEWAL_ATTACHMENT,
} from "@/tests/helpers/renewal-draft-attachment";

const MAILBOX = "workflow@pmikcmetro.com";

function fakeClient(overrides: Partial<RenewalDraftGmailClient> = {}) {
  const createDraft = vi.fn(
    async (): Promise<{ draftId: string; messageId?: string }> => ({
      draftId: "draft-live-1",
    }),
  );
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
  copy_template_hash: "a".repeat(64),
  copy_envelope_hash: "b".repeat(64),
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
  // S40 AC-S40-1: an external action must declare its lane; there is no implicit Live default.
  dataMode: "live" as const,
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

  it("cannot reconcile without a deterministic identifier, and never verifies SMS consent", async () => {
    const { client } = fakeClient();
    const provider = new LiveRenewalGmailDraftProvider(client);

    // No RFC Message-ID and no lookup capability means there is nothing to resolve BY. Returning
    // null is honest here; it must never fall back to creating a second draft.
    await expect(
      provider.reconcile({
        actionKey: "gmail.renewal_notice.draft_create",
        idempotencyKey: "synthetic-key",
      }),
    ).resolves.toBeNull();
    await expect(provider.verifySmsConsent()).rejects.toThrow(/never performs SMS/i);
  });

  it("produces a stable idempotency key for the same governed draft input", () => {
    // Sanity check that the executor's identity contract is exercised by this action shape.
    expect(externalActionIdempotencyKey(draftInput)).toBe(
      externalActionIdempotencyKey({ ...draftInput }),
    );
  });

  it("creates one attachment draft and succeeds only after exact created-id raw MIME readback", async () => {
    const rfcMessageId = "<owner-s79@pmikcmetro.com>";
    const body = `${DRAFT_BANNER}\n\nComparable rent screenshot attached.`;
    const raw = encodeRawDraft({
      to: "owner@northend-holdings.com",
      subject: "Owner renewal review",
      body,
      from: MAILBOX,
      messageId: rfcMessageId,
      attachment: {
        filename: TEST_RESOLVED_RENEWAL_ATTACHMENT.filename,
        mimeType: TEST_RESOLVED_RENEWAL_ATTACHMENT.mimeType,
        bytes: TEST_RESOLVED_RENEWAL_ATTACHMENT.bytes,
      },
    });
    const getDraftById = vi.fn(async () => ({
      draftId: "draft-live-1",
      messageId: "gmail-message-1",
      raw,
    }));
    const { client, createDraft } = fakeClient({ getDraftById });
    createDraft.mockResolvedValueOnce({
      draftId: "draft-live-1",
      messageId: "gmail-message-1",
    });
    const provider = new LiveRenewalGmailDraftProvider(
      client,
      TEST_RESOLVED_RENEWAL_ATTACHMENT,
    );

    const readback = await provider.execute({
      operation: "draft",
      artifactRef: "owner-renewal:v1.0",
      recipient: "owner@northend-holdings.com",
      sender: MAILBOX,
      subject: "Owner renewal review",
      body,
      attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY,
      expectedRfcMessageId: rfcMessageId,
      idempotencyKey: "idem-s79",
    });

    expect(createDraft).toHaveBeenCalledWith({
      to: "owner@northend-holdings.com",
      subject: "Owner renewal review",
      body,
      messageId: rfcMessageId,
      attachment: {
        filename: TEST_RESOLVED_RENEWAL_ATTACHMENT.filename,
        mimeType: "image/png",
        bytes: TEST_RESOLVED_RENEWAL_ATTACHMENT.bytes,
      },
    });
    expect(getDraftById).toHaveBeenCalledWith("draft-live-1");
    expect(readback).toMatchObject({
      providerRef: "draft-live-1",
      rfcMessageId,
      payload: { attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY },
    });
  });

  it("marks a changed Gmail API message identity after create as ambiguous", async () => {
    const rfcMessageId = "<owner-s79-message-id@pmikcmetro.com>";
    const body = `${DRAFT_BANNER}\n\nComparable rent screenshot attached.`;
    const raw = encodeRawDraft({
      to: "owner@northend-holdings.com",
      subject: "Owner renewal review",
      body,
      from: MAILBOX,
      messageId: rfcMessageId,
      attachment: {
        filename: TEST_RESOLVED_RENEWAL_ATTACHMENT.filename,
        mimeType: TEST_RESOLVED_RENEWAL_ATTACHMENT.mimeType,
        bytes: TEST_RESOLVED_RENEWAL_ATTACHMENT.bytes,
      },
    });
    const { client, createDraft } = fakeClient({
      getDraftById: async () => ({
        draftId: "draft-live-1",
        messageId: "gmail-message-readback",
        raw,
      }),
    });
    createDraft.mockResolvedValueOnce({
      draftId: "draft-live-1",
      messageId: "gmail-message-created",
    });
    const provider = new LiveRenewalGmailDraftProvider(
      client,
      TEST_RESOLVED_RENEWAL_ATTACHMENT,
    );

    await expect(
      provider.execute({
        operation: "draft",
        artifactRef: "owner-renewal:v1.0",
        recipient: "owner@northend-holdings.com",
        sender: MAILBOX,
        subject: "Owner renewal review",
        body,
        attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY,
        expectedRfcMessageId: rfcMessageId,
        idempotencyKey: "idem-s79-message-id",
      }),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("marks post-create attachment mismatch as ambiguous instead of success", async () => {
    const rfcMessageId = "<owner-s79-mismatch@pmikcmetro.com>";
    const body = `${DRAFT_BANNER}\n\nComparable rent screenshot attached.`;
    const changedBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x09, 0x09, 0x09, 0x09,
    ]);
    const raw = encodeRawDraft({
      to: "owner@northend-holdings.com",
      subject: "Owner renewal review",
      body,
      from: MAILBOX,
      messageId: rfcMessageId,
      attachment: {
        filename: TEST_RENEWAL_ATTACHMENT_IDENTITY.filename,
        mimeType: "image/png",
        bytes: changedBytes,
      },
    });
    const { client } = fakeClient({
      getDraftById: async () => ({ draftId: "draft-live-1", raw }),
    });
    const provider = new LiveRenewalGmailDraftProvider(
      client,
      TEST_RESOLVED_RENEWAL_ATTACHMENT,
    );

    await expect(
      provider.execute({
        operation: "draft",
        artifactRef: "owner-renewal:v1.0",
        recipient: "owner@northend-holdings.com",
        sender: MAILBOX,
        subject: "Owner renewal review",
        body,
        attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY,
        expectedRfcMessageId: rfcMessageId,
        idempotencyKey: "idem-s79-mismatch",
      }),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("reconciles an attachment only from decoded exact-RFC raw MIME", async () => {
    const rfcMessageId = "<owner-s79-reconcile@pmikcmetro.com>";
    const body = `${DRAFT_BANNER}\n\nComparable rent screenshot attached.`;
    const raw = encodeRawDraft({
      to: "owner@northend-holdings.com",
      subject: "Owner renewal review",
      body,
      from: MAILBOX,
      messageId: rfcMessageId,
      attachment: {
        filename: TEST_RENEWAL_ATTACHMENT_IDENTITY.filename,
        mimeType: "image/png",
        bytes: TEST_RESOLVED_RENEWAL_ATTACHMENT.bytes,
      },
    });
    const { client } = fakeClient({
      findDraftByRfcMessageId: async () => ({
        draftId: "draft-reconciled-s79",
        raw,
      }),
    });
    const provider = new LiveRenewalGmailDraftProvider(client);
    const expectedPayload = {
      operation: "draft" as const,
      artifactRef: "owner-renewal:v1.0",
      recipient: "owner@northend-holdings.com",
      sender: MAILBOX,
      subject: "Owner renewal review",
      body,
      attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY,
    };

    await expect(
      provider.reconcile({
        actionKey: "gmail.renewal_notice.draft_create",
        idempotencyKey: "idem-s79-reconcile",
        expectedRfcMessageId: rfcMessageId,
        expectedPayload,
      }),
    ).resolves.toMatchObject({
      providerRef: "draft-reconciled-s79",
      rfcMessageId,
      payload: expectedPayload,
    });
  });
});
