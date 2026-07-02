import { describe, expect, it } from "vitest";

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  MOVE_IN_STEP_TITLES,
  buildMoveInProcessTemplate,
} from "@/lib/move-in/process-template";

// Move-In process template (S13 Wave 2 / space-teeth E1a): a valid Draft definition whose ten steps
// quote docs/products/move-in-move-out-process.md §3, with NO hard blocking gate (v1-process-qa
// Move-In Q2 override) and no executable action reference.

const EXPECTED_TITLES = [
  "Intake form / tenant info",
  "Collect onboarding documents & screening",
  "Build the lease document set",
  "Deposit / deposit-replacement posture",
  "E-signature",
  "Certified funds",
  "Inspection setup",
  "Key handoff",
  "Welcome communication",
  "Disable the listing",
];

describe("buildMoveInProcessTemplate", () => {
  const template = buildMoveInProcessTemplate({
    ownerUid: "owner",
    approverUid: "approver",
  });

  it("builds a schema-valid process-definition input", () => {
    expect(() => CreateProcessDefinitionInputSchema.parse(template)).not.toThrow();
  });

  it("encodes the ten §3 Move-In steps in order", () => {
    expect(template.steps).toHaveLength(10);
    expect(template.steps.map((step) => step.title)).toEqual(EXPECTED_TITLES);
    expect([...MOVE_IN_STEP_TITLES]).toEqual(EXPECTED_TITLES);
  });

  it("uses the Q1 manual-start trigger (no auto RentVine detect in V1)", () => {
    expect(template.trigger).toContain("Manual start");
    expect(template.trigger.toLowerCase()).toContain("approved/onboarding");
  });

  it("reframes e-signature and certified funds as tracked flags, NOT hard gates (Q2 override)", () => {
    const eSign = template.steps.find((step) => step.title === "E-signature");
    const funds = template.steps.find((step) => step.title === "Certified funds");
    expect(eSign?.description).toContain("NOT a hard blocking gate");
    expect(funds?.description).toContain("NOT a hard blocking gate");
    // No step description frames itself as a blocking gate.
    for (const step of template.steps) {
      expect(step.description ?? "").not.toMatch(/blocks the run|hard gate\b/i);
    }
  });

  it("carries no action references, so none can be 'Approved for Execution'", () => {
    expect(template.action_references ?? []).toEqual([]);
  });
});
