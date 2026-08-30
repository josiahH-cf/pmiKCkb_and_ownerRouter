import { describe, expect, it, vi } from "vitest";

import { RentVineError } from "@/lib/integrations/rentvine/client";
import type { RentVineLeaseUpdatePayload } from "@/lib/integrations/rentvine/write-client";
import { buildRentVineProofBinding } from "@/lib/lease-renewal/rentvine-proof-contract";
import {
  assertRentVineProofLeaseAfter,
  parseRentVineProofLeaseSnapshot,
  rentVineProofWriteOutcome,
  updateRentVineProofLeaseEndDate,
} from "@/lib/lease-renewal/rentvine-proof-provider";
import { parseRentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

function binding() {
  return buildRentVineProofBinding(
    parseRentVineProofRuntimeConfig({
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
        clientDesignationRef: "client-direction-provider-a1b2",
        protectedGateDirectionRef: "owner-gate-provider-c3d4",
        endpointEvidenceRef: "endpoint-evidence-provider-e5f6",
        mappingEvidenceRef: "mapping-evidence-provider-g7h8",
        backupEvidenceRef: "backup-evidence-provider-i9j0",
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
    }),
    "forward",
  );
}

describe("S30 strict RentVine provider adapter", () => {
  it("accepts the selected exact identity and canonical date fields", () => {
    expect(
      parseRentVineProofLeaseSnapshot(
        { leaseID: 42, startDate: "2025-09-01", endDate: "2026-08-31" },
        binding(),
      ),
    ).toEqual({ leaseId: "42", startDate: "2025-09-01", endDate: "2026-08-31" });
  });

  it.each([
    [{ leaseID: 43, startDate: "2025-09-01", endDate: "2026-08-31" }],
    [
      {
        leaseID: 42,
        leaseId: 43,
        startDate: "2025-09-01",
        endDate: "2026-08-31",
      },
    ],
    [{ leaseID: 42, startDate: "09/01/2025", endDate: "2026-08-31" }],
    [{ leaseID: 42, startDate: "2025-09-01", endDate: "08/31/2026" }],
  ])("refuses wrong identity or non-canonical read shape: %j", (raw) => {
    expect(() => parseRentVineProofLeaseSnapshot(raw, binding())).toThrow();
  });

  it("sends only the exact lease id, fresh startDate, and one endDate replacement", async () => {
    const exact = binding();
    const snapshot = parseRentVineProofLeaseSnapshot(
      { leaseID: 42, startDate: "2025-09-01", endDate: "2026-08-31" },
      exact,
    );
    const updateLease = vi.fn(
      async (leaseId: string, payload: RentVineLeaseUpdatePayload) => {
        void leaseId;
        void payload;
        return { accepted: true };
      },
    );

    await expect(
      updateRentVineProofLeaseEndDate({ updateLease }, exact, snapshot),
    ).resolves.toEqual({ accepted: true });
    expect(updateLease).toHaveBeenCalledWith("42", {
      startDate: "2025-09-01",
      endDate: "2026-09-01",
    });
    expect(Object.keys(updateLease.mock.calls[0]![1])).toEqual(["startDate", "endDate"]);
  });

  it("distinguishes known refusal from uncertain server/transport outcomes", () => {
    expect(rentVineProofWriteOutcome(new RentVineError("refused", 400))).toBe("failed");
    expect(rentVineProofWriteOutcome(new RentVineError("rate", 429))).toBe("failed");
    expect(rentVineProofWriteOutcome(new RentVineError("server", 500))).toBe("ambiguous");
    expect(rentVineProofWriteOutcome(new Error("network"))).toBe("ambiguous");
  });

  it("requires exact readback rather than treating any successful response as proof", () => {
    expect(() =>
      assertRentVineProofLeaseAfter(
        { leaseId: "42", startDate: "2025-09-01", endDate: "2026-08-31" },
        binding(),
      ),
    ).toThrow();
  });
});
