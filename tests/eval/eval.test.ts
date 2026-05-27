import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCE_STATES } from "@/lib/constants";

interface EvalCase {
  id: string;
  question: string;
  expected_source_state: string;
  category: string;
}

const evalCases = JSON.parse(
  readFileSync(new URL("./kb-eval-seed.json", import.meta.url), "utf8"),
) as EvalCase[];

describe("KB eval seed set", () => {
  it("contains the required minimum number of scaffolded eval cases", () => {
    expect(evalCases).toHaveLength(50);
  });

  it("uses only supported source states", () => {
    const states = new Set(SOURCE_STATES);
    for (const evalCase of evalCases) {
      expect(
        states.has(evalCase.expected_source_state as (typeof SOURCE_STATES)[number]),
      ).toBe(true);
    }
  });
});
