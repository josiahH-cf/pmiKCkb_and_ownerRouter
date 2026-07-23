import { describe, expect, it } from "vitest";

import {
  ATTENTION_LANES,
  ATTENTION_LANE_META,
  attentionSeverityFromRenewal,
  meetsSeverityThreshold,
  toAttentionSignal,
} from "@/lib/attention/lanes";
import { buildStandingSignals } from "@/lib/attention/standing-signals";

describe("attention lane contract (S17 B3)", () => {
  it("exposes exactly the six closed lanes, each with all-clear copy", () => {
    expect([...ATTENTION_LANES]).toEqual([
      "decision",
      "connection",
      "coverage",
      "renewal",
      "review",
      "support",
    ]);
    for (const lane of ATTENTION_LANES) {
      expect(ATTENTION_LANE_META[lane].label.length).toBeGreaterThan(0);
      expect(ATTENTION_LANE_META[lane].allClear.length).toBeGreaterThan(0);
    }
  });

  // AC-S17-4: toAttentionSignal is the ONLY constructor and copies EXACTLY the six whitelisted keys, so
  // a value-bearing field smuggled into the input can never serialize onto a surface.
  it("copies only the six value-free keys, dropping any smuggled value-bearing field", () => {
    const signal = toAttentionSignal({
      lane: "renewal",
      severity: "high",
      label: "Current rent",
      detail: "Run 1",
      href: "/lease-renewal/runs/run-1",
      signalKey: "renewal:run-1:current_rent",
      // Smuggled value-bearing fields (not part of the input type, forced through):
      ...({
        address: "123 Main St",
        proposed_value: "$1,289",
        reason: "secret",
        field_key: "current_rent",
        reason_code: "data_entry_error",
        decider: "u-1",
      } as object),
    } as Parameters<typeof toAttentionSignal>[0]);

    expect(Object.keys(signal).sort()).toEqual([
      "detail",
      "href",
      "label",
      "lane",
      "severity",
      "signal_key",
    ]);
    const serialized = JSON.stringify(signal);
    for (const forbidden of [
      "123 Main St",
      "$1,289",
      "secret",
      "field_key",
      "reason_code",
      "decider",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("maps renewal severity onto the neutral scale and orders it", () => {
    expect(attentionSeverityFromRenewal("High")).toBe("high");
    expect(attentionSeverityFromRenewal("Blocked")).toBe("high");
    expect(attentionSeverityFromRenewal("Medium")).toBe("medium");
    expect(attentionSeverityFromRenewal("Low")).toBe("low");
    expect(meetsSeverityThreshold("high", "medium")).toBe(true);
    expect(meetsSeverityThreshold("low", "medium")).toBe(false);
    expect(meetsSeverityThreshold("medium", "medium")).toBe(true);
  });
});

describe("buildStandingSignals (S17 B2)", () => {
  it("stamps connection + coverage gaps with their lanes and value-free fields", () => {
    const signals = buildStandingSignals(
      [
        {
          label: "RentVine",
          detail: "Ready to connect",
          href: "/connections#connector-rentvine",
        },
      ],
      [{ label: "Owner Email", detail: "Needs a process", href: "/spaces/owner-email" }],
    );
    expect(signals.map((s) => s.lane)).toEqual(["connection", "coverage"]);
    expect(signals[0].signal_key).toBe("connection:/connections#connector-rentvine");
    expect(signals[1].signal_key).toBe("coverage:/spaces/owner-email");
    for (const signal of signals) {
      expect(ATTENTION_LANES).toContain(signal.lane);
    }
  });

  it("returns no signals when there are no gaps (all-clear)", () => {
    expect(buildStandingSignals([], [])).toEqual([]);
  });
});
