import { describe, expect, it, vi } from "vitest";

import {
  loadTestSetRuntimeConfig,
  parseTestSetRuntimeConfig,
  S63_RUNTIME_CONFIG_PATH_ENV,
  S63RuntimeConfigError,
} from "@/lib/lease-renewal/test-set-runtime-config";
import {
  createTestSetRunReference,
  formatTestSetCaptureSummary,
  formatTestSetEvidenceSummary,
  formatTestSetRefusal,
  formatTestSetReportSummary,
  safeTestSetFailureCode,
} from "@/lib/lease-renewal/test-set-run-output";

function validConfig() {
  return {
    schemaVersion: "s63-runtime-v1",
    scope: "renewals",
    actor: {
      uid: "fixture-managed-operator",
      email: "fixture.operator@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["renewals"],
    },
    cases: [
      { caseRef: "case-1", leaseId: "fixture-lease-a", sheetRowNumber: 101 },
      { caseRef: "case-2", leaseId: "fixture-lease-b", sheetRowNumber: 102 },
      { caseRef: "case-3", leaseId: "fixture-lease-c", sheetRowNumber: 103 },
      { caseRef: "case-4", leaseId: "fixture-lease-d", sheetRowNumber: 104 },
    ],
    report: {
      windowDescription: "Fixture review window.",
      dailyOwner: "Fixture operational owner.",
      abortTrigger: "Fixture abort trigger.",
    },
  };
}

function expectConfigCode(value: unknown, code: string): void {
  try {
    parseTestSetRuntimeConfig(value);
    throw new Error("Expected the runtime config to be refused.");
  } catch (error) {
    expect(error).toBeInstanceOf(S63RuntimeConfigError);
    expect((error as S63RuntimeConfigError).code).toBe(code);
  }
}

