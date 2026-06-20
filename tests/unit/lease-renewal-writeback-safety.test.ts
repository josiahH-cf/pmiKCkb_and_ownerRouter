import { describe, expect, it } from "vitest";
import {
  buildWriteTarget,
  executeApprovedWriteBack,
  MockSheet,
  transitionWriteBack,
  type WriteTarget,
} from "@/lib/lease-renewal/writeback";

function target(overrides: Partial<WriteTarget> = {}): WriteTarget {
  return {
    tab_fingerprint: "Renewals",
    tab_name: "Renewals",
    tab_number: 3,
    sheet_row_index: 2,
    row_signature: "unit-1042|Jordan Maple",
    column_anchor: "renewal_completed",
    a1_cell: "G5",
    expected_prior_value: "yes",
    new_value: "Needs Renewed",
    ...overrides,
  };
}

function sheetWithTwoYesRows(failWrites = false): MockSheet {
  return new MockSheet(
    [
      { lease_id: "unit-1041", tenant_name: "Casey Rivers", renewal_completed: "yes" },
      { lease_id: "unit-1042", tenant_name: "Jordan Maple", renewal_completed: "yes" },
    ],
    ["lease_id", "tenant_name"],
    failWrites,
  );
}

describe("write-back state machine (§4.2)", () => {
  it("walks the happy path Proposed -> Written", () => {
    let state = transitionWriteBack("Proposed", "submit");
    expect(state).toBe("Awaiting Approval");
    state = transitionWriteBack(state, "approve");
    expect(state).toBe("Approved");
    state = transitionWriteBack(state, "beginWrite");
    state = transitionWriteBack(state, "verify");
    state = transitionWriteBack(state, "confirm");
    expect(state).toBe("Written");
  });

  it("supports Returned for Revision and Blocked branches", () => {
    expect(transitionWriteBack("Awaiting Approval", "return")).toBe("Returned for Revision");
    expect(transitionWriteBack("Verifying", "block")).toBe("Blocked");
  });

  it("throws on an undefined transition", () => {
    expect(() => transitionWriteBack("Written", "approve")).toThrow();
    expect(() => transitionWriteBack("Proposed", "confirm")).toThrow();
  });
});

describe("structural cell map (§4.1)", () => {
  it("refuses credential tabs by construction", () => {
    expect(() => buildWriteTarget(target({ tab_number: 7 }))).toThrow();
    expect(() => buildWriteTarget(target({ tab_number: 4 }))).toThrow();
  });

  it("refuses divider/scaffold prior values", () => {
    expect(() => buildWriteTarget(target({ expected_prior_value: "-----" }))).toThrow();
  });
});

describe("re-anchor + read-after-write (§4.3)", () => {
  it("writes the structurally-anchored row, not another row sharing the low-cardinality value", () => {
    const sheet = sheetWithTwoYesRows();
    const result = executeApprovedWriteBack(sheet, target());

    expect(result.state).toBe("Written");
    // Row 1 (Jordan Maple) was written; row 0 (Casey Rivers, also "yes") is untouched.
    expect(sheet.rows[1].renewal_completed).toBe("Needs Renewed");
    expect(sheet.rows[0].renewal_completed).toBe("yes");
  });

  it("re-anchors correctly after a row shift (insert above)", () => {
    const sheet = sheetWithTwoYesRows();
    sheet.insertRow(0, { lease_id: "unit-1000", tenant_name: "New Row", renewal_completed: "no" });
    // Jordan Maple is now at index 2, but the signature still re-resolves it.
    const result = executeApprovedWriteBack(sheet, target());

    expect(result.state).toBe("Written");
    expect(sheet.rows[2].renewal_completed).toBe("Needs Renewed");
  });

  it("Blocks when the row no longer resolves (changed since approval)", () => {
    const sheet = sheetWithTwoYesRows();
    sheet.rows[1].tenant_name = "Different Person"; // signature no longer matches
    const result = executeApprovedWriteBack(sheet, target());

    expect(result.state).toBe("Blocked");
    expect(result.reason).toContain("row changed since approval");
    expect(result.attempted).toEqual({ a1_cell: "G5", new_value: "Needs Renewed" });
  });

  it("Blocks on a compare-and-set prior-value mismatch", () => {
    const sheet = sheetWithTwoYesRows();
    sheet.rows[1].renewal_completed = "no"; // prior value is not the expected "yes"
    const result = executeApprovedWriteBack(sheet, target());

    expect(result.state).toBe("Blocked");
    expect(result.reason).toContain("compare-and-set");
  });

  it("Blocks on a read-after-write mismatch and never blind-retries", () => {
    const sheet = sheetWithTwoYesRows(true); // writes do not persist
    const result = executeApprovedWriteBack(sheet, target());

    expect(result.state).toBe("Blocked");
    expect(result.reason).toContain("read-after-write mismatch");
    expect(sheet.rows[1].renewal_completed).toBe("yes"); // unchanged
  });

  it("Blocks (ambiguous) when two rows share the same signature", () => {
    const sheet = new MockSheet(
      [
        { lease_id: "dup", tenant_name: "Same", renewal_completed: "yes" },
        { lease_id: "dup", tenant_name: "Same", renewal_completed: "yes" },
      ],
      ["lease_id", "tenant_name"],
    );
    const result = executeApprovedWriteBack(sheet, target({ row_signature: "dup|Same" }));
    expect(result.state).toBe("Blocked");
    expect(result.reason).toContain("uniquely");
  });
});
