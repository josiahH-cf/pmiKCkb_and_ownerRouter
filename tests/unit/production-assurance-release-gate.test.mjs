import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildCandidateAssuranceReceipt,
  reserveReceipt,
} from "../../scripts/production-assurance-receipts.mjs";
import {
  promoteProductionCandidate,
  preflightProductionPromotionRecovery,
  runPredecessorRecoveryGate,
  verifyCandidateReceiptVersion,
  verifyPromotionOperatorAccount,
} from "../../scripts/release.mjs";

const RECEIPT = Object.freeze({
  candidateOrigin: "https://candidate---pmi-kc-app-abc-uc.a.run.app",
  expectedCommit: "a".repeat(40),
  expectedRevision: "pmi-kc-app-candidate-123",
  service: "pmi-kc-app",
});
const NOW = Date.parse("2026-09-02T20:00:00.000Z");
const PREDECESSOR = "pmi-kc-app-predecessor-122";

function candidateReceipt() {
  return buildCandidateAssuranceReceipt(
    {
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: RECEIPT.service,
      candidateOrigin: RECEIPT.candidateOrigin,
      canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
      expectedCommit: RECEIPT.expectedCommit,
      expectedRevision: RECEIPT.expectedRevision,
      expectedConfigurationFingerprint: `sha256:${"b".repeat(64)}`,
      predecessorRevision: PREDECESSOR,
      predecessorBaseline: {
        verifiedAt: "2026-09-02T19:59:00.000Z",
        canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
        expectedCommit: "c".repeat(40),
        expectedRevision: PREDECESSOR,
        expectedConfigurationFingerprint: `sha256:${"d".repeat(64)}`,
        trafficPercent: 100,
        adminVerdict: "passed",
        editorVerdict: "passed",
        monitoringState: "ready",
      },
      adminVerdict: "passed",
      editorVerdict: "passed",
      reconciliationState: "matched",
      monitoringState: "ready",
    },
    NOW,
  );
}

function serving(revision) {
  return JSON.stringify({
    status: { traffic: [{ revisionName: revision, percent: 100 }] },
  });
}

function promotionHarness(readbacks) {
  const remainingReadbacks = [...readbacks];
  const trafficTargets = [];
  const runCommand = vi.fn(async (_command, args) => {
    if (args.includes("describe")) return serving(remainingReadbacks.shift());
    const target = args
      .find((entry) => entry.startsWith("--to-revisions="))
      ?.slice("--to-revisions=".length, -"=100".length);
    if (!target) throw new Error("unexpected_test_command");
    trafficTargets.push(target);
    return "";
  });
  return { runCommand, trafficTargets };
}

function promotionInput(overrides = {}) {
  return {
    candidateReceipt: candidateReceipt(),
    candidateReceiptPath: "/not-used-by-injected-claim/candidate.json",
    candidateRevision: RECEIPT.expectedRevision,
    deployCommand: "gcloud",
    env: {},
    promotionReceiptPath: "/not-used-by-injected-reservation.json",
    target: {
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: RECEIPT.service,
    },
    argv: [],
    verifyCandidate: vi.fn().mockResolvedValue(undefined),
    claimCandidateReceipt: vi.fn(),
    preflightRecovery: vi.fn().mockReturnValue({
      adminProfile: "/outside/admin",
      editorProfile: "/outside/editor",
      operatorEmail: "operator@pmikcmetro.com",
    }),
    verifyOperatorAccount: vi.fn().mockResolvedValue(undefined),
    verifyRecovery: vi.fn().mockResolvedValue(undefined),
    reserveReceiptOutput: vi.fn().mockReturnValue({ reserved: true }),
    discardReceiptOutput: vi.fn(),
    buildTrafficCommand: ({ revision }) => ({
      command: "gcloud",
      args: ["run", "services", "update-traffic", `--to-revisions=${revision}=100`],
    }),
    now: () => NOW + 1_000,
    ...overrides,
  };
}

