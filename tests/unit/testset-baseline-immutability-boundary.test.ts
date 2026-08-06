// AC-S58-10, named form. The S63 four-lease test-set baseline is a persisted, IMMUTABLE record:
// captured once per lease, never re-read, never revalidated, never overwritten by any refresh. The
// baseline store does not exist yet when S58 ships, so this sentinel asserts the independently
// checkable half TODAY: the live-lease refresh path has NO write capability at all — it can touch
// no Firestore collection, no Sheet, no Drive folder, and no Gmail surface, so no refresh cycle can
// mutate a baseline (or anything else). The full form, asserting a REAL baseline is unmutated
// across a refresh cycle, is AC-S63-3 and lands with S63; recording it this way keeps a vacuously
// green sentinel from being mistaken for that proof.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as liveLeaseCache from "@/lib/lease-renewal/live-lease-cache";

const ROOT = process.cwd();

// The refresh path: the cache module itself plus the demand-driven refresh route over it.
const REFRESH_PATH_FILES = [
  "lib/lease-renewal/live-lease-cache.ts",
  "app/api/lease-renewal/refresh/route.ts",
] as const;

// Any import from a module family that can write. The cache may import ONLY the RentVine client
// types and the lease mapper; the route may add auth/session, config, zod, and Next primitives.
const WRITE_CAPABLE_IMPORT =
  /from\s+"@\/lib\/(?:firestore|google-sheets|google-drive|gmail-hub|maintenance)\/|write-client|firebase-admin/;

describe("test-set baseline immutability boundary (AC-S58-10 named form)", () => {
  it("the live-lease refresh path imports no write-capable module", () => {
    for (const rel of REFRESH_PATH_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(
        WRITE_CAPABLE_IMPORT.test(source),
        `${rel} must not import a write-capable module`,
      ).toBe(false);
    }
  });

  it("the cache module exports no write-shaped capability", () => {
    const writeShaped = Object.keys(liveLeaseCache).filter((name) =>
      /write|save|persist|record|upsert|delete|baseline/i.test(name),
    );
    expect(writeShaped).toEqual([]);
  });

  it("scans real files (self-check that the boundary is not vacuous)", () => {
    for (const rel of REFRESH_PATH_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(source.length).toBeGreaterThan(100);
    }
    // The module genuinely exposes the refresh surface this sentinel bounds.
    expect(typeof liveLeaseCache.getLiveLeaseSnapshot).toBe("function");
    expect(typeof liveLeaseCache.invalidateLiveLeaseCache).toBe("function");
  });
});
