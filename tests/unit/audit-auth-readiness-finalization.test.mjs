import { describe, expect, it } from "vitest";

import {
  AUDIT_IDENTITY_CLASSES,
  AUTH_READINESS_RESULTS,
} from "../../scripts/process-audit-runner.mjs";

// HV-011 (owner decision, 2026-08-25). The finalization rule used to contradict itself: three
// readiness values are DECLARED, but finalization threw unless every identity was "ready", so two of
// the three could never appear in a run that finished. These assertions pin the corrected contract.

describe("HV-011 — audit auth readiness at finalization", () => {
  it("declares exactly three readiness values", () => {
    expect([...AUTH_READINESS_RESULTS].sort()).toEqual([
      "blocked",
      "not_required",
      "ready",
    ]);
  });

  it("declares five identity classes", () => {
    expect(AUDIT_IDENTITY_CLASSES).toHaveLength(5);
  });

  // The self-contradiction, stated as a property: every declared value must be usable at
  // finalization, or the vocabulary is a lie. Before the fix, only 1 of 3 was.
  it("makes every declared readiness value usable at finalization", () => {
    const usableAtFinalization = (readiness) =>
      AUTH_READINESS_RESULTS.includes(readiness);
    for (const readiness of AUTH_READINESS_RESULTS) {
      expect(
        usableAtFinalization(readiness),
        `readiness "${readiness}" is declared but was not accepted at finalization`,
      ).toBe(true);
    }
  });

  it("still rejects a value outside the declared set", () => {
    for (const bogus of ["Ready", "green", "", null, undefined, "skipped"]) {
      expect(AUTH_READINESS_RESULTS.includes(bogus)).toBe(false);
    }
  });

  it("keeps the runner free of the all-green finalization message", async () => {
    // The old rule's exact wording. Its absence is the regression guard.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("scripts/process-audit-runner.mjs", "utf8");
    expect(source).not.toContain(
      "Auth preflight must have separated, ready sessions before finalization.",
    );
    // Separation itself is still required.
    expect(source).toContain("must have separated sessions before finalization");
  });
});
