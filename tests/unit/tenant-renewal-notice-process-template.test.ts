import { describe, expect, it } from "vitest";

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  TENANT_RENEWAL_NOTICE_STEP_TITLES,
  buildTenantRenewalNoticeProcessTemplate,
} from "@/lib/lease-renewal/tenant-renewal-notice/process-template";

// Tenant Renewal Notice template (space-teeth E3b): a valid Draft whose steps wrap the existing
// buildTenantOfferDraft + the new buildDotloopFollowUpDraft; its two Dotloop action references stay
// Needs Permission, none Approved for Execution.

const EXPECTED_TITLES = [
  "Gather facts",
  "Compose tenant offer draft",
  "Compose Dotloop follow-up draft",
  "Human approval / send",
];

describe("buildTenantRenewalNoticeProcessTemplate", () => {
  const template = buildTenantRenewalNoticeProcessTemplate({
    ownerUid: "owner",
    approverUid: "approver",
  });

  it("builds a schema-valid process-definition input", () => {
    expect(() => CreateProcessDefinitionInputSchema.parse(template)).not.toThrow();
  });

  it("encodes the four-step draft sequence", () => {
    expect(template.steps.map((step) => step.title)).toEqual(EXPECTED_TITLES);
    expect([...TENANT_RENEWAL_NOTICE_STEP_TITLES]).toEqual(EXPECTED_TITLES);
  });

  it("references the two EXISTING Dotloop keys, both Needs Permission, none Approved for Execution", () => {
    const refs = template.action_references ?? [];
    const keys = refs.map((ref) => ref.action_registry_key);
    expect(keys).toEqual([
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ]);
    for (const ref of refs) {
      expect(ref.readiness).toBe("Needs Permission");
      expect(ref.readiness).not.toBe("Approved for Execution");
    }
  });

  it("names the composers it wraps in the step descriptions (surface, not execute)", () => {
    const offerStep = template.steps.find(
      (step) => step.title === "Compose tenant offer draft",
    );
    const dotloopStep = template.steps.find(
      (step) => step.title === "Compose Dotloop follow-up draft",
    );
    expect(offerStep?.description).toContain("buildTenantOfferDraft");
    expect(dotloopStep?.description).toContain("buildDotloopFollowUpDraft");
  });
});
