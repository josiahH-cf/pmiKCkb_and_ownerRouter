import { describe, expect, it } from "vitest";

import { evaluateGoldenScenarios, type GoldenScenario } from "@/lib/lease-renewal/golden/harness";
import {
  SEVERITIES,
  applyDecisions,
  buildWorksheet,
  summarizeDecisions,
  type CapturedDraft,
  type GoldenWorksheet,
} from "@/lib/lease-renewal/golden/labeling";
import { GOLDEN_SCENARIOS } from "@/lib/lease-renewal/golden/scenarios";

// The golden-data labeling round-trip (R3 math half). Built on the committable synthetic sample — NO real
// client data. Proves: a worksheet exposes every candidate flag with context; an incomplete review CANNOT
// produce verified labels (anti-slop); and accept/reject/severity decisions round-trip into a verified set
// the harness gate enforces — including making a rejection a failing gate that drives the math tuning.

const sample = GOLDEN_SCENARIOS.find((scenario) => scenario.name === "comprehensive-sample");
if (!sample) throw new Error("comprehensive-sample golden scenario missing");

function makeDraft(): CapturedDraft {
  return {
    name: "synthetic-draft",
    category: "wrong",
    description: "synthetic fixture",
    labelsVerified: false,
    input: sample!.input as unknown as CapturedDraft["input"],
    expectedFlags: [...sample!.expectedFlags],
  };
}

/** A fully-reviewed copy: every decision "accept", every field meaning confirmed, reviewed:true. */
function fullyReviewed(worksheet: GoldenWorksheet): GoldenWorksheet {
  const copy = structuredClone(worksheet);
  copy.reviewed = true;
  copy.entries.forEach((entry) => (entry.decision = "accept"));
  copy.fieldsUnderReview.forEach((field) => (field.meaningConfirmed = true));
  return copy;
}

function asScenario(verified: ReturnType<typeof applyDecisions>): GoldenScenario {
  return {
    name: verified.name,
    category: verified.category,
    description: verified.description,
    input: verified.input as unknown as GoldenScenario["input"],
    expectedFlags: verified.expectedFlags,
  };
}

describe("golden-data labeling round-trip", () => {
  it("builds one worksheet entry per candidate flag, each with reviewable context", () => {
    const worksheet = buildWorksheet(makeDraft());

    expect(worksheet.reviewed).toBe(false);
    expect(worksheet.entries.length).toBe(sample!.expectedFlags.length);
    for (const entry of worksheet.entries) {
      expect(entry.decision).toBe("PENDING");
      expect(entry.key).toBe(`${entry.tab}#${entry.sourceRowIndex}#${entry.fieldKey}`);
      expect(entry.candidates.length).toBeGreaterThanOrEqual(1);
    }
    expect(worksheet.fieldsUnderReview.length).toBeGreaterThanOrEqual(1);
    const flagsAcrossFields = worksheet.fieldsUnderReview.reduce(
      (sum, field) => sum + field.candidateFlagCount,
      0,
    );
    expect(flagsAcrossFields).toBe(worksheet.entries.length);
    expect(worksheet.instructions).toContain("reject");
  });

  it("refuses to apply an unreviewed worksheet", () => {
    const draft = makeDraft();
    expect(() => applyDecisions(draft, buildWorksheet(draft))).toThrow(/not reviewed/);
  });

  it("refuses to apply while any decision is still PENDING", () => {
    const draft = makeDraft();
    const worksheet = fullyReviewed(buildWorksheet(draft));
    worksheet.entries[0].decision = "PENDING";
    expect(() => applyDecisions(draft, worksheet)).toThrow(/PENDING/);
  });

  it("refuses to apply while any field meaning is unconfirmed", () => {
    const draft = makeDraft();
    const worksheet = fullyReviewed(buildWorksheet(draft));
    worksheet.fieldsUnderReview[0].meaningConfirmed = false;
    expect(() => applyDecisions(draft, worksheet)).toThrow(/unconfirmed/);
  });

  it("accept-all round-trips into a verified set the harness accepts with zero false positives", () => {
    const draft = makeDraft();
    const verified = applyDecisions(draft, fullyReviewed(buildWorksheet(draft)));

    expect(verified.labelsVerified).toBe(true);
    expect(verified.expectedFlags.length).toBe(draft.expectedFlags.length);

    const result = evaluateGoldenScenarios([asScenario(verified)]);
    expect(result.falsePositiveRate).toBe(0);
    expect(result.diffs.filter((diff) => diff.kind === "false_negative")).toEqual([]);
    expect(result.diffs.filter((diff) => diff.kind === "severity_mismatch")).toEqual([]);
  });

  it("a rejection drops the flag and becomes a failing gate; a severity edit is recorded", () => {
    const draft = makeDraft();
    const worksheet = fullyReviewed(buildWorksheet(draft));

    // Reject entry 0; correct entry 1 to a severity different from its candidate.
    worksheet.entries[0].decision = "reject";
    const corrected = SEVERITIES.find((sev) => sev !== worksheet.entries[1].candidateSeverity);
    if (!corrected) throw new Error("no alternative severity");
    worksheet.entries[1].decision = corrected;

    const summary = summarizeDecisions(worksheet);
    expect(summary.rejected).toBe(1);
    expect(summary.severityCorrections).toBe(1);

    const verified = applyDecisions(draft, worksheet);
    expect(verified.expectedFlags.length).toBe(worksheet.entries.length - 1);
    const correctedFlag = verified.expectedFlags.find(
      (flag) =>
        flag.tab === worksheet.entries[1].tab &&
        flag.sourceRowIndex === worksheet.entries[1].sourceRowIndex &&
        flag.fieldKey === worksheet.entries[1].fieldKey,
    );
    expect(correctedFlag?.severity).toBe(corrected);

    // The rejected candidate is still raised by the pipeline → a false positive the math must fix; the
    // severity edit shows up as a mismatch. This is the gate that drives the tuning loop.
    const result = evaluateGoldenScenarios([asScenario(verified)]);
    expect(result.falsePositives).toBe(1);
    expect(result.severityMismatches).toBe(1);
  });

  it("refuses a worksheet whose name does not match the draft", () => {
    const draft = makeDraft();
    const worksheet = fullyReviewed(buildWorksheet(draft));
    worksheet.capturedName = "some-other-draft";
    expect(() => applyDecisions(draft, worksheet)).toThrow(/matching pair/);
  });

  it("refuses a worksheet whose entries no longer match the draft's pipeline flags", () => {
    const draft = makeDraft();
    const worksheet = fullyReviewed(buildWorksheet(draft));
    worksheet.entries.pop();
    expect(() => applyDecisions(draft, worksheet)).toThrow(/do not match/);
  });
});
