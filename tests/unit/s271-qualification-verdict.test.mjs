import { describe, expect, it } from "vitest";
import {
  BATCH_INTAKES,
  ENGINEERING_CASES,
  NEGATIVE_CONTROLS,
  NO_OBSERVER,
  REQUIRED_OBSERVATIONS,
  THURSDAY_CASES,
  classifyFridayFinding,
  cumulativePackageVerdict,
  failFirstClaimsHold,
  humanReviewVerdict,
  novemberTenMatrixVerdict,
} from "../browser/one-path-november-10-qualification-verdict.mjs";

const source = "c".repeat(40);
const buildId = "exact-build";
const run = { served_sha: source, harness_sha: source, harness_uncommitted: false };
const rehearsal = {
  servedVersion: source,
  servedCommit: source,
  overlay: false,
  compiled: true,
};
const compiled = { source, buildId };
const baseline = {
  source: "9b3bb69e2694d72c8312c4c8a5e42cb984f895aa",
  results: [
    {
      id: "N10-02",
      check: "Amount approved field in the owner response",
      observed: 0,
      expectation: "fail-first: 0 before S262",
    },
    {
      id: "N10-07",
      check: "Full view toggle",
      observed: 1,
      expectation: "preservation: 1",
    },
  ],
};

function passing(id) {
  const observed = Object.fromEntries(
    REQUIRED_OBSERVATIONS[id].map((key) => [key, true]),
  );
  if (id === "N10-04")
    Object.assign(observed, {
      monthlyTotalCents: 97_800,
      oneTimeTotalCents: 3_500,
      mappingRevision: 1,
    });
  if (id === "N10-07") Object.assign(observed, { checkedOutcomes: 7, fullSections: 5 });
  if (id === "N10-08") observed.rejectedNegativeControls = [...NEGATIVE_CONTROLS];
  if (id === "N10-10") observed.providerEffects = 0;
  return { id, verdict: "Yes", observed };
}

const all = () => ENGINEERING_CASES.map(passing);
const verdict = (overrides = {}) =>
  novemberTenMatrixVerdict({
    run,
    rehearsal,
    compiled,
    results: all(),
    networkRefusals: [],
    baseline,
    ...overrides,
  });

describe("AC-S271-1 versioned matrix and falsifications", () => {
  it("accepts a complete exact cumulative matrix", () => {
    const result = verdict();
    expect(result.verdict).toBe("Yes");
    expect(result.human).toBe("NOT RUN");
    expect(result.exact).toBe(true);
  });

  it("names a required readback for every engineering case and excludes the human N10-06", () => {
    expect(ENGINEERING_CASES).not.toContain("N10-06");
    for (const id of ENGINEERING_CASES)
      expect(REQUIRED_OBSERVATIONS[id].length).toBeGreaterThan(5);
  });

  it("rejects a missing journey", () => {
    expect(verdict({ results: all().filter(({ id }) => id !== "N10-03") }).verdict).toBe(
      "No",
    );
  });

  it("rejects a missing readback owner", () => {
    const results = all();
    delete results[1].observed.amountOnlyCoverage;
    expect(verdict({ results }).verdict).toBe("No");
  });

  it("rejects a stale or mixed build", () => {
    expect(verdict({ compiled: { source: "d".repeat(40), buildId } }).verdict).toBe("No");
    const results = all();
    results[0].buildId = "other-build";
    expect(verdict({ results }).mixedBuild).toBe(true);
    expect(verdict({ results }).verdict).toBe("No");
  });

  it("rejects an overlay or uncommitted harness", () => {
    expect(verdict({ rehearsal: { ...rehearsal, overlay: true } }).verdict).toBe("No");
    expect(verdict({ run: { ...run, harness_uncommitted: true } }).verdict).toBe("No");
  });

  it("rejects a preservation probe relabeled as a new fail-first check", () => {
    const results = all();
    results[1].failFirst = ["Amount approved field in the owner response"];
    expect(verdict({ results }).verdict).toBe("Yes");
    results[5].failFirst = ["Full view toggle"];
    expect(failFirstClaimsHold(results[5], baseline)).toBe(false);
    expect(verdict({ results }).verdict).toBe("No");
  });

  it("rejects an attempted live effect or a refused outbound connection", () => {
    const results = all();
    results[2].observed.attemptedLiveEffects = 1;
    expect(verdict({ results }).verdict).toBe("No");
    expect(verdict({ networkRefusals: [{ host: "gmail.googleapis.com" }] }).verdict).toBe(
      "No",
    );
  });

  it("rejects a provider effect in the packet review", () => {
    const results = all();
    results[8].observed.providerEffects = 1;
    expect(verdict({ results }).verdict).toBe("No");
  });

  it("requires every N09-10-style negative control to be rejected", () => {
    const results = all();
    results[6].observed.rejectedNegativeControls = NEGATIVE_CONTROLS.slice(1);
    expect(verdict({ results }).verdict).toBe("No");
  });

  it("keeps an unverified case unverified rather than passing", () => {
    const results = all();
    results[3] = {
      id: "N10-04",
      verdict: "UNVERIFIED",
      observed: { missing: "mapping" },
    };
    expect(verdict({ results }).verdict).toBe("UNVERIFIED");
  });

  it("scopes the Thursday checkpoint to the five core journeys", () => {
    const thursday = THURSDAY_CASES.map(passing);
    expect(verdict({ results: thursday, scope: "thursday" }).verdict).toBe("Yes");
    expect(verdict({ results: thursday }).verdict).toBe("No");
  });
});

