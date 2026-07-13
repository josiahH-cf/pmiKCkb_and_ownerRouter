import { describe, expect, it } from "vitest";

import { buildDecisionAttentionBacklog } from "@/lib/attention/decision-backlog";

describe("canonical decision attention projection", () => {
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
