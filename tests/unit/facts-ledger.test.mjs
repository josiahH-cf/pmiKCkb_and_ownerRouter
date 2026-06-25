import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkFactsText,
  evaluateContextFreshness,
} from "../../scripts/check-context-freshness.mjs";

// Structural guard for the solidified-context spine. Mirrors plan-status-sync.test.mjs: it asserts
// the real docs/facts.md + docs/loop-state.md pass the gate, and that the gate actually fails on a
// fabricated violation (so a green run means something).

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("context-freshness gate", () => {
  it("passes on the real docs/facts.md and docs/loop-state.md", () => {
    const { problems } = evaluateContextFreshness(root);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("flags a Verified fact with no evidence or date", () => {
    const bad = [
      "## Fact Ledger",
      "",
      "| id | claim | status | evidence | verified-on | supersedes | review-by |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| F-BAD | a claim | Verified | — |  | — | — |",
      "",
      "## Supersede Log",
      "",
      "## Open Questions",
      "",
    ].join("\n");

    const { problems } = checkFactsText(bad);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("no evidence"))).toBe(true);
    expect(problems.some((p) => p.includes("verified-on"))).toBe(true);
  });

  it("rejects a status outside the allowed set", () => {
    const bad = [
      "## Fact Ledger",
      "",
      "| id | claim | status | evidence | verified-on | supersedes | review-by |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| F-X | a claim | Confirmed | `AGENTS.md` | 2026-06-25 | — | — |",
      "",
      "## Supersede Log",
      "",
      "## Open Questions",
      "",
    ].join("\n");

    const { problems } = checkFactsText(bad);
    expect(problems.some((p) => p.includes("must be one of"))).toBe(true);
  });
});
