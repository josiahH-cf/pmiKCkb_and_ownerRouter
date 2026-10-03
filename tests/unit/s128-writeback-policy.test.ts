import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SHEET_WRITEBACK_FLAG,
  isOperatingSheetWritebackPaused,
  isSheetWritebackEnabled,
} from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  assertRevisionSheetWritebackForRole,
  readRevisionWritebackFlag,
} from "@/lib/production-assurance/revision-configuration";

// S128 (F08): the server-owned pause is exactly the inverse of the reviewed write switch. S159: the
// assurance readback holds each exact revision to the switch value reviewed for its release role.

describe("S128 operating-sheet write pause policy", () => {
  const original = process.env[SHEET_WRITEBACK_FLAG];
  beforeEach(() => {
    delete process.env[SHEET_WRITEBACK_FLAG];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[SHEET_WRITEBACK_FLAG];
    else process.env[SHEET_WRITEBACK_FLAG] = original;
  });

  it("is paused unless the switch is the exact string true", () => {
    expect(isOperatingSheetWritebackPaused()).toBe(true);
    process.env[SHEET_WRITEBACK_FLAG] = "false";
    expect(isOperatingSheetWritebackPaused()).toBe(true);
    process.env[SHEET_WRITEBACK_FLAG] = "TRUE";
    expect(isOperatingSheetWritebackPaused()).toBe(true);
    process.env[SHEET_WRITEBACK_FLAG] = "true";
    expect(isOperatingSheetWritebackPaused()).toBe(false);
    expect(isSheetWritebackEnabled()).toBe(true);
  });
});

function v2Revision(...values: (string | undefined)[]) {
  return {
    containers: values.map((value) => ({
      env: value === undefined ? [] : [{ name: SHEET_WRITEBACK_FLAG, value }],
    })),
  };
}

describe("S128 revision writeback readback", () => {
  it("reads the flag from the exact verified revision containers", () => {
    expect(readRevisionWritebackFlag(v2Revision("false"))).toBe("false");
    expect(readRevisionWritebackFlag(v2Revision("true"))).toBe("true");
    expect(readRevisionWritebackFlag(v2Revision(undefined))).toBeNull();
  });

  it("passes a predecessor that actually reads false and returns the value for evidence", () => {
    expect(
      assertRevisionSheetWritebackForRole(v2Revision("false"), "predecessor", {
        predecessorActual: "false",
      }),
    ).toBe("false");
    expect(() =>
      assertRevisionSheetWritebackForRole(v2Revision(undefined), "predecessor", {
        predecessorActual: "false",
      }),
    ).toThrow(/revision_writeback_expectation_mismatch/);
  });

  it("refuses a false-predecessor recovery target that would dispatch writes", () => {
    expect(() =>
      assertRevisionSheetWritebackForRole(v2Revision("true"), "recovery_target", {
        predecessorActual: "false",
      }),
    ).toThrow(/revision_writeback_expectation_mismatch/);
  });

  it("refuses an unreadable or ambiguous revision configuration", () => {
    expect(() => readRevisionWritebackFlag({})).toThrow(
      /revision_writeback_flag_unreadable/,
    );
    expect(() => readRevisionWritebackFlag(v2Revision("true", "false"))).toThrow(
      /revision_writeback_flag_ambiguous/,
    );
  });
});
