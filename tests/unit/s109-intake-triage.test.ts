import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_INTAKE_URGENCIES,
  MAINTENANCE_REQUIRED_EVIDENCE,
  intakeTriageCopy,
  projectIntakeTriage,
  type IntakeTriageInput,
} from "@/lib/maintenance/intake-triage";
import {
  MAINTENANCE_TROUBLESHOOTING_CATALOG,
  selectTroubleshootingResource,
} from "@/lib/maintenance/troubleshooting-catalog";
import { interpretIntakeFreeText } from "@/lib/maintenance/intake-triage-model";

// S109: triage is deterministic and owns urgency, evidence, expectation, and resource selection. A
// model may only suggest an issue type for free text; it can never downgrade a fire report, select a
// resource, or mark intake complete.

function triage(overrides: Partial<IntakeTriageInput> = {}) {
  return projectIntakeTriage({
    summary: "Kitchen faucet drips",
    description: "",
    issueType: null,
    happeningNow: null,
    damageOrAccess: "",
    attemptedSteps: "",
    hasPhotos: false,
    ...overrides,
  });
}

describe("S109 urgency rules are deterministic (ARCH-S109-1 / BEH-S109-2)", () => {
  it("exposes exactly the specified urgency vocabulary", () => {
    expect([...MAINTENANCE_INTAKE_URGENCIES]).toEqual([
      "emergency_fire",
      "urgent_flooding",
      "normal",
    ]);
  });

  it("routes fire, smoke, gas, and carbon monoxide to the emergency path", () => {
    for (const summary of [
      "There is a FIRE in the kitchen",
      "Smoke coming from the outlet",
      "I smell gas in the hallway",
      "The carbon monoxide alarm is going off",
    ]) {
      expect(triage({ summary }).urgency, summary).toBe("emergency_fire");
    }
  });

  it("routes active water to the urgent path", () => {
    for (const summary of [
      "The basement is flooding",
      "A pipe burst under the sink",
      "The toilet is overflowing",
      "Sewage is backing up into the tub",
    ]) {
      expect(triage({ summary }).urgency, summary).toBe("urgent_flooding");
    }
  });

  it("escalates a leak the resident says is happening now", () => {
    expect(
      triage({ summary: "Leaking under the sink", happeningNow: false }).urgency,
    ).toBe("normal");
    expect(
      triage({ summary: "Leaking under the sink", happeningNow: true }).urgency,
    ).toBe("urgent_flooding");
  });

  it("keeps fire above flooding when both appear", () => {
    expect(triage({ summary: "Smoke and flooding in the basement" }).urgency).toBe(
      "emergency_fire",
    );
  });

  it("leaves an ordinary report normal", () => {
    expect(triage().urgency).toBe("normal");
  });
});

describe("S109 required evidence blocks completion (BEH-S109-1 / AC-S109-2)", () => {
  it("requires photos for the reviewed issue types and reports intake incomplete", () => {
    const result = triage({
      summary: "Water under the kitchen sink",
      issueType: "Plumbing",
    });
    expect(result.requiredEvidence).toEqual(["photos"]);
    expect(result.photosNeeded).toBe(true);
    expect(result.intakeComplete).toBe(false);
    expect(result.evidenceRequest).toMatch(/photo/i);
  });

  it("requires photos whenever the reporter describes damage", () => {
    const result = triage({
      issueType: "Electrical",
      damageOrAccess: "The ceiling is stained and sagging",
    });
    expect(result.requiredEvidence).toEqual(["photos"]);
    expect(result.intakeComplete).toBe(false);
  });

  it("marks intake complete only when nothing is required or the photos exist", () => {
    expect(triage({ issueType: "Electrical" }).intakeComplete).toBe(true);
    expect(triage({ issueType: "Plumbing", hasPhotos: true }).intakeComplete).toBe(true);
  });

  it("keeps the exact evidence table visible and reviewed", () => {
    expect(MAINTENANCE_REQUIRED_EVIDENCE.Plumbing).toEqual(["photos"]);
    expect(MAINTENANCE_REQUIRED_EVIDENCE.Appliance).toEqual(["photos"]);
    expect(MAINTENANCE_REQUIRED_EVIDENCE.Electrical).toEqual([]);
  });
});

describe("S109 copy sets expectations without promising completion (BEH-S109-2)", () => {
  it("tells a fire reporter to call emergency services and still records the report", () => {
    const result = triage({ summary: "Fire in the kitchen" });
    expect(result.acknowledgement).toBe(
      "Call 911 now if anyone is in danger. We have recorded your report.",
    );
    expect(result.recorded).toBe(true);
  });

  it("acknowledges flooding as urgent with immediate guidance", () => {
    const result = triage({ summary: "The basement is flooding" });
    expect(result.acknowledgement).toMatch(/urgent/i);
    expect(result.acknowledgement).toMatch(/shut off the water/i);
  });

  it("acknowledges an ordinary report without promising a completion time", () => {
    const result = triage();
    expect(result.acknowledgement).toMatch(/review/i);
    expect(result.acknowledgement).not.toMatch(
      /within \d|today|tomorrow|guarantee|will be fixed|same day/i,
    );
  });

  it("keeps every approved template free of a completion promise", () => {
    for (const urgency of MAINTENANCE_INTAKE_URGENCIES) {
      expect(intakeTriageCopy(urgency)).not.toMatch(
        /within \d|guarantee|will be fixed|same day/i,
      );
    }
  });
});