describe("S63 secure runtime config", () => {
  it("accepts one strict managed-renewals actor and exactly four stable case slots", () => {
    const parsed = parseTestSetRuntimeConfig(validConfig());
    expect(parsed.schemaVersion).toBe("s63-runtime-v1");
    expect(parsed.actor).toMatchObject({
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["renewals"],
    });
    expect(parsed.cases.map((entry) => entry.caseRef)).toEqual([
      "case-1",
      "case-2",
      "case-3",
      "case-4",
    ]);
  });

  it("refuses missing, non-four, duplicate, malformed, or unexpected case input", () => {
    expectConfigCode({ ...validConfig(), cases: [] }, "case_count");
    expectConfigCode(
      { ...validConfig(), cases: validConfig().cases.slice(0, 3) },
      "case_count",
    );
    expectConfigCode(
      {
        ...validConfig(),
        cases: [
          ...validConfig().cases,
          { caseRef: "case-5", leaseId: "fixture-lease-e", sheetRowNumber: 105 },
        ],
      },
      "case_count",
    );
    expectConfigCode(
      {
        ...validConfig(),
        cases: validConfig().cases.map((entry, index) =>
          index === 1 ? { ...entry, leaseId: "fixture-lease-a" } : entry,
        ),
      },
      "duplicate_lease",
    );
    expectConfigCode(
      {
        ...validConfig(),
        cases: validConfig().cases.map((entry, index) =>
          index === 1 ? { ...entry, sheetRowNumber: 101 } : entry,
        ),
      },
      "duplicate_sheet_row",
    );
    expectConfigCode(
      {
        ...validConfig(),
        cases: validConfig().cases.map((entry, index) =>
          index === 1 ? { ...entry, caseRef: "case-1" } : entry,
        ),
      },
      "case_refs",
    );
    expectConfigCode(
      {
        ...validConfig(),
        cases: validConfig().cases.map((entry, index) =>
          index === 1 ? { ...entry, sheetRowNumber: 0 } : entry,
        ),
      },
      "case_shape",
    );
    expectConfigCode(
      {
        ...validConfig(),
        cases: validConfig().cases.map((entry, index) =>
          index === 1 ? { ...entry, unexpected: "not allowed" } : entry,
        ),
      },
      "case_shape",
    );
  });

  it("refuses an unmanaged, non-renewals, or malformed actor without echoing values", () => {
    const sensitiveLease = "sensitive-lease-reference";
    const sensitiveEmail = "sensitive.person@outside.invalid";
    const config = validConfig();
    config.cases[0]!.leaseId = sensitiveLease;
    config.actor.email = sensitiveEmail;
    config.actor.hd = "outside.invalid";

    try {
      parseTestSetRuntimeConfig(config);
      throw new Error("Expected actor refusal.");
    } catch (error) {
      expect(error).toBeInstanceOf(S63RuntimeConfigError);
      expect((error as S63RuntimeConfigError).code).toBe("managed_actor");
      expect((error as Error).message).not.toContain(sensitiveLease);
      expect((error as Error).message).not.toContain(sensitiveEmail);
    }

    expectConfigCode(
      {
        ...validConfig(),
        actor: { ...validConfig().actor, scopes: ["maintenance"] },
      },
      "renewals_scope",
    );
    expectConfigCode(
      {
        ...validConfig(),
        actor: { ...validConfig().actor, role: "Viewer" },
      },
      "actor_role",
    );
  });

  it("loads only an explicit secure path outside tracked source or under gitignored temp", () => {
    const readText = vi.fn(() => JSON.stringify(validConfig()));
    const realPath = vi.fn((path: string) => path);
    const outside = loadTestSetRuntimeConfig({
      rootDir: "/workspace/repository",
      env: { [S63_RUNTIME_CONFIG_PATH_ENV]: "/secure/s63-runtime.json" },
      readText,
      realPath,
    });
    expect(outside.cases).toHaveLength(4);
    expect(readText).toHaveBeenCalledTimes(1);

    readText.mockClear();
    const ignored = loadTestSetRuntimeConfig({
      rootDir: "/workspace/repository",
      env: {
        [S63_RUNTIME_CONFIG_PATH_ENV]:
          "/workspace/repository/temp/test-set/runtime/config.json",
      },
      readText,
      realPath,
    });
    expect(ignored.cases).toHaveLength(4);
    expect(readText).toHaveBeenCalledTimes(1);

    readText.mockClear();
    expect(() =>
      loadTestSetRuntimeConfig({
        rootDir: "/workspace/repository",
        env: {
          [S63_RUNTIME_CONFIG_PATH_ENV]:
            "/workspace/repository/scripts/tracked-config.json",
        },
        readText,
        realPath,
      }),
    ).toThrowError(expect.objectContaining({ code: "tracked_config_path" }));
    expect(readText).not.toHaveBeenCalled();

    expect(() =>
      loadTestSetRuntimeConfig({
        rootDir: "/workspace/repository",
        env: {},
        readText,
        realPath,
      }),
    ).toThrowError(expect.objectContaining({ code: "config_path_missing" }));
    expect(readText).not.toHaveBeenCalled();
  });

  it("refuses a temp symlink whose canonical target is tracked source", () => {
    const readText = vi.fn(() => JSON.stringify(validConfig()));
    expect(() =>
      loadTestSetRuntimeConfig({
        rootDir: "/workspace/repository",
        env: {
          [S63_RUNTIME_CONFIG_PATH_ENV]:
            "/workspace/repository/temp/test-set/runtime-link.json",
        },
        realPath: () => "/workspace/repository/docs/runtime-secret.json",
        readText,
      }),
    ).toThrowError(expect.objectContaining({ code: "tracked_config_path" }));
    expect(readText).not.toHaveBeenCalled();
  });
});

describe("S63 value-free terminal output", () => {
  it("emits only counts, an opaque run reference, operation, and allowlisted failure code", () => {
    const runReference = createTestSetRunReference(
      () => "11111111-2222-4333-8444-555555555555",
    );
    expect(runReference).toBe("s63-11111111-2222-4333-8444-555555555555");

    const capture = formatTestSetCaptureSummary({
      runReference,
      configuredCount: 4,
      capturedCount: 2,
      reusedCount: 2,
    });
    const report = formatTestSetReportSummary({
      runReference,
      caseCount: 4,
      baselineCount: 4,
      evidenceCount: 17,
    });
    const evidence = formatTestSetEvidenceSummary({
      runReference,
      caseSlotCount: 4,
      appendedCount: 8,
      reusedCount: 3,
    });
    const sensitiveError = new Error(
      "sensitive-lease-reference sensitive.person@pmikcmetro.com row=999 hash=secret",
    );
    const refusal = formatTestSetRefusal({
      operation: "report",
      code: safeTestSetFailureCode(sensitiveError),
    });
    const output = [capture, report, evidence, refusal].join("\n");

    expect(output).toContain(runReference);
    expect(output).toContain("configured=4");
    expect(output).toContain("evidence=17");
    expect(output).toContain("appended=8");
    expect(output).toContain("reused=3");
    expect(output).toContain("unexpected_failure");
    expect(output).not.toMatch(
      /sensitive-lease-reference|sensitive\.person|row=999|hash=secret/,
    );
  });
});
