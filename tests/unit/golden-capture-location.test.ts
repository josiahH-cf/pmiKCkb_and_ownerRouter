import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { loadVerifiedCapturedScenarios } from "@/lib/lease-renewal/golden/load";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
it("uses the original private capture location in a native execution directory without copying it", () => {
  const root = mkdtempSync(join(tmpdir(), "pmi-capture-location-"));
  roots.push(root);
  const captures = join(root, "private");
  mkdirSync(captures);
  writeFileSync(
    join(captures, "isolated.json"),
    JSON.stringify({
      name: "isolated-location-fixture",
      description: "isolated unit fixture",
      category: "edge",
      labelsVerified: true,
      input: { runId: "isolated", tables: [], nonSheetCandidates: [] },
      expectedFlags: [],
    }),
  );
  vi.stubEnv("PMIKC_VERIFIED_CAPTURE_DIR", captures);
  const actual = loadVerifiedCapturedScenarios();
  expect(actual).toHaveLength(1);
  expect(actual[0].name).toBe("isolated-location-fixture");
});
it("fails clearly if an explicitly requested capture directory disappears", () => {
  vi.stubEnv(
    "PMIKC_VERIFIED_CAPTURE_DIR",
    join(tmpdir(), "pmi-capture-missing-never-created"),
  );
  expect(() => loadVerifiedCapturedScenarios()).toThrow(
    "verified_capture_directory_missing",
  );
});
