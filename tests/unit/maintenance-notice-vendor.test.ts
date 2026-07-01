import { describe, expect, it } from "vitest";
import { buildWorkOrderDraft } from "@/lib/maintenance/work-order-draft";
import { buildOwnerNoticeDraft } from "@/lib/maintenance/owner-notice-draft";
import {
  VENDOR_ROSTER_UNVERIFIED,
  suggestVendorAssignment,
} from "@/lib/maintenance/vendor-assignment";

const CAPTURED_AT = "2026-07-01T10:00:00Z";

function workOrder(note: string, unitLabel: string | null, photos: string[] = []) {
  return buildWorkOrderDraft({
    reporterUid: "u-1",
    typedNote: note,
    unit: unitLabel
      ? { unitId: "unit:456", label: unitLabel, confidence: "Likely" }
      : null,
    photoRefs: photos,
    capturedAt: CAPTURED_AT,
  });
}

describe("suggestVendorAssignment", () => {
  it("suggests Plumbing for a water leak, never naming a vendor", () => {
    const suggestion = suggestVendorAssignment("water leak under the sink");
    expect(suggestion.trade).toBe("Plumbing");
    expect(suggestion.matchedKeywords).toEqual(
      expect.arrayContaining(["leak", "water", "sink"]),
    );
    expect(suggestion.suggestedVendor).toBeNull();
    expect(suggestion.vendorRoster).toBe(VENDOR_ROSTER_UNVERIFIED);
    expect(suggestion.requiresApproval).toBe(true);
    expect(suggestion.production_allowed).toBe(false);
  });

  it("suggests Electrical for a sparking outlet", () => {
    expect(suggestVendorAssignment("sparking outlet in the kitchen").trade).toBe(
      "Electrical",
    );
  });

  it("suggests HVAC for no heat", () => {
    expect(suggestVendorAssignment("no heat, the furnace won't start").trade).toBe(
      "HVAC",
    );
  });

  it("suggests Appliance for an oven/stove issue", () => {
    expect(suggestVendorAssignment("the oven and stove stopped working").trade).toBe(
      "Appliance",
    );
  });

  it("falls back to General with no matched keywords", () => {
    const suggestion = suggestVendorAssignment("something in the apartment feels off");
    expect(suggestion.trade).toBe("General");
    expect(suggestion.matchedKeywords).toEqual([]);
  });

  it("breaks a trade tie deterministically by trade order", () => {
    // "water" (Plumbing) and "heater" (HVAC) each score 1 → Plumbing wins (earlier in the order).
    expect(suggestVendorAssignment("the water heater is broken").trade).toBe("Plumbing");
    expect(suggestVendorAssignment("the water heater is broken")).toEqual(
      suggestVendorAssignment("the water heater is broken"),
    );
  });
});

describe("buildOwnerNoticeDraft", () => {
  it("drafts a source-tagged owner notice and never allows a send", () => {
    const notice = buildOwnerNoticeDraft({
      workOrder: workOrder("water leak under the sink", "123 Main St #2", ["drive:1"]),
      ownerName: "Jane Owner",
    });

    expect(notice.kind).toBe("maintenance_owner_notice");
    expect(notice.production_allowed).toBe(false);
    expect(notice.send_allowed).toBe(false);
    expect(notice.missingInputs).toEqual([]);
    expect(notice.subject).toBe("Maintenance request — 123 Main St #2");
    expect(notice.body).toContain("Hello Jane Owner,");
    expect(notice.body).toContain("123 Main St #2");
    expect(notice.body).toContain("water leak under the sink");
    expect(notice.body).toContain("1 photo(s) are on file.");
    expect(notice.facts.find((f) => f.key === "photos")?.value).toBe("1");
  });

  it("marks an unmatched unit as Needs Verification, never invented", () => {
    const notice = buildOwnerNoticeDraft({
      workOrder: workOrder("water leak under the sink", null),
      ownerName: "Jane Owner",
    });

    expect(notice.missingInputs).toContain("property/unit (unmatched location)");
    expect(notice.body).toContain("[Needs Verification: property/unit");
    expect(notice.facts.find((f) => f.key === "property")?.confidence).toBe(
      "Needs Verification",
    );
  });

  it("marks a missing owner name as Needs Verification", () => {
    const notice = buildOwnerNoticeDraft({
      workOrder: workOrder("water leak under the sink", "123 Main St #2"),
    });

    expect(notice.missingInputs).toContain("owner name/contact");
    expect(notice.body).toContain("Hello [Needs Verification: owner name],");
    expect(notice.body).toContain("No photos are on file yet.");
  });
});
