import { describe, expect, it } from "vitest";

import {
  readRenewalAuxiliary,
  renewalAuxiliaryFailures,
  renewalAuxiliaryValue,
  unavailableRenewalAuxiliary,
} from "@/lib/lease-renewal/auxiliary-read";

describe("renewal auxiliary read states", () => {
  it("preserves a successful empty value as available instead of confusing it with failure", async () => {
    const result = await readRenewalAuxiliary("resolutions", async () => [] as string[]);
    expect(result).toEqual({ key: "resolutions", status: "available", value: [] });
    expect(renewalAuxiliaryValue(result, ["fallback"])).toEqual([]);
  });

  it("keeps durable Sheet effect status distinct from proposal-read availability", async () => {
    const failed = await readRenewalAuxiliary("sheet_effect_status", async () => {
      throw new Error("private execution-store detail");
    });
    expect(failed).toEqual({ key: "sheet_effect_status", status: "failed" });
    expect(renewalAuxiliaryValue(failed, null)).toBeNull();
  });

  it("classifies forbidden, unavailable, and failed reads without leaking messages", async () => {
    const forbidden = await readRenewalAuxiliary("progress", async () => {
      throw Object.assign(new Error("private identity"), { status: 403 });
    });
    const unavailable = await readRenewalAuxiliary("packet", async () => {
      throw Object.assign(new Error("private record"), { status: 404 });
    });
    const failed = await readRenewalAuxiliary("communications", async () => {
      throw new Error("private provider detail");
    });

    expect(forbidden).toEqual({ key: "progress", status: "forbidden" });
    expect(unavailable).toEqual({ key: "packet", status: "unavailable" });
    expect(failed).toEqual({ key: "communications", status: "failed" });
    expect(JSON.stringify([forbidden, unavailable, failed])).not.toMatch(/private/i);
  });

  it("returns only symbolic failed states and uses explicit fallbacks", () => {
    const missing = unavailableRenewalAuxiliary("sheet_proposal");
    expect(renewalAuxiliaryValue(missing, null)).toBeNull();
    expect(renewalAuxiliaryFailures([missing])).toEqual([
      { key: "sheet_proposal", status: "unavailable" },
    ]);
  });
});
