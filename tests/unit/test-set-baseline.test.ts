// S63 frozen baseline store (AC-S63-2): capture-once semantics, the hash over both frozen
// sources, role gates, and round-tripping. Immutability across a refresh cycle is proven in
// `testset-baseline-immutability-boundary.test.ts` (AC-S63-3).

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  captureTestSetBaseline,
  getTestSetBaseline,
  testSetBaselineMatchesInput,
  testSetBaselineHash,
  TEST_SET_BASELINE_COLLECTION,
  type TestSetBaselineRentvineFacts,
} from "@/lib/firestore/test-set-baseline";
import { FakeFirestore } from "../helpers/fake-firestore";

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor-1@example.com",
  hd: "example.com",
  role: "Editor",
};
const facts: TestSetBaselineRentvineFacts = {
  leaseId: "fixture-lease-a",
  leaseEnd: "2030-01-31",
  currentRent: 1234,
  tenantCount: 1,
  addressLabel: "fixture address",
  portfolioId: "9",
};
const sheetRow = { current_rent: "$1,234.00", market_value: "$1,300.00" };

function fs(db: FakeFirestore): Firestore {
  return db as unknown as Firestore;
}

describe("captureTestSetBaseline (AC-S63-2)", () => {
  it("captures the RentVine facts, the Sheet row, and a hash over both", async () => {
    const db = new FakeFirestore();
    const baseline = await captureTestSetBaseline(
      editor,
      {
        leaseId: "fixture-lease-a",
        sheetRowNumber: 101,
        rentvineFacts: facts,
        sheetRow,
      },
      fs(db),
    );
    expect(baseline.hash).toBe(testSetBaselineHash({ rentvineFacts: facts, sheetRow }));
    expect(baseline.hash).toMatch(/^[0-9a-f]{64}$/);

    const stored = db.store.get(`${TEST_SET_BASELINE_COLLECTION}/fixture-lease-a`);
    expect(stored?.lease_id).toBe("fixture-lease-a");
    expect(stored?.sheet_row_number).toBe(101);
    expect(stored?.hash).toBe(baseline.hash);

    const read = await getTestSetBaseline(editor, "fixture-lease-a", fs(db));
    expect(read?.rentvineFacts).toEqual(facts);
    expect(read?.sheetRow).toEqual(sheetRow);
    expect(read?.hash).toBe(baseline.hash);
  });

  it("hashes canonically: key order never changes the hash, values always do", () => {
    const reordered = testSetBaselineHash({
      rentvineFacts: facts,
      sheetRow: { market_value: "$1,300.00", current_rent: "$1,234.00" },
    });
    expect(reordered).toBe(testSetBaselineHash({ rentvineFacts: facts, sheetRow }));
    expect(
      testSetBaselineHash({
        rentvineFacts: facts,
        sheetRow: { ...sheetRow, market_value: "$1,301.00" },
      }),
    ).not.toBe(reordered);
  });

  it("reuses only an exact source-equivalent immutable baseline", async () => {
    const db = new FakeFirestore();
    const input = {
      leaseId: "fixture-lease-a",
      sheetRowNumber: 101,
      rentvineFacts: facts,
      sheetRow,
    };
    const baseline = await captureTestSetBaseline(editor, input, fs(db));

    expect(testSetBaselineMatchesInput(baseline, input)).toBe(true);
    expect(
      testSetBaselineMatchesInput(baseline, {
        ...input,
        sheetRow: { ...sheetRow, market_value: "$1,301.00" },
      }),
    ).toBe(false);
    expect(
      testSetBaselineMatchesInput(baseline, {
        ...input,
        rentvineFacts: { ...facts, currentRent: 1235 },
      }),
    ).toBe(false);
  });

  it("requires a lease id and a positive Sheet row number", async () => {
    const db = new FakeFirestore();
    await expect(
      captureTestSetBaseline(
        editor,
        { leaseId: "  ", sheetRowNumber: 101, rentvineFacts: facts, sheetRow },
        fs(db),
      ),
    ).rejects.toThrow(EditableLayerError);
    await expect(
      captureTestSetBaseline(
        editor,
        {
          leaseId: "fixture-lease-a",
          sheetRowNumber: 0,
          rentvineFacts: facts,
          sheetRow,
        },
        fs(db),
      ),
    ).rejects.toThrow(EditableLayerError);
  });

  it("returns null for a lease with no captured baseline", async () => {
    const db = new FakeFirestore();
    expect(await getTestSetBaseline(editor, "fixture-lease-missing", fs(db))).toBeNull();
  });
});
