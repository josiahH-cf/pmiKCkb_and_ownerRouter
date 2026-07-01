import { describe, expect, it } from "vitest";

import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
} from "@/lib/firestore/types";
import { getSimulationRun, listSimulationRuns } from "@/lib/lease-renewal/simulation";

// Slice B: the run-page overlay carries the append-only approval decision history, and the value-free
// review board still never leaks it. A sentinel reason proves the board drops the activity entirely.
const ACTIVITY_REASON_1 = "SENTINEL_APPROVE_REASON_first";
const ACTIVITY_REASON_2 = "SENTINEL_REVOKE_REASON_second";

function firstSimRun() {
  const summary = listSimulationRuns()[0];
  const run = getSimulationRun(summary.runId);
  if (!run) throw new Error("expected a deterministic simulation run");
  return { summary, run };
}

function queuedResolutionFor(
  runId: string,
  key: string,
  fieldKey: string,
  fieldLabel: string,
): LeaseRenewalResolutionRecord {
  return {
    id: key,
    source_trigger_key: key,
    run_id: runId,
    field_key: fieldKey,
    field_label: fieldLabel,
    severity: "High",
    status: "Resolved",
    resolution_kind: "pick_source",
    chosen_source: "rentvine",
    reason: "RentVine is authoritative.",
    resolved_by_uid: "approver-1",
    proposed_writeback: {
      field_key: fieldKey,
      value: "1500",
      source_of_value: "rentvine",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function activityRecord(
  runId: string,
  key: string,
  overrides: Partial<LeaseRenewalWritebackApprovalActivityRecord>,
): LeaseRenewalWritebackApprovalActivityRecord {
  return {
    id: `${key}-${overrides.created_at ?? "x"}`,
    source_trigger_key: key,
    run_id: runId,
    actor_uid: "admin-dan",
    action: "approve",
    new_state: "Approved",
    reason: "recorded",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRenewalRunView write-back approval activity overlay", () => {
  it("layers the grouped decision history onto a queued flag, oldest → newest", () => {
    const { summary, run } = firstSimRun();

    // Discover a real flag key from the deterministic run.
    const base = buildRenewalRunView(run, [], summary.label);
    const flag = base.groups.flatMap((group) => group.flags)[0];
    expect(flag).toBeDefined();
    const key = flag.sourceTriggerKey;

    const resolution = queuedResolutionFor(
      summary.runId,
      key,
      flag.fieldKey,
      flag.fieldLabel,
    );
    const activityByKey = new Map<string, LeaseRenewalWritebackApprovalActivityRecord[]>([
      [
        key,
        [
          activityRecord(summary.runId, key, {
            action: "approve",
            new_state: "Approved",
            reason: ACTIVITY_REASON_1,
            created_at: "2026-07-01T10:00:00.000Z",
          }),
          activityRecord(summary.runId, key, {
            action: "return",
            previous_state: "Approved",
            new_state: "Returned for Revision",
            reason: ACTIVITY_REASON_2,
            created_at: "2026-07-01T11:00:00.000Z",
          }),
        ],
      ],
    ]);

    const view = buildRenewalRunView(run, [resolution], summary.label, [], activityByKey);
    const decided = view.groups
      .flatMap((group) => group.flags)
      .find((candidate) => candidate.sourceTriggerKey === key);

    const activity = decided?.writebackApproval?.activity;
    expect(activity).toBeDefined();
    expect(activity).toHaveLength(2);
    // Preserves the caller's oldest → newest ordering (the service sorts; the view does not re-order).
    expect(activity?.[0]).toEqual({
      action: "approve",
      decidedByUid: "admin-dan",
      reason: ACTIVITY_REASON_1,
      createdAt: "2026-07-01T10:00:00.000Z",
    });
    expect(activity?.[1]).toEqual({
      action: "return",
      decidedByUid: "admin-dan",
      reason: ACTIVITY_REASON_2,
      createdAt: "2026-07-01T11:00:00.000Z",
    });
  });

  it("omits activity entirely when none is passed (board/queue paths)", () => {
    const { summary, run } = firstSimRun();
    const base = buildRenewalRunView(run, [], summary.label);
    const flag = base.groups.flatMap((group) => group.flags)[0];
    const resolution = queuedResolutionFor(
      summary.runId,
      flag.sourceTriggerKey,
      flag.fieldKey,
      flag.fieldLabel,
    );

    const view = buildRenewalRunView(run, [resolution], summary.label);
    const overlay = view.groups
      .flatMap((group) => group.flags)
      .find(
        (candidate) => candidate.sourceTriggerKey === flag.sourceTriggerKey,
      )?.writebackApproval;

    expect(overlay).not.toBeNull();
    expect(overlay?.activity).toBeUndefined();
  });

  it("never leaks the decision history onto the value-free review board", () => {
    const { summary, run } = firstSimRun();
    const base = buildRenewalRunView(run, [], summary.label);
    const flag = base.groups.flatMap((group) => group.flags)[0];
    const key = flag.sourceTriggerKey;

    const view = buildRenewalRunView(
      run,
      [queuedResolutionFor(summary.runId, key, flag.fieldKey, flag.fieldLabel)],
      summary.label,
      [],
      new Map([
        [
          key,
          [
            activityRecord(summary.runId, key, {
              reason: ACTIVITY_REASON_1,
              created_at: "2026-07-01T10:00:00.000Z",
            }),
          ],
        ],
      ]),
    );

    // Even though the run view carries the activity, the board projection drops the whole overlay.
    const board = buildRenewalReviewBoard([view]);
    const serialized = JSON.stringify(board);
    expect(serialized).not.toContain(ACTIVITY_REASON_1);
    expect(serialized).not.toContain(ACTIVITY_REASON_2);
    expect(serialized).not.toContain("activity");
    expect(serialized).not.toContain("decidedByUid");
  });
});
