import { describe, expect, it, vi } from "vitest";

import { verifyRentVineProofActor } from "@/lib/lease-renewal/rentvine-proof-actor";
import { parseRentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

function runtime() {
  return parseRentVineProofRuntimeConfig({
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
      clientDesignationRef: "client-direction-actor-a1b2",
      protectedGateDirectionRef: "owner-gate-actor-c3d4",
      endpointEvidenceRef: "endpoint-evidence-actor-e5f6",
      mappingEvidenceRef: "mapping-evidence-actor-g7h8",
      backupEvidenceRef: "backup-evidence-actor-i9j0",
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

function exactUser() {
  return {
    uid: "managed-admin-1",
    email: "admin@pmikcmetro.com",
    emailVerified: true,
    disabled: false,
    customClaims: { role: "Admin", scopes: ["renewals"] },
    providerData: [{ providerId: "google.com", email: "admin@pmikcmetro.com" }],
  };
}

describe("S30 managed actor readback", () => {
  it("accepts the exact enabled Google Admin with renewals access", async () => {
    await expect(
      verifyRentVineProofActor({ getUser: vi.fn(async () => exactUser()) }, runtime()),
    ).resolves.toBeUndefined();
  });

  it("accepts the established absent-scopes All-Spaces wildcard", async () => {
    await expect(
      verifyRentVineProofActor(
        {
          getUser: vi.fn(async () => ({
            ...exactUser(),
            customClaims: { role: "Admin" },
          })),
        },
        runtime(),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["different email", { email: "other@pmikcmetro.com" }],
    ["unverified email", { emailVerified: false }],
    ["disabled user", { disabled: true }],
    ["non-Google provider", { providerData: [{ providerId: "password" }] }],
    ["non-Admin role", { customClaims: { role: "Editor", scopes: ["renewals"] } }],
    ["missing scope", { customClaims: { role: "Admin", scopes: ["maintenance"] } }],
    [
      "vendor claim",
      { customClaims: { role: "Admin", scopes: ["renewals"], vendor: true } },
    ],
  ])("refuses %s", async (_name, override) => {
    await expect(
      verifyRentVineProofActor(
        { getUser: vi.fn(async () => ({ ...exactUser(), ...override })) },
        runtime(),
      ),
    ).rejects.toBeDefined();
  });

  it("fails closed when Firebase Auth readback is unavailable", async () => {
    await expect(
      verifyRentVineProofActor(
        {
          getUser: vi.fn(async () => {
            throw new Error("unavailable");
          }),
        },
        runtime(),
      ),
    ).rejects.toMatchObject({ code: "actor_read_failed" });
  });
});
