import { describe, expect, it } from "vitest";

import { EditableLayerError } from "@/lib/firestore/errors";
import {
  planLeaseRenewalResolution,
  ResolveLeaseRenewalFlagInputSchema,
  type ResolvableFlag,
} from "@/lib/firestore/lease-renewal-resolutions";

const FLAG: ResolvableFlag = {
  source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
  run_id: "run-1",
  field_key: "renewal_date",
  field_label: "Renewal date",
  severity: "High",
  candidate_sources: [
    { source: "sheet_tab3", value: "2026-08-31" },
    { source: "rentvine", value: "2026-09-01" },
  ],
};

function parse(input: Record<string, unknown>) {
  return ResolveLeaseRenewalFlagInputSchema.parse(input);
}

describe("planLeaseRenewalResolution", () => {
  it("resolves by picking a source and queues a (never-executed) write-back", () => {
    const plan = planLeaseRenewalResolution(
      FLAG,
      parse({
        run_id: "run-1",
        source_trigger_key: FLAG.source_trigger_key,
        kind: "pick_source",
        chosen_source: "rentvine",
        reason: "Rentvine is the read-authoritative lease record.",
      }),
    );

    expect(plan.status).toBe("Resolved");
    expect(plan.resolution_kind).toBe("pick_source");
    expect(plan.chosen_source).toBe("rentvine");
    expect(plan.proposed_writeback).toEqual({
      field_key: "renewal_date",
      value: "2026-09-01",
      source_of_value: "rentvine",
      status: "Queued",
      production_allowed: false,
    });
  });

  it("rejects a chosen source that is not one of the flag's candidates", () => {
    const input = parse({
      run_id: "run-1",
      source_trigger_key: FLAG.source_trigger_key,
      kind: "pick_source",
      chosen_source: "made_up_source",
      reason: "trying to pick a phantom source",
    });
    expect(() => planLeaseRenewalResolution(FLAG, input)).toThrow(EditableLayerError);
  });

  it("resolves with a corrected value (neither source is right)", () => {
    const plan = planLeaseRenewalResolution(
      FLAG,
      parse({
        run_id: "run-1",
        source_trigger_key: FLAG.source_trigger_key,
        kind: "corrected_value",
        corrected_value: "2026-10-15",
        reason: "Owner agreed a later renewal date by email.",
      }),
    );

    expect(plan.status).toBe("Resolved");
    expect(plan.resolution_kind).toBe("corrected_value");
    expect(plan.proposed_writeback?.value).toBe("2026-10-15");
    expect(plan.proposed_writeback?.source_of_value).toBe("corrected_value");
    expect(plan.proposed_writeback?.production_allowed).toBe(false);
  });

  it("dismisses a false-positive flag with no proposed write-back", () => {
    const plan = planLeaseRenewalResolution(
      FLAG,
      parse({
        run_id: "run-1",
        source_trigger_key: FLAG.source_trigger_key,
        kind: "flag_incorrect",
        reason: "The HOA dissolved, so the sheet value is already correct.",
      }),
    );

    expect(plan.status).toBe("Dismissed");
    expect(plan.resolution_kind).toBe("flag_incorrect");
    expect(plan.proposed_writeback).toBeUndefined();
  });

  it("requires a plain-English reason", () => {
    expect(() =>
      parse({
        run_id: "run-1",
        source_trigger_key: FLAG.source_trigger_key,
        kind: "flag_incorrect",
        reason: "   ",
      }),
    ).toThrow();
  });
});
