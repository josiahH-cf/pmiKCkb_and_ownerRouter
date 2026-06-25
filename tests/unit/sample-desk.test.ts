import { describe, expect, it } from "vitest";

import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/sample-desk";

describe("getRenewalDeskView", () => {
  it("classifies the sample batch into the expected dispositions", () => {
    const view = getRenewalDeskView();
    expect(view.cohort.summary).toMatchObject({
      total: 7,
      actionable: 3,
      needsReview: 1,
      skipped: 2,
      outOfWindow: 1,
    });
    expect(view.actionable).toHaveLength(3);
    expect(view.review).toHaveLength(1);
    expect(view.skipped).toHaveLength(2);
    expect(view.outOfWindow).toHaveLength(1);
  });

  it("surfaces the skip reasons and an off-cycle review reason as human labels", () => {
    const view = getRenewalDeskView();
    expect(view.skipped.map((s) => s.reasonLabel).sort()).toEqual([
      "Month-to-month",
      "Program lease",
    ]);
    expect(view.review[0].reasonLabel).toBe("Off-cycle end date");
    expect(view.outOfWindow[0].reasonLabel).toBe("Outside this window");
  });

  it("marks the data-conflict lease with an open conflict and a stage", () => {
    const view = getRenewalDeskView();
    const walnut = view.actionable.find((s) => s.id === "lease-1207-walnut-2");
    expect(walnut?.openConflicts).toBe(1);
    expect(walnut?.stageLabel).toBe("Data check");
    const maple = view.actionable.find((s) => s.id === "lease-4821-maple-4");
    expect(maple?.openConflicts).toBe(0);
    expect(maple?.stageLabel).toBe("Owner decision");
  });

  it("is deterministic", () => {
    expect(getRenewalDeskView()).toEqual(getRenewalDeskView());
  });
});

describe("getRenewalLeaseWorkspace", () => {
  it("builds owner + tenant drafts and the readiness checklist for a decided lease", () => {
    const ws = getRenewalLeaseWorkspace("lease-318-cedar-7");
    expect(ws).not.toBeNull();
    expect(ws?.currentStepIndex).toBe(2);
    expect(ws?.ownerDraft.production_allowed).toBe(false);
    expect(ws?.tenantDraft).not.toBeNull();
    expect(ws?.tenantDraft?.send_allowed).toBe(false);
    expect(ws?.tenantDraft?.channels.text.body).toContain("$1,260");
    // Kansas City property → the city addendum check should flag.
    expect(ws?.readiness.flags.some((c) => c.id === "city_addendum")).toBe(true);
    expect(ws?.readiness.production_allowed).toBe(false);
  });

  it("withholds the tenant offer until the owner decides, and shows missing market inputs", () => {
    const ws = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    expect(ws?.currentStepIndex).toBe(0);
    expect(ws?.tenantDraft).toBeNull();
    expect(ws?.ownerDraft.missingInputs.length).toBeGreaterThan(0);
    expect(ws?.readiness.needsInput.length).toBeGreaterThan(0);
    expect(ws?.dataCheck.some((item) => item.agreement === "conflict")).toBe(true);
  });

  it("returns null for non-actionable and unknown leases", () => {
    expect(getRenewalLeaseWorkspace("lease-540-oak-3")).toBeNull();
    expect(getRenewalLeaseWorkspace("lease-77-birch-1")).toBeNull();
    expect(getRenewalLeaseWorkspace("does-not-exist")).toBeNull();
  });
});
