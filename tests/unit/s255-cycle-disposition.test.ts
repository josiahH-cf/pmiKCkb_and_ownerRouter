import { describe, expect, it } from "vitest";
import {
  dispositionCycleFor,
  projectCycleDisposition,
  type CycleDispositionRecord,
} from "@/lib/lease-renewal/cycle-disposition";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";

const cycleId = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const source = { kind: "lease_end", dateIso: "2026-12-31" } as const;
const retirement: CycleDispositionRecord = {
  leaseId: "42",
  cycle: { ...source, cycleId: null },
  revision: 1,
  action: "retire",
  reason: "Inactive cycle confirmed by staff",
  actorUid: "staff-fixture",
  at: "2026-11-07T12:00:00.000Z",
  operationId: "0886c74f-bc92-476b-880c-615cb61217fc",
};

describe("S255 current-cycle disposition", () => {
  it("keeps a retirement when the first staff record gives its cycle an id", () => {
    const work = emptyRenewalWorkspace("42", cycleId, {
      ...source,
      source: "RentVine lease end",
    });
    const cycle = dispositionCycleFor(source, work);
    expect(cycle).toEqual({ ...source, cycleId });
    expect(projectCycleDisposition(retirement, cycle, work.revision).state).toBe(
      "retired",
    );
  });

  it("keeps the same disposition after an earlier correction but leaves a later cycle eligible", () => {
    const earlier = { ...source, dateIso: "2026-12-01", cycleId: null };
    const later = { ...source, dateIso: "2027-12-31", cycleId: null };
    expect(projectCycleDisposition(retirement, earlier, 0).state).toBe("retired");
    expect(projectCycleDisposition(retirement, later, 0).state).toBe("active");
  });

  it("holds an unreadable disposition and cannot assume a new cycle from a missing date", () => {
    expect(projectCycleDisposition(undefined, { ...source, cycleId }, 0).state).toBe(
      "unavailable",
    );
    expect(projectCycleDisposition(retirement, null, 0).state).toBe("unavailable");
    expect(projectCycleDisposition(null, null, 0).state).toBe("active");
  });

  it("preserves explicit work on a prior cycle only while that choice remains current", () => {
    const work = emptyRenewalWorkspace("42", cycleId, {
      ...source,
      source: "RentVine lease end",
    });
    const later = { ...source, dateIso: "2027-12-31" };
    expect(dispositionCycleFor(later, work, true)).toEqual({ ...source, cycleId });
    expect(dispositionCycleFor(later, work)).toEqual({ ...later, cycleId: null });
  });
});
