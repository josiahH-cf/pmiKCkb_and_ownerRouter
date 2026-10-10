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

  it("new process guidance starts with assessment, makes owner contact optional and retains PMI closure", () => {
    const titles = template.steps.map((step) => step.title);
    expect(titles).toContain("Assessment and troubleshooting");
    expect(titles.indexOf("Assessment and troubleshooting")).toBeLessThan(
      titles.indexOf("Vendor coordination"),
    );
    expect(titles).not.toContain("Owner notice");
    const descriptions = template.steps.map((step) => step.description).join(" ");
    expect(descriptions).toContain("Owner contact is optional");
    expect(descriptions).toContain("PMI retains final closure");
    expect(descriptions).not.toContain("Pending future automation");
    expect(template.stop_condition).toContain("Urgent guidance remains available");
  });

  it("references the RentVine work-order actions with their live registry readiness", () => {
    const refs = template.action_references ?? [];
    const keys = refs.map((ref) => ref.action_registry_key);
    expect(keys).toContain("rentvine.work_order.read");
    expect(keys).toContain("rentvine.work_order.create");
    // The S99 activation (2026-09-02) opened these exact keys; the template reference is display
    // metadata only and still grants no execution authority.
    for (const ref of refs) {
      expect(typeof ref.readiness).toBe("string");
      expect(ref.readiness ?? "").not.toBe("");
    }
  });
});
