import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadRentVineProofConfirmation,
  S30_RENTVINE_PROOF_CONFIRMATION_PATH_ENV,
} from "@/lib/lease-renewal/rentvine-proof-confirmation";
import {
  buildRentVineProofBinding,
  buildRentVineProofExecutionRecord,
  buildRentVineProofReviewPacket,
  parseRentVineProofConfirmation,
} from "@/lib/lease-renewal/rentvine-proof-contract";
import { writeRentVineProofReviewPacket } from "@/lib/lease-renewal/rentvine-proof-review";
import {
  formatRentVineProofExecutionSummary,
  formatRentVineProofRefusal,
  formatRentVineProofStatusSummary,
} from "@/lib/lease-renewal/rentvine-proof-run-output";
import { parseRentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

const nowMs = Date.parse("2026-08-30T16:00:00.000Z");

function prepared() {
  const runtime = parseRentVineProofRuntimeConfig({
    schemaVersion: "s30-runtime-v1",
    scope: "renewals",
    proofRef: "s30-123e4567-e89b-42d3-a456-426614174000",
    account: "pmikcmetro",
    actor: {
      uid: "managed-admin-1",
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      scopes: ["renewals"],
    },
    authority: {
      clientDesignationRef: "client-direction-output-a1b2",
      protectedGateDirectionRef: "owner-gate-output-c3d4",
      endpointEvidenceRef: "endpoint-evidence-output-e5f6",
      mappingEvidenceRef: "mapping-evidence-output-g7h8",
      backupEvidenceRef: "backup-evidence-output-i9j0",
      authorizationExpiresAt: "2026-08-30T18:00:00.000Z",
    },
    target: {
      leaseId: "42",
      identityField: "leaseID",
      field: "endDate",
      expectedStartDate: "2025-09-01",
      expectedEndDate: "2026-08-31",
      proposedEndDate: "2026-09-01",
      rollbackEndDate: "2026-08-31",
    },
  });
  const binding = buildRentVineProofBinding(runtime, "forward");
  const record = buildRentVineProofExecutionRecord(binding, nowMs);
  return { runtime, record, packet: buildRentVineProofReviewPacket(binding, record) };
}

function confirmationJson() {
  const { runtime, record } = prepared();
  return {
    schemaVersion: "s30-confirmation-v1",
    proofRef: runtime.proofRef,
    phase: "forward",
    executionId: record.id,
    previewHash: record.previewHash,
    actor: { uid: runtime.actor.uid, email: runtime.actor.email },
    confirmedAt: "2026-08-30T16:01:00.000Z",
  };
}

describe("S30 secure input and value-free output", () => {
  it("loads an exact confirmation from gitignored temp and rejects tracked source", () => {
    const root = mkdtempSync(join(tmpdir(), "s30-confirm-root-"));
    const secureDir = join(root, "temp", "rentvine-proof");
    mkdirSync(secureDir, { recursive: true });
    const securePath = join(secureDir, "confirmation.json");
    writeFileSync(securePath, JSON.stringify(confirmationJson()), "utf8");
    expect(
      loadRentVineProofConfirmation({
        rootDir: root,
        env: { [S30_RENTVINE_PROOF_CONFIRMATION_PATH_ENV]: securePath },
      }),
    ).toMatchObject({ executionId: prepared().record.id });

    const trackedPath = join(root, "confirmation.json");
    writeFileSync(trackedPath, JSON.stringify(confirmationJson()), "utf8");
    expect(() =>
      loadRentVineProofConfirmation({
        rootDir: root,
        env: { [S30_RENTVINE_PROOF_CONFIRMATION_PATH_ENV]: trackedPath },
      }),
    ).toThrow();
  });

  it("rejects a temp confirmation symlink that resolves into tracked source", () => {
    const root = mkdtempSync(join(tmpdir(), "s30-confirm-link-"));
    const secureDir = join(root, "temp", "rentvine-proof");
    mkdirSync(secureDir, { recursive: true });
    const trackedPath = join(root, "tracked-confirmation.json");
    writeFileSync(trackedPath, JSON.stringify(confirmationJson()), "utf8");
    const linkedPath = join(secureDir, "confirmation.json");
    symlinkSync(realpathSync(trackedPath), linkedPath);
    expect(() =>
      loadRentVineProofConfirmation({
        rootDir: root,
        env: { [S30_RENTVINE_PROOF_CONFIRMATION_PATH_ENV]: linkedPath },
      }),
    ).toThrow();
  });

  it("writes one exact review packet under gitignored temp, reuses exact content, and rejects drift", () => {
    const root = mkdtempSync(join(tmpdir(), "s30-review-root-"));
    const { packet } = prepared();
    expect(writeRentVineProofReviewPacket({ rootDir: root, packet })).toEqual({
      reused: false,
    });
    expect(writeRentVineProofReviewPacket({ rootDir: root, packet })).toEqual({
      reused: true,
    });
    const outputPath = join(
      root,
      "temp",
      "rentvine-proof",
      `${packet.executionId}.review.json`,
    );
    const stored = JSON.parse(readFileSync(outputPath, "utf8"));
    stored.target.after = "2026-09-30";
    writeFileSync(outputPath, JSON.stringify(stored), "utf8");
    expect(() => writeRentVineProofReviewPacket({ rootDir: root, packet })).toThrow();
  });

  it("emits only allowlisted states and opaque hashes/ids", () => {
    const canaries = [
      "lease-SECRET",
      "resident@example.com",
      "2026-08-31",
      "/secure/runtime.json",
    ];
    const output = [
      formatRentVineProofExecutionSummary({
        phase: "forward",
        executionId: `s30-forward-${"a".repeat(48)}`,
        resultHash: "b".repeat(64),
        duplicate: false,
        reconciled: false,
      }),
      formatRentVineProofStatusSummary({
        forwardState: "succeeded",
        rollbackState: "missing",
        gateExecutable: false,
        committedSeedClosed: true,
      }),
      formatRentVineProofRefusal({
        operation: "execute",
        code: "provider_ambiguous",
      }),
    ].join("\n");
    for (const canary of canaries) expect(output).not.toContain(canary);
  });

  it("keeps both tracked templates deliberately non-executable", () => {
    const runtimeTemplate = JSON.parse(
      readFileSync("docs/source-corpus/rentvine-proof-runtime.template.json", "utf8"),
    );
    const confirmationTemplate = JSON.parse(
      readFileSync(
        "docs/source-corpus/rentvine-proof-confirmation.template.json",
        "utf8",
      ),
    );
    expect(() => parseRentVineProofRuntimeConfig(runtimeTemplate)).toThrow();
    expect(() => parseRentVineProofConfirmation(confirmationTemplate)).toThrow();
  });
});
