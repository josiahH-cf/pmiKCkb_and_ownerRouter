import { describe, expect, it } from "vitest";

import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import { projectEffectiveDataCheck } from "@/lib/lease-renewal/effective-data-check";

const SOURCE_TRIGGER =
  "lease_renewal:reconcile:live-review:0123456789abcdef:current_rent";
const FINGERPRINT = `rcf1_${"a".repeat(64)}`;
const ITEM: DeskReconItem = {
  fieldKey: "current_rent",
  fieldLabel: "Current rent",
  sourceTriggerKey: SOURCE_TRIGGER,
  candidateFingerprint: FINGERPRINT,
  agreement: "conflict",
  candidates: [
    {
      source: "rentvine",
      sourceSystem: "RentVine",
      value: "1400",
      confidence: "Verified",
    },
    {
      source: "sheet_tab3",
      sourceSystem: "Sheet",
      value: "1300",
      confidence: "Needs Verification",
    },
  ],
};

function pickedResolution(
  overrides: Partial<LeaseRenewalResolutionRecord> = {},
): LeaseRenewalResolutionRecord {
  return {
    id: "resolution-1",
    source_trigger_key: SOURCE_TRIGGER,
    run_id: "live-review",
    field_key: "current_rent",
    field_label: "Current rent",
    candidate_fingerprint: FINGERPRINT,
    severity: "High",
    status: "Resolved",
    resolution_kind: "pick_source",
    chosen_source: "sheet_tab3",
    proposed_writeback: {
      field_key: "current_rent",
      value: "1300",
      source_of_value: "sheet_tab3",
      status: "Queued",
      production_allowed: false,
    },
    reason: "The operating Sheet reflects the executed amendment.",
    resolved_by_uid: "admin-1",
    created_at: "2026-09-02T12:00:00.000Z",
    updated_at: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("effective renewal data-check projection", () => {
  it("clears one exact source conflict from a complete picked-candidate decision", () => {
    const projection = projectEffectiveDataCheck([ITEM], [pickedResolution()]);

    expect(projection.items[0]).toMatchObject({ agreement: "resolved" });
    expect(projection.resolutionsByField.get("current_rent")).toEqual({
      kind: "pick_source",
      value: "1300",
      source: "sheet_tab3",
      priorAgreement: "conflict",
    });
  });

  it.each([
    ["source fingerprint drift", { candidate_fingerprint: `rcf1_${"b".repeat(64)}` }],
    ["legacy fingerprint", { candidate_fingerprint: undefined }],
    ["legacy resolution kind", { resolution_kind: undefined }],
    ["missing resolution updated-at", { updated_at: "" }],
    ["unknown picked source", { chosen_source: "unknown" }],
    [
      "picked value mismatch",
      {
        proposed_writeback: {
          field_key: "current_rent",
          value: "1400",
          source_of_value: "sheet_tab3",
          status: "Queued",
          production_allowed: false,
        } as const,
      },
    ],
    [
      "picked source mismatch",
      {
        proposed_writeback: {
          field_key: "current_rent",
          value: "1300",
          source_of_value: "rentvine",
          status: "Queued",
          production_allowed: false,
        } as const,
      },
    ],
  ])("reopens the source conflict for %s", (_name, overrides) => {
    const projection = projectEffectiveDataCheck(
      [ITEM],
      [pickedResolution(overrides as Partial<LeaseRenewalResolutionRecord>)],
    );

    expect(projection.items[0]).toMatchObject({ agreement: "conflict" });
    expect(projection.resolutionsByField.size).toBe(0);
  });

  it("records an exact dismissal without selecting or verifying a value", () => {
    const dismissed = pickedResolution({
      status: "Dismissed",
      resolution_kind: "flag_incorrect",
      chosen_source: undefined,
      proposed_writeback: undefined,
    });
    const projection = projectEffectiveDataCheck([ITEM], [dismissed]);

    expect(projection.items[0]).toMatchObject({ agreement: "dismissed" });
    expect(projection.resolutionsByField.get("current_rent")).toEqual({
      kind: "flag_incorrect",
      value: null,
      source: null,
      priorAgreement: "conflict",
    });
  });
});
