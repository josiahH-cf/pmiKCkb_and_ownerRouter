import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkFactsText,
  evaluateContextFreshness,
  gitIgnoredPaths,
} from "../../scripts/check-context-freshness.mjs";
import { missingRepositoryPaths } from "../../scripts/check-active-doc-paths.mjs";

// Structural guard for the solidified-context spine. Mirrors plan-status-sync.test.mjs: it asserts
// the real docs/facts.md + docs/loop-state.md pass the gate, and that the gate actually fails on a
// fabricated violation (so a green run means something).

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("context-freshness gate", () => {
  it("passes on the real docs/facts.md and docs/loop-state.md", () => {
    const { problems } = evaluateContextFreshness(root);
    expect(problems, problems.join("\n")).toEqual([]);
  }, 20_000);

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

  // Regression: the gate used to resolve evidence paths with existsSync alone, so a row citing a
  // gitignored artifact passed locally and failed only in CI. main was red from 3859059 to 9ab1647
  // for exactly that. These pin the LOCAL gate to the same verdict CI reaches.
  describe("gitignored evidence paths", () => {
    it("reports a gitignored path as ignored", () => {
      const ignored = gitIgnoredPaths(
        ["docs/temp/rentcast-gate-flip-d12-patch.md", "docs/facts.md"],
        root,
      );
      expect(ignored.has("docs/temp/rentcast-gate-flip-d12-patch.md")).toBe(true);
      expect(ignored.has("docs/facts.md")).toBe(false);
    });

    it("does not flag a committed path, and stays empty for an empty input", () => {
      expect(
        gitIgnoredPaths(["AGENTS.md", "scripts/check-context-freshness.mjs"], root),
      ).toEqual(new Set());
      expect(gitIgnoredPaths([], root)).toEqual(new Set());
    });

    it("fails open rather than throwing when git cannot answer", () => {
      // Outside a work tree check-ignore exits 128; the gate must degrade to its existsSync check
      // rather than becoming unrunnable off-repo.
      expect(() => gitIgnoredPaths(["docs/facts.md"], tmpdir())).not.toThrow();
      expect(gitIgnoredPaths(["docs/facts.md"], tmpdir())).toEqual(new Set());
    });

    it("does not treat a merely-untracked new file as a violation", () => {
      // A file created for the current slice is untracked until `git add`. Only ignored-ness fails,
      // otherwise authoring a fact alongside a new file would be impossible.
      const fresh = join(root, `not-added-${process.pid}.md`);
      writeFileSync(fresh, "temp\n");
      try {
        expect(gitIgnoredPaths([`not-added-${process.pid}.md`], root)).toEqual(new Set());
      } finally {
        rmSync(fresh, { force: true });
      }
    });
  });

  it("does not report an intentionally ignored source directory missing in clean CI", () => {
    expect(
      missingRepositoryPaths(
        [
          "docs/client_docs/definitely-not-present/",
          "docs/context_and_calls/definitely-not-present/",
          "docs/definitely-not-present/",
        ],
        root,
      ),
    ).toEqual(["docs/definitely-not-present/"]);
  });
});
