// S63 report shape and git boundary. All values are synthetic unit fixtures.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { TestSetEvidenceEntry } from "@/lib/firestore/test-set-evidence";
import {
  buildTestSetReport,
  TEST_SET_OPEN_SEND_KEYS,
  type TestSetReportLease,
} from "@/lib/lease-renewal/test-set-report";
import {
  evaluateTestSetVerdict,
  type TestSetVerdictInput,
} from "@/lib/lease-renewal/test-set-verdict";
import {
  RENEWAL_PROCESS_DEFINITION,
  RENEWAL_PROCESS_VERSION,
} from "@/lib/lease-renewal/renewal-process";

function entry(
  kind: TestSetEvidenceEntry["kind"],
  recordedAt: string,
  note: string,
): TestSetEvidenceEntry {
  return {
    id: recordedAt,
    leaseId: "fixture-lease-b",
    kind,
    note,
    payload: {},
    recordedAt,
    recordedByUid: "fixture-editor",
  };
}

function passingInput(): TestSetVerdictInput {
  return {
    process: {
      processVersion: RENEWAL_PROCESS_VERSION,
      observedStepIds: RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.id),
      observedSubstepIds: RENEWAL_PROCESS_DEFINITION.steps.flatMap((step) =>
        step.substeps.map((substep) => substep.id),
      ),
      branchOrBlockerExplained: true,
      transitionEvidenceExplained: true,
    },
    numberEvidence: {
      knownDiscrepancyFields: [],
      raisedDiscrepancyFields: [],
      sourceFactsMatchOrRaised: true,
      contractualBaseRentVerified: true,
      recurringChargesSeparated: true,
      rentCastRadiusMiles: 2,
      rentCastRequestedCount: 15,
      providerOrderPreserved: true,
      hiddenSelectionApplied: false,
      providerEvidenceAttributed: true,
      humanDecisionRecordedSeparately: true,
      providerSetOfferedRent: false,
    },
    safety: {
      previewWithoutConfirmationObserved: true,
      appDraftCreateCount: 0,
      appClientSendCount: 0,
      rentvineWriteReceiptCount: 0,
      sheetWriteReceiptCount: 0,
      dotloopWriteReceiptCount: 0,
    },
  };
}

function fixtureLease(overrides: Partial<TestSetReportLease> = {}): TestSetReportLease {
  return {
    leaseId: "fixture-lease-a",
    sheetRowNumber: 101,
    endDateIso: "2030-01-31",
    baseline: {
      captured: true,
      hash: "a".repeat(64),
      capturedAt: "2030-01-01T00:00:00.000Z",
    },
    evidence: [],
    verdict: evaluateTestSetVerdict(passingInput()),
    comparisonMode: null,
    ...overrides,
  };
}

function fixtureReport(): string {
  const incompleteInput = passingInput();
  incompleteInput.safety.appDraftCreateCount = null;
  return buildTestSetReport({
    generatedAtIso: "2030-01-05T00:00:00.000Z",
    windowDescription: "Fixture review window.",
    dailyOwner: "Fixture operational owner.",
    abortTrigger: "Fixture abort trigger.",
    leases: [
      fixtureLease(),
      fixtureLease({
        leaseId: "fixture-lease-b",
        sheetRowNumber: 102,
        endDateIso: "2030-02-28",
        comparisonMode: "blind",
        verdict: evaluateTestSetVerdict(incompleteInput),
        evidence: [
          entry(
            "discrepancy_raised",
            "2030-01-02T00:00:00.000Z",
            "Fixture source disagreement was raised.",
          ),
          entry(
            "human_position",
            "2030-01-03T00:00:00.000Z",
            "Fixture human decision was recorded.",
          ),
        ],
      }),
    ],
  });
}

describe("buildTestSetReport", () => {
  it("states the exact runtime boundary and scopes both open send keys out", () => {
    const report = fixtureReport();
    expect(report).toContain("secure runtime input");
    expect(report).toContain("does not create an unsent");
    for (const key of TEST_SET_OPEN_SEND_KEYS) {
      expect(report).toContain(key);
    }
    expect(TEST_SET_OPEN_SEND_KEYS).toEqual([
      "gmail.thread.reply",
      "internal.transactional_notice.send",
    ]);
  });

  it("renders process, number/evidence, and read-only safety outcomes separately", () => {
    const report = fixtureReport();
    expect(report).toContain("## Lease fixture-lease-a (Sheet row 101");
    expect(report).toContain("## Lease fixture-lease-b (Sheet row 102");
    expect(report).toContain("### Process outcome");
    expect(report).toContain("### Number and evidence outcome");
    expect(report).toContain("### Read-only safety outcome");
    expect(report).toContain("`not_evaluated`");
    expect(report).toContain("cannot infer a zero");
  });

  it("generates discrepancy/timeline facts from evidence rather than case-specific source prose", () => {
    const report = fixtureReport();
    expect(report).toContain("Fixture source disagreement was raised.");
    expect(report).toContain("Discrepancies raised: 1");
    expect(report).toContain("blind (before the app evidence)");
    expect(report).not.toMatch(/\bLeases?\s+\d+/);
    expect(report).not.toContain("Application-initiated client sends during the test: 0");
  });

  it("always discloses sample, unevaluated families, exact identity, and S59 policy limits", () => {
    const report = fixtureReport();
    expect(report).toContain("## Limits of this report");
    expect(report).toContain("Sample size");
    expect(report).toContain("not_evaluated:");
    expect(report).toContain("exact lease-id/Sheet-row binding");
    expect(report).toContain("2-mile maximum and 15-request policy");
    expect(report).toContain("Daily owner: Fixture operational owner.");
    expect(report).toContain("Abort trigger: Fixture abort trigger.");
  });
});

describe("evidence and report artifacts stay outside Git", () => {
  it("temp/ is gitignored", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore.split(/\r?\n/).map((line) => line.trim())).toContain("temp/");
  });

  it("uses a temp-only opaque-run output and never prints its path", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "generate-test-set-report.ts"),
      "utf8",
    );
    expect(source).toContain('const REPORT_DEFAULT_DIR = "temp/test-set"');
    expect(source).toContain("report-${runReference}.md");
    expect(source).toContain("formatTestSetReportSummary");
    expect(source).not.toMatch(/console\.log\([^)]*outPath/s);
  });
});
