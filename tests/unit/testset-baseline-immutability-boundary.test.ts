// AC-S58-10 (named form) + AC-S63-3 (full form). The S63 four-lease test-set baseline is a
// persisted, IMMUTABLE record: captured once per lease, never revalidated, never overwritten by
// any refresh. S58 shipped the independently checkable half — the live-lease refresh path has NO
// write capability at all. S63 completes the sentinel with the store present: the store's only
// write is a transactional `create` (a second capture is an API error, not an overwrite), the
// refresh path never imports the store, and a REAL captured baseline survives a full refresh
// cycle with its hash byte-identical.

import type { Firestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  captureTestSetBaseline,
  getTestSetBaseline,
  verifyTestSetBaselineHash,
  type TestSetBaselineRentvineFacts,
} from "@/lib/firestore/test-set-baseline";
import * as liveLeaseCache from "@/lib/lease-renewal/live-lease-cache";
import { FakeFirestore } from "../helpers/fake-firestore";

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

  // S63: the refresh path must never learn the baseline store exists.
  it("the refresh path never imports the baseline store", () => {
    for (const rel of REFRESH_PATH_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(/test-set-baseline/.test(source), rel).toBe(false);
    }
  });

  // S63: the store's ONLY write primitive is a transactional create. `.set(`, `.update(`, and
  // `.delete(` are absent from the module source, so an overwrite path cannot be added quietly.
  it("the baseline store source contains create-only persistence", () => {
    const source = readFileSync(join(ROOT, "lib/firestore/test-set-baseline.ts"), "utf8");
    expect(source.includes("transaction.create(")).toBe(true);
    expect(/transaction\.(set|update|delete)\(/.test(source)).toBe(false);
    expect(/\.doc\([^)]*\)\.(set|update|delete)\(/.test(source)).toBe(false);
    expect(/\b(force|recapture|overwrite)\b/i.test(source)).toBe(false);
  });
});

// AC-S63-3, full form: a REAL captured baseline survives a full refresh cycle byte-identically.
describe("frozen baseline survives a refresh cycle (AC-S63-3)", () => {
  const editor: AuthenticatedUser = {
    uid: "editor-1",
    email: "editor-1@example.com",
    hd: "example.com",
    role: "Editor",
  };
  const facts: TestSetBaselineRentvineFacts = {
    leaseId: "fixture-lease-a",
    leaseEnd: "2030-01-31",
    currentRent: 0,
    tenantCount: 5,
    addressLabel: "fixture address",
    portfolioId: null,
  };
  const sheetRow = { current_rent: "$1,000.00", market_value: "$1,100.00" };

  function fakeReader(): liveLeaseCache.LeaseExportReader {
    return {
      listAllLeasesExport: async () => ({
        rows: [
          {
            lease: { leaseID: "fixture-lease-a", endDate: "2030-01-31" },
            unit: { rent: 0 },
          },
        ],
        pages: 1,
        complete: true,
      }),
    };
  }

  it("capture, refresh cycle, hash identical; a second capture refuses", async () => {
    const db = new FakeFirestore();
    const captured = await captureTestSetBaseline(
      editor,
      {
        leaseId: "fixture-lease-a",
        sheetRowNumber: 101,
        rentvineFacts: facts,
        sheetRow,
      },
      db as unknown as Firestore,
    );

    // A FULL refresh cycle over the live cache: snapshot, invalidate, snapshot again.
    liveLeaseCache.clearLiveLeaseCache();
    await liveLeaseCache.getLiveLeaseSnapshot(fakeReader(), Date.now());
    liveLeaseCache.invalidateLiveLeaseCache();
    await liveLeaseCache.getLiveLeaseSnapshot(fakeReader(), Date.now());
    liveLeaseCache.clearLiveLeaseCache();

    const after = await getTestSetBaseline(
      editor,
      "fixture-lease-a",
      db as unknown as Firestore,
    );
    expect(after).not.toBeNull();
    // The hash is identical before and after the refresh cycle — the baseline did not move.
    expect(after?.hash).toBe(captured.hash);
    expect(verifyTestSetBaselineHash(after!)).toBe(true);

    // And capturing again is an ERROR, not an overwrite.
    await expect(
      captureTestSetBaseline(
        editor,
        {
          leaseId: "fixture-lease-a",
          sheetRowNumber: 101,
          rentvineFacts: { ...facts, currentRent: 999 },
          sheetRow,
        },
        db as unknown as Firestore,
      ),
    ).rejects.toThrow(/already exists/i);
    const unchanged = await getTestSetBaseline(
      editor,
      "fixture-lease-a",
      db as unknown as Firestore,
    );
    expect(unchanged?.rentvineFacts.currentRent).toBe(0);
    expect(unchanged?.hash).toBe(captured.hash);
  });

  it("detects post-capture tampering through the hash", async () => {
    const db = new FakeFirestore();
    const captured = await captureTestSetBaseline(
      editor,
      {
        leaseId: "fixture-lease-b",
        sheetRowNumber: 102,
        rentvineFacts: { ...facts, leaseId: "fixture-lease-b" },
        sheetRow,
      },
      db as unknown as Firestore,
    );
    expect(verifyTestSetBaselineHash(captured)).toBe(true);
    // A tampered copy (simulating an out-of-band mutation) fails hash verification.
    expect(
      verifyTestSetBaselineHash({
        ...captured,
        sheetRow: { ...captured.sheetRow, market_value: "$9,999.00" },
      }),
    ).toBe(false);
  });
});
