import { describe, expect, it, vi } from "vitest";

import { DotloopRenewalExecutor } from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  actionId: "dotloop-1",
  actionKey: "dotloop.loop.create_from_template",
  values: {
    workflow_context: "renewal:lease-synthetic",
    template_ref: "template-synthetic",
    participant_refs: "owner-synthetic,tenant-synthetic",
  },
  sourceRefs: ["source:synthetic"],
};

describe("Dotloop renewal executor", () => {
  it("creates one configured fake loop with exact participants and documents", async () => {
    const createLoop = vi.fn().mockResolvedValue({ loopRef: "loop-1" });
    const uploadDocument = vi.fn();
    const result = await new DotloopRenewalExecutor({
      createLoop,
      uploadDocument,
      reconcile: vi.fn(),
    }).execute(base);
    expect(result.providerRef).toBe("loop-1");
    expect(createLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        participantRefs: ["owner-synthetic", "tenant-synthetic"],
      }),
    );
  });

  it("blocks missing template or participant before provider", async () => {
    const createLoop = vi.fn();
    await expect(
      new DotloopRenewalExecutor({
        createLoop,
        uploadDocument: vi.fn(),
        reconcile: vi.fn(),
      }).execute({
        ...base,
        values: { ...base.values, participant_refs: "" },
      }),
    ).rejects.toBeDefined();
    expect(createLoop).not.toHaveBeenCalled();
  });
});
