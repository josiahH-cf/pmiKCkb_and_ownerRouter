import { describe, expect, it } from "vitest";

import { EditableLayerError } from "@/lib/firestore/errors";
import {
  planLeaseRenewalResolution,
  ResolveLeaseRenewalFlagInputSchema,
  resolutionReasonRequirement,
  type ResolvableFlag,
} from "@/lib/firestore/lease-renewal-resolutions";

const FLAG: ResolvableFlag = {
  source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
  run_id: "run-1",
  field_key: "renewal_date",
  field_label: "Renewal date",
  severity: "High",
  suggested_source: "rentvine",
  candidate_sources: [
    { source: "sheet_tab3", value: "2026-08-31" },
    { source: "rentvine", value: "2026-09-01" },
  ],
};

const MEDIUM_FLAG: ResolvableFlag = {
  ...FLAG,
  severity: "Medium",
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

  it("rejects a blank plain-English reason when the key is supplied", () => {
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

describe("resolutionReasonRequirement", () => {
  it.each(["High", "Blocked"] as const)(
    "requires free text for %s severity even when the suggested source and a code are supplied",
    (severity) => {
      const flag: ResolvableFlag = { ...FLAG, severity };
      const input = parse({
        run_id: flag.run_id,
        source_trigger_key: flag.source_trigger_key,
        kind: "pick_source",
        chosen_source: "rentvine",
        reason_code: "accepted_suggestion",
      });

      expect(() => resolutionReasonRequirement(flag, input)).toThrow(
        "A plain-English reason is required.",
      );
    },
  );

  it.each([
    {
      label: "a corrected value",
      input: {
        kind: "corrected_value",
        corrected_value: "2026-10-15",
      },
    },
    {
      label: "an incorrect-flag dismissal",
      input: { kind: "flag_incorrect" },
    },
    {
      label: "a source override",
      input: { kind: "pick_source", chosen_source: "sheet_tab3" },
    },
  ])("requires free text for $label despite a reason code", ({ input }) => {
    const parsed = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      reason_code: "accepted_suggestion",
      ...input,
    });

    expect(() => resolutionReasonRequirement(MEDIUM_FLAG, parsed)).toThrow(
      "A plain-English reason is required.",
    );
  });

  it("rejects the accepted-suggestion code on a manual source override even with spoofed label text", () => {
    const input = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      kind: "pick_source",
      chosen_source: "sheet",
      reason: "Accepted the suggested source",
      reason_code: "accepted_suggestion",
    });

    expect(() => resolutionReasonRequirement(MEDIUM_FLAG, input)).toThrow(
      "only valid for the exact suggested source",
    );
  });

  it.each(["Low", "Medium"] as const)(
    "uses the reason-code label verbatim for a code-only %s suggested-source acceptance",
    (severity) => {
      const flag: ResolvableFlag = { ...MEDIUM_FLAG, severity };
      const input = parse({
        run_id: flag.run_id,
        source_trigger_key: flag.source_trigger_key,
        kind: "pick_source",
        chosen_source: "rentvine",
        reason_code: "accepted_suggestion",
      });

      expect(resolutionReasonRequirement(flag, input)).toBe(
        "Accepted the suggested source",
      );
    },
  );

  it("requires a reason code on the safe suggested-source path", () => {
    const input = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      kind: "pick_source",
      chosen_source: "rentvine",
      reason: "I agree with the suggestion.",
    });

    expect(() => resolutionReasonRequirement(MEDIUM_FLAG, input)).toThrow(
      "A reason code is required.",
    );
  });

  it("keeps supplied free text as optional elaboration when the safe path also has a code", () => {
    const input = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      kind: "pick_source",
      chosen_source: "rentvine",
      reason: "  Confirmed against the signed lease.  ",
      reason_code: "accepted_suggestion",
    });

    expect(resolutionReasonRequirement(MEDIUM_FLAG, input)).toBe(
      "Confirmed against the signed lease.",
    );
  });
});
