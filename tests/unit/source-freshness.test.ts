import { describe, expect, it } from "vitest";

import { computeSourceFreshness } from "@/lib/retrieval/source-freshness";

const REF = "2026-07-23T00:00:00.000Z";

describe("computeSourceFreshness (AC-S32-4)", () => {
  it("is deterministic for fixed inputs", () => {
    const args = {
      lastReviewedAt: "2026-06-01",
      reviewIntervalDays: 30,
      referenceDateIso: REF,
    };
    expect(computeSourceFreshness(args)).toEqual(computeSourceFreshness(args));
  });

  it("returns unknown (no due date) when the review date is absent", () => {
    expect(
      computeSourceFreshness({ reviewIntervalDays: 30, referenceDateIso: REF }),
    ).toEqual({ status: "unknown" });
  });

  it("returns unknown (no due date) when the interval is absent or non-positive", () => {
    expect(
      computeSourceFreshness({ lastReviewedAt: "2026-06-01", referenceDateIso: REF }),
    ).toEqual({ status: "unknown" });
    expect(
      computeSourceFreshness({
        lastReviewedAt: "2026-06-01",
        reviewIntervalDays: 0,
        referenceDateIso: REF,
      }),
    ).toEqual({ status: "unknown" });
  });

  it("returns fresh with a due date when the reference is before the due date", () => {
    // Reviewed 2026-07-20, interval 30 -> due 2026-08-19; reference 2026-07-23 is before due.
    const result = computeSourceFreshness({
      lastReviewedAt: "2026-07-20",
      reviewIntervalDays: 30,
      referenceDateIso: REF,
    });
    expect(result.status).toBe("fresh");
    expect(result.dueDateIso).toBe("2026-08-19");
    expect(result.daysOverdue).toBeUndefined();
  });

  it("returns review-due with the exact daysOverdue just past the due date", () => {
    // Reviewed 2026-06-01, interval 30 -> due 2026-07-01; reference 2026-07-23 is 22 days overdue.
    const result = computeSourceFreshness({
      lastReviewedAt: "2026-06-01",
      reviewIntervalDays: 30,
      referenceDateIso: REF,
    });
    expect(result.status).toBe("review-due");
    expect(result.dueDateIso).toBe("2026-07-01");
    expect(result.daysOverdue).toBe(22);
  });

  it("returns stale when overdue by more than a full interval", () => {
    // Reviewed 2026-01-01, interval 30 -> due 2026-01-31; reference 2026-07-23 is far past a full cycle.
    const result = computeSourceFreshness({
      lastReviewedAt: "2026-01-01",
      reviewIntervalDays: 30,
      referenceDateIso: REF,
    });
    expect(result.status).toBe("stale");
    expect(result.daysOverdue).toBeGreaterThan(30);
  });
});
