import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findCustomerIdentifiers,
  FORBIDDEN_MEETING_SHORTCUTS,
  MEETING_PREFLIGHT_CHECKS,
  MEETING_QUESTION,
  parseWalkthroughScript,
  SAFE_MEETING_BRANCHES,
} from "@/lib/lease-renewal/meeting-walkthrough";
import { parseGuideSteps } from "@/scripts/lib/renewal-guide-controls.mjs";

const RUNBOOK_PATH = "docs/products/renewal-meeting-walkthrough-runbook.md";
const RUNBOOK = readFileSync(resolve(process.cwd(), RUNBOOK_PATH), "utf8");
const GUIDE = parseGuideSteps(
  readFileSync(resolve(process.cwd(), "docs/products/renewal-operator-guide.md"), "utf8"),
) as { step: string; control: string; page: string }[];
const GUIDE_BY_STEP = new Map(GUIDE.map((step) => [step.step, step]));

describe("S132 AC-S132-3: side-by-side script names only real controls", () => {
  const script = parseWalkthroughScript(RUNBOOK);

  it("covers the ten walkthrough stages with nine-column rows and cited guide steps", () => {
    expect(script.rows.length).toBeGreaterThanOrEqual(12);
    const controls = script.rows.map((row) => row.control).join(" | ");
    for (const expected of [
      "Filter renewal date",
      "Lease information",
      "Fact to correct",
      "Rent and charges working area",
      "Copy formatted body",
      "Record owner response",
      "Copy plain text",
      "Record tenant response",
      "Reload document readiness and attempts",
      "Preview exact Dotloop packet creation",
      "Record staff completion",
      "Filter status",
    ])
      expect(controls, expected).toContain(expected);
    for (const row of script.rows) {
      expect(row.requiredInput.length).toBeGreaterThan(0);
      expect(row.expectedOutput.length).toBeGreaterThan(0);
      expect(row.evidenceType.length).toBeGreaterThan(0);
      expect(row.safeRecovery.length).toBeGreaterThan(10);
    }
  });

  it("every cited guide step exists and its exact control text appears in the row", () => {
    for (const row of script.rows) {
      for (const ref of row.guideSteps) {
        const guideStep = GUIDE_BY_STEP.get(ref);
        expect(guideStep, `script row ${row.step} cites guide step ${ref}`).toBeDefined();
      }
      // The row names at least one of its cited controls verbatim, so it cannot drift to a button
      // that does not exist. Navigation-only citations (section links) may be cited for scope.
      const named = row.guideSteps.some((ref) =>
        row.controls.includes(GUIDE_BY_STEP.get(ref)!.control),
      );
      expect(
        named,
        `script row ${row.step} names none of its cited controls verbatim`,
      ).toBe(true);
    }
    for (const row of script.rows) {
      expect(
        row.controls.length,
        `script row ${row.step} names no bold control`,
      ).toBeGreaterThan(0);
      for (const control of row.controls)
        expect(
          GUIDE.some((step) => step.control === control),
          `control "${control}" is not in the operator guide`,
        ).toBe(true);
    }
  });

  it("unknown manual steps are visible meeting questions, never invented process", () => {
    expect(script.meetingQuestions.length).toBeGreaterThanOrEqual(3);
    for (const question of script.meetingQuestions) {
      const row = script.rows.find((candidate) => candidate.step === question.step)!;
      expect(row.manualStep.startsWith(MEETING_QUESTION)).toBe(true);
      expect(row.manualStep.length).toBeGreaterThan(MEETING_QUESTION.length + 5);
    }
    const guessy = script.rows.filter(
      (row) =>
        !row.manualStepIsQuestion &&
        /probably|presumably|likely|assume/i.test(row.manualStep),
    );
    expect(guessy).toEqual([]);
  });

  it("permitted effects stay within the four named kinds and live effects need an exact confirmation", () => {
    const exact = script.rows.filter(
      (row) => row.permittedEffect === "exact_confirmed_effect",
    );
    expect(exact).toEqual([]);
    for (const row of script.rows.filter((row) => row.permittedEffect === "unsent_draft"))
      expect(row.safeRecovery).toMatch(/mailbox|not sent/i);
    for (const row of script.rows.filter((row) => row.permittedEffect === "none"))
      expect(row.expectedOutput).not.toMatch(/\b(created|sent|signed|completed)\b/i);
  });

  it("the script's Sheet row keeps F08 preview-only", () => {
    const sheetRow = script.rows.find((row) =>
      row.control.includes("Preview Owner emails update"),
    )!;
    expect(sheetRow.permittedEffect).toBe("none");
    expect(sheetRow.expectedOutput).toMatch(/F08/);
    expect(sheetRow.safeRecovery).toMatch(/preview-only/);
  });
});

describe("S132 runbook honesty", () => {
  it("is marked Draft for validation with no human verdict and no scheduled event", () => {
    expect(RUNBOOK).toMatch(/^Status: Draft for validation\./m);
    expect(RUNBOOK).toMatch(/no step below has a human verdict/);
    expect(RUNBOOK).toMatch(/schedules nothing and sends no invitation/);
    expect(RUNBOOK).not.toMatch(/\bPASS\b/);
    expect(RUNBOOK).not.toMatch(/October 1|2026-10-01/);
  });

  it("carries no customer identifiers and no demo shortcut", () => {
    const body = RUNBOOK.replace(/`[^`]*`/g, "");
    expect(findCustomerIdentifiers(body)).toEqual([]);
    expect(RUNBOOK).not.toMatch(/https?:\/\/[^\s)]*(?:zoom|meet\.google|teams)/i);
    for (const shortcut of FORBIDDEN_MEETING_SHORTCUTS)
      expect(RUNBOOK.toLowerCase()).not.toMatch(
        new RegExp(`(?:required|do|then): ${shortcut}`),
      );
  });

  it("the preflight table names every contract check and the branch table every branch", () => {
    for (const check of MEETING_PREFLIGHT_CHECKS)
      expect(RUNBOOK, check.id).toContain(check.label.replace(/ \(F08\)$/, ""));
    for (const branch of SAFE_MEETING_BRANCHES) {
      const label = branch.id.replace(/_/g, " ");
      expect(RUNBOOK.toLowerCase(), branch.id).toContain(
        label.replace("no policy", "no policy material"),
      );
    }
    expect(RUNBOOK).toMatch(
      /\| Case \| Step \| Actual step \| Expected \| Observed \| Actor \|/,
    );
    expect(RUNBOOK).toMatch(/\| +\| +\| +\| +\| +\| +\| +\| +\| Not run \|/);
  });
});
