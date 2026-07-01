import { describe, expect, it } from "vitest";
import { buildRenewalReviewBoard, renewalRunHref } from "@/lib/approval/renewal-review";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import type { Severity } from "@/lib/lease-renewal/severity";
import { getSimulationRun, listSimulationRuns } from "@/lib/lease-renewal/simulation";

// A value-bearing sentinel: every flag fixture carries this in its (ignored) candidate/suggested
// value fields so the "value-free" assertions can prove the board never leaks it.
const SECRET = "SENTINEL_RENT_4242";

function makeFlag(
  fieldKey: string,
  severity: Severity,
  overrides: Partial<RenewalFlagView> = {},
): RenewalFlagView {
  return {
    sourceTriggerKey: `lease_renewal:reconcile:run:${fieldKey}`,
    fieldKey,
    fieldLabel: overrides.fieldLabel ?? fieldKey,
    severity,
    agreement: overrides.agreement ?? "conflict",
    actionNeeded: overrides.actionNeeded ?? `Reconcile ${fieldKey}`,
    directLink: `/lease-renewal/runs/run/reconciliation/${fieldKey}`,
    suggestedWinner: { source: "rentvine", value: SECRET },
    blockedReason: overrides.blockedReason,
    candidates: [
      {
        source: "rentvine",
        sourceSystem: "RentVine",
        value: SECRET,
        confidence: "High",
        locationRef: "ref",
      },
    ],
    resolution: overrides.resolution ?? null,
    writeback:
      overrides.writeback ??
      ({
        fieldKey,
        fieldLabel: fieldKey,
        method: "append_only_column",
        proposedColumnHeader: `KB Proposed — ${fieldKey}`,
        proposedValue: SECRET,
        sourceSystem: "RentVine",
        rationale: `Append "${SECRET}" from RentVine ...`,
        status: "Proposed",
        requiresApproval: true,
        autoApplyAllowed: false,
        suggestionOnly: true,
        valueReady: true,
      } as RenewalFlagView["writeback"]),
  };
}

function makeView(
  runId: string,
  label: string,
  groups: { severity: Severity; flags: RenewalFlagView[] }[],
): RenewalRunView {
  return {
    runId,
    label,
    manifest: {
      tabsRecognized: 0,
      tabsUnrecognized: 0,
      credentialTabsExcluded: 0,
      credentialScrubHits: 0,
      dividerRowsDropped: 0,
      totalRecords: 0,
    },
    excludedTabs: [],
    groups,
    totalFlags: groups.reduce((sum, group) => sum + group.flags.length, 0),
    resolvedCount: 0,
  };
}

