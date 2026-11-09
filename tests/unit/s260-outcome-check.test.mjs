import { describe, expect, it } from "vitest";
import { outcomeFaults } from "../browser/one-path-november-9-outcome-check.mjs";
import { novemberNineMatrixVerdict } from "../browser/one-path-november-9-qualification-verdict.mjs";

const focused = {
  workAreas: 1,
  evidenceAreas: 1,
  looseControls: 0,
  evidenceOpen: false,
  effectsInEvidence: false,
  duplicateEditors: false,
  visibleCue: true,
  competingSend: false,
  inactive: false,
};

describe("N09-10 rendered outcome contract", () => {
  it("accepts distinct work and closed verification with a visible action", () => {
    expect(outcomeFaults(focused)).toEqual([]);
  });
  it.each([
    [{ workAreas: 0, evidenceAreas: 0, looseControls: 23 }, "unconsolidated"],
    [{ looseControls: 6 }, "unconsolidated"],
    [{ duplicateEditors: true }, "duplicate working rent editor"],
    [{ effectsInEvidence: true }, "effectful evidence"],
    [{ visibleCue: false }, "next action or fix is hidden"],
    [{ competingSend: true }, "send competes with reconciliation"],
    [{ evidenceOpen: true }, "evidence initially open"],
  ])("rejects a reachable Full section with %o", (defect, reason) => {
    expect(outcomeFaults({ ...focused, ...defect })).toContain(reason);
  });
});

describe("S260 exact matrix verdict", () => {
  const source = "a".repeat(40);
  const rows = [
    "N09-01",
    "N09-02",
    "N09-03",
    "N09-04",
    "N09-05",
    "N09-06",
    "N09-07",
    "N09-08",
    "N09-09-Editor",
    "N09-09-Approver",
    "N09-09-Admin",
    "N09-10",
  ].map((id) => ({ id, verdict: "Yes", observed: { readback: true } }));
  const input = {
    run: { served_sha: source, harness_sha: source },
    rehearsal: { servedVersion: source, servedCommit: source, compiled: true },
    compiled: { source, buildId: "exact-build" },
    results: rows,
    networkRefusals: [],
    tenantSendProof: false,
  };

  it("records a matrix pass separately from the other gates and human verdict", () => {
    expect(novemberNineMatrixVerdict(input)).toMatchObject({
      source,
      verdict: "Yes",
      completeMatrix: true,
      exact: true,
      human: "NOT RUN",
    });
  });

  it.each([
    { run: { ...input.run, harness_sha: "b".repeat(40) } },
    { compiled: { ...input.compiled, source: "b".repeat(40) } },
    { compiled: { source } },
    { results: rows.slice(1) },
    { results: [...rows.slice(1), rows[1]] },
    { results: [{ ...rows[0], observed: {} }, ...rows.slice(1)] },
    { results: [{ ...rows[0], observed: { missing: "readback" } }, ...rows.slice(1)] },
    { networkRefusals: [{}] },
  ])("refuses a stale, mixed, missing, duplicate or unsupported report %o", (bad) => {
    expect(novemberNineMatrixVerdict({ ...input, ...bad }).verdict).toBe("No");
  });

  it("keeps a complete exact matrix unverified when a required observation is held", () => {
    const results = [{ ...rows[0], verdict: "UNVERIFIED" }, ...rows.slice(1)];
    expect(novemberNineMatrixVerdict({ ...input, results }).verdict).toBe("UNVERIFIED");
  });
});
