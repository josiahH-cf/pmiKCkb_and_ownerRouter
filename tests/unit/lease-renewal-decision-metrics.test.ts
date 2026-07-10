import { describe, expect, it } from "vitest";

import {
  buildDecisionMetrics,
  type DecisionMetricsApprovalInput,
  type DecisionMetricsResolutionInput,
} from "@/lib/lease-renewal/decision-metrics";

const resolutions: DecisionMetricsResolutionInput[] = [
  { resolution_kind: "pick_source", reason_code: "stale_source" },
  { resolution_kind: "pick_source" },
  { resolution_kind: "corrected_value", reason_code: "data_entry_error" },
  { resolution_kind: "flag_incorrect", reason_code: "sheet_already_right" },
  { resolution_kind: "flag_incorrect", reason_code: "rule_too_strict" },
];

const approvals: DecisionMetricsApprovalInput[] = [
  { state: "Approved", reason_code: "stale_source" },
  { state: "Approved" },
  { state: "Returned for Revision", reason_code: "severity_wrong" },
];

describe("buildDecisionMetrics", () => {
  it("counts accept / correct / dismiss and the dismiss rate", () => {
    const metrics = buildDecisionMetrics({ resolutions, approvals });
    expect(metrics.total_decisions).toBe(8);
    expect(metrics.resolutions).toEqual({
      total: 5,
      accepted: 2,
      corrected: 1,
      dismissed: 2,
      dismiss_rate: 0.4,
    });
    expect(metrics.approvals).toEqual({ total: 3, approved: 2, returned: 1 });
  });

  it("tallies reason codes across both paths and counts uncategorized decisions", () => {
    const metrics = buildDecisionMetrics({ resolutions, approvals });
    expect(metrics.reason_codes.stale_source).toBe(2); // one resolution + one approval
    expect(metrics.reason_codes.sheet_already_right).toBe(1);
    expect(metrics.reason_codes.severity_wrong).toBe(1);
    expect(metrics.uncategorized).toBe(2); // one resolution + one approval with no code
  });

  it("handles the empty case without dividing by zero", () => {
    const metrics = buildDecisionMetrics({ resolutions: [], approvals: [] });
    expect(metrics.total_decisions).toBe(0);
    expect(metrics.resolutions.dismiss_rate).toBe(0);
  });

  it("is VALUE-FREE by construction: no value-bearing field can leak (sentinel)", () => {
    // Even if a caller passes value-bearing fields on the input records, the projection copies none of
    // them onto the output — only integers and the derived rate survive.
    const metrics = buildDecisionMetrics({
      resolutions: [
        {
          resolution_kind: "corrected_value",
          reason_code: "data_entry_error",
          // deliberately smuggled value-bearing fields:
          ...({
            corrected_value: "$1,289",
            field_key: "current_rent",
            reason: "secret",
          } as object),
        },
      ],
      approvals: [
        {
          state: "Approved",
          ...({ proposed_value: "$1,250", source_of_value: "sheet" } as object),
        },
      ],
    });

    const serialized = JSON.stringify(metrics);
    // Real value-bearing leaks (a category key like "sheet_already_right" is NOT a value).
    for (const forbidden of [
      "$1,289",
      "$1,250",
      "current_rent",
      "secret",
      "proposed_value",
      "corrected_value",
      "field_key",
      "source_of_value",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // Exact top-level key set — a new value-bearing key added later fails this test.
    expect(Object.keys(metrics).sort()).toEqual([
      "approvals",
      "reason_codes",
      "resolutions",
      "review",
      "total_decisions",
      "uncategorized",
    ]);
    // The S17 review roll-up is integers only.
    expect(Object.keys(metrics.review).sort()).toEqual([
      "high_risk_overrides",
      "self_corrections",
    ]);
    expect(typeof metrics.review.high_risk_overrides).toBe("number");
    expect(typeof metrics.review.self_corrections).toBe("number");
  });

  // AC-S17-6: the value-free review roll-up counts high-risk overrides (corrected_value at High) and
  // self-corrections (returned write-back authorizations), and the digest projects them into ONE signal.
  it("rolls up high-risk overrides + self-corrections and builds one value-free digest (AC-S17-6)", async () => {
    const { buildTeamReviewDigest } = await import("@/lib/attention/review-lane");
    const metrics = buildDecisionMetrics({
      resolutions: [
        { resolution_kind: "corrected_value", severity: "High" },
        { resolution_kind: "corrected_value", severity: "Medium" },
        { resolution_kind: "pick_source", severity: "High" },
      ],
      approvals: [
        { state: "Approved" },
        { state: "Returned for Revision" },
        { state: "Returned for Revision" },
      ],
    });
    expect(metrics.review.high_risk_overrides).toBe(1); // only the High corrected_value
    expect(metrics.review.self_corrections).toBe(2); // the two returned approvals

    const digest = buildTeamReviewDigest(metrics);
    expect(digest).not.toBeNull();
    expect(digest!.lane).toBe("review");
    expect(digest!.severity).toBe("high");
    expect(digest!.signal_key).toBe("team_review:digest");
    expect(digest!.detail).toBe("1 high-risk override, 2 self-corrections this period");
    // Value-free: the digest is exactly the six whitelisted keys, no value-bearing field.
    expect(Object.keys(digest!).sort()).toEqual([
      "detail",
      "href",
      "label",
      "lane",
      "severity",
      "signal_key",
    ]);

    // Nothing to review => no signal (never a per-edit ping).
    expect(
      buildTeamReviewDigest(buildDecisionMetrics({ resolutions: [], approvals: [] })),
    ).toBeNull();
  });
});
