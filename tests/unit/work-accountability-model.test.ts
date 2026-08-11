import { describe, expect, it } from "vitest";

import {
  actualTaskMinutes,
  addRetentionPeriod,
  assertTransitionAllowed,
  canonicalSourceLink,
  compareTaskExpectation,
  durationMinutes,
  idleCutoffAt,
  shouldAcknowledgeHeartbeat,
  workIdlePhase,
} from "@/lib/work-accountability/model";
import {
  WORK_RETENTION_POLICY_VERSION,
  type WorkSessionRecord,
  type WorkTaskRecord,
} from "@/lib/work-accountability/types";

describe("work accountability pure contract", () => {
  it.each([
    ["2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ["2024-02-29T12:30:00.000Z", "2025-02-28T12:30:00.000Z"],
  ])("applies the exact twelve-month retention boundary", (anchor, expected) => {
    expect(addRetentionPeriod(anchor)).toBe(expected);
  });

  it.each([
    ["2026-08-11T12:12:59.999Z", "active"],
    ["2026-08-11T12:13:00.000Z", "warning"],
    ["2026-08-11T12:14:59.999Z", "warning"],
    ["2026-08-11T12:15:00.000Z", "cutoff"],
  ] as const)("classifies the idle boundary at %s", (now, expected) => {
    expect(workIdlePhase("2026-08-11T12:00:00.000Z", now)).toBe(expected);
  });

  it("coalesces heartbeats and computes the exact cutoff", () => {
    const last = "2026-08-11T12:00:00.000Z";
    expect(shouldAcknowledgeHeartbeat(last, "2026-08-11T12:00:59.999Z")).toBe(false);
    expect(shouldAcknowledgeHeartbeat(last, "2026-08-11T12:01:00.000Z")).toBe(true);
    expect(shouldAcknowledgeHeartbeat(last, "2026-08-11T12:15:00.000Z")).toBe(false);
    expect(idleCutoffAt(last)).toBe("2026-08-11T12:15:00.000Z");
  });

  it("sums ended effective sessions only and keeps comparison copy neutral", () => {
    const task = taskRecord({
      state: "Completed",
      expectation_snapshot: {
        expectation_id: "expectation-1",
        expectation_key: "lease-renewals:review",
        version: 1,
        minimum_minutes: 30,
        maximum_minutes: 45,
        effective_at: "2026-08-11T10:00:00.000Z",
      },
    });
    const sessions = [
      sessionRecord({ id: "ended-1", effective_minutes: 20 }),
      sessionRecord({ id: "ended-2", effective_minutes: 10 }),
      sessionRecord({ id: "other", task_id: "other-task", effective_minutes: 99 }),
      sessionRecord({ id: "active", state: "Active", effective_minutes: 99 }),
    ];
    expect(actualTaskMinutes(task.id, sessions)).toBe(30);
    expect(compareTaskExpectation(task, 29.5)).toEqual({
      label: "Below expected range",
      difference_minutes: 0.5,
    });
    expect(compareTaskExpectation(task, 30)).toEqual({
      label: "Within expected range",
      difference_minutes: 0,
    });
    expect(compareTaskExpectation(task, 45.25)).toEqual({
      label: "Above expected range",
      difference_minutes: 0.25,
    });
  });

  it("refuses reversed time and disallowed task-state edges", () => {
    expect(() =>
      durationMinutes("2026-08-11T12:01:00.000Z", "2026-08-11T12:00:00.000Z"),
    ).toThrow("cannot be before");
    expect(() => assertTransitionAllowed("Not started", "Paused")).toThrow("cannot move");
    expect(() => assertTransitionAllowed("Completed", "In progress")).toThrow(
      "cannot move",
    );
    expect(() => assertTransitionAllowed("Completed", "Paused")).not.toThrow();
  });

  it("generates only bounded canonical in-app source links", () => {
    expect(canonicalSourceLink("workflow_run", "run-1")).toBe("/workflow-runs/run-1");
    expect(canonicalSourceLink("renewal_lease", "lease:1")).toBe(
      "/lease-renewal/live/desk/lease/lease%3A1",
    );
    expect(canonicalSourceLink("maintenance_ticket", "ticket-1")).toBe(
      "/maintenance?ticket_id=ticket-1",
    );
    expect(canonicalSourceLink("approval_item", "item-1")).toBe(
      "/approval-queue?item_id=item-1",
    );
    expect(canonicalSourceLink("manual")).toBeUndefined();
  });
});

function taskRecord(overrides: Partial<WorkTaskRecord> = {}): WorkTaskRecord {
  return {
    id: "task-1",
    space_id: "lease-renewals",
    source: { type: "manual", status: "verified" },
    task_type: "review",
    title: "Review renewal packet",
    assignee_uid: "staff-1",
    creator_uid: "staff-1",
    state: "Not started",
    next_action: "Open the renewal workspace",
    created_at: "2026-08-11T10:00:00.000Z",
    updated_at: "2026-08-11T10:00:00.000Z",
    record_version: 1,
    retention_policy_version: WORK_RETENTION_POLICY_VERSION,
    legal_hold: false,
    ...overrides,
  };
}

function sessionRecord(overrides: Partial<WorkSessionRecord> = {}): WorkSessionRecord {
  return {
    id: "session-1",
    task_id: "task-1",
    original_task_id: "task-1",
    staff_uid: "staff-1",
    state: "Ended",
    original_start_at: "2026-08-11T10:00:00.000Z",
    original_end_at: "2026-08-11T10:10:00.000Z",
    end_reason: "manual_pause",
    last_acknowledged_activity_at: "2026-08-11T10:00:00.000Z",
    effective_start_at: "2026-08-11T10:00:00.000Z",
    effective_end_at: "2026-08-11T10:10:00.000Z",
    effective_minutes: 10,
    correction_state: "none",
    idempotency_key: "hash",
    record_version: 2,
    created_at: "2026-08-11T10:00:00.000Z",
    updated_at: "2026-08-11T10:10:00.000Z",
    retention_policy_version: WORK_RETENTION_POLICY_VERSION,
    retention_expires_at: "2027-08-11T10:10:00.000Z",
    legal_hold: false,
    ...overrides,
  };
}
