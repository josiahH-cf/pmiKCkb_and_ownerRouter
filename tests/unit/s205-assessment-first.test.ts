import {
  maintenanceAging,
  MAINTENANCE_STAGES,
  MAINTENANCE_STAGE_TRANSITIONS,
} from "@/lib/maintenance/lifecycle";
import { it, expect } from "vitest";
import { projectMaintenanceWaitingOn } from "@/lib/maintenance/waiting-on";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
const ticket: MaintenanceTicketRecord = {
  id: "case-one",
  data_mode: "live",
  status: "Open",
  summary: "Fixture dripping tap",
  description: "Report with no approval or estimate",
  priority: "Normal",
  priority_provenance: "operator-set",
  unit: { unitId: "unit:801", label: "Fixture unit" },
  photo_refs: [],
  reporter: { kind: "staff", uid: "staff-one" },
  labels: [],
  space_id: "maintenance-work-order-intake",
  created_at: "2026-10-06T23:00:00Z",
  updated_at: "2026-10-09T15:00:00Z",
};
export { ticket };
it("an intake without an estimate begins with assessment and does not require an owner email", () => {
  const p = projectMaintenanceWaitingOn({ ticket, link: null, preapproval: null });
  expect(p.waitingOn).toBe("assessment");
  expect(p.ownerDecisionRequired).toBe(false);
  expect(p.nextAction).not.toMatch(/send|email/i);
});
it("troubleshooting resolution waits for PMI closeout instead of inventing spending or provider approval", () => {
  const assessed = {
    ...ticket,
    workflow_stage: "resolved_troubleshooting",
    assessment: {
      outcome: "resolved_troubleshooting",
      scope: "Tap tightened; no purchased work",
      evidence_refs: [],
      recorded_at: "2026-10-09T15:00:00Z",
      recorded_by_uid: "staff-one",
      version: 1,
    },
  } as MaintenanceTicketRecord;
  const p = projectMaintenanceWaitingOn({
    ticket: assessed,
    link: null,
    preapproval: null,
  });
  expect(p.waitingOn).toBe("pmi_review");
  expect(p.ownerDecisionRequired).toBe(false);
  expect(p.withinPreapproval).toBe(false);
});

it("three calendar days use Chicago dates and read/update churn never resets meaningful age", () => {
  expect(maintenanceAging(ticket, "2026-10-09T04:59:59Z")).toMatchObject({
    createdDays: 2,
    aging: false,
  });
  expect(
    maintenanceAging(
      { ...ticket, updated_at: "2026-10-09T05:00:00Z" },
      "2026-10-09T05:00:00Z",
    ),
  ).toMatchObject({ createdDays: 3, progressDays: 3, aging: true, progressKnown: false });
  expect(
    maintenanceAging({ ...ticket, status: "Closed" }, "2040-10-09T05:00:00Z").aging,
  ).toBe(false);
});
it("every declared stage has explicit legal exits and only PMI review/troubleshooting can close", () => {
  expect(Object.keys(MAINTENANCE_STAGE_TRANSITIONS).sort()).toEqual(
    [...MAINTENANCE_STAGES].sort(),
  );
  for (const [stage, next] of Object.entries(MAINTENANCE_STAGE_TRANSITIONS)) {
    expect(new Set(next).size).toBe(next.length);
    for (const target of next) expect(MAINTENANCE_STAGES).toContain(target);
    if (next.includes("closed"))
      expect(["completion_review", "resolved_troubleshooting"]).toContain(stage);
  }
  expect(MAINTENANCE_STAGE_TRANSITIONS.closed).toEqual(["assessment"]);
  expect(MAINTENANCE_STAGE_TRANSITIONS.cancelled).toEqual(["assessment"]);
});
