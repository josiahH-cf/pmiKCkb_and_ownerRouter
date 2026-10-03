import { describe, expect, it } from "vitest";

import { ATTENTION_LANES, ATTENTION_SEVERITIES } from "@/lib/attention/lanes";
import {
  buildOrderedRenewalAttention,
  buildRenewalAttention,
} from "@/lib/lease-renewal/attention";
import {
  DEFAULT_RENEWAL_DESK_QUERY,
  applyRenewalDeskQuery,
  withRenewalDeskQueryKeys,
} from "@/lib/lease-renewal/desk-query";
import { getRenewalDeskView, type DeskLeaseSummary } from "@/tests/helpers/sample-desk";

function summary(overrides: Partial<DeskLeaseSummary>): DeskLeaseSummary {
  return withRenewalDeskQueryKeys({
    ...getRenewalDeskView().actionable[0],
    ...overrides,
  });
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
    // S157 BEH-7 (8a3f929d): a source difference is advisory; the headline names it as
    // something to review, never as a hold on continuing.
    expect(items[0].headline).toBe("1 source difference to review");
    expect(items[0].headline).not.toMatch(/resolve before|before you can continue/i);
    expect(items[0].actionLabel).toBe("Review differences");
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

  it("S157 BEH-7: words several source differences as items to review, with no hold on work", () => {
    const [item] = buildRenewalAttention([summary({ id: "diff", openConflicts: 2 })]);
    expect(item).toMatchObject({
      headline: "2 source differences to review",
      actionLabel: "Review differences",
      urgency: "high",
    });
    expect(item.headline).not.toMatch(/conflict|resolve|continue/i);
  });

  it("excludes progressing leases (past the owner decision, no conflict)", () => {
    const progressing = summary({ id: "prog", stageIndex: 3, openConflicts: 0 });
    expect(buildRenewalAttention([progressing])).toEqual([]);
  });

  it("returns an empty list when nothing is actionable", () => {
    expect(buildRenewalAttention([])).toEqual([]);
  });

  it("derives attention from the filtered canonical source without applying a second order", () => {
    const result = applyRenewalDeskQuery(getRenewalDeskView().items, {
      ...DEFAULT_RENEWAL_DESK_QUERY,
      sort: "tenant",
      direction: "desc",
    });
    const expectedIds = result.items
      .filter(
        (item) =>
          Boolean(item.followUp?.attention) ||
          item.openConflicts > 0 ||
          (item.stageIndex >= 0 && item.stageIndex <= 1),
      )
      .map((item) => item.id);

    expect(
      buildOrderedRenewalAttention(result.items).map((item) => item.leaseId),
    ).toEqual(expectedIds);

    const filtered = applyRenewalDeskQuery(getRenewalDeskView().items, {
      ...DEFAULT_RENEWAL_DESK_QUERY,
      q: "Maple",
    });
    expect(
      buildOrderedRenewalAttention(filtered.items).map((item) => item.leaseId),
    ).toEqual(["lease-4821-maple-4"]);
  });

  // AC-S17-4: the renewal fold speaks the shared attention contract — every item carries the `renewal`
  // lane and a neutral severity from the closed enums, so the desk uses the hub's + deck's vocabulary.
  it("stamps every item with the renewal lane and a neutral attention severity (AC-S17-4)", () => {
    const view = getRenewalDeskView();
    const items = buildRenewalAttention(view.actionable);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.lane).toBe("renewal");
      expect(ATTENTION_LANES).toContain(item.lane);
      expect(ATTENTION_SEVERITIES).toContain(item.severity);
      // urgency and severity agree: a high-urgency item is high severity.
      expect(item.severity).toBe(item.urgency === "high" ? "high" : "medium");
    }
  });
});
