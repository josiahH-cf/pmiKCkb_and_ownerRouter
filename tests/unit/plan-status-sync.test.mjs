import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Freshness guard for the intentionally small present-truth plan. Historical cross-product phase
// inventories were retired during the context reset; this test now protects the active outcome,
// bounded release sequence, and explicit completion rule instead of forcing old phases back into
// current documentation.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PLAN_PATH = join(root, "docs", "plan.md");

describe("plan.md present-truth freshness", () => {
  const plan = readFileSync(PLAN_PATH, "utf8");

  it("keeps only the active outcome, implementation, release sequence, and completion rule", () => {
    expect(plan).toContain("## Outcome");
    expect(plan).toContain("## Completed implementation");
    expect(plan).toContain("## Current release sequence");
    expect(plan).toContain("## Completion rule");
    expect(plan).not.toContain("## Cross-Product Phases");
  });

  it("pins the remaining release proof and the no-live-effect boundary", () => {
    expect(plan).toContain("zero-traffic candidate");
    expect(plan).toContain("eight-row human litmus");
    expect(plan).toContain("editable 8–10 slide customer readout");
    expect(plan).toContain(
      "No live RentVine record, operating Sheet cell, or client-facing message may be",
    );
  });
});
