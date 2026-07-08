import { describe, expect, it } from "vitest";

import { buildRenewalAttention } from "@/lib/lease-renewal/attention";
import { getRenewalDeskView } from "@/lib/lease-renewal/sample-desk";

describe("buildRenewalAttention", () => {
  it("produces one attention item per actionable lease, deep-linked to its workspace", () => {
    const view = getRenewalDeskView();
    const items = buildRenewalAttention(view.actionable);

    expect(items).toHaveLength(view.actionable.length);
    for (const item of items) {
      expect(item.href).toBe(`/lease-renewal/lease/${item.leaseId}`);
      expect(item.actionLabel.length).toBeGreaterThan(0);
      expect(item.headline.length).toBeGreaterThan(0);
    }
  });

  it("leads with open source conflicts (high urgency) before other work", () => {
    const view = getRenewalDeskView();
    const items = buildRenewalAttention(view.actionable);

    expect(items[0].urgency).toBe("high");
    expect(items[0].headline).toMatch(/source conflict/);
    expect(items[0].actionLabel).toBe("Resolve conflicts");
    // Urgency never increases as you go down the list (stable most-attention-first order).
    const ranks = items.map((item) => ({ high: 0, medium: 1, low: 2 })[item.urgency]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("returns an empty list when nothing is actionable", () => {
    expect(buildRenewalAttention([])).toEqual([]);
  });
});
