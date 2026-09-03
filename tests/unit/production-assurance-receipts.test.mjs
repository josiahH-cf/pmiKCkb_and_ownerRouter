import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCandidateAssuranceReceipt,
  assertPromotionReceipt,
  buildCandidateAssuranceReceipt,
  buildPromotionReceipt,
  claimCandidateAssuranceReceipt,
  commitReservedReceipt,
  readCandidateAssuranceReceipt,
  readPromotionReceipt,
  reserveReceipt,
  writeReceipt,
} from "../../scripts/production-assurance-receipts.mjs";

const NOW = Date.parse("2026-09-02T20:00:00.000Z");
const RECEIPT_ID = "123e4567-e89b-42d3-a456-426614174000";
const BASELINE = Object.freeze({
  verifiedAt: "2026-09-02T19:59:00.000Z",
  canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
  expectedCommit: "c".repeat(40),
  expectedRevision: "pmi-kc-app-predecessor-122",
  expectedConfigurationFingerprint: `sha256:${"d".repeat(64)}`,
  trafficPercent: 100,
  adminVerdict: "passed",
  editorVerdict: "passed",
  monitoringState: "ready",
});
const EXPECTED = Object.freeze({
  project: "pmi-kc-kb-prod",
  region: "us-central1",
  service: "pmi-kc-app",
  candidateOrigin: "https://candidate---pmi-kc-app-abc-uc.a.run.app",
  canonicalOrigin: "https://pmi-kc-app-abc-uc.a.run.app",
  expectedCommit: "a".repeat(40),
  expectedRevision: "pmi-kc-app-candidate-123",
  expectedConfigurationFingerprint: `sha256:${"b".repeat(64)}`,
  predecessorRevision: "pmi-kc-app-predecessor-122",
  predecessorBaseline: BASELINE,
  adminVerdict: "passed",
  editorVerdict: "passed",
  reconciliationState: "matched",
  monitoringState: "ready",
});

