import { describe, expect, it } from "vitest";
import {
  classifyField,
  routeSeverity,
  severityForField,
} from "@/lib/lease-renewal/severity";

describe("severity routing (§3.3 first-match-wins)", () => {
  it("routes legal / financial / timing / owner-facing fields to High (rule 1)", () => {
    expect(severityForField("lawn_care").severity).toBe("High"); // Case B
    expect(severityForField("current_rent").severity).toBe("High");
    expect(severityForField("market_value").severity).toBe("High");
    expect(severityForField("renewal_date").severity).toBe("High");
    expect(severityForField("owner_pricing_confirmed").severity).toBe("High");
  });

  it("routes parseable inspection cadence to Medium, but to High when it implicates the $130 owner charge", () => {
    expect(severityForField("inspections_cadence").severity).toBe("Medium"); // Case A
    expect(
      severityForField("inspections_cadence", {}, { implicatesOwnerCharge: true })
        .severity,
    ).toBe("High");
    expect(severityForField("owner_charge_130").severity).toBe("High");
  });

  it("routes any data-quality blocker to Blocked (rule 2)", () => {
    expect(
      severityForField("inspections_cadence", { hasUnparsedCandidate: true }).severity,
    ).toBe("Blocked");
    expect(
      severityForField("inspections_cadence", { noPrecedenceRule: true }).severity,
    ).toBe("Blocked");
    expect(severityForField("address", { joinBelowThreshold: true }).severity).toBe(
      "Blocked",
    );
    expect(
      severityForField("inspections_cadence", { columnUnmapped: true }).severity,
    ).toBe("Blocked");
  });

  it("routes internal-state fields to Medium and cosmetic to Low", () => {
    expect(routeSeverity("operational").severity).toBe("Medium");
    expect(routeSeverity("tenant_intake").severity).toBe("Medium");
    expect(routeSeverity("cosmetic").severity).toBe("Low");
  });

  it("applies rule 1 before rule 2 (a High field with an unparsed candidate stays High)", () => {
    const decision = severityForField("lawn_care", { hasUnparsedCandidate: true });
    expect(decision.severity).toBe("High");
    expect(decision.rule).toBe(1);
  });

  it("routes a field that feeds an external write to High regardless of class", () => {
    const decision = routeSeverity("operational", { feedsExternalWrite: true });
    expect(decision.severity).toBe("High");
    expect(decision.reason).toContain("external write");
  });

  it("classifies unlisted fields as operational by default", () => {
    expect(classifyField("some_unknown_field")).toBe("operational");
  });
});
