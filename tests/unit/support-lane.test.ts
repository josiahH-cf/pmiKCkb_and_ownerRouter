// S65 (AC-S65-4, AC-S65-5): closing a report is visible immediately — the badge and the
// notifications lane exclude `resolved`, and a resolved report is never past its follow-up
// window. The broader lane behavior is covered in support-attention.test.ts; this file pins the
// closure-visibility contract the S65 transition depends on.

import { describe, expect, it } from "vitest";

import {
  buildSupportSignals,
  countSupportAttention,
  isSupportFollowUpDue,
} from "@/lib/attention/support-lane";

const NOW = "2026-08-06T12:00:00.000Z";
const OLD = "2026-07-01T00:00:00.000Z";

describe("closing a report decrements the counts (AC-S65-4)", () => {
  it("resolving a new report removes it from both counts and both signals", () => {
    const before = countSupportAttention(
      [
        { status: "new", created_at: OLD },
        { status: "acknowledged", created_at: OLD },
      ],
      NOW,
    );
    expect(before).toEqual({ newCount: 1, followUpDueCount: 2 });

    // The same queue after an Admin resolves both: nothing left to count.
    const after = countSupportAttention(
      [
        { status: "resolved", created_at: OLD },
        { status: "resolved", created_at: OLD },
      ],
      NOW,
    );
    expect(after).toEqual({ newCount: 0, followUpDueCount: 0 });
    expect(buildSupportSignals([{ status: "resolved", created_at: OLD }], NOW)).toEqual(
      [],
    );
  });
});

describe("a resolved report is never past follow-up (AC-S65-5)", () => {
  it("stays not-due at any age", () => {
    expect(
      isSupportFollowUpDue(
        { status: "resolved", created_at: "2020-01-01T00:00:00Z" },
        NOW,
      ),
    ).toBe(false);
    expect(isSupportFollowUpDue({ status: "resolved", created_at: OLD }, NOW)).toBe(
      false,
    );
  });
});
