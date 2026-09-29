import { beforeEach, describe, expect, it, vi } from "vitest";

const guards = vi.hoisted(() => ({
  lock: vi.fn(),
  admission: vi.fn(),
  checkpoint: vi.fn(),
  preflight: vi.fn(),
  receipt: vi.fn(),
  baseline: vi.fn(),
}));
vi.mock("../../scripts/release-lock.mjs", () => ({
  assertReleaseProcessLock: guards.lock,
}));
vi.mock("../../scripts/release-control.mjs", () => ({
  assertReleaseAdmission: guards.admission,
  assertReleaseCheckpoint: guards.checkpoint,
  releaseHead: () => "a".repeat(40),
}));
vi.mock("../../scripts/production-assurance-preflight", async (original) => ({
  ...(await original<object>()),
  preflightProductionAssurance: guards.preflight,
}));
vi.mock("../../scripts/production-assurance-receipts.mjs", async (original) => ({
  ...(await original<object>()),
  readAssuranceReceiptForRecovery: guards.receipt,
}));
vi.mock("../../scripts/release-recovery.mjs", async (original) => ({
  ...(await original<object>()),
  readRecoveryBaseline: guards.baseline,
}));

import {
  executeBatchRecovery,
  prepareBatchRecovery,
} from "../../scripts/observe-production-release";

const sha = "a".repeat(40);
const runId = "00000000-0000-4000-8000-000000000001";
const revision = "pmi-kc-app-synthetic-candidate";
const baseline = { path: "/outside/synthetic-baseline.json", runId };
beforeEach(() => {
  vi.resetAllMocks();
  guards.admission.mockReturnValue({ sha, runId });
  guards.receipt.mockReturnValue({
    project: "pmi-kc-kb-prod",
    region: "us-central1",
    service: "pmi-kc-app",
    expectedCommit: sha,
    expectedRevision: revision,
    recoveryBaseline: baseline,
  });
  guards.baseline.mockReturnValue({ sha, runId });
  guards.preflight.mockRejectedValue(new Error("unexpected_authentication"));
});

describe("recovery command admission before authentication", () => {
  it.each([prepareBatchRecovery, executeBatchRecovery])(
    "%s refuses missing kernel ownership before auth, receipt or admission reads",
    async (run) => {
      guards.lock.mockImplementation(() => {
        throw new Error("release_kernel_lock_required");
      });
      await expect(run(["--live"])).rejects.toThrow("release_kernel_lock_required");
      expect(guards.admission).not.toHaveBeenCalled();
      expect(guards.receipt).not.toHaveBeenCalled();
      expect(guards.preflight).not.toHaveBeenCalled();
    },
  );
  it("preparation binds the exact admitted run and recovery phase before authentication", async () => {
    guards.checkpoint.mockImplementation(() => {
      throw new Error("exact_batch_checkpoint_required");
    });
    await expect(prepareBatchRecovery(["--live"])).rejects.toThrow(
      "exact_batch_checkpoint_required",
    );
    expect(guards.checkpoint).toHaveBeenCalledWith({ sha, runId, phases: ["recovery"] });
    expect(guards.preflight).not.toHaveBeenCalled();
  });
  it("rollback binds immutable receipt run, commit and candidate without requiring forward admission", async () => {
    guards.checkpoint.mockImplementation(() => {
      throw new Error("exact_batch_checkpoint_required");
    });
    await expect(
      executeBatchRecovery(["--live", "--recovery-receipt=/outside/synthetic.json"]),
    ).rejects.toThrow("exact_batch_checkpoint_required");
    expect(guards.baseline).toHaveBeenCalledWith(baseline, {
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: "pmi-kc-app",
      sha,
    });
    expect(guards.checkpoint).toHaveBeenCalledWith({
      sha,
      runId,
      revision,
      phases: ["promote", "observe"],
    });
    expect(guards.admission).not.toHaveBeenCalled();
    expect(guards.preflight).not.toHaveBeenCalled();
  });
});
