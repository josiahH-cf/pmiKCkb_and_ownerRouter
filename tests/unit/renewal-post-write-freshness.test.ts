import { describe, expect, it } from "vitest";

import {
  RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS,
  parseRenewalSourceRefreshAfter,
} from "@/lib/lease-renewal/post-write-freshness";

describe("renewal source-refresh browser barrier", () => {
  const nowMs = 1_800_000_000_000;

  it("accepts only a recent bounded millisecond generation", () => {
    expect(parseRenewalSourceRefreshAfter(String(nowMs - 1_000), nowMs)).toBe(
      nowMs - 1_000,
    );
    expect(parseRenewalSourceRefreshAfter(undefined, nowMs)).toBeNull();
    expect(parseRenewalSourceRefreshAfter("not-a-timestamp", nowMs)).toBeNull();
    expect(
      parseRenewalSourceRefreshAfter(
        String(nowMs - RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS * 1_000 - 1),
        nowMs,
      ),
    ).toBeNull();
    expect(parseRenewalSourceRefreshAfter(String(nowMs + 60_001), nowMs)).toBeNull();
  });
});