describe("AC-S271-3 human review states", () => {
  it("records NOT RUN without an observer", () => {
    expect(humanReviewVerdict(null)).toEqual({ verdict: NO_OBSERVER, valid: true });
    expect(humanReviewVerdict({ verdict: NO_OBSERVER }).verdict).toBe(NO_OBSERVER);
  });

  it("rejects an inferred pass with no observer", () => {
    expect(humanReviewVerdict({ verdict: "Yes" }).valid).toBe(false);
  });

  it("rejects a model observer, an unbound build and an assumed delivery", () => {
    const record = {
      observer: { role: "Renewal lead", kind: "model" },
      build: "other",
      scenarios: [{ caseType: "ordinary", result: "Yes" }],
      deliveryAssumed: true,
    };
    const result = humanReviewVerdict(record, { build: buildId });
    expect(result.verdict).toBe("INVALID");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "observer is not a person",
        "review is not bound to the reviewed build",
        "delivery cannot be inferred from a review",
      ]),
    );
  });

  it("records a failure with its issue and leaves an unobserved device unclaimed", () => {
    const record = {
      observer: { role: "Renewal lead", kind: "human" },
      build: buildId,
      scenarios: [
        { caseType: "ordinary", result: "Yes" },
        {
          caseType: "owner amount change",
          result: "No",
          issue: "Amount approved hidden",
        },
        { caseType: "pending resource", result: "Not observed" },
      ],
    };
    expect(humanReviewVerdict(record, { build: buildId })).toMatchObject({
      verdict: "No",
      valid: true,
    });
    const device = {
      ...record,
      scenarios: [{ caseType: "ordinary", result: "Yes", device: "phone" }],
    };
    expect(humanReviewVerdict(device, { build: buildId }).verdict).toBe("INVALID");
  });
});

describe("AC-S271-7 cumulative admission package", () => {
  const ready = {
    intakes: [...BATCH_INTAKES],
    scope: "cumulative",
    qualifiedSource: source,
    ciSource: source,
    ciConclusion: "success",
    buildSource: source,
    unresolvedOperations: [],
    engineeringVerdict: "Yes",
  };

  it("admits the complete qualified package", () => {
    expect(cumulativePackageVerdict(ready)).toEqual({ admissible: true, problems: [] });
  });

  it.each([
    [{ intakes: BATCH_INTAKES.slice(0, 10) }, "missing intakes 149"],
    [{ scope: "thursday" }, "a core-only checkpoint cannot be admitted"],
    [{ ciSource: "e".repeat(40) }, "exact-main CI is stale or not green"],
    [{ buildSource: "f".repeat(40) }, "mixed build"],
    [{ unresolvedOperations: ["send-1"] }, "an operation is unresolved"],
  ])("refuses %o", (defect, problem) => {
    const result = cumulativePackageVerdict({ ...ready, ...defect });
    expect(result.admissible).toBe(false);
    expect(result.problems).toContain(problem);
  });
});

describe("AC-S271-8 Friday triage", () => {
  const base = {
    case: "synthetic ordinary lease",
    expected: "Amount approved visible",
    observed: "hidden behind evidence",
    affectedAction: "tenant offer review",
    nextOwner: "engineering",
    build: buildId,
  };

  it("classifies the four finding kinds separately", () => {
    expect(
      classifyFridayFinding({
        ...base,
        kind: "in-scope-defect",
        reproduction: "steps",
        owningCheck: "N10-02",
      }).disposition,
    ).toBe("verify-on-build");
    expect(
      classifyFridayFinding({
        ...base,
        kind: "source-answer",
        source: "approved mapping",
        authority: "renewal lead",
        destination: "Admin offer charge mappings",
      }).disposition,
    ).toBe("route-to-owner");
    expect(
      classifyFridayFinding({
        ...base,
        kind: "unverified-suggestion",
        owner: "team",
        evidenceNeeded: "fee policy",
      }).disposition,
    ).toBe("hold");
    expect(
      classifyFridayFinding({
        ...base,
        kind: "scope-change",
        decider: "owner",
        affectedPath: "messaging",
      }).disposition,
    ).toBe("hold");
  });

  it("refuses an unattributed source answer and a cross-build replacement", () => {
    expect(
      classifyFridayFinding({
        ...base,
        kind: "source-answer",
        source: "x",
        destination: "y",
      }).problems,
    ).toContain("a source answer needs attributable authority");
    const replacement = classifyFridayFinding(
      {
        ...base,
        kind: "in-scope-defect",
        reproduction: "steps",
        owningCheck: "N10-02",
        replaces: "thursday-N10-02",
      },
      { earlierEvidence: [{ id: "thursday-N10-02", build: "thursday-build" }] },
    );
    expect(replacement.problems).toContain(
      "a different build cannot replace earlier evidence",
    );
  });
});