function response(patch = {}) {
  return {
    ok: true,
    json: async () => ({
      commit: RECEIPT.expectedCommit,
      revision: RECEIPT.expectedRevision,
      service: RECEIPT.service,
      environment: "production",
      ...patch,
    }),
  };
}

describe("production promotion assurance gate", () => {
  it("validates a managed operator and two distinct existing external recovery profiles", () => {
    const directory = mkdtempSync(join(tmpdir(), "pmi-promotion-readiness-"));
    const adminProfile = mkdtempSync(join(tmpdir(), "pmi-admin-profile-"));
    const editorProfile = mkdtempSync(join(tmpdir(), "pmi-editor-profile-"));
    const candidatePath = join(directory, "candidate.json");
    writeFileSync(candidatePath, "{}\n", { encoding: "utf8", mode: 0o600 });
    try {
      expect(
        preflightProductionPromotionRecovery({
          argv: [
            "--operator-email=operator@pmikcmetro.com",
            `--admin-profile=${adminProfile}`,
            `--editor-profile=${editorProfile}`,
          ],
          candidateReceiptPath: candidatePath,
          promotionReceiptPath: join(directory, "promotion.json"),
        }),
      ).toMatchObject({
        operatorEmail: "operator@pmikcmetro.com",
        adminProfile,
        editorProfile,
      });
      expect(() =>
        preflightProductionPromotionRecovery({
          argv: [
            "--operator-email=outsider@example.com",
            `--admin-profile=${adminProfile}`,
            `--editor-profile=${editorProfile}`,
          ],
          candidateReceiptPath: candidatePath,
          promotionReceiptPath: join(directory, "promotion.json"),
        }),
      ).toThrow("internal_operator_required");
      expect(() =>
        preflightProductionPromotionRecovery({
          argv: [
            "--operator-email=operator@pmikcmetro.com",
            `--admin-profile=${adminProfile}`,
            `--editor-profile=${adminProfile}`,
          ],
          candidateReceiptPath: candidatePath,
          promotionReceiptPath: join(directory, "promotion.json"),
        }),
      ).toThrow("distinct_managed_profiles_required");
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(adminProfile, { recursive: true, force: true });
      rmSync(editorProfile, { recursive: true, force: true });
    }
  });

  it("refuses a different active gcloud identity before receipt reservation or traffic", async () => {
    const runCommand = vi.fn().mockResolvedValue("other@pmikcmetro.com");
    const reserveReceiptOutput = vi.fn();
    await expect(
      promoteProductionCandidate(
        promotionInput({
          runCommand,
          reserveReceiptOutput,
          verifyOperatorAccount: verifyPromotionOperatorAccount,
        }),
      ),
    ).rejects.toThrow("promotion_operator_identity_mismatch");
    expect(runCommand).toHaveBeenCalledOnce();
    expect(runCommand.mock.calls[0][1]).toEqual([
      "auth",
      "list",
      "--filter=status:ACTIVE",
      "--format=value(account)",
    ]);
    expect(reserveReceiptOutput).not.toHaveBeenCalled();
  });

  it("accepts only an exact candidate-origin version readback", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response());
    await expect(
      verifyCandidateReceiptVersion(RECEIPT, fetchFn),
    ).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledWith(
      `${RECEIPT.candidateOrigin}/api/version`,
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    ["commit", { commit: "b".repeat(40) }],
    ["revision", { revision: "pmi-kc-app-other-999" }],
    ["service", { service: "foreign-service" }],
    ["environment", { environment: "demo" }],
  ])("refuses a receipt whose live %s no longer matches", async (_label, patch) => {
    await expect(
      verifyCandidateReceiptVersion(RECEIPT, vi.fn().mockResolvedValue(response(patch))),
    ).rejects.toThrow("Candidate assurance receipt no longer matches the candidate");
  });

  it("fails closed when the candidate read never returns", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("private provider error"));
    await expect(verifyCandidateReceiptVersion(RECEIPT, fetchFn)).rejects.toThrow(
      "Candidate receipt version read failed",
    );
  });

  it("restores and verifies the predecessor when promotion-receipt persistence fails", async () => {
    const harness = promotionHarness([
      PREDECESSOR,
      RECEIPT.expectedRevision,
      PREDECESSOR,
    ]);
    const discardReceiptOutput = vi.fn();
    const verifyRecovery = vi.fn().mockResolvedValue(undefined);
    await expect(
      promoteProductionCandidate(
        promotionInput({
          ...harness,
          commitReceiptOutput: vi.fn(() => {
            throw new Error("disk_failure");
          }),
          discardReceiptOutput,
          verifyRecovery,
        }),
      ),
    ).rejects.toThrow(
      "Production promotion failed after traffic mutation; exact predecessor restored",
    );
    expect(harness.trafficTargets).toEqual([RECEIPT.expectedRevision, PREDECESSOR]);
    expect(harness.runCommand).toHaveBeenCalledTimes(5);
    expect(discardReceiptOutput).toHaveBeenCalledTimes(1);
    expect(verifyRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: PREDECESSOR, trafficPercent: 100 }),
    );
  });

  it("restores and verifies the predecessor when exact promotion readback mismatches", async () => {
    const harness = promotionHarness([
      PREDECESSOR,
      "pmi-kc-app-unexpected-999",
      PREDECESSOR,
    ]);
    const commitReceiptOutput = vi.fn();
    await expect(
      promoteProductionCandidate(promotionInput({ ...harness, commitReceiptOutput })),
    ).rejects.toThrow(
      "Production promotion failed after traffic mutation; exact predecessor restored",
    );
    expect(harness.trafficTargets).toEqual([RECEIPT.expectedRevision, PREDECESSOR]);
    expect(harness.runCommand).toHaveBeenCalledTimes(5);
    expect(commitReceiptOutput).not.toHaveBeenCalled();
  });

  it("reports an unverified rollback and retains the reserved marker when restoration drifts", async () => {
    const harness = promotionHarness([
      PREDECESSOR,
      "pmi-kc-app-unexpected-999",
      RECEIPT.expectedRevision,
    ]);
    const discardReceiptOutput = vi.fn();
    await expect(
      promoteProductionCandidate(promotionInput({ ...harness, discardReceiptOutput })),
    ).rejects.toThrow("predecessor restoration could not be verified");
    expect(harness.trafficTargets).toEqual([RECEIPT.expectedRevision, PREDECESSOR]);
    expect(harness.runCommand).toHaveBeenCalledTimes(5);
    expect(discardReceiptOutput).not.toHaveBeenCalled();
  });

  it("leaves no valid promotion receipt after directory fsync failure plus rollback drift", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pmi-promotion-fsync-drift-"));
    const output = join(directory, "promotion.json");
    let reservation;
    const reserveReceiptOutput = (path) => {
      reservation = reserveReceipt(path);
      const originalIo = reservation.io;
      let syncCount = 0;
      reservation.io = {
        ...originalIo,
        fsync(descriptor) {
          syncCount += 1;
          if (syncCount === 2) throw new Error("directory_fsync_failed");
          return originalIo.fsync(descriptor);
        },
      };
      return reservation;
    };
    const harness = promotionHarness([
      PREDECESSOR,
      RECEIPT.expectedRevision,
      RECEIPT.expectedRevision,
    ]);
    try {
      await expect(
        promoteProductionCandidate(
          promotionInput({
            ...harness,
            promotionReceiptPath: output,
            reserveReceiptOutput,
          }),
        ),
      ).rejects.toThrow("predecessor restoration could not be verified");
      expect(existsSync(output)).toBe(false);
      expect(existsSync(reservation.pendingPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("treats a rejected traffic command as ambiguous and restores before surfacing failure", async () => {
    const trafficTargets = [];
    const readbacks = [PREDECESSOR, PREDECESSOR];
    let mutationCalls = 0;
    const runCommand = vi.fn(async (_command, args) => {
      if (args.includes("describe")) return serving(readbacks.shift());
      const target = args
        .find((entry) => entry.startsWith("--to-revisions="))
        ?.slice("--to-revisions=".length, -"=100".length);
      trafficTargets.push(target);
      mutationCalls += 1;
      if (mutationCalls === 1) throw new Error("provider_timeout_after_accept");
      return "";
    });
    const verifyRecovery = vi.fn().mockResolvedValue(undefined);

    await expect(
      promoteProductionCandidate(promotionInput({ runCommand, verifyRecovery })),
    ).rejects.toThrow("exact predecessor restored and recovery verified");
    expect(trafficTargets).toEqual([RECEIPT.expectedRevision, PREDECESSOR]);
    expect(verifyRecovery).toHaveBeenCalledOnce();
  });

  it("durably claims the candidate immediately before the traffic attempt and records both timestamps", async () => {
    const harness = promotionHarness([PREDECESSOR, RECEIPT.expectedRevision]);
    const claimCandidateReceipt = vi.fn();
    const commitReceiptOutput = vi.fn();
    const times = [NOW + 1_000, NOW + 2_000, NOW + 3_000];
    const result = await promoteProductionCandidate(
      promotionInput({
        ...harness,
        claimCandidateReceipt,
        commitReceiptOutput,
        now: () => times.shift(),
      }),
    );

    expect(claimCandidateReceipt).toHaveBeenCalledOnce();
    expect(claimCandidateReceipt.mock.invocationCallOrder[0]).toBeGreaterThan(
      harness.runCommand.mock.invocationCallOrder[0],
    );
    expect(claimCandidateReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      harness.runCommand.mock.invocationCallOrder[1],
    );
    expect(result.promotionReceipt).toMatchObject({
      candidateReceiptId: expect.any(String),
      promotionStartedAt: new Date(NOW + 2_000).toISOString(),
      promotionVerifiedAt: new Date(NOW + 3_000).toISOString(),
      predecessorBaseline: expect.objectContaining({ expectedRevision: PREDECESSOR }),
    });
    expect(commitReceiptOutput).toHaveBeenCalledWith(
      { reserved: true },
      result.promotionReceipt,
    );
  });

  it("does not attempt traffic when the one-use claim fails after preflight", async () => {
    const runCommand = vi.fn();
    runCommand.mockResolvedValueOnce(serving(PREDECESSOR));
    const reserveReceiptOutput = vi.fn().mockReturnValue({ reserved: true });
    const discardReceiptOutput = vi.fn();
    await expect(
      promoteProductionCandidate(
        promotionInput({
          runCommand,
          reserveReceiptOutput,
          discardReceiptOutput,
          claimCandidateReceipt: vi.fn(() => {
            throw new Error("receipt_path_exists");
          }),
        }),
      ),
    ).rejects.toThrow("receipt_path_exists");
    expect(reserveReceiptOutput).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledOnce();
    expect(discardReceiptOutput).toHaveBeenCalledWith({ reserved: true });
  });

  it("exposes a repeatable full predecessor-recovery gate bound to the original receipt", async () => {
    const runCommand = vi.fn().mockResolvedValue(undefined);
    await runPredecessorRecoveryGate({
      argv: [
        "--operator-email=operator@pmikcmetro.com",
        "--admin-profile=/outside/admin",
        "--editor-profile=/outside/editor",
      ],
      candidateReceiptPath: "/outside/candidate.json",
      runCommand,
    });
    expect(runCommand).toHaveBeenCalledWith(expect.stringMatching(/^npm(?:\.cmd)?$/), [
      "run",
      "assure:production-observation",
      "--",
      "--verify-rollback-recovery",
      "--live",
      "--recovery-receipt=/outside/candidate.json",
      "--operator-email=operator@pmikcmetro.com",
      "--admin-profile=/outside/admin",
      "--editor-profile=/outside/editor",
    ]);
  });
});
