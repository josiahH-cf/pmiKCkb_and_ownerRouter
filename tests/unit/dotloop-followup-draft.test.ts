import { describe, expect, it } from "vitest";

import {
  DOTLOOP_FOLLOWUP_ACTION_KEYS,
  buildDotloopFollowUpDraft,
} from "@/lib/lease-renewal/dotloop-followup-draft";

// Dotloop follow-up draft (space-teeth E3a): draft-only, references the two EXISTING Dotloop registry
// keys (never authors new metadata), and marks unresolved participant/template/property fields.

describe("buildDotloopFollowUpDraft", () => {
  it("is draft-only and references only the two existing Dotloop registry keys", () => {
    const draft = buildDotloopFollowUpDraft({});
    expect(draft.production_allowed).toBe(false);
    expect(draft.send_allowed).toBe(false);
    expect(draft.kind).toBe("dotloop_followup");
    expect(draft.actionReferenceKeys).toEqual([
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ]);
    expect([...DOTLOOP_FOLLOWUP_ACTION_KEYS]).toEqual(draft.actionReferenceKeys);
  });

  it("emits Needs-Verification markers for every unresolved field (never invented)", () => {
    const draft = buildDotloopFollowUpDraft({});
    expect(draft.missingInputs).toEqual(
      expect.arrayContaining([
        "property/unit",
        "Dotloop loop name",
        "Dotloop template",
        "participant(s)",
      ]),
    );
    expect(draft.body).toContain("Needs Verification: property/unit");
  });

  it("uses supplied values and drops them from missingInputs", () => {
    const draft = buildDotloopFollowUpDraft({
      propertyLabel: "123 Main St",
      loopName: "Renewal — 123 Main St",
      templateName: "KCR Renewal",
      participants: [{ name: "Jordan Rivers", role: "tenant" }],
    });
    expect(draft.missingInputs).toEqual([]);
    expect(draft.body).toContain("123 Main St");
    const participant = draft.facts.find((fact) => fact.key === "participant_1");
    expect(participant?.value).toBe("Jordan Rivers (tenant)");
  });
});
