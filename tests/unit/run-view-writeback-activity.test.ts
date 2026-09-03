import { describe, expect, it } from "vitest";

import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import {
  getSimulationRun,
  listSimulationRuns,
} from "@/tests/helpers/lease-renewal-simulation";

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
  candidateFingerprint: string,
): LeaseRenewalResolutionRecord {
  return {
    id: key,
    source_trigger_key: key,
    run_id: runId,
    field_key: fieldKey,
    field_label: fieldLabel,
    candidate_fingerprint: candidateFingerprint,
    severity: "High",
    status: "Resolved",
    resolution_kind: "corrected_value",
    corrected_value: "1500",
    reason: "RentVine is authoritative.",
    resolved_by_uid: "approver-1",
    proposed_writeback: {
      field_key: fieldKey,
      value: "1500",
      source_of_value: "corrected_value",
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

function approvalFor(
  resolution: LeaseRenewalResolutionRecord,
  overrides: Partial<LeaseRenewalWritebackApprovalRecord> = {},
): LeaseRenewalWritebackApprovalRecord {
  if (!resolution.proposed_writeback) throw new Error("expected a queued proposal");
  return {
    id: "approval-1",
    source_trigger_key: resolution.source_trigger_key,
    run_id: resolution.run_id,
    field_key: resolution.field_key,
    field_label: resolution.field_label,
    candidate_fingerprint: resolution.candidate_fingerprint,
    resolution_updated_at: resolution.updated_at,
    severity: resolution.severity,
    state: "Approved",
    proposed_value: resolution.proposed_writeback.value,
    source_of_value: resolution.proposed_writeback.source_of_value,
    reason: "Approved after exact review.",
    decided_by_uid: "admin-2",
    production_allowed: false,
    executed: false,
    created_at: "2026-07-01T01:00:00.000Z",
    updated_at: "2026-07-01T01:00:00.000Z",
    ...overrides,
  };
}

function fingerprintFor(run: ReturnType<typeof firstSimRun>["run"], key: string): string {
  const value = run.flags.find(
    (flag) => flag.queueMapping?.queueItem.source_trigger_key === key,
  )?.candidateFingerprint;
  if (!value) throw new Error("expected a candidate fingerprint");
  return value;
}

describe("buildRenewalRunView write-back approval activity overlay", () => {
  it("projects the exact saved queued proposal instead of the deterministic suggestion", () => {
    const { summary, run } = firstSimRun();
    const base = buildRenewalRunView(run, [], summary.label);
    const flag = base.groups.flatMap((group) => group.flags)[0];
    const resolution = queuedResolutionFor(
      summary.runId,
      flag.sourceTriggerKey,
      flag.fieldKey,
      flag.fieldLabel,
      fingerprintFor(run, flag.sourceTriggerKey),
    );
    resolution.proposed_writeback = {
      field_key: flag.fieldKey,
      value: "1501",
      source_of_value: "corrected_value",
      status: "Queued",
      production_allowed: false,
    };
    resolution.resolution_kind = "corrected_value";
    resolution.chosen_source = undefined;
    resolution.corrected_value = "1501";

    const view = buildRenewalRunView(run, [resolution], summary.label);
    const projected = view.groups
      .flatMap((group) => group.flags)
      .find((candidate) => candidate.sourceTriggerKey === flag.sourceTriggerKey);

    expect(projected?.writeback).toMatchObject({
      proposedValue: "1501",
      sourceSystem: "corrected_value",
      suggestionOnly: false,
    });
    expect(projected?.writebackApproval?.authorizationToken).toMatch(
      /^rwat1_[a-f0-9]{64}$/,
    );
  });

  it.each([
    ["missing source fingerprint", { candidate_fingerprint: undefined }],
    ["blank source fingerprint", { candidate_fingerprint: "" }],
    ["missing resolution version", { resolution_updated_at: undefined }],
    [
      "mismatched resolution version",
      { resolution_updated_at: "2026-06-30T00:00:00.000Z" },
    ],
  ])(
    "renders a %s approval as stale and awaiting a fresh decision",
    (_name, overrides) => {
      const { summary, run } = firstSimRun();
      const base = buildRenewalRunView(run, [], summary.label);
      const flag = base.groups.flatMap((group) => group.flags)[0];
      const resolution = queuedResolutionFor(
        summary.runId,
        flag.sourceTriggerKey,
        flag.fieldKey,
        flag.fieldLabel,
        fingerprintFor(run, flag.sourceTriggerKey),
      );
      const view = buildRenewalRunView(run, [resolution], summary.label, [
        approvalFor(resolution, overrides),
      ]);
      const projected = view.groups
        .flatMap((group) => group.flags)
        .find(
          (candidate) => candidate.sourceTriggerKey === flag.sourceTriggerKey,
        )?.writebackApproval;

      expect(projected).toMatchObject({
        state: "Awaiting Approval",
        stale: true,
        productionAllowed: false,
        executed: false,
      });
    },
  );

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
      fingerprintFor(run, key),
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
      fingerprintFor(run, flag.sourceTriggerKey),
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
      [
        queuedResolutionFor(
          summary.runId,
          key,
          flag.fieldKey,
          flag.fieldLabel,
          fingerprintFor(run, key),
        ),
      ],
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
