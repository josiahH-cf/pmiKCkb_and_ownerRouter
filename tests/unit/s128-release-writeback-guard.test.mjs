import { describe, expect, it } from "vitest";

import {
  SHEET_WRITEBACK_FLAG,
  buildPausedRollbackRedeployPlan,
  parseRevisionWritebackFlag,
  revisionSheetWritebackEquals,
} from "../../scripts/release-candidate.mjs";

// S128 (F08) introduced these pure readers. S159 replaces the blanket "must be false" predicate with
// an exact comparison against the value expected for the revision's release role; the retired
// image-only rollback redeploy stays refused.

function revision(flagValue) {
  const env = [{ name: "APP_COMMIT_SHA", value: "a".repeat(40) }];
  if (flagValue !== undefined) env.push({ name: SHEET_WRITEBACK_FLAG, value: flagValue });
  return { spec: { containers: [{ image: "img@sha256:abc", env }] } };
}

describe("S128 revision write-flag readback", () => {
  it("reads the exact flag value from the revision env", () => {
    expect(parseRevisionWritebackFlag(revision("true"))).toBe("true");
    expect(parseRevisionWritebackFlag(revision("false"))).toBe("false");
  });

  it("returns null when the flag is absent", () => {
    expect(parseRevisionWritebackFlag(revision(undefined))).toBeNull();
    expect(parseRevisionWritebackFlag({})).toBeNull();
    expect(parseRevisionWritebackFlag(null)).toBeNull();
  });

  it("matches only the exact expected value for the revision's release role", () => {
    // A predecessor or recovery target that actually reads false matches false and never true.
    expect(revisionSheetWritebackEquals(revision("false"), "false")).toBe(true);
    expect(revisionSheetWritebackEquals(revision("false"), "true")).toBe(false);
    // A candidate or promoted revision matches the reviewed true and never false.
    expect(revisionSheetWritebackEquals(revision("true"), "true")).toBe(true);
    expect(revisionSheetWritebackEquals(revision("true"), "false")).toBe(false);
    // A non-exact or absent value, or an unstated expectation, is never a match.
    for (const expected of ["true", "false"]) {
      expect(revisionSheetWritebackEquals(revision(" true "), expected)).toBe(false);
      expect(revisionSheetWritebackEquals(revision("TRUE"), expected)).toBe(false);
      expect(revisionSheetWritebackEquals(revision(undefined), expected)).toBe(false);
    }
    expect(revisionSheetWritebackEquals(revision("true"), undefined)).toBe(false);
    expect(revisionSheetWritebackEquals(revision("true"), "TRUE")).toBe(false);
  });
});

describe("S128 paused rollback redeploy plan", () => {
  it("refuses the retired image-only immediate-traffic redeploy", () => {
    expect(() =>
      buildPausedRollbackRedeployPlan({
        project: "pmi-kc-kb-prod",
        region: "us-central1",
        service: "pmi-kc-app",
        image: "img@sha256:abc",
        revisionSuffix: "rabc-0123456789ab",
      }),
    ).toThrow("receipt_bound_prepared_recovery_required");
  });
  it("refuses to build a redeploy that is missing an exact target field", () => {
    for (const omit of ["project", "region", "service", "image", "revisionSuffix"]) {
      const input = {
        project: "pmi-kc-kb-prod",
        region: "us-central1",
        service: "pmi-kc-app",
        image: "img@sha256:abc",
        revisionSuffix: "rabc-0123456789ab",
      };
      delete input[omit];
      expect(() => buildPausedRollbackRedeployPlan(input)).toThrow();
    }
  });
});
