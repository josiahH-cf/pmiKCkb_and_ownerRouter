import { describe, expect, it, vi } from "vitest";

import { DotloopRenewalExecutor } from "@/lib/lease-renewal/execution/providers";

const base = {
  workflowId: "renewal-1",
  // S40 AC-S40-1: an external action must declare its lane; there is no implicit Live default.
  dataMode: "live" as const,
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
      readLoop: vi.fn().mockResolvedValue({
        loopRef: "loop-1",
        templateRef: "template-synthetic",
        participantRefs: ["owner-synthetic", "tenant-synthetic"],
        active: true,
      }),
      readDocument: vi.fn(),
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
        readLoop: vi.fn(),
        readDocument: vi.fn(),
        reconcile: vi.fn(),
      }).execute({
        ...base,
        values: { ...base.values, participant_refs: "" },
      }),
    ).rejects.toBeDefined();
    expect(createLoop).not.toHaveBeenCalled();
  });

  it("refuses mismatched readback and proves exact rollback separately", async () => {
    let active = true;
    const readLoop = vi.fn(async () => ({
      loopRef: "loop-1",
      templateRef: "template-synthetic",
      participantRefs: ["owner-synthetic", "tenant-synthetic"],
      active,
    }));
    const rollbackLoop = vi.fn(async () => {
      active = false;
      return { loopRef: "loop-1", applied: true };
    });
    const executor = new DotloopRenewalExecutor({
      createLoop: vi.fn().mockResolvedValue({ loopRef: "loop-1" }),
      uploadDocument: vi.fn(),
      readLoop,
      readDocument: vi.fn(),
      reconcile: vi.fn(),
      rollbackLoop,
    });
    const receipt = await executor.execute(base);
    await expect(executor.correct!(base, receipt)).resolves.toBeUndefined();
    expect(rollbackLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        loopRef: "loop-1",
        expectedTemplateRef: "template-synthetic",
      }),
    );

    await expect(
      new DotloopRenewalExecutor({
        createLoop: vi.fn().mockResolvedValue({ loopRef: "loop-1" }),
        uploadDocument: vi.fn(),
        readLoop: vi.fn().mockResolvedValue({
          loopRef: "loop-1",
          templateRef: "wrong-template",
          participantRefs: [],
          active: true,
        }),
        readDocument: vi.fn(),
        reconcile: vi.fn(),
      }).execute(base),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });
});
