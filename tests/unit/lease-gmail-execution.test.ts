import { describe, expect, it, vi } from "vitest";

import { LeaseGmailExecutor } from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  actionId: "gmail-1",
  actionKey: "gmail.renewal_notice.send",
  values: {
    recipient: "tenant@example.invalid",
    body: "Synthetic source-backed renewal notice",
    artifact_ref: "tenant-renewal:v1.0",
  },
  sourceRefs: ["source:synthetic"],
};

describe("Lease Gmail executor", () => {
  it("uses authoritative recipient plus S24 artifact and idempotency", async () => {
    const execute = vi.fn().mockResolvedValue({ providerRef: "gmail-message-1" });
    const result = await new LeaseGmailExecutor({
      execute,
      reconcile: vi.fn(),
    }).execute(base);
    expect(result.providerRef).toBe("gmail-message-1");
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "tenant@example.invalid",
        idempotencyKey: "renewal-1:gmail-1",
      }),
    );
  });

  it("blocks missing recipient or unapproved artifact before provider", async () => {
    const execute = vi.fn();
    const executor = new LeaseGmailExecutor({ execute, reconcile: vi.fn() });
    await expect(
      executor.execute({ ...base, values: { ...base.values, recipient: "" } }),
    ).rejects.toBeDefined();
    await expect(
      executor.execute({
        ...base,
        values: { ...base.values, artifact_ref: "mutable-draft" },
      }),
    ).rejects.toBeDefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
