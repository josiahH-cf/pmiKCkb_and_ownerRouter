import { describe, expect, it } from "vitest";

import {
  THEME_EXPERIENCE_LEDGER,
  THEME_MIGRATION_COHORTS,
  THEME_SOURCE_MIGRATION_LEDGER,
} from "@/lib/ui/theme-surface-ledger";

describe("S85 bounded theme migration ledger", () => {
  it("covers every audited surface exactly once", () => {
    expect(THEME_EXPERIENCE_LEDGER).toHaveLength(29);
    expect(THEME_EXPERIENCE_LEDGER.map((entry) => entry.id)).toEqual(
      Array.from(
        { length: 29 },
        (_, index) => `SUR-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(new Set(THEME_EXPERIENCE_LEDGER.flatMap((entry) => entry.routes)).size).toBe(
      30,
    );
    for (const entry of THEME_EXPERIENCE_LEDGER) {
      expect(entry.themes).toEqual(["light", "dark"]);
      expect(entry.viewports).toEqual([1280, 760, 320]);
      expect(entry.zoom).toContain(2);
      expect(entry.states.length).toBeGreaterThan(0);
      expect(entry.forcedColors).toBe(true);
      expect(entry.reducedMotion).toBe(true);
    }
  });

  it("keeps all five ordered cohorts and material state coverage", () => {
    expect(THEME_MIGRATION_COHORTS.map((cohort) => cohort.id)).toEqual([1, 2, 3, 4, 5]);
    const stateText = THEME_EXPERIENCE_LEDGER.flatMap((entry) => entry.states).join(" ");
    for (const state of [
      "loading",
      "empty",
      "error",
      "permission",
      "degraded",
      "disabled",
    ])
      expect(stateText).toContain(state);
  });

  it("records the exhaustive alias/source disposition and requires zero removed uses", () => {
    expect(THEME_SOURCE_MIGRATION_LEDGER).toHaveLength(32);
    expect(
      new Set(THEME_SOURCE_MIGRATION_LEDGER.map((entry) => entry.oldName)).size,
    ).toBe(THEME_SOURCE_MIGRATION_LEDGER.length);
    for (const entry of THEME_SOURCE_MIGRATION_LEDGER) {
      if (entry.disposition === "remove") expect(entry.expectedUsageCount).toBe(0);
      else expect(entry.disposition).toBe("retain-source");
    }
  });
});