const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("production assurance release receipts", () => {
  it("binds one fresh green candidate receipt to exact release coordinates", () => {
    const receipt = buildCandidateAssuranceReceipt(EXPECTED, NOW, RECEIPT_ID);
    expect(
      assertCandidateAssuranceReceipt(
        receipt,
        {
          project: EXPECTED.project,
          service: EXPECTED.service,
          expectedRevision: EXPECTED.expectedRevision,
        },
        NOW + 1,
      ),
    ).toEqual(receipt);
    for (const patch of [
      { adminVerdict: "failed" },
      { reconciliationState: "inconclusive_source_changed" },
      { predecessorRevision: EXPECTED.expectedRevision },
      { candidateOrigin: EXPECTED.canonicalOrigin },
    ]) {
      expect(() =>
        assertCandidateAssuranceReceipt({ ...receipt, ...patch }, {}, NOW + 1),
      ).toThrow("candidate_assurance_receipt_invalid");
    }
    expect(() =>
      assertCandidateAssuranceReceipt(receipt, {}, Date.parse(receipt.expiresAt)),
    ).toThrow("candidate_assurance_receipt_invalid");
    expect(() =>
      assertCandidateAssuranceReceipt(
        {
          ...receipt,
          predecessorBaseline: {
            ...receipt.predecessorBaseline,
            expectedConfigurationFingerprint: `sha256:${"e".repeat(64)}`,
          },
        },
        {},
        NOW + 1,
      ),
    ).not.toThrow();
    expect(() =>
      assertCandidateAssuranceReceipt(
        {
          ...receipt,
          predecessorBaseline: {
            ...receipt.predecessorBaseline,
            trafficPercent: 99,
          },
        },
        {},
        NOW + 1,
      ),
    ).toThrow("candidate_assurance_receipt_invalid");
    expect(() =>
      assertCandidateAssuranceReceipt(
        {
          ...receipt,
          predecessorBaseline: {
            ...receipt.predecessorBaseline,
            verifiedAt: new Date(NOW - 2 * 60 * 60 * 1_000 - 1).toISOString(),
          },
        },
        {},
        NOW + 1,
      ),
    ).toThrow("candidate_assurance_receipt_invalid");
    expect(buildCandidateAssuranceReceipt(EXPECTED, NOW).candidateReceiptId).not.toBe(
      buildCandidateAssuranceReceipt(EXPECTED, NOW).candidateReceiptId,
    );
  });

  it("writes exclusively and binds promotion to the candidate and captured predecessor", () => {
    const directory = mkdtempSync(join(tmpdir(), "pmi-assurance-receipts-"));
    temporary.push(directory);
    const candidatePath = join(directory, "candidate.json");
    const promotionPath = join(directory, "promotion.json");
    const candidate = buildCandidateAssuranceReceipt(EXPECTED, NOW, RECEIPT_ID);
    const promotion = buildPromotionReceipt(candidate, NOW + 1_000, NOW + 2_000);
    writeReceipt(candidatePath, candidate);
    writeReceipt(promotionPath, promotion);
    expect(
      readCandidateAssuranceReceipt(
        candidatePath,
        { expectedCommit: EXPECTED.expectedCommit },
        NOW,
      ),
    ).toEqual(candidate);
    expect(
      readPromotionReceipt(
        promotionPath,
        {
          expectedRevision: EXPECTED.expectedRevision,
          predecessorRevision: EXPECTED.predecessorRevision,
        },
        NOW + 3_000,
      ),
    ).toEqual(promotion);
    expect(() => writeReceipt(candidatePath, candidate)).toThrow();
    expect(() =>
      assertPromotionReceipt(
        { ...promotion, predecessorRevision: EXPECTED.expectedRevision },
        {},
        NOW + 3_000,
      ),
    ).toThrow("promotion_receipt_invalid");
  });

  it("reserves the promotion receipt path exclusively before committing durable content", () => {
    const directory = mkdtempSync(join(tmpdir(), "pmi-assurance-reservation-"));
    temporary.push(directory);
    const path = join(directory, "promotion.json");
    const promotion = buildPromotionReceipt(
      buildCandidateAssuranceReceipt(EXPECTED, NOW, RECEIPT_ID),
      NOW + 1_000,
      NOW + 2_000,
    );
    const reservation = reserveReceipt(path);
    expect(() => reserveReceipt(path)).toThrow();
    expect(commitReservedReceipt(reservation, promotion)).toBe(path);
    expect(readPromotionReceipt(path, {}, NOW + 3_000)).toEqual(promotion);
    expect(() => commitReservedReceipt(reservation, promotion)).toThrow(
      "receipt_reservation_invalid",
    );
  });

  it("publishes no final receipt when pending-file fsync fails", () => {
    const directory = mkdtempSync(join(tmpdir(), "pmi-assurance-fsync-"));
    temporary.push(directory);
    const path = join(directory, "promotion.json");
    const reservation = reserveReceipt(path);
    const originalIo = reservation.io;
    reservation.io = {
      ...originalIo,
      fsync() {
        throw new Error("injected_fsync_failure");
      },
    };
    expect(() => commitReservedReceipt(reservation, { never: "published" })).toThrow(
      "injected_fsync_failure",
    );
    expect(existsSync(path)).toBe(false);
    expect(existsSync(reservation.pendingPath)).toBe(false);
  });

  it("claims each unique candidate receipt exactly once and never frees it after use", () => {
    const directory = mkdtempSync(join(tmpdir(), "pmi-assurance-claim-"));
    const copiedDirectory = mkdtempSync(join(tmpdir(), "pmi-assurance-claim-copy-"));
    const authorityRoot = mkdtempSync(join(tmpdir(), "pmi-assurance-authority-"));
    temporary.push(directory, copiedDirectory, authorityRoot);
    const candidatePath = join(directory, "candidate.json");
    const candidate = buildCandidateAssuranceReceipt(EXPECTED, NOW, RECEIPT_ID);
    writeReceipt(candidatePath, candidate);
    const claimed = claimCandidateAssuranceReceipt(
      candidatePath,
      candidate,
      NOW + 1_000,
      { authorityRoot },
    );
    expect(existsSync(claimed.claimPath)).toBe(true);
    expect(() =>
      claimCandidateAssuranceReceipt(candidatePath, candidate, NOW + 2_000, {
        authorityRoot,
      }),
    ).toThrow("receipt_path_exists");

    const copiedPath = join(copiedDirectory, "copied-candidate.json");
    copyFileSync(candidatePath, copiedPath);
    expect(() =>
      claimCandidateAssuranceReceipt(copiedPath, candidate, NOW + 3_000, {
        authorityRoot,
      }),
    ).toThrow("receipt_path_exists");
    expect(claimed.claimPath).not.toContain("candidate.json.");
  });

  it("requires absolute receipt paths outside the repository", () => {
    expect(() => writeReceipt("relative-receipt.json", {})).toThrow(
      "external_receipt_path_required",
    );
    expect(() => writeReceipt(join(process.cwd(), "receipt.json"), {})).toThrow(
      "receipt_path_must_be_outside_repository",
    );
  });
});
