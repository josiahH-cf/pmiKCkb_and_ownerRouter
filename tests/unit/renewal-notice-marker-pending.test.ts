import { describe, expect, it } from "vitest";
import {
  advanceNoticeSafetyMarker,
  noticeSafetyBasis,
  pendingNoticeHash,
  type NoticeSafetyMarker,
} from "@/lib/lease-renewal/notice-safety";

// Synthetic source clocks exercise admission order, never provider time or customer evidence.
const scopeHash = "a".repeat(64);
const clearHash = "b".repeat(64);
const positiveHash = "c".repeat(64);
const observedAt = "2026-09-29T04:00:00.000Z";
function pending(): NoticeSafetyMarker {
  const sourceReadAt = { lease: 100, status: 110 };
  return {
    scopeHash,
    sourceReadAt,
    semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
    version: 8,
    observedAt,
  };
}
function input(
  sourceReadAt: NoticeSafetyMarker["sourceReadAt"],
  semanticHash = clearHash,
) {
  return { scopeHash, sourceReadAt, semanticHash, observedAt };
}

describe("pending notice admission cannot be poisoned by an older observation", () => {
  it.each([
    { lease: 99, status: 110 },
    { lease: 100, status: 109 },
    { lease: 101, status: 109 },
    { lease: 99, status: 111 },
  ])("keeps an older or incomparable %j pending and unavailable", (vector) => {
    for (const semanticHash of [clearHash, positiveHash]) {
      const before = pending();
      const stale = advanceNoticeSafetyMarker(before, input(vector, semanticHash));
      expect(stale).toEqual({ marker: before, ready: false });
      // Exact latest evidence can now finish its already-admitted generation.
      const latest = advanceNoticeSafetyMarker(stale.marker, input(before.sourceReadAt));
      expect(latest.ready).toBe(true);
      expect(latest.marker.version).toBe(before.version);
      expect(noticeSafetyBasis(latest.marker)).not.toEqual(noticeSafetyBasis(before));
    }
  });

  it("preserves a third admission when the previous in-flight read returns", () => {
    const second = pending();
    const sourceReadAt = { lease: 120, status: 130 };
    const third = {
      ...second,
      sourceReadAt,
      version: second.version + 1,
      semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
    };
    const lateSecond = advanceNoticeSafetyMarker(third, input(second.sourceReadAt));
    expect(lateSecond).toEqual({ marker: third, ready: false });
    expect(advanceNoticeSafetyMarker(lateSecond.marker, input(sourceReadAt))).toEqual({
      marker: { ...input(sourceReadAt), version: third.version },
      ready: true,
    });
  });

  it("keeps a genuine completed-evidence conflict blocked until a newer coherent read", () => {
    const complete = { ...pending(), semanticHash: clearHash };
    const conflict = advanceNoticeSafetyMarker(
      complete,
      input(complete.sourceReadAt, positiveHash),
    );
    expect(conflict.ready).toBe(false);
    expect(conflict.marker.version).toBe(complete.version + 1);
    for (const semanticHash of [clearHash, positiveHash]) {
      expect(
        advanceNoticeSafetyMarker(
          conflict.marker,
          input(complete.sourceReadAt, semanticHash),
        ),
      ).toEqual({ marker: conflict.marker, ready: false });
    }
    const refreshed = advanceNoticeSafetyMarker(
      conflict.marker,
      input({ lease: 120, status: 130 }),
    );
    expect(refreshed.ready).toBe(true);
    expect(refreshed.marker.version).toBeGreaterThan(conflict.marker.version);
  });
});
