import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Freshness guard for docs/plan.md: every cross-product phase must carry a `Status:` line with an
// allowed value, and the phases must be numbered contiguously from P0. This makes "where are we"
// machine-checkable and stops a phase (or a new phase) from drifting without a status. It is a
// structural check on the doc itself — there is no runtime code that reads plan.md.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PLAN_PATH = join(root, "docs", "plan.md");

// Keep in sync with the explainer under "## Cross-Product Phases" in docs/plan.md.
const ALLOWED_STATUSES = ["done", "in progress", "blocked", "not started"];

function readCrossProductPhases() {
  const text = readFileSync(PLAN_PATH, "utf8");
  const heading = "## Cross-Product Phases";
  const start = text.indexOf(heading);

  if (start === -1) {
    throw new Error('docs/plan.md is missing the "## Cross-Product Phases" section.');
  }

  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);

  // Each phase begins at a "### P<n> - ..." heading.
  return section
    .split(/\n###\s+/)
    .slice(1)
    .map((chunk) => {
      const title = chunk.split("\n", 1)[0].trim();
      const statusMatch = /\nStatus:\s*(.+)/.exec(`\n${chunk}`);
      return { title, status: statusMatch ? statusMatch[1].trim() : null };
    });
}

describe("plan.md phase status freshness", () => {
  const phases = readCrossProductPhases();

  it("numbers the cross-product phases contiguously from P0", () => {
    const ids = phases
      .map((phase) => phase.title.match(/^P(\d+)\b/)?.[1])
      .filter((id) => id != null)
      .map(Number);

    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids).toEqual(ids.map((_, index) => index));
  });

  it("gives every phase a Status line starting with an allowed value", () => {
    for (const phase of phases) {
      expect(phase.status, `missing Status for "${phase.title}"`).not.toBeNull();

      const keyword = ALLOWED_STATUSES.find((status) =>
        phase.status.toLowerCase().startsWith(status),
      );

      expect(
        keyword,
        `"${phase.title}" Status "${phase.status}" must start with one of: ${ALLOWED_STATUSES.join(", ")}`,
      ).toBeTruthy();
    }
  });

  it("names what a blocked phase waits on", () => {
    for (const phase of phases) {
      if (phase.status?.toLowerCase().startsWith("blocked")) {
        // A bare "blocked" with no explanation is the drift we want to catch.
        expect(
          phase.status.length,
          `"${phase.title}" is blocked but does not say what it waits on`,
        ).toBeGreaterThan("blocked".length + 3);
      }
    }
  });
});
