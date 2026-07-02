import { describe, expect, it } from "vitest";

import { buildWorkOrderDraft, inferPriority } from "@/lib/maintenance/work-order-draft";

// Maintenance intake domain core (S4): capture -> structured work-order draft. Pure; the RentVine create
// stays gated (readyForExecution always false); blockers list what a human must close first.

const CAP_TS = "2026-06-29T00:00:00.000Z";
const base = { reporterUid: "field-1", reporterName: "Sam", capturedAt: CAP_TS };
const verifiedUnit = {
  unitId: "u1",
  label: "123 Main #2",
  confidence: "Verified" as const,
};

describe("buildWorkOrderDraft", () => {
  it("assembles a draft from a complete capture, gated for execution", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      typedNote: "Dishwasher won't drain",
      unit: verifiedUnit,
      photoRefs: ["drive:abc"],
      priority: "Normal",
    });
    expect(draft.summary).toBe("Dishwasher won't drain");
    expect(draft.description).toContain("Dishwasher");
    expect(draft.unit).toEqual({ unitId: "u1", label: "123 Main #2" });
    expect(draft.photoRefs).toEqual(["drive:abc"]);
    expect(draft.reporter).toEqual({ uid: "field-1", name: "Sam" });
    expect(draft.capturedAt).toBe(CAP_TS);
    expect(draft.blockers).toEqual([]);
    expect(draft.readyForExecution).toBe(false);
  });

  it("combines a typed note and a voice transcript", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      typedNote: "Kitchen",
      voiceTranscript: "sink is clogged",
      unit: verifiedUnit,
    });
    expect(draft.description).toBe("Kitchen\n\nsink is clogged");
  });

  it("infers Emergency priority from an emergency keyword", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      voiceTranscript: "there is water leaking everywhere",
      unit: verifiedUnit,
    });
    expect(draft.priority).toBe("Emergency");
  });

  it("defaults to Normal priority with no keywords and no explicit priority", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      typedNote: "cabinet door is loose",
      unit: verifiedUnit,
    });
    expect(draft.priority).toBe("Normal");
  });

  it("respects an explicit priority over inference", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      typedNote: "gas smell reported",
      unit: verifiedUnit,
      priority: "Low",
    });
    expect(draft.priority).toBe("Low");
  });

  it("blocks on a missing description", () => {
    const draft = buildWorkOrderDraft({ ...base, unit: verifiedUnit });
    expect(draft.blockers).toContain("Add an issue description or voice note.");
  });

  it("blocks on an unmatched unit", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      typedNote: "broken window",
      unit: null,
    });
    expect(draft.blockers).toContain("Match the location to a unit.");
  });

  it("blocks on a low-confidence unit match", () => {
    const draft = buildWorkOrderDraft({
      ...base,
      typedNote: "broken window",
      unit: { unitId: "u1", label: "x", confidence: "Needs Review" },
    });
    expect(draft.blockers).toContain("Confirm the matched unit (low-confidence match).");
  });
});

describe("inferPriority", () => {
  it("flags emergencies case-insensitively", () => {
    expect(inferPriority("NO HEAT in the unit")).toBe("Emergency");
  });

  it("returns Normal for routine issues", () => {
    expect(inferPriority("squeaky door hinge")).toBe("Normal");
  });
});