describe("S109 troubleshooting resources are reviewed and at most one (BEH-S109-3)", () => {
  it("starts empty until the owner supplies reviewed links", () => {
    expect(MAINTENANCE_TROUBLESHOOTING_CATALOG).toEqual([]);
  });

  it("offers at most one entry, only for a normal issue with exactly one match", () => {
    const catalog = [
      {
        id: "res-1",
        issueType: "Plumbing" as const,
        title: "Find your water shutoff",
        url: "https://example.test/shutoff",
        reviewedOnIso: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "res-2",
        issueType: "Appliance" as const,
        title: "Reset a tripped disposal",
        url: "https://example.test/disposal",
        reviewedOnIso: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "res-3",
        issueType: "Appliance" as const,
        title: "Another appliance guide",
        url: "https://example.test/other",
        reviewedOnIso: "2026-09-01T00:00:00.000Z",
      },
    ];
    expect(selectTroubleshootingResource("Plumbing", "normal", catalog)?.id).toBe(
      "res-1",
    );
    // Two matches is ambiguous, so none is offered.
    expect(selectTroubleshootingResource("Appliance", "normal", catalog)).toBeNull();
    // An unknown issue type receives none.
    expect(selectTroubleshootingResource(null, "normal", catalog)).toBeNull();
    expect(selectTroubleshootingResource("HVAC", "normal", catalog)).toBeNull();
    // Urgency suppresses the offer entirely.
    expect(
      selectTroubleshootingResource("Plumbing", "urgent_flooding", catalog),
    ).toBeNull();
    expect(
      selectTroubleshootingResource("Plumbing", "emergency_fire", catalog),
    ).toBeNull();
  });

  it("refuses an entry that is not an https link reviewed on an exact date", () => {
    for (const bad of [
      { url: "http://example.test/x" },
      { url: "javascript:alert(1)" },
      { reviewedOnIso: "" },
      { title: "" },
    ]) {
      expect(
        selectTroubleshootingResource("Plumbing", "normal", [
          {
            id: "res-1",
            issueType: "Plumbing" as const,
            title: "Find your water shutoff",
            url: "https://example.test/shutoff",
            reviewedOnIso: "2026-09-01T00:00:00.000Z",
            ...bad,
          },
        ]),
        JSON.stringify(bad),
      ).toBeNull();
    }
  });
});

describe("S109 the model interprets, the rules decide (AC-S109-1)", () => {
  const request = {
    summary: "There is smoke coming from the wall outlet",
    description: "",
  };

  it("never lets a model downgrade a fire report", async () => {
    const interpretation = await interpretIntakeFreeText(request, {
      provider: {
        async generateText() {
          return {
            text: JSON.stringify({ issueType: "General", urgencyHint: "normal" }),
          };
        },
      },
    });
    expect(interpretation.issueType).toBe("General");
    expect(
      triage({ summary: request.summary, issueType: interpretation.issueType }).urgency,
    ).toBe("emergency_fire");
  });

  it("falls back deterministically when no provider is configured", async () => {
    await expect(
      interpretIntakeFreeText(
        { summary: "The dishwasher will not drain", description: "" },
        { provider: null },
      ),
    ).resolves.toMatchObject({ issueType: "Appliance", source: "rules" });
  });

  it("falls back deterministically when the model answers off-schema", async () => {
    for (const text of ["not json", JSON.stringify({ issueType: "Roofing" }), "{}"]) {
      await expect(
        interpretIntakeFreeText(
          { summary: "The dishwasher will not drain", description: "" },
          {
            provider: {
              async generateText() {
                return { text };
              },
            },
          },
        ),
        text,
      ).resolves.toMatchObject({ issueType: "Appliance", source: "rules" });
    }
  });

  it("returns nothing a resource could be selected from", async () => {
    const interpretation = await interpretIntakeFreeText(request, {
      provider: {
        async generateText() {
          return {
            text: JSON.stringify({
              issueType: "Plumbing",
              resourceId: "res-1",
              url: "https://example.test/x",
            }),
          };
        },
      },
    });
    expect(Object.keys(interpretation).sort()).toEqual(["issueType", "source"]);
  });

  it("keeps the triage module free of any model dependency", () => {
    const code = readFileSync("lib/maintenance/intake-triage.ts", "utf8");
    expect(code).not.toMatch(/model-provider|generateText|llm/i);
  });
});

describe("S109 the public route keeps its S47 boundary (ARCH-S109-2 / AC-S109-3)", () => {
  it("imports no ticket writer, provider, session, or draft path", () => {
    const code = readFileSync(
      "app/api/maintenance/intake/public/route.ts",
      "utf8",
    ).replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const forbidden of [
      "requireCapability",
      "@/lib/auth/session",
      "createMaintenanceTicket",
      "promoteUnverifiedIntake",
      "next/headers",
      "model-provider",
      "draft",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    expect(/rentvine|gmail/i.test(code)).toBe(false);
  });
});
