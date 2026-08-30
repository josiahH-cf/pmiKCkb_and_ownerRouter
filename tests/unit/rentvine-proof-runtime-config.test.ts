import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  loadRentVineProofRuntimeConfig,
  parseRentVineProofRuntimeConfig,
  S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH_ENV,
} from "@/lib/lease-renewal/rentvine-proof-runtime-config";

function validConfig() {
  return {
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
  };
}

describe("S30 secure runtime configuration", () => {
  it("accepts exactly one managed-Admin lease endDate proof", () => {
    expect(parseRentVineProofRuntimeConfig(validConfig())).toMatchObject({
      proofRef: "s30-123e4567-e89b-42d3-a456-426614174000",
      account: "pmikcmetro",
      actor: { role: "Admin", scopes: ["renewals"] },
      target: { leaseId: "42", field: "endDate", identityField: "leaseID" },
    });
  });

  it.each([
    [
      "wrong account",
      (input: ReturnType<typeof validConfig>) => (input.account = "other"),
    ],
    [
      "non-Admin actor",
      (input: ReturnType<typeof validConfig>) => (input.actor.role = "Editor"),
    ],
    [
      "personal actor",
      (input: ReturnType<typeof validConfig>) => {
        input.actor.email = "operator@example.com";
        input.actor.hd = "example.com";
      },
    ],
    [
      "missing renewals scope",
      (input: ReturnType<typeof validConfig>) => (input.actor.scopes = ["maintenance"]),
    ],
    [
      "placeholder authority",
      (input: ReturnType<typeof validConfig>) =>
        (input.authority.clientDesignationRef = "TBD"),
    ],
    [
      "unsupported field",
      (input: ReturnType<typeof validConfig>) =>
        ((input.target as Record<string, unknown>).field = "currentRent"),
    ],
    [
      "unchanged proposal",
      (input: ReturnType<typeof validConfig>) =>
        (input.target.proposedEndDate = input.target.expectedEndDate),
    ],
    [
      "rollback drift",
      (input: ReturnType<typeof validConfig>) =>
        (input.target.rollbackEndDate = "2026-08-30"),
    ],
  ])("refuses %s", (_name, mutate) => {
    const input = validConfig();
    mutate(input);
    expect(() => parseRentVineProofRuntimeConfig(input)).toThrow();
  });

  it("rejects a second target and every unknown key", () => {
    const input = {
      ...validConfig(),
      targets: [validConfig().target, { ...validConfig().target, leaseId: "43" }],
    };
    expect(() => parseRentVineProofRuntimeConfig(input)).toThrow();
  });

  it("loads only from a canonical path outside tracked source or under gitignored temp", () => {
    const root = mkdtempSync(join(tmpdir(), "s30-config-root-"));
    const tempDir = join(root, "temp", "rentvine-proof");
    mkdirSync(tempDir, { recursive: true });
    const securePath = join(tempDir, "runtime.json");
    writeFileSync(securePath, JSON.stringify(validConfig()), "utf8");

    expect(
      loadRentVineProofRuntimeConfig({
        rootDir: root,
        env: { [S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH_ENV]: securePath },
      }),
    ).toMatchObject({ proofRef: validConfig().proofRef });

    const trackedPath = join(root, "runtime.json");
    writeFileSync(trackedPath, JSON.stringify(validConfig()), "utf8");
    expect(() =>
      loadRentVineProofRuntimeConfig({
        rootDir: root,
        env: { [S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH_ENV]: trackedPath },
      }),
    ).toThrow();
  });

  it("refuses a temp-path symlink that canonically escapes into tracked source", () => {
    const root = mkdtempSync(join(tmpdir(), "s30-config-link-root-"));
    const tempDir = join(root, "temp", "rentvine-proof");
    mkdirSync(tempDir, { recursive: true });
    const trackedPath = join(root, "tracked-runtime.json");
    writeFileSync(trackedPath, JSON.stringify(validConfig()), "utf8");
    const linkedPath = join(tempDir, "runtime.json");
    symlinkSync(realpathSync(trackedPath), linkedPath);

    expect(() =>
      loadRentVineProofRuntimeConfig({
        rootDir: root,
        env: { [S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH_ENV]: linkedPath },
      }),
    ).toThrow();
  });
});
