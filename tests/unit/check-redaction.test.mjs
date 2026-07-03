import { describe, expect, it } from "vitest";

import { REDACTED_TREES, evaluateRedaction } from "../../scripts/check-redaction.mjs";

const GITIGNORE_OK = ["/golden-data/", "docs/client_docs/", ".env.local"];

describe("evaluateRedaction (S13 H4 redaction gate)", () => {
  it("passes when the client-data trees are gitignored and nothing under them is tracked", () => {
    const result = evaluateRedaction({
      gitignoreLines: GITIGNORE_OK,
      trackedFiles: [],
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("fails when a client-data file is tracked by git", () => {
    const result = evaluateRedaction({
      gitignoreLines: GITIGNORE_OK,
      trackedFiles: ["golden-data/captured/r3-bootstrap.json"],
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("tracked by git");
  });

  it("fails when a client-data tree is not gitignored", () => {
    const result = evaluateRedaction({
      gitignoreLines: [".env.local"],
      trackedFiles: [],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("must be gitignored"))).toBe(true);
  });

  it("guards both known client-data trees", () => {
    expect(REDACTED_TREES).toContain("golden-data/");
    expect(REDACTED_TREES).toContain("docs/client_docs/");
  });
});
