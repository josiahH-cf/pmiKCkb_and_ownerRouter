import { describe, expect, it } from "vitest";

import {
  buildLocalV1ManifestReport,
  formatLocalV1ManifestReport,
} from "@/scripts/v1-manifest-report";

describe("bodyless local V1 manifest report", () => {
  it("reports only Pre-V1 local readiness and never release authority", () => {
    const report = buildLocalV1ManifestReport("abcdef0");

    expect(report.bodyless).toBe(true);
    expect(report.releaseAccepted).toBe(false);
    expect(report.state).toBe("pre-v1");
    expect(report.stage).not.toBe("v1");
    expect(report.environment).toBe("local");
    expect(report.actionProofs.required).toBeGreaterThan(0);
    expect(report.actionProofs.accepted).toBe(0);
    expect(report.actionProofs.productionAllowed).toBe(0);
    expect(report.issueCount).toBeGreaterThan(0);
    expect(report.gateCounts.releaseIdentityAndPins).toBeGreaterThan(0);
    expect(Object.values(report.gateCounts).reduce((sum, count) => sum + count, 0)).toBe(
      report.issueCount,
    );
  });

  it("emits counts and gate messages without serializing manifest proof bodies", () => {
    const output = formatLocalV1ManifestReport(
      buildLocalV1ManifestReport("abcdef0"),
      true,
    );

    expect(output).toContain('"releaseAccepted": false');
    expect(output).toContain('"bodyless": true');
    expect(output).not.toContain('"actions":');
    expect(output).not.toContain('"smokeCases":');
    expect(output).not.toContain('"migrations":');
    expect(output).not.toContain('"issues":');
    expect(output).not.toContain('"danBusinessAcceptance":');
    expect(output).not.toContain('"josiahTechnicalAcceptance":');
  });
});
