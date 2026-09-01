import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Freshness guard for the intentionally small present-truth plan. Historical cross-product phase
// inventories were retired during the context reset; this test now protects the active outcome,
// current implementation baseline, bounded closure sequence, and explicit delivery rule instead of
// forcing superseded meeting artifacts back into current documentation.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PLAN_PATH = join(root, "docs", "plan.md");

describe("plan.md present-truth freshness", () => {
  const plan = readFileSync(PLAN_PATH, "utf8");

  it("keeps only the active outcome, current baseline, authority, queue, and delivery rule", () => {
    expect(plan).toContain("## Outcome");
    expect(plan).toContain("## Current implementation baseline");
    expect(plan).toContain("## Authority and closed decisions");
    expect(plan).toContain("## Canonical closure sequence");
    expect(plan).toContain("## Per-suite delivery rule");
    expect(plan).not.toContain("## Cross-Product Phases");
  });

  it("pins current production, the exact effect boundary, canonical endpoints, and terminal rule", () => {
    expect(plan).toContain("796879d6e95834a749b8f11f998ff5c76e6d0459");
    expect(plan).toContain("pmi-kc-app-rmtiwwud5-993818fec846");
    expect(plan).toContain("No RentVine renewal write");
    expect(plan).toContain("Maintenance provider mutation");
    expect(plan).toContain("bounded temporary proof window");
    expect(plan).toContain("S96 — safe connector disconnect and reconciliation");
    expect(plan).toContain("S87 — final six-cohort product-wide content reconciliation");
    expect(plan).toContain("ALL_GATES_GREEN");
  });
});
