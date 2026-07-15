import { describe, expect, it } from "vitest";

import {
  buildLocalV1ManifestReport,
  formatLocalV1ManifestReport,
} from "@/scripts/v1-manifest-report";

describe("bodyless local V1 application and provider report", () => {
  it("reports application readiness separately from provider activation", () => {
    const report = buildLocalV1ManifestReport("abcdef0");

    expect(report.bodyless).toBe(true);
    expect(report.productionVerdictAssessed).toBe(false);
    expect(report.state).toBe("local-evidence-inventory");
    expect(report.stage).not.toBe("v1");
    expect(report.environment).toBe("local");
    expect(report.applicationWorkflow.required).toBeGreaterThan(0);
    expect(report.applicationWorkflow.covered).toBe(0);
    expect(report.providerActivation.counts.unavailable).toBe(
      report.applicationWorkflow.required,
    );
    expect(report.providerActivation.advisory).toBe(true);
    expect(report.providerActivation.counts.enabled).toBe(0);
    expect(report.advisorySignoffs).toEqual({
      complete: false,
      danBusiness: "pending",
      josiahTechnical: "pending",
      issueCount: 0,
    });
    expect(report.issueCount).toBeGreaterThan(0);
    expect(report.gateCounts.releaseIdentityAndPins).toBeGreaterThan(0);
    expect(Object.values(report.gateCounts).reduce((sum, count) => sum + count, 0)).toBe(
      report.issueCount,
    );
  });

  it("emits counts without serializing action or evidence bodies", () => {
    const output = formatLocalV1ManifestReport(
      buildLocalV1ManifestReport("abcdef0"),
      true,
    );

    expect(output).toContain('"productionVerdictAssessed": false');
    expect(output).toContain('"bodyless": true');
    expect(output).toContain('"applicationWorkflow"');
    expect(output).toContain('"providerActivation"');
    expect(output).toContain('"advisorySignoffs"');
    expect(output).not.toContain('"actions":');
    expect(output).not.toContain('"smokeCases":');
    expect(output).not.toContain('"migrations":');
    expect(output).not.toContain('"issues":');
    expect(output).not.toContain('"danBusinessAcceptance":');
    expect(output).not.toContain('"josiahTechnicalAcceptance":');
  });

  it("labels provider status and signoffs as advisory in human output", () => {
    const output = formatLocalV1ManifestReport(buildLocalV1ManifestReport("abcdef0"));

    expect(output).toContain(
      "Local V1 evidence inventory — deployment verdict intentionally not assessed",
    );
    expect(output).toContain("Advisory provider status");
    expect(output).toContain("Advisory signoffs — Dan: pending; Josiah: pending");
    expect(output).toContain("does not label the application Pre-V1 or V1");
    expect(output).not.toContain("Application accepted: no");
    expect(output).not.toContain("named acceptance");
  });
});
