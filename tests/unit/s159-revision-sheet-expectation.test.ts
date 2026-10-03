import { describe, expect, it } from "vitest";

import { assertRevisionSheetWritebackForRole as assertForRole } from "@/lib/production-assurance/revision-configuration";
import { gatherLocalEvidence } from "@/scripts/meeting-walkthrough-preflight";

// S159 (R-S159-11, BEH-S159-11): the assurance readback compares the exact revision's
// operating-Sheet switch with the reviewed value for that revision's release role. The candidate
// and the promoted revision carry the reviewed value; the predecessor and its recovery target keep
// the captured predecessor's actual value.

const FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";

function v2Revision(...values: (string | undefined)[]) {
  return {
    containers: values.map((value) => ({
      env: value === undefined ? [] : [{ name: FLAG, value }],
    })),
  };
}

describe("S159 BEH-S159-11: revision switch readback by release role", () => {
  it.each(["candidate", "promoted"] as const)(
    "accepts a %s revision that carries the reviewed value true",
    (role) => {
      expect(assertForRole(v2Revision("true"), role)).toBe("true");
    },
  );

  it.each(["candidate", "promoted"] as const)(
    "refuses a %s revision whose value differs from the reviewed one",
    (role) => {
      for (const revision of [
        v2Revision("false"),
        v2Revision(undefined),
        v2Revision("TRUE"),
        v2Revision(" true "),
      ])
        expect(() => assertForRole(revision, role)).toThrow(
          /revision_writeback_expectation_mismatch/,
        );
    },
  );

  it.each(["predecessor", "recovery_target"] as const)(
    "holds a %s revision to the captured predecessor's actual value, false or true",
    (role) => {
      expect(
        assertForRole(v2Revision("false"), role, { predecessorActual: "false" }),
      ).toBe("false");
      expect(assertForRole(v2Revision("true"), role, { predecessorActual: "true" })).toBe(
        "true",
      );
      expect(() =>
        assertForRole(v2Revision("true"), role, { predecessorActual: "false" }),
      ).toThrow(/revision_writeback_expectation_mismatch/);
      expect(() =>
        assertForRole(v2Revision("false"), role, { predecessorActual: "true" }),
      ).toThrow(/revision_writeback_expectation_mismatch/);
    },
  );

  it.each(["predecessor", "recovery_target"] as const)(
    "refuses a %s check when the captured predecessor value is missing",
    (role) => {
      for (const missing of [undefined, null, "", "on"])
        expect(() =>
          assertForRole(v2Revision("false"), role, { predecessorActual: missing }),
        ).toThrow(/predecessor_sheet_writeback_evidence_required/);
    },
  );

  it("refuses an unreadable or ambiguous revision for every role", () => {
    expect(() => assertForRole({}, "candidate")).toThrow(
      /revision_writeback_flag_unreadable/,
    );
    expect(() => assertForRole(v2Revision("true", "false"), "promoted")).toThrow(
      /revision_writeback_flag_ambiguous/,
    );
  });
});

describe("S159 BEH-S159-11: the meeting preflight reads the reviewed switch value", () => {
  const evidence = (value: string | undefined) =>
    gatherLocalEvidence({
      readGitHead: () => "abcdef0123456789",
      env: value === undefined ? {} : { [FLAG]: value },
      nowIso: () => "2026-10-02T15:00:00.000Z",
    }).sheet_writeback_pause;

  it("verifies the switch only at the reviewed value", () => {
    expect(evidence("true")?.state).toBe("verified");
    expect(evidence("true")?.evidence).toMatch(/matches the reviewed release value true/);
  });

  it.each(["false", undefined, "TRUE", "1"])(
    "reports the switch as failed when it reads %s",
    (value) => {
      expect(evidence(value)?.state).toBe("failed");
      expect(evidence(value)?.evidence).toMatch(/reviewed release value is true/);
    },
  );
});
