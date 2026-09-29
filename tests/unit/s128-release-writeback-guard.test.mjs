import { describe, expect, it } from "vitest";

import {
  SHEET_WRITEBACK_FLAG,
  buildPausedRollbackRedeployPlan,
  parseRevisionWritebackFlag,
  revisionPausesSheetWriteback,
} from "../../scripts/release-candidate.mjs";

// S128 (F08): the pure rollback-safety builders. A rollback must never restore a revision that would
// still dispatch operating-Sheet writes; these functions read the flag and build the paused redeploy.

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

  it("treats a trimmed true as writing (matching the runtime), requires an explicit false pause", () => {
    // The runtime enables writes on the trimmed exact "true", so the guard must too: a " true "
    // revision WOULD write and is therefore not paused (the guard would redeploy it flag-false).
    expect(revisionPausesSheetWriteback(revision("true"))).toBe(false);
    expect(revisionPausesSheetWriteback(revision(" true "))).toBe(false);
    expect(revisionPausesSheetWriteback(revision("false"))).toBe(true);
    expect(revisionPausesSheetWriteback(revision("TRUE"))).toBe(false);
    expect(revisionPausesSheetWriteback(revision(undefined))).toBe(false);
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
