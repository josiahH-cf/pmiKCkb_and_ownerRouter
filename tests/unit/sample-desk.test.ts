import { describe, expect, it } from "vitest";

import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/tests/helpers/sample-desk";

describe("getRenewalDeskView", () => {
  it("classifies the sample batch into the expected dispositions", () => {
    const view = getRenewalDeskView();
    // S251 R-S251-10: "Section 8 Program" is housing assistance wording, a suggestion only, so
    // lease-915-pine-5 is a renewal target (before S251: actionable 3, skipped 1).
    expect(view.cohort.summary).toMatchObject({
      total: 7,
      actionable: 4,
      needsReview: 1,
      skipped: 0,
      periodicReview: 1,
      outOfWindow: 1,
    });
    expect(view.actionable).toHaveLength(4);
    expect(view.actionable.map((s) => s.id)).toContain("lease-915-pine-5");
    expect(
      view.cohort.classifications.find((lease) => lease.leaseId === "915-5")
        ?.housingAssistanceMention,
    ).toBe(true);
    expect(view.review).toHaveLength(1);
    expect(view.skipped).toHaveLength(0);
    expect(view.periodicReview).toHaveLength(1);
    expect(view.outOfWindow).toHaveLength(1);
  });

  it("surfaces the skip, periodic-review, and off-cycle review reasons as human labels", () => {
    const view = getRenewalDeskView();
    // S251: the sample has no program lease left; "Program lease" stays pinned by the S246
    // matrix (lease 112, "PadSplit program") and tests/unit/s251-housing-assistance.test.ts.
    expect(view.skipped.map((s) => s.reasonLabel)).toEqual([]);
    expect(view.periodicReview.map((s) => s.reasonLabel)).toEqual(["Month-to-month"]);
    expect(view.review[0].reasonLabel).toBe("Off-cycle end date");
    expect(view.outOfWindow[0].reasonLabel).toBe("Outside this window");
  });

  it("marks the data-conflict lease with an open conflict and a stage", () => {
    const view = getRenewalDeskView();
    const walnut = view.actionable.find((s) => s.id === "lease-1207-walnut-2");
    expect(walnut?.openConflicts).toBe(1);
    expect(walnut?.stageLabel).toBe("Verify renewal");
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
    // The illustrative decision may render a draft, but it cannot skip missing process evidence.
    expect(ws?.currentStepIndex).toBe(0);
    expect(ws?.process.steps).toHaveLength(6);
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

  it("surfaces an unconfirmed client timing policy without inventing a due date", () => {
    const ws = getRenewalLeaseWorkspace("lease-318-cedar-7", "2026-06-01");
    expect(ws?.notice).not.toBeNull();
    expect(ws?.notice?.statusLabel).toBe("Timing policy not confirmed");
    expect(ws?.notice?.lines).toEqual([
      expect.objectContaining({
        label: "Client timing policy",
        value: "Not confirmed",
      }),
    ]);
    expect(ws?.notice?.lines.some((line) => line.label === "Notice due by")).toBe(false);
  });
});
