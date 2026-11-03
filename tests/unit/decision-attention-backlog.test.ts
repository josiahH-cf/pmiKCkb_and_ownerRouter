import { describe, expect, it } from "vitest";

import { buildDecisionAttentionBacklog } from "@/lib/attention/decision-backlog";

describe("canonical decision attention projection", () => {
  it("S238 A-06 preserves read completeness separately from the strict signal row shape", () => {
    const projection = buildDecisionAttentionBacklog({
      rows: [],
      counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
      readState: "partial",
      unavailableFeeds: ["renewal_reviews"],
      renewalReviewIssue: {
        code: "source_stale",
        message: "The renewal source is stale.",
        sourceReadAtIso: null,
        overlayUnavailable: false,
      },
    });
    expect(projection).toMatchObject({
      readState: "partial",
      unavailableFeeds: ["renewal_reviews"],
      renewalReviewIssue: { code: "source_stale" },
    });
    expect(projection.count).toBe(0);
    expect(projection.signals).toEqual([]);
  });
  it("uses the inbox total and copies exactly the six value-free signal keys", () => {
    const inbox = {
      rows: [
        {
          kind: "renewal_flag" as const,
          key: "renewal_flag:run-1:rent",
          label: "Current rent",
          detail: "Synthetic renewal run",
          severity: "High" as const,
          href: "/lease-renewal/runs/run-1",
          proposedValue: "$1,200",
          reason: "private",
          address: "not allowed",
        },
      ],
      counts: { total: 1, renewalFlags: 1, writebacksAwaiting: 0, queueItems: 0 },
    };

    const projection = buildDecisionAttentionBacklog(inbox);

    expect(projection.count).toBe(inbox.counts.total);
    expect(Object.keys(projection.signals[0]).sort()).toEqual([
      "detail",
      "href",
      "label",
      "lane",
      "severity",
      "signal_key",
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/\$1,200|private|not allowed/);
  });
});
