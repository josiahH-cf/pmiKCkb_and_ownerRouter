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
  candidate_fingerprint: "candidate-fingerprint-1",
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
  return ResolveLeaseRenewalFlagInputSchema.parse({
    candidate_fingerprint: FLAG.candidate_fingerprint,
    ...input,
  });
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

  it("rejects a source label that maps to more than one candidate", () => {
    const ambiguousFlag: ResolvableFlag = {
      ...FLAG,
      candidate_sources: [
        ...FLAG.candidate_sources,
        { source: "rentvine", value: "2026-11-01" },
      ],
    };
    const input = parse({
      run_id: ambiguousFlag.run_id,
      source_trigger_key: ambiguousFlag.source_trigger_key,
      kind: "pick_source",
      chosen_source: "rentvine",
      reason: "Attempting to choose an ambiguous provider candidate.",
    });

    expect(() => planLeaseRenewalResolution(ambiguousFlag, input)).toThrow(
      "The chosen source is ambiguous for this record.",
    );
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

  it.each(["not rent", "0", "-25", "1e3", "$1,2.00"])(
    "refuses invalid corrected current rent %s",
    (correctedValue) => {
      const rentFlag: ResolvableFlag = {
        ...FLAG,
        field_key: "current_rent",
        field_label: "Current rent",
      };
      const input = parse({
        run_id: rentFlag.run_id,
        source_trigger_key: rentFlag.source_trigger_key,
        kind: "corrected_value",
        corrected_value: correctedValue,
        reason: "Neither source reflects the executed lease.",
      });

      expect(() => planLeaseRenewalResolution(rentFlag, input)).toThrow(
        "Current rent requires a positive currency value.",
      );
    },
  );

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

  it("S157: a blank plain-English reason parses as no reason", () => {
    expect(
      parse({
        run_id: "run-1",
        source_trigger_key: FLAG.source_trigger_key,
        kind: "flag_incorrect",
        reason: "   ",
      }).reason,
    ).toBe("");
  });
});

describe("resolutionReasonRequirement", () => {
  it.each(["High", "Blocked"] as const)(
    "keeps the accepted-suggestion code to Low/Medium flags: a %s pick with that code is refused, not silently relabelled",
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
        "only valid for the exact suggested source",
      );
    },
  );

  it.each(["High", "Blocked"] as const)(
    "S157: a %s decision without a note or code is stamped with the neutral no-note label",
    (severity) => {
      const flag: ResolvableFlag = { ...FLAG, severity };
      const input = parse({
        run_id: flag.run_id,
        source_trigger_key: flag.source_trigger_key,
        kind: "pick_source",
        chosen_source: "rentvine",
      });

      expect(resolutionReasonRequirement(flag, input)).toBe("Recorded without a note");
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
  ])("refuses the accepted-suggestion code for $label", ({ input }) => {
    const parsed = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      reason_code: "accepted_suggestion",
      ...input,
    });

    expect(() => resolutionReasonRequirement(MEDIUM_FLAG, parsed)).toThrow(
      "only valid for the exact suggested source",
    );
  });

  it.each([
    {
      label: "a corrected value",
      input: { kind: "corrected_value", corrected_value: "2026-10-15" },
    },
    { label: "an incorrect-flag dismissal", input: { kind: "flag_incorrect" } },
    {
      label: "a source override",
      input: { kind: "pick_source", chosen_source: "sheet_tab3" },
    },
  ])("S157: $label needs no narrative; free text is kept when given", ({ input }) => {
    const bare = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      ...input,
    });
    expect(resolutionReasonRequirement(MEDIUM_FLAG, bare)).toBe(
      "Recorded without a note",
    );
    const noted = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      reason: "  Checked the executed lease.  ",
      ...input,
    });
    expect(resolutionReasonRequirement(MEDIUM_FLAG, noted)).toBe(
      "Checked the executed lease.",
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

  it("S157: the safe suggested-source path keeps free text without a code, and stamps the no-note label with neither", () => {
    const noted = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      kind: "pick_source",
      chosen_source: "rentvine",
      reason: "I agree with the suggestion.",
    });
    expect(resolutionReasonRequirement(MEDIUM_FLAG, noted)).toBe(
      "I agree with the suggestion.",
    );
    const bare = parse({
      run_id: MEDIUM_FLAG.run_id,
      source_trigger_key: MEDIUM_FLAG.source_trigger_key,
      kind: "pick_source",
      chosen_source: "rentvine",
    });
    expect(resolutionReasonRequirement(MEDIUM_FLAG, bare)).toBe(
      "Recorded without a note",
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
