import { describe, expect, it, vi } from "vitest";

import {
  loadTestSetObservationBatch,
  parseTestSetObservationBatch,
  S63_OBSERVATION_PATH_ENV,
} from "@/lib/lease-renewal/test-set-observation-input";
import { S63RunError } from "@/lib/lease-renewal/test-set-run-output";

function validBatch() {
  return {
    schemaVersion: "s63-observation-v1",
    batchRef: "fixture-batch-1",
    entries: [
      {
        observationRef: "fixture-observation-1",
        caseRef: "case-1",
        kind: "process_observation",
        note: "Fixture process observation.",
        payload: { processVersion: "renewal-v1" },
      },
      {
        observationRef: "fixture-observation-2",
        caseRef: "case-2",
        kind: "number_evidence_observation",
        note: "Fixture number observation.",
        payload: { rentCastRadiusMiles: 2 },
      },
      {
        observationRef: "fixture-observation-3",
        caseRef: "case-3",
        kind: "safety_observation",
        note: "Fixture safety observation.",
        payload: { appDraftCreateCount: 0 },
      },
    ],
  };
}

function expectCode(value: unknown, code: string): void {
  try {
    parseTestSetObservationBatch(value);
    throw new Error("Expected observation refusal.");
  } catch (error) {
    expect(error).toBeInstanceOf(S63RunError);
    expect((error as S63RunError).code).toBe(code);
  }
}

describe("S63 secure observation input", () => {
  it("accepts case-slot references and current append-only evidence kinds", () => {
    const batch = parseTestSetObservationBatch(validBatch());
    expect(batch.batchRef).toBe("fixture-batch-1");
    expect(batch.entries).toHaveLength(3);
    expect(batch.entries.map((entry) => entry.observationRef)).toEqual([
      "fixture-observation-1",
      "fixture-observation-2",
      "fixture-observation-3",
    ]);
    expect(batch.entries.map((entry) => entry.caseRef)).toEqual([
      "case-1",
      "case-2",
      "case-3",
    ]);
  });

  it("rejects empty, unknown-slot, send-shaped, legacy-verdict, or extra-key input", () => {
    expectCode({ ...validBatch(), entries: [] }, "observation_shape");
    expectCode(
      {
        ...validBatch(),
        entries: validBatch().entries.map((entry, index) =>
          index === 0 ? { ...entry, caseRef: "case-9" } : entry,
        ),
      },
      "observation_shape",
    );
    for (const kind of ["human_send", "verdict", "not_a_kind"]) {
      expectCode(
        {
          ...validBatch(),
          entries: validBatch().entries.map((entry, index) =>
            index === 0 ? { ...entry, kind } : entry,
          ),
        },
        "observation_shape",
      );
    }
    expectCode(
      {
        ...validBatch(),
        entries: validBatch().entries.map((entry, index) =>
          index === 0 ? { ...entry, unexpected: true } : entry,
        ),
      },
      "observation_shape",
    );
  });

  it("keeps malformed client-bearing values out of error text", () => {
    const sensitive = "sensitive client observation that must not be echoed";
    const input = validBatch();
    input.entries[0]!.note = sensitive.repeat(500);
    try {
      parseTestSetObservationBatch(input);
      throw new Error("Expected observation refusal.");
    } catch (error) {
      expect(error).toBeInstanceOf(S63RunError);
      expect((error as S63RunError).code).toBe("observation_shape");
      expect((error as Error).message).not.toContain(sensitive);
    }
  });

  it("refuses malformed or unknown fields in the three current structured observations", () => {
    for (const [kind, payload] of [
      ["process_observation", { unknownProcessFact: true }],
      ["number_evidence_observation", { rentCastRadiusMiles: "two" }],
      ["safety_observation", { appDraftCreateCount: -1 }],
    ] as const) {
      expectCode(
        {
          ...validBatch(),
          entries: validBatch().entries.map((entry, index) =>
            index === 0 ? { ...entry, kind, payload } : entry,
          ),
        },
        "observation_shape",
      );
    }
  });

  it("loads only an explicit path outside tracked source or under temp", () => {
    const readText = vi.fn(() => JSON.stringify(validBatch()));
    const realPath = vi.fn((path: string) => path);
    expect(
      loadTestSetObservationBatch({
        rootDir: "/workspace/repository",
        env: { [S63_OBSERVATION_PATH_ENV]: "/secure/s63-observations.json" },
        readText,
        realPath,
      }).entries,
    ).toHaveLength(3);

    readText.mockClear();
    expect(() =>
      loadTestSetObservationBatch({
        rootDir: "/workspace/repository",
        env: {
          [S63_OBSERVATION_PATH_ENV]:
            "/workspace/repository/scripts/tracked-observations.json",
        },
        readText,
        realPath,
      }),
    ).toThrowError(expect.objectContaining({ code: "observation_tracked_path" }));
    expect(readText).not.toHaveBeenCalled();

    expect(() =>
      loadTestSetObservationBatch({
        rootDir: "/workspace/repository",
        env: {},
        readText,
        realPath,
      }),
    ).toThrowError(expect.objectContaining({ code: "observation_path_missing" }));
  });

  it("refuses a temp symlink whose canonical target is tracked source", () => {
    const readText = vi.fn(() => JSON.stringify(validBatch()));
    expect(() =>
      loadTestSetObservationBatch({
        rootDir: "/workspace/repository",
        env: {
          [S63_OBSERVATION_PATH_ENV]:
            "/workspace/repository/temp/test-set/observation-link.json",
        },
        realPath: () => "/workspace/repository/docs/observation-secret.json",
        readText,
      }),
    ).toThrowError(expect.objectContaining({ code: "observation_tracked_path" }));
    expect(readText).not.toHaveBeenCalled();
  });
});
