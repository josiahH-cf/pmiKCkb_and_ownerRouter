import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import controlMap from "@/lib/help/content/renewal-control-map.json";
import {
  RENEWAL_CONTROL_MAP,
  renewalControlMapContinuity,
  type RenewalControlMapRow,
} from "@/lib/help/renewal-controls";

// S252 L54 / R-S252-6: every control in the starting commit's renewal control map (70 rows, frozen
// as control names only in tests/fixtures/s252/starting-renewal-control-map.json) is still in the
// map by its step id, role and accessible name, or carries its recorded new name in the one rename
// field, `formerly`, on the row that replaced it. None is gone. The browser half,
// scripts/smoke-renewal-guide-controls-browser.mjs, finds each of the 70 rows on its own page.

interface StartingRow {
  readonly step: string;
  readonly page: string;
  readonly control: string;
  readonly role: string;
  readonly scope: string;
  readonly availability: string;
}

const starting = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/s252/starting-renewal-control-map.json"),
    "utf8",
  ),
) as { commit: string; rows: StartingRow[] };

describe("S252 L54: the starting commit's control map rows are all still found", () => {
  it("the frozen starting map is the 70 rows of 6491c06f, by page", () => {
    expect(starting.commit).toBe("6491c06f3773e92c0bd811d4360371523e24d643");
    expect(starting.rows).toHaveLength(70);
    const pages = (test: (page: string) => boolean) =>
      starting.rows.filter((row) => test(row.page)).length;
    expect(pages((page) => page.startsWith("workspace:"))).toBe(50);
    expect(pages((page) => page === "/lease-renewal")).toBe(6);
    expect(pages((page) => page === "/connections")).toBe(13);
    expect(pages((page) => page === "/")).toBe(1);
  });

  it("every starting row is kept by role and name, or listed with its recorded new name", () => {
    const result = renewalControlMapContinuity(starting.rows, RENEWAL_CONTROL_MAP);
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(70);
    expect(
      result.rows.every((row) => row.state === "kept" || row.state === "renamed"),
    ).toBe(true);
  });

  it("every rename names the old label and role it replaced and a different new name", () => {
    for (const row of controlMap as readonly RenewalControlMapRow[]) {
      if (!row.formerly) continue;
      expect(row.formerly.control.trim().length, row.step).toBeGreaterThan(0);
      expect(row.formerly.control === row.control && row.formerly.role === row.role).toBe(
        false,
      );
    }
  });

  it("a removed row fails, naming the starting step and control", () => {
    const removed = RENEWAL_CONTROL_MAP.filter((row) => row.step !== "2");
    expect(renewalControlMapContinuity(starting.rows, removed).problems).toEqual([
      'Starting control map row 2 (summary "Filter renewal date" on /lease-renewal) is gone from the current map.',
    ]);
  });

  it("a renamed row without its recorded old name fails", () => {
    const renamed = RENEWAL_CONTROL_MAP.map((row) =>
      row.step === "4"
        ? { ...row, control: "Apply the month", formerly: undefined }
        : row,
    );
    expect(renewalControlMapContinuity(starting.rows, renamed).problems).toEqual([
      'Starting control map row 4 (button "Apply month" on /lease-renewal) is now button "Apply the month" with no recorded former name.',
    ]);
    const recorded = RENEWAL_CONTROL_MAP.map((row) =>
      row.step === "4"
        ? {
            ...row,
            control: "Apply the month",
            formerly: { control: "Apply month", role: "button" as const },
          }
        : row,
    );
    const ok = renewalControlMapContinuity(starting.rows, recorded);
    expect(ok.problems).toEqual([]);
    expect(ok.rows.find((row) => row.step === "4")).toMatchObject({
      state: "renamed",
      now: "Apply the month",
    });
  });
});
