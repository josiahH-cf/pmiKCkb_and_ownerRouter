import { describe, expect, it, vi } from "vitest";

import { MaintenanceOwnerEmailExecutor } from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-1",
  actionId: "owner-email-1",
  actionKey: "gmail.maintenance_owner_notice.send",
  values: {
    recipient: "owner@example.invalid",
    body: "Synthetic source-backed maintenance notice",
    artifact_ref: "maintenance-owner:v1.0",
  },
  sourceRefs: ["source:synthetic"],
};

describe("Maintenance owner email", () => {
  it("requires authoritative recipient and maintenance-owner:v1.0", async () => {
    const execute = vi.fn().mockResolvedValue({ providerRef: "message-1" });
    const executor = new MaintenanceOwnerEmailExecutor({ execute, reconcile: vi.fn() });
    await expect(executor.execute(base)).resolves.toMatchObject({
      providerRef: "message-1",
    });
    await expect(
      executor.execute({
        ...base,
        values: { ...base.values, artifact_ref: "owner-renewal:v1.0" },
      }),
    ).rejects.toBeDefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
