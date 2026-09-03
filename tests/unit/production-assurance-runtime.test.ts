import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requireExplicitLive,
  resolveManagedProfile,
  resolveProductionTarget,
  safeCliFailure,
  verifyExactVersion,
} from "../../scripts/production-assurance-runtime";

const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("production assurance command boundary", () => {
  it("requires an explicit live flag", () => {
    expect(() => requireExplicitLive([])).toThrow("explicit_live_required");
    expect(() => requireExplicitLive(["--live"])).not.toThrow();
  });

  it("requires an exact https Cloud Run origin, commit, and revision", () => {
    const commit = "1".repeat(40);
    expect(
      resolveProductionTarget([
        "--base-url=https://pmi-kc-app-example-uc.a.run.app",
        `--expected-commit=${commit}`,
        "--expected-revision=pmi-kc-app-revision-1",
        "--service=pmi-kc-app",
      ]),
    ).toEqual({
      origin: "https://pmi-kc-app-example-uc.a.run.app",
      expectedCommit: commit,
      expectedRevision: "pmi-kc-app-revision-1",
      service: "pmi-kc-app",
    });
    for (const baseUrl of [
      "http://pmi-kc-app-example-uc.a.run.app",
      "https://example.com",
      "https://pmi-kc-app-example-uc.a.run.app/private",
      "https://pmi-kc-app-example-uc.a.run.app?lease=private",
    ]) {
      expect(() =>
        resolveProductionTarget([
          `--base-url=${baseUrl}`,
          `--expected-commit=${commit}`,
          "--expected-revision=pmi-kc-app-revision-1",
          "--service=pmi-kc-app",
        ]),
      ).toThrow("production_origin_invalid");
    }
    expect(() =>
      resolveProductionTarget([
        "--base-url=https://pmi-kc-app-example-uc.a.run.app",
        `--expected-commit=${commit}`,
        "--expected-revision=foreign-service-revision-1",
        "--service=pmi-kc-app",
      ]),
    ).toThrow("version_service_mismatch");
  });

  it("requires /api/version to echo the exact service as well as revision and commit", async () => {
    const target = {
      origin: "https://pmi-kc-app-example-uc.a.run.app",
      expectedCommit: "1".repeat(40),
      expectedRevision: "pmi-kc-app-revision-1",
      service: "pmi-kc-app",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        commit: target.expectedCommit,
        revision: target.expectedRevision,
        service: "foreign-service",
        environment: "production",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyExactVersion(target)).rejects.toThrow("version_identity_mismatch");
  });

  it("requires an existing managed profile outside the repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "pmi-assurance-profile-"));
    temporary.push(outside);
    expect(resolveManagedProfile([`--profile=${outside}`])).toBe(resolve(outside));

    const inside = resolve("temp", "assurance-profile-test");
    mkdirSync(inside, { recursive: true });
    temporary.push(inside);
    expect(() => resolveManagedProfile([`--profile=${inside}`])).toThrow(
      "managed_profile_must_be_outside_repository",
    );
  });

  it("never exposes arbitrary exception text at the CLI boundary", () => {
    expect(
      safeCliFailure(new Error("https://example.invalid/private?token=secret")),
    ).toBe("assurance_failed");
    expect(safeCliFailure(new Error("managed_profile_required"))).toBe(
      "managed_profile_required",
    );
  });
});
