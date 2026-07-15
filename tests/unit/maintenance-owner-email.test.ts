import { describe, expect, it, vi } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import type { WorkflowMessagePayload } from "@/lib/lease-renewal/execution/providers";
import { MaintenanceOwnerEmailExecutor } from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-synthetic",
  actionId: "owner-email-1",
  actionKey: "gmail.maintenance_owner_notice.send",
  values: {
    workflow_context: "maintenance:ticket-synthetic:unit-synthetic-101",
    ticket_ref: "ticket-synthetic",
    template_ref: "maintenance-owner:v1.0",
    from: "workflow@pmikcmetro.com",
    recipients: "owner-synthetic@example.invalid",
    subject: "Synthetic maintenance notice",
    body: "Synthetic source-backed maintenance notice",
    recipient_source_ref: "rentvine:owner-synthetic",
    mailbox_source_ref: "workspace:workflow-mailbox",
    rfc_message_id: "<maintenance-synthetic@pmikc.invalid>",
  },
  sourceRefs: ["source:synthetic"],
} satisfies ExternalActionInput;

describe("Maintenance owner email", () => {
  it("requires authoritative ticket/unit/owner/mailbox and maintenance-owner:v1.0", async () => {
    const execute = vi.fn(async (input: ProviderExecuteInput) => ({
      providerRef: "message-1",
      rfcMessageId: base.values.rfc_message_id,
      payload: payloadFrom(input),
    }));
    const executor = new MaintenanceOwnerEmailExecutor({
      execute,
      reconcile: vi.fn(),
      verifySmsConsent: vi.fn(),
    });
    await expect(executor.execute(base)).resolves.toMatchObject({
      providerRef: "message-1",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    { template_ref: "owner-renewal:v1.0" },
    { ticket_ref: "ticket-other" },
    { workflow_context: "" },
    { workflow_context: "maintenance:ticket-other:unit-synthetic-101" },
    { recipient_source_ref: "" },
    { from: "not-an-email" },
    { recipients: "not-an-email" },
    { rfc_message_id: "" },
    { rfc_message_id: "not-an-rfc-message-id" },
    { body: "x".repeat(20_001) },
  ])(
    "blocks missing, drifted, or authority-bearing content before Gmail",
    async (patch) => {
      const execute = vi.fn();
      const executor = new MaintenanceOwnerEmailExecutor({
        execute,
        reconcile: vi.fn(),
        verifySmsConsent: vi.fn(),
      });
      const input: ExternalActionInput = {
        ...base,
        values: { ...base.values, ...patch } as Readonly<
          Record<string, string | number | boolean>
        >,
      };
      expect(executor.validate(input)).toBeTruthy();
      await expect(executor.execute(input)).rejects.toBeDefined();
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("marks an exact Gmail reconciliation receipt", async () => {
    const executor = new MaintenanceOwnerEmailExecutor({
      execute: vi.fn(),
      reconcile: vi.fn().mockResolvedValue({
        providerRef: "message-1",
        rfcMessageId: "<maintenance-synthetic@pmikc.invalid>",
        payload: maintenancePayload(),
      }),
      verifySmsConsent: vi.fn(),
    });

    await expect(executor.reconcile(base)).resolves.toMatchObject({
      providerRef: "message-1",
      reconciled: true,
    });
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

function maintenancePayload(): WorkflowMessagePayload {
  return {
    operation: "send",
    artifactRef: base.values.template_ref,
    recipient: base.values.recipients,
    sender: base.values.from,
    subject: base.values.subject,
    body: base.values.body,
  };
}
