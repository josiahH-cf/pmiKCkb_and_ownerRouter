import { describe, expect, it } from "vitest";

import {
  assertRentVineProofConfirmation,
  buildRentVineProofBinding,
  buildRentVineProofExecutionRecord,
  buildRentVineProofReviewPacket,
  parseRentVineProofConfirmation,
  rentVineProofExecutionId,
} from "@/lib/lease-renewal/rentvine-proof-contract";
import { parseRentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

const NOW_MS = Date.parse("2026-08-30T16:00:00.000Z");

function runtime() {
  return parseRentVineProofRuntimeConfig({
    schemaVersion: "s30-runtime-v1",
    scope: "renewals",
    proofRef: "s30-123e4567-e89b-42d3-a456-426614174000",
    account: "pmikcmetro",
    actor: {
      uid: "managed-admin-1",
      email: "renewals-admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      scopes: ["renewals"],
    },
    authority: {
      clientDesignationRef: "client-direction-20260830-a1b2",
      protectedGateDirectionRef: "owner-gate-direction-20260830-c3d4",
      endpointEvidenceRef: "rentvine-contract-evidence-20260830-e5f6",
      mappingEvidenceRef: "rentvine-lease-map-20260830-g7h8",
      backupEvidenceRef: "rentvine-before-read-20260830-i9j0",
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
}

describe("S30 exact proof contract", () => {
  it("builds one deterministic, value-bound, bodyless forward execution", () => {
    const config = runtime();
    const binding = buildRentVineProofBinding(config, "forward");
    const first = buildRentVineProofExecutionRecord(binding, NOW_MS);
    const second = buildRentVineProofExecutionRecord(binding, NOW_MS + 1_000);

    expect(first.id).toBe(second.id);
    expect(first.id).toBe(rentVineProofExecutionId(config.proofRef, "forward"));
    expect(first.previewHash).toBe(second.previewHash);
    expect(first).toMatchObject({
      actionKey: "rentvine.lease.renewal_writeback",
      actionId: "rentvine-proof:forward",
      dataMode: "live",
      state: "ready",
      attemptCount: 0,
    });
    const stored = JSON.stringify(first);
    expect(stored).not.toContain(`\"${config.target.leaseId}\"`);
    expect(stored).not.toContain(config.actor.email);
    expect(stored).not.toContain(config.target.expectedEndDate!);
    expect(stored).not.toContain(config.target.proposedEndDate);
  });

  it("changes the preview hash when any exact value or actor changes", () => {
    const config = runtime();
    const original = buildRentVineProofExecutionRecord(
      buildRentVineProofBinding(config, "forward"),
      NOW_MS,
    );
    const changed = {
      ...config,
      target: { ...config.target, proposedEndDate: "2026-09-02" },
    };
    const changedRecord = buildRentVineProofExecutionRecord(
      buildRentVineProofBinding(changed, "forward"),
      NOW_MS,
    );
    expect(changedRecord.id).toBe(original.id);
    expect(changedRecord.previewHash).not.toBe(original.previewHash);
  });

  it("requires an exact confirmation object rather than a boolean", () => {
    expect(() => parseRentVineProofConfirmation(true)).toThrow();
    expect(() =>
      parseRentVineProofConfirmation({
        schemaVersion: "s30-confirmation-v1",
        proofRef: "s30-123e4567-e89b-42d3-a456-426614174000",
        phase: "forward",
        executionId: "wrong",
        previewHash: "a".repeat(64),
        actor: {
          uid: "managed-admin-1",
          email: "renewals-admin@pmikcmetro.com",
        },
        confirmedAt: "2026-08-30T16:01:00.000Z",
        confirm: true,
      }),
    ).toThrow();
  });

  it("binds confirmation to the exact actor, execution, preview, phase, and fresh time", () => {
    const config = runtime();
    const binding = buildRentVineProofBinding(config, "forward");
    const record = buildRentVineProofExecutionRecord(binding, NOW_MS);
    const confirmation = parseRentVineProofConfirmation({
      schemaVersion: "s30-confirmation-v1",
      proofRef: config.proofRef,
      phase: "forward",
      executionId: record.id,
      previewHash: record.previewHash,
      actor: { uid: config.actor.uid, email: config.actor.email },
      confirmedAt: "2026-08-30T16:01:00.000Z",
    });

    expect(() =>
      assertRentVineProofConfirmation({
        confirmation,
        runtime: config,
        binding,
        record,
        nowMs: NOW_MS + 2 * 60_000,
      }),
    ).not.toThrow();
    expect(() =>
      assertRentVineProofConfirmation({
        confirmation: { ...confirmation, previewHash: "f".repeat(64) },
        runtime: config,
        binding,
        record,
        nowMs: NOW_MS + 2 * 60_000,
      }),
    ).toThrow();
  });

  it("creates a review packet with the exact before, change, rollback, authority, and actor", () => {
    const config = runtime();
    const binding = buildRentVineProofBinding(config, "forward");
    const record = buildRentVineProofExecutionRecord(binding, NOW_MS);
    expect(buildRentVineProofReviewPacket(binding, record)).toEqual(
      expect.objectContaining({
        executionId: record.id,
        previewHash: record.previewHash,
        proofRef: config.proofRef,
        phase: "forward",
        actor: expect.objectContaining({
          uid: config.actor.uid,
          email: config.actor.email,
          role: "Admin",
        }),
        target: expect.objectContaining({
          leaseId: "42",
          field: "endDate",
          before: "2026-08-31",
          after: "2026-09-01",
          rollback: "2026-08-31",
        }),
      }),
    );
  });
});
