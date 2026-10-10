import { describe, it, expect } from "vitest";
import {
  projectMaintenanceUrgency,
  selectOperatingPolicy,
  OperatingPolicyInputSchema,
  type OperatingPolicyVersion,
} from "@/lib/maintenance/operating-policy";
import { inferPriority } from "@/lib/maintenance/work-order-draft";
import { projectIntakeTriage } from "@/lib/maintenance/intake-triage";
const at = "2026-10-10T01:00:00.000Z";
const policy = (
  version: number,
  extra: Partial<Extract<OperatingPolicyVersion, { purpose: "emergency" }>> = {},
): Extract<OperatingPolicyVersion, { purpose: "emergency" }> => ({
  id: "emergency_property_901",
  version,
  purpose: "emergency",
  scope: { kind: "property", propertyId: "901" },
  state: "approved",
  title: "Reviewed fixture policy",
  effectiveFrom: "2026-10-01T00:00:00.000Z",
  expiresAt: null,
  sourceRefs: ["fixture approved document"],
  rules: [],
  guidance: {
    emergency_fire: "Fixture approved life safety wording",
    urgent_flooding: "Fixture approved water wording",
    normal: null,
    urgent_property: null,
  },
  contacts: [],
  recordedAt: at,
  recordedBy: "fixture-admin",
  reason: "Fixture policy review",
  ...extra,
});
describe("shared approved maintenance policy", () => {
  it("keeps one urgency for staff/public and incidental words cannot become gas", () => {
    for (const text of ["smell gas", "burst pipe", "dishwasher gasket", "no heat"]) {
      const decision = projectMaintenanceUrgency({ summary: text }, null);
      expect(inferPriority(text)).toBe(decision.priority);
      expect(projectIntakeTriage({ summary: text }).urgency).toBe(decision.urgency);
    }
    expect(
      projectMaintenanceUrgency({ summary: "dishwasher gasket" }, null).urgency,
    ).toBe("normal");
  });
  it("preserves immediate fallback despite missing policy, photos and cost", () => {
    const x = projectMaintenanceUrgency({ summary: "smell gas" }, null);
    expect(x.guidance).toContain("Call 911");
    expect(x.routing.state).toBe("unavailable");
    expect(
      projectIntakeTriage({
        summary: "smell gas",
        issueType: "Plumbing",
        hasPhotos: false,
      }).acknowledgement,
    ).toBe(x.guidance);
  });
  it("selects applicable approved property over organization and rejects ambiguity", () => {
    const org = policy(1, {
      id: "emergency_organization",
      scope: { kind: "organization" },
    });
    expect(
      selectOperatingPolicy([org, policy(2)], "emergency", "901", at).policy?.version,
    ).toBe(2);
    expect(
      selectOperatingPolicy([policy(1), policy(2)], "emergency", "901", at).state,
    ).toBe("conflicting");
    for (const extra of [
      { state: "draft" },
      { state: "revoked" },
      { effectiveFrom: "2027-01-01T00:00:00.000Z" },
      { expiresAt: "2026-10-09T00:00:00.000Z" },
    ] as const)
      expect(
        selectOperatingPolicy([policy(2, extra)], "emergency", "901", at).policy,
      ).toBeNull();
  });
  it("a replacement cannot downgrade baseline or invent a contact", () => {
    const p = policy(2);
    const d = projectMaintenanceUrgency(
      { summary: "gas", suggestedUrgency: "normal" },
      p as never,
    );
    expect(d.urgency).toBe("emergency_fire");
    expect(d.policyVersion).toBe(2);
    expect(d.guidance).toBe("guidance" in p ? p.guidance.emergency_fire : null);
    expect(d.routing.state).toBe("unavailable");
  });
  it("approved inputs need actual source and channel coverage evidence; chargeback has no intake timing", () => {
    expect(
      OperatingPolicyInputSchema.safeParse({ ...policy(1), sourceRefs: [] }).success,
    ).toBe(false);
    expect(
      OperatingPolicyInputSchema.safeParse({
        purpose: "chargeback",
        scope: { kind: "organization" },
        state: "approved",
        title: "fixture",
        effectiveFrom: at,
        expiresAt: null,
        sourceRefs: ["fixture source"],
        wording: "fixture approved wording",
        timing: "intake",
        reviewConditions: ["assessment"],
        contacts: [],
      }).success,
    ).toBe(false);
  });
});
