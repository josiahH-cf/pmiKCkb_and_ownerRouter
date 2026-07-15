import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import {
  LeaseGmailExecutor,
  type WorkflowMessagePayload,
} from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  actionId: "gmail-1",
  actionKey: "gmail.renewal_notice.send",
  values: {
    workflow_context: "renewal:lease-synthetic",
    template_ref: "tenant-renewal:v1.0",
    from: "workflow@pmikcmetro.com",
    to: "tenant@example.invalid",
    subject: "Synthetic renewal notice",
    body: "Synthetic source-backed renewal notice",
    recipient_source_ref: "fixture:tenant",
    mailbox_source_ref: "fixture:mailbox",
    rfc_message_id: "<renewal-synthetic@example.invalid>",
  },
  sourceRefs: ["source:synthetic"],
};

describe("Lease Gmail executor", () => {
  it("uses authoritative recipient plus S24 artifact and idempotency", async () => {
    const execute = vi.fn(async (input: ProviderExecuteInput) => ({
      providerRef: "gmail-message-1",
      rfcMessageId: base.values.rfc_message_id,
      payload: payloadFrom(input),
    }));
    const executor = new LeaseGmailExecutor({
      execute,
      reconcile: vi.fn(),
      verifySmsConsent: vi.fn(),
    });
    const result = await executor.execute(base);
    expect(result.providerRef).toBe("gmail-message-1");
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "tenant@example.invalid",
        expectedRfcMessageId: base.values.rfc_message_id,
        idempotencyKey: externalActionIdempotencyKey(base),
      }),
    );
    expect(JSON.stringify(result)).not.toContain(base.values.body);
    const changedBody = await executor.execute({
      ...base,
      values: { ...base.values, body: "A second exact reviewed body" },
    });
    expect(changedBody.resultHash).not.toBe(result.resultHash);
  });

  it("blocks missing recipient or unapproved artifact before provider", async () => {
    const execute = vi.fn();
    const executor = new LeaseGmailExecutor({
      execute,
      reconcile: vi.fn(),
      verifySmsConsent: vi.fn(),
    });
    await expect(
      executor.execute({ ...base, values: { ...base.values, to: "" } }),
    ).rejects.toBeDefined();
    await expect(
      executor.execute({
        ...base,
        values: { ...base.values, template_ref: "mutable-draft" },
      }),
    ).rejects.toBeDefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("requires the literal banner in the actual draft body, not only a boolean", async () => {
    const execute = vi.fn(async (input: ProviderExecuteInput) => ({
      providerRef: "draft-synthetic-1",
      payload: payloadFrom(input),
    }));
    const executor = new LeaseGmailExecutor({
      execute,
      reconcile: vi.fn(),
      verifySmsConsent: vi.fn(),
    });
    await expect(
      executor.execute({
        ...base,
        actionKey: "gmail.renewal_notice.draft_create",
        values: {
          ...base.values,
          body: "Unbannered draft body",
          draft_banner_present: true,
        },
      }),
    ).rejects.toThrow(/banner/i);
    await expect(
      executor.execute({
        ...base,
        actionKey: "gmail.renewal_notice.draft_create",
        values: {
          ...base.values,
          body: `${DRAFT_BANNER}\n\nSynthetic draft`,
          draft_banner_present: true,
        },
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["recipient", { recipient: "wrong-recipient@example.invalid" }],
    ["body", { body: "A different provider-fetched body" }],
  ] as const)(
    "rejects a matching RFC Message-ID with drifted provider-fetched %s",
    async (_field, readbackPatch) => {
      const execute = vi.fn(async (input: ProviderExecuteInput) => ({
        providerRef: "gmail-message-drifted",
        rfcMessageId: base.values.rfc_message_id,
        payload: { ...payloadFrom(input), ...readbackPatch },
      }));
      const executor = new LeaseGmailExecutor({
        execute,
        reconcile: vi.fn(),
        verifySmsConsent: vi.fn(),
      });

      await expect(executor.execute(base)).rejects.toThrow(/reviewed payload/i);
    },
  );

  it("rejects reconciliation when the RFC Message-ID matches but the fetched body does not", async () => {
    const expectedPayload = messagePayloadForBase();
    const executor = new LeaseGmailExecutor({
      execute: vi.fn(),
      reconcile: vi.fn().mockResolvedValue({
        providerRef: "gmail-message-1",
        rfcMessageId: base.values.rfc_message_id,
        payload: { ...expectedPayload, body: "Drifted reconciled body" },
      }),
      verifySmsConsent: vi.fn(),
    });

    await expect(executor.reconcile(base)).rejects.toThrow(/reviewed payload/i);
  });

  it("refuses SMS when the trusted consent resolver does not bind recipient and sender", async () => {
    const execute = vi.fn();
    const verifySmsConsent = vi.fn().mockResolvedValue(false);
    const executor = new LeaseGmailExecutor({
      execute,
      reconcile: vi.fn(),
      verifySmsConsent,
    });
    await expect(
      executor.execute({
        ...base,
        actionKey: "sms.renewal_message.send",
        values: {
          workflow_context: "renewal:lease-synthetic",
          template_ref: "tenant-renewal:v1.0",
          recipient: "+15555550101",
          sender: "+15555550102",
          body: "Synthetic SMS",
          consent_ref: "consent:synthetic:1",
        },
      }),
    ).rejects.toThrow(/consent source/i);
    expect(verifySmsConsent).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });
});

type ProviderExecuteInput = WorkflowMessagePayload & {
  expectedRfcMessageId?: string;
  idempotencyKey: string;
};

function payloadFrom(input: ProviderExecuteInput): WorkflowMessagePayload {
  const { expectedRfcMessageId, idempotencyKey, ...payload } = input;
  void expectedRfcMessageId;
  void idempotencyKey;
  return payload;
}

function messagePayloadForBase(): WorkflowMessagePayload {
  return {
    operation: "send",
    artifactRef: base.values.template_ref,
    recipient: base.values.to,
    sender: base.values.from,
    subject: base.values.subject,
    body: base.values.body,
  };
}
