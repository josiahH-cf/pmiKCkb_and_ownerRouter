import { describe, expect, it } from "vitest";

import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  actionRegistryHash,
  buildCurrentPreV1Manifest,
  verifyV1ReleaseManifest,
} from "@/lib/release/manifest";

describe("V1 release manifest", () => {
  it("keeps the current local candidate pre-V1 with exact gates", () => {
    const result = verifyV1ReleaseManifest(buildCurrentPreV1Manifest("abcdef0"));
    expect(result.ok).toBe(false);
    expect(result.state).toBe("pre-v1");
    expect(result.issues).toContain("S25 is Gated, not Accepted.");
    expect(result.issues).toContain("Dan business acceptance is pending.");
  });

  it("fails missing action, registry drift, and absent owner acceptance", () => {
    const manifest = buildCurrentPreV1Manifest("abcdef0");
    manifest.actions.shift();
    manifest.registryHash = "0".repeat(64);
    const result = verifyV1ReleaseManifest(manifest);
    expect(result.issues.some((issue) => issue.includes("missing"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("hash drifted"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("acceptance is pending"))).toBe(
      true,
    );
  });

  it("accepts only an all-green test-seam registry plus both named signatures", () => {
    const registry = ACTION_REGISTRY_SEED.map((entry) => ({
      ...entry,
      readiness: "Approved for Execution" as const,
      evidence_status: "Documented" as const,
      production_allowed: true,
    }));
    const manifest = buildCurrentPreV1Manifest("abcdef0");
    manifest.stage = "v1";
    manifest.registryHash = actionRegistryHash(registry);
    for (const suite of Object.values(manifest.suites)) suite.state = "Accepted";
    manifest.actions = manifest.actions.map((action) => ({
      ...action,
      state: "Accepted",
      productionAllowed: true,
      evidenceRef: "docs/evidence/synthetic-accepted.md",
      monitoringRef: manifest.monitoringRef,
      rollbackRef: manifest.rollbackRef,
    }));
    manifest.danBusinessAcceptance = {
      status: "accepted",
      acceptedBy: "Dan",
      acceptedAt: "2026-07-14T00:00:00.000Z",
      evidenceRef: "docs/evidence/synthetic-accepted.md",
    };
    manifest.josiahTechnicalAcceptance = {
      status: "accepted",
      acceptedBy: "Josiah",
      acceptedAt: "2026-07-14T00:00:00.000Z",
      evidenceRef: "docs/evidence/synthetic-accepted.md",
    };
    expect(verifyV1ReleaseManifest(manifest, registry)).toMatchObject({
      ok: true,
      state: "v1",
    });
  });
});
