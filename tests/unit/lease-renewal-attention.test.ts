import { describe, expect, it } from "vitest";

import { buildRenewalAttention } from "@/lib/lease-renewal/attention";
import {
  getRenewalDeskView,
  type DeskLeaseSummary,
} from "@/lib/lease-renewal/sample-desk";

function summary(overrides: Partial<DeskLeaseSummary>): DeskLeaseSummary {
  return {
    id: "lease-x",
    addressLabel: "1 Test St",
    tenantNameLabel: "Test household",
    endDateIso: "2026-09-30",
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Get the owner's rent decision",
    openConflicts: 0,
    ...overrides,
  };
}

describe("buildRenewalAttention", () => {
  it("surfaces only leases that need attention now, not every actionable lease", () => {
    const view = getRenewalDeskView();
    const items = buildRenewalAttention(view.actionable);

    // Progressing leases (past the owner decision, no conflict) are excluded, so the fold is a strict
    // subset of the actionable set and never re-lists the whole queue.
    expect(items.length).toBeLessThan(view.actionable.length);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.href).toBe(`/lease-renewal/lease/${item.leaseId}`);
      expect(item.actionLabel.length).toBeGreaterThan(0);
      expect(item.headline.length).toBeGreaterThan(0);
    }
  });

  it("leads with open source conflicts (high urgency) before awaited decisions", () => {
    const view = getRenewalDeskView();
    const items = buildRenewalAttention(view.actionable);

    expect(items[0].urgency).toBe("high");
    expect(items[0].headline).toMatch(/source conflict/);
    expect(items[0].actionLabel).toBe("Resolve conflicts");
    const ranks = items.map((item) => ({ high: 0, medium: 1 })[item.urgency]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("orders same-urgency leases by soonest end date, so a sooner lease never sorts below a later one", () => {
    const soon = summary({
      id: "soon",
      addressLabel: "Zed St",
      endDateIso: "2026-08-05",
    });
    const later = summary({
      id: "later",
      addressLabel: "Aardvark St",
      endDateIso: "2026-09-30",
    });
    // 'soon' has a later-alphabet address but the sooner deadline must still win.
    const items = buildRenewalAttention([later, soon]);
    expect(items.map((item) => item.leaseId)).toEqual(["soon", "later"]);
  });

  it("excludes progressing leases (past the owner decision, no conflict)", () => {
    const progressing = summary({ id: "prog", stageIndex: 3, openConflicts: 0 });
    expect(buildRenewalAttention([progressing])).toEqual([]);
  });

  it("returns an empty list when nothing is actionable", () => {
    expect(buildRenewalAttention([])).toEqual([]);
  });
});
