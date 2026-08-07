// S63 report builder (AC-S63-8, AC-S63-13) and the evidence/report output-path boundary
// (AC-S63-11). Fixture data only — no client value appears here; committed identifiers (lease
// ids, Sheet rows, end dates, counts, hashes) are deliberately in scope.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { TestSetEvidenceEntry } from "@/lib/firestore/test-set-evidence";
import {
  buildTestSetReport,
  TEST_SET_OPEN_SEND_KEYS,
  type TestSetReportLease,
} from "@/lib/lease-renewal/test-set-report";
import { evaluateTestSetVerdict } from "@/lib/lease-renewal/test-set-verdict";

function entry(
  kind: TestSetEvidenceEntry["kind"],
  recordedAt: string,
  note: string,
): TestSetEvidenceEntry {
  return {
    id: recordedAt,
    leaseId: "297",
    kind,
    note,
    payload: {},
    recordedAt,
    recordedByUid: "editor-1",
  };
}

function fixtureLease(overrides: Partial<TestSetReportLease>): TestSetReportLease {
  return {
    leaseId: "278",
    sheetRowNumber: 507,
    endDateIso: "2026-09-30",
    baseline: {
      captured: true,
      hash: "a".repeat(64),
      capturedAt: "2026-08-06T00:00:00Z",
    },
    evidence: [],
    verdict: evaluateTestSetVerdict({
      reachability: {
        appearedOnDesk: true,
        endDateMatchesBaseline: true,
        dispositionCorrect: true,
      },
      factAccuracy: {
        knownDiscrepancyFields: [],
        raisedDiscrepancyFields: [],
        factsMatchOrRaised: true,
      },
      numberAgreement: {
        providerEstimate: null,
        providerMissingReason: "RentCast account inactive (Q-RENTCAST-ACCOUNT-403)",
        sheetMarketValue: 1300,
      },
      communicationCorrectness: {
        ownerDraftRecipientsCorrect: true,
        tenantDraftRecipientsCorrect: true,
        channelsSeparated: true,
        numbersAttributed: true,
      },
    }),
    comparisonMode: null,
    ...overrides,
  };
}

function fixtureReport(): string {
  return buildTestSetReport({
    generatedAtIso: "2026-08-06T23:00:00.000Z",
    windowDescription: "Two to four weeks per D08, from the test-set opening.",
    dailyOwner: "Bailey (fallback: Josiah)",
    abortTrigger:
      "Any Sev-1 the runtime suspend cannot contain, or a second Sev-1 with the same cause.",
    leases: [
      fixtureLease({}),
      fixtureLease({
        leaseId: "297",
        sheetRowNumber: 510,
        endDateIso: "2026-10-10",
        comparisonMode: "blind",
        evidence: [
          entry(
            "discrepancy_raised",
            "2026-08-07T10:00:00.000Z",
            "RentVine reads a zero current rent while the Sheet lists a non-zero figure.",
          ),
          entry("human_position", "2026-08-07T11:00:00.000Z", "Team figure recorded."),
        ],
      }),
    ],
    applicationInitiatedClientSends: 0,
  });
}

describe("buildTestSetReport (AC-S63-8, AC-S63-13)", () => {
  it("states the procedural cohort boundary and lists both open send keys out of scope", () => {
    const report = fixtureReport();
    expect(report).toContain("procedural, not enforced by code");
    for (const key of TEST_SET_OPEN_SEND_KEYS) {
      expect(report).toContain(key);
    }
    expect(TEST_SET_OPEN_SEND_KEYS).toEqual([
      "gmail.thread.reply",
      "internal.transactional_notice.send",
    ]);
    expect(report).toContain("Application-initiated client sends during the test: 0");
  });

  it("renders one section per lease with all four criteria and their reasons", () => {
    const report = fixtureReport();
    expect(report).toContain("## Lease 278 (Sheet row 507, ends 2026-09-30)");
    expect(report).toContain("## Lease 297 (Sheet row 510, ends 2026-10-10)");
    for (const title of [
      "1. Reachability and classification",
      "2. Fact accuracy",
      "3. Number agreement",
      "4. Communication correctness",
    ]) {
      expect(report).toContain(title);
    }
    // A not_evaluated criterion renders its status AND its reason, never a bare pass.
    expect(report).toContain("`not_evaluated`");
    expect(report).toContain("Q-RENTCAST-ACCOUNT-403");
  });

  it("is generated from the evidence records (timeline lines come from entries)", () => {
    const report = fixtureReport();
    expect(report).toContain(
      "RentVine reads a zero current rent while the Sheet lists a non-zero figure.",
    );
    expect(report).toContain("Discrepancies raised: 1");
    expect(report).toContain("blind (before the app's output)");
  });

  it("cannot read as an unqualified pass: the limits section is unconditional", () => {
    const report = fixtureReport();
    expect(report).toContain("## Limits of this report");
    expect(report).toContain("Sample size");
    expect(report).toContain("not evaluated:");
    expect(report).toContain("Leases 279 and 280 share one street address");
    expect(report).toContain("Lease 297 carried a source disagreement from day zero");
    expect(report).toContain("No cohort lease is MKD-owned");
    expect(report).toContain("±5%");
    expect(report).toContain("$50");
    // Window, daily owner, abort trigger are carried into the document.
    expect(report).toContain("Daily owner: Bailey (fallback: Josiah)");
    expect(report).toContain("Abort trigger:");
  });
});

describe("evidence and report artifacts live outside git (AC-S63-11)", () => {
  it("temp/ (cohort detail, generated reports) is gitignored", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    const lines = gitignore.split(/\r?\n/).map((line) => line.trim());
    expect(lines).toContain("temp/");
  });

  it("the report generator writes under temp/ by default", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "generate-test-set-report.ts"),
      "utf8",
    );
    expect(source).toContain('"temp/test-set"');
    // The generator refuses to write anywhere outside the gitignored tree.
    expect(source).toContain("outside the gitignored temp/ tree");
  });
});
