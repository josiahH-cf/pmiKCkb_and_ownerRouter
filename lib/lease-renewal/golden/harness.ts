// Golden-data harness (R2). Runs the deterministic reconciliation pipeline against LABELED golden
// scenarios and measures accuracy — above all the FALSE-POSITIVE flag rate, the metric the ~397-flag
// live run lacked. Ground truth lives in the scenarios (the complete set of flags that SHOULD fire);
// any flag the pipeline raises that ground truth does not expect is a false positive. Pure + offline:
// runRenewalPipeline is a pure function, so this needs no network, Vertex, or cloud spend — the local
// model is the (free) engine for any LLM-judged checks layered on later.

import {
  runRenewalPipeline,
  type ReconciledFieldOutcome,
  type RenewalRunInput,
} from "@/lib/lease-renewal/pipeline";

/** The four routing severities, derived from the pipeline's own outcome type (no drift). */
export type Severity = ReconciledFieldOutcome["reconciliation"]["severity"];

/** One ground-truth flag: the pipeline SHOULD raise exactly this, at this severity. */
export interface ExpectedFlag {
  tab: string;
  sourceRowIndex: number;
  fieldKey: string;
  severity: Severity;
}

export interface GoldenScenario {
  name: string;
  /** Labeling intent: a clean case (no flags), a genuine conflict, or a tricky edge. */
  category: "correct" | "wrong" | "edge";
  description: string;
  input: RenewalRunInput;
  /** COMPLETE set of flags ground truth expects. Anything else the pipeline raises is a false positive. */
  expectedFlags: readonly ExpectedFlag[];
}

export interface FlagDiff {
  scenario: string;
  kind: "false_positive" | "false_negative" | "severity_mismatch";
  flag: string;
  detail: string;
}

export interface GoldenEvalResult {
  scenarioCount: number;
  expectedFlagCount: number;
  actualFlagCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  severityMismatches: number;
  /** falsePositives / actualFlagCount (0 when nothing was flagged) — the 397-noise metric. */
  falsePositiveRate: number;
  diffs: FlagDiff[];
}

function flagKey(tab: string, sourceRowIndex: number, fieldKey: string): string {
  return `${tab}#${sourceRowIndex}#${fieldKey}`;
}

export function evaluateGoldenScenarios(
  scenarios: readonly GoldenScenario[],
): GoldenEvalResult {
  let expectedFlagCount = 0;
  let actualFlagCount = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let severityMismatches = 0;
  const diffs: FlagDiff[] = [];

  for (const scenario of scenarios) {
    const result = runRenewalPipeline(scenario.input);

    const actual = new Map<string, ReconciledFieldOutcome>();
    for (const flag of result.flags) {
      actual.set(
        flagKey(flag.recordRef.tab, flag.recordRef.sourceRowIndex, flag.fieldKey),
        flag,
      );
    }
    const expected = new Map<string, ExpectedFlag>();
    for (const exp of scenario.expectedFlags) {
      expected.set(flagKey(exp.tab, exp.sourceRowIndex, exp.fieldKey), exp);
    }

    expectedFlagCount += expected.size;
    actualFlagCount += actual.size;

    for (const [key, exp] of expected) {
      const got = actual.get(key);
      if (!got) {
        falseNegatives += 1;
        diffs.push({
          scenario: scenario.name,
          kind: "false_negative",
          flag: key,
          detail: `expected ${exp.severity} flag, none raised`,
        });
        continue;
      }
      truePositives += 1;
      if (got.reconciliation.severity !== exp.severity) {
        severityMismatches += 1;
        diffs.push({
          scenario: scenario.name,
          kind: "severity_mismatch",
          flag: key,
          detail: `expected ${exp.severity}, got ${got.reconciliation.severity}`,
        });
      }
    }

    for (const [key, got] of actual) {
      if (!expected.has(key)) {
        falsePositives += 1;
        diffs.push({
          scenario: scenario.name,
          kind: "false_positive",
          flag: key,
          detail: `unexpected ${got.reconciliation.severity} flag (${got.reconciliation.agreement})`,
        });
      }
    }
  }

  return {
    scenarioCount: scenarios.length,
    expectedFlagCount,
    actualFlagCount,
    truePositives,
    falsePositives,
    falseNegatives,
    severityMismatches,
    falsePositiveRate: actualFlagCount === 0 ? 0 : falsePositives / actualFlagCount,
    diffs,
  };
}