describe("buildRenewalReviewBoard", () => {
  it("groups flags by run and counts open / high-severity / blocked", () => {
    const board = buildRenewalReviewBoard([
      makeView("run-a", "Run A", [
        {
          severity: "High",
          flags: [makeFlag("current_rent", "High"), makeFlag("renewal_date", "High")],
        },
        { severity: "Blocked", flags: [makeFlag("owner_charge_130", "Blocked")] },
        { severity: "Low", flags: [makeFlag("address", "Low")] },
      ]),
    ]);

    expect(board.totalRuns).toBe(1);
    const run = board.runs[0];
    expect(run.runId).toBe("run-a");
    expect(run.href).toBe(renewalRunHref("run-a"));
    expect(run.totalFlags).toBe(4);
    expect(run.openFlags).toBe(4);
    expect(run.highSeverityOpen).toBe(3); // 2 High + 1 Blocked
    expect(run.blockedOpen).toBe(1);
    expect(board.totalOpenFlags).toBe(4);
  });

  it("treats a resolved flag as no longer open", () => {
    const board = buildRenewalReviewBoard([
      makeView("run-a", "Run A", [
        {
          severity: "High",
          flags: [
            makeFlag("current_rent", "High", {
              resolution: { status: "Resolved" },
            }),
            makeFlag("renewal_date", "High"),
          ],
        },
      ]),
    ]);

    const run = board.runs[0];
    expect(run.totalFlags).toBe(2);
    expect(run.openFlags).toBe(1);
    expect(run.highSeverityOpen).toBe(1);
    expect(run.flags.find((flag) => flag.fieldKey === "current_rent")?.resolved).toBe(
      true,
    );
  });

  it("still counts a flag whose resolution is Open as open", () => {
    const board = buildRenewalReviewBoard([
      makeView("run-a", "Run A", [
        {
          severity: "Medium",
          flags: [makeFlag("lease_start", "Medium", { resolution: { status: "Open" } })],
        },
      ]),
    ]);

    expect(board.runs[0].openFlags).toBe(1);
    expect(board.runs[0].flags[0].resolved).toBe(false);
  });

  it("orders runs most-attention-first (high-severity, then open count, then label)", () => {
    const board = buildRenewalReviewBoard([
      makeView("run-low", "Zeta low-only", [
        { severity: "Low", flags: [makeFlag("address", "Low")] },
      ]),
      makeView("run-high", "Alpha high", [
        { severity: "High", flags: [makeFlag("current_rent", "High")] },
      ]),
    ]);

    expect(board.runs.map((run) => run.runId)).toEqual(["run-high", "run-low"]);
  });

  it("never leaks candidate or suggested VALUES into the value-free board", () => {
    const board = buildRenewalReviewBoard([
      makeView("run-a", "Run A", [
        { severity: "High", flags: [makeFlag("current_rent", "High")] },
      ]),
    ]);

    const serialized = JSON.stringify(board);
    // SECRET is the candidate value AND the proposal's proposedValue/rationale — none may leak.
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("suggestedWinner");
    expect(serialized).not.toContain("candidates");
    expect(serialized).not.toContain("proposedValue");
    expect(serialized).not.toContain("rationale");
    // The flag row carries only the safe, PII-free shape (the proposal collapses to a boolean).
    expect(Object.keys(board.runs[0].flags[0]).sort()).toEqual([
      "actionNeeded",
      "agreement",
      "fieldKey",
      "fieldLabel",
      "href",
      "proposalReady",
      "resolved",
      "severity",
    ]);
  });

  it("carries the value-free proposal-ready flag from the write-back proposal", () => {
    const board = buildRenewalReviewBoard([
      makeView("run-a", "Run A", [
        {
          severity: "High",
          flags: [
            makeFlag("current_rent", "High"),
            makeFlag("owner_charge_130", "Blocked", {
              writeback: {
                fieldKey: "owner_charge_130",
                fieldLabel: "owner_charge_130",
                method: "append_only_column",
                proposedColumnHeader: "KB Proposed — owner_charge_130",
                proposedValue: null,
                sourceSystem: null,
                rationale: "No append-only proposal: no precedence winner.",
                status: "Blocked",
                requiresApproval: true,
                autoApplyAllowed: false,
                suggestionOnly: true,
                valueReady: false,
              },
            }),
          ],
        },
      ]),
    ]);

    const flags = board.runs[0].flags;
    expect(flags.find((flag) => flag.fieldKey === "current_rent")?.proposalReady).toBe(
      true,
    );
    expect(
      flags.find((flag) => flag.fieldKey === "owner_charge_130")?.proposalReady,
    ).toBe(false);
  });

  it("returns an empty board for no runs", () => {
    const board = buildRenewalReviewBoard([]);
    expect(board).toEqual({
      runs: [],
      totalRuns: 0,
      totalFlags: 0,
      totalOpenFlags: 0,
    });
  });

  it("produces a real, value-free board from the deterministic simulation run", () => {
    const summaries = listSimulationRuns();
    const views = summaries
      .map((summary) => {
        const run = getSimulationRun(summary.runId);
        return run ? buildRenewalRunView(run, [], summary.label) : null;
      })
      .filter((view): view is RenewalRunView => view !== null);

    const board = buildRenewalReviewBoard(views);

    expect(board.totalRuns).toBe(1);
    expect(board.totalFlags).toBeGreaterThan(0);
    // Even against the real reconciliation output, no value-bearing keys leak.
    const serialized = JSON.stringify(board);
    expect(serialized).not.toContain("suggestedWinner");
    expect(serialized).not.toContain("candidates");
  });
});
