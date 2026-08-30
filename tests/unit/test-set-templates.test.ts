import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseTestSetObservationBatch } from "@/lib/lease-renewal/test-set-observation-input";
import { parseTestSetRuntimeConfig } from "@/lib/lease-renewal/test-set-runtime-config";

function template(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), "docs", "source-corpus", name), "utf8"),
  ) as Record<string, unknown>;
}

describe("S63 operator templates", () => {
  it("fixes four opaque case slots but cannot execute until secure values replace placeholders", () => {
    const runtime = template("four-lease-runtime.template.json");
    expect(
      (runtime.cases as Array<Record<string, unknown>>).map((entry) => entry.caseRef),
    ).toEqual(["case-1", "case-2", "case-3", "case-4"]);
    expect(() => parseTestSetRuntimeConfig(runtime)).toThrowError(
      expect.objectContaining({ code: "case_shape" }),
    );
  });

  it("provides three null-safe verdict observations per case and cannot execute as copied", () => {
    const observations = template("four-lease-observations.template.json");
    const entries = observations.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(12);
    for (const caseRef of ["case-1", "case-2", "case-3", "case-4"]) {
      expect(
        entries.filter((entry) => entry.caseRef === caseRef).map((entry) => entry.kind),
      ).toEqual([
        "process_observation",
        "number_evidence_observation",
        "safety_observation",
      ]);
    }
    for (const entry of entries) {
      expect(Object.values(entry.payload as Record<string, unknown>)).toEqual(
        expect.arrayContaining([null]),
      );
      expect(
        Object.values(entry.payload as Record<string, unknown>).every(
          (value) => value === null,
        ),
      ).toBe(true);
    }
    expect(() => parseTestSetObservationBatch(observations)).toThrowError(
      expect.objectContaining({ code: "observation_shape" }),
    );
  });
});
