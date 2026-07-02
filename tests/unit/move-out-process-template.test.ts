import { describe, expect, it } from "vitest";

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  MOVE_OUT_STEP_TITLES,
  buildMoveOutProcessTemplate,
} from "@/lib/move-out/process-template";

// Move-Out process template (S13 Wave 2 / space-teeth E1b): a valid Draft definition whose eleven
// steps quote docs/products/move-in-move-out-process.md §4, with the Q1 manual "Start move-out"
// trigger, the disposition/finalization steps as ordinary checklist steps (no new blocking
// mechanism), and no executable action reference.

const EXPECTED_TITLES = [
  "Notice / exit trigger",
  "Scheduled vs actual vacate dates",
  "Move-out document set (Dotloop)",
  "Conditional 4265 coordination charge",
  "Move-out inspection",
  "RentVine close-out / reporting changes",
  "Lock change + owner charge",
  "Deposit disposition",
  "Deposit-replacement claim (conditional)",
  "Collections",
  "Final / relisting",
];

describe("buildMoveOutProcessTemplate", () => {
  const template = buildMoveOutProcessTemplate({
    ownerUid: "owner",
    approverUid: "approver",
  });

  it("builds a schema-valid process-definition input", () => {
    expect(() => CreateProcessDefinitionInputSchema.parse(template)).not.toThrow();
  });

  it("encodes the eleven §4 Move-Out steps in order", () => {
    expect(template.steps).toHaveLength(11);
    expect(template.steps.map((step) => step.title)).toEqual(EXPECTED_TITLES);
    expect([...MOVE_OUT_STEP_TITLES]).toEqual(EXPECTED_TITLES);
  });

  it('uses the Q1 manual "Start move-out" trigger (no Renewals handoff in V1)', () => {
    expect(template.trigger).toContain('"Start move-out"');
    expect(template.trigger).toContain("ONLY V1 trigger");
    expect(template.trigger.toLowerCase()).toContain("no automatic renewals");
  });

  it("keeps disposition + finalization as ordinary checklist steps (no new blocking mechanism)", () => {
    const disposition = template.steps.find(
      (step) => step.title === "Deposit disposition",
    );
    const finalStep = template.steps.find((step) => step.title === "Final / relisting");
    expect(disposition?.description).toContain("ordinary checklist step");
    expect(finalStep?.description).toContain("ordinary checklist step");
  });

  it("labels the suggested deduction and keeps the statutory deadline a Needs Verification placeholder", () => {
    const disposition = template.steps.find(
      (step) => step.title === "Deposit disposition",
    );
    expect(disposition?.description).toContain("SUGGESTED deposit deduction");
    expect(disposition?.description).toContain("owner approval required");
    expect(disposition?.description).toContain("Needs Verification:");
  });

  it("carries no action references, so none can be 'Approved for Execution'", () => {
    expect(template.action_references ?? []).toEqual([]);
  });
});
