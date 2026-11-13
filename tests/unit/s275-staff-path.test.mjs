import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOVEMBER_10_CORE_JOURNEYS,
  REHEARSAL_SEED,
  checkStaffPathCalls,
} from "../../scripts/lib/one-path-rehearsal/staff-path-check.mjs";

// S275 R-S275-8 / AC-S275-5: the rehearsal seed and the November 10 core journeys reach an owner
// reply the staff way: the mail stand-in's reply hook, then the worker tick (the seed) or the
// waiting step's visible "Check for a reply now" (N10-02). Neither posts the sequences refresh
// action itself. Static reads of the two files only.
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const files = [REHEARSAL_SEED, NOVEMBER_10_CORE_JOURNEYS].map((file) => ({
  file,
  text: read(file),
}));

describe("S275 R-S275-8: the seed and N10-02 reach the reply through staff paths", () => {
  it("AC-S275-5 finds no direct post of the sequences refresh action in the seed or the November 10 journeys", () => {
    const result = checkStaffPathCalls(files);
    expect(result.unparsed).toEqual([]);
    expect(result.violations.filter(({ action }) => action === "refresh")).toEqual([]);
  });

  it("S284 R-S284-2 the seed's send, the N10-03 schedule and the N10-02 duplicate-send probe use staff controls", () => {
    const result = checkStaffPathCalls(files);
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
    const seed = read(REHEARSAL_SEED);
    expect(seed).toContain(
      'confirmReviewDialog(page, review.dialog, "Send this message")',
    );
    const journeys = read(NOVEMBER_10_CORE_JOURNEYS);
    expect(journeys).toContain('"Review and schedule"');
    expect(journeys).toContain('"Schedule this message"');
    // The probe is a second page on the same review, confirmed after the first Send.
    expect(journeys).toContain("const stalePage = await page.context().newPage();");
    expect(journeys).toContain(
      'assert.ok(stale.alert, "The stale page shows the refusal");',
    );
  });

  it("R-S275-8 the seed reads the reply through the worker tick and N10-02 through the visible check", () => {
    const seed = read(REHEARSAL_SEED);
    expect(seed).toContain('import { runDueMessageTick } from "./due-message-tick.mjs";');
    expect(seed).toContain("tick = await runDueMessageTick(rehearsal);");
    const journeys = read(NOVEMBER_10_CORE_JOURNEYS);
    expect(journeys).toContain('{ name: "Check for a reply now", exact: true }');
    expect(journeys).toContain('check: "reply-by-visible-check"');
  });
});
