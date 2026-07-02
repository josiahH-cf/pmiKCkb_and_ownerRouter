import { describe, expect, it } from "vitest";

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { MAINTENANCE_STAGES } from "@/lib/maintenance/constants";
import { buildMaintenanceProcessTemplate } from "@/lib/maintenance/process-template";

// Maintenance process template (S4): a valid Draft definition whose RentVine work-order actions stay
// non-executable (gated) — mirrors the lease-renewal template guards.

describe("buildMaintenanceProcessTemplate", () => {
  const template = buildMaintenanceProcessTemplate({
    ownerUid: "owner",
    approverUid: "approver",
  });

  it("builds a schema-valid process-definition input", () => {
    expect(() => CreateProcessDefinitionInputSchema.parse(template)).not.toThrow();
  });

  it("uses the maintenance stage model", () => {
    expect(template.steps.map((step) => step.title)).toEqual([...MAINTENANCE_STAGES]);
  });

  it("references the RentVine work-order actions, none 'Approved for Execution'", () => {
    const refs = template.action_references ?? [];
    const keys = refs.map((ref) => ref.action_registry_key);
    expect(keys).toContain("rentvine.work_order.read");
    expect(keys).toContain("rentvine.work_order.create");
    for (const ref of refs) {
      expect(ref.readiness).not.toBe("Approved for Execution");
    }
  });
});
