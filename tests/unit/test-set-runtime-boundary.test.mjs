import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const EXECUTION_SCRIPTS = [
  "scripts/capture-test-set-baseline.ts",
  "scripts/append-test-set-evidence.ts",
  "scripts/generate-test-set-report.ts",
];

function source(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function stripComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function importSpecifiers(value) {
  return [...stripComments(value).matchAll(/\bfrom\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

describe("S63 runtime and no-effect execution boundary", () => {
  it("loads and validates secure exact-four input before any external reader or Firestore", () => {
    for (const path of EXECUTION_SCRIPTS) {
      const code = stripComments(source(path));
      const mainIndex = code.indexOf("async function main(");
      expect(mainIndex, `${path} must expose one bounded main operation`).toBeGreaterThan(
        -1,
      );
      const configIndex = code.indexOf("loadTestSetRuntimeConfig(");
      expect(configIndex, `${path} must load secure runtime input`).toBeGreaterThan(-1);
      const observationIndex = code.indexOf("loadTestSetObservationBatch(");
      if (path.includes("append-test-set-evidence")) {
        expect(
          observationIndex,
          `${path} must load secure observations before Firestore`,
        ).toBeGreaterThan(configIndex);
      }

      for (const constructor of [
        "new RentVineClient(",
        "new GoogleSheetsApiReader(",
        "getLiveFirestore(",
      ]) {
        const constructorIndex = code.indexOf(constructor, mainIndex);
        if (constructorIndex >= 0) {
          expect(
            configIndex,
            `${path} must refuse invalid input before ${constructor}`,
          ).toBeLessThan(constructorIndex);
          if (path.includes("append-test-set-evidence")) {
            expect(
              observationIndex,
              `${path} must refuse invalid observations before ${constructor}`,
            ).toBeLessThan(constructorIndex);
          }
        }
      }
    }
  });

  it("contains no tracked cohort, fixed actor, or case-specific report prose", () => {
    const combined = EXECUTION_SCRIPTS.map(source).join("\n");
    expect(combined).not.toMatch(/\bconst\s+(?:COHORT|CAPTURE_ACTOR|REPORT_ACTOR)\b/);
    expect(combined).not.toMatch(/leaseId\s*:\s*["'][^<][^"']*["']/);
    expect(combined).not.toMatch(/sheetRow(?:Number)?\s*:\s*\d+/);
    expect(combined).not.toMatch(/@pmikcmetro\.com/);

    const reportBuilder = source("lib/lease-renewal/test-set-report.ts");
    expect(reportBuilder).not.toMatch(/\bLeases?\s+\d+/);
    expect(reportBuilder).not.toContain("applicationInitiatedClientSends: 0");
  });

  it("never emits case, actor, row, date, hash, raw error, or report-path values", () => {
    const forbiddenOutput =
      /console\.(?:log|error)\([^;]*(?:leaseId|sheetRow|endDate|\.hash|\.email|\.uid|outPath|error\.message|String\(error\))/s;
    for (const path of EXECUTION_SCRIPTS) {
      expect(stripComments(source(path)), path).not.toMatch(forbiddenOutput);
    }
  });

  it("binds secure observation retries to a stable idempotency key", () => {
    const code = stripComments(source("scripts/append-test-set-evidence.ts"));
    expect(code).toContain("idempotencyKey");
    expect(code).toContain("reusedCount");
  });

  it("imports readers and app-plane immutable stores but no draft, sender, writer, executor, or gate mutator", () => {
    const forbiddenImport =
      /(?:google-sheets\/write-client|rentvine\/(?:write|renewal)|gmail-runtime\/client|live-renewal-draft-provider|dotloop|external-execution|action-gate)/;
    for (const path of [
      ...EXECUTION_SCRIPTS,
      "lib/lease-renewal/test-set-runtime-config.ts",
      "lib/lease-renewal/test-set-observation-input.ts",
      "lib/lease-renewal/test-set-run-output.ts",
    ]) {
      expect(importSpecifiers(source(path)).join("\n"), path).not.toMatch(
        forbiddenImport,
      );
    }
  });
});
