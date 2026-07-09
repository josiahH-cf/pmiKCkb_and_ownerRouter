import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_UNIT_CANDIDATES,
  UNIT_INDEX_TTL_MS,
  clearUnitIndexCache,
  getUnitIndex,
  searchUnits,
} from "@/lib/maintenance/unit-index";
import type { UnitSourceOutcome } from "@/lib/maintenance/live-unit-source";
import type { UnitCandidate } from "@/lib/maintenance/unit-matcher";

// Deps are injected (load + config + now) so these stay hermetic without module mocking, mirroring the
// connector-verification cache test.

const T0 = 1_000_000;

const CANDIDATES: UnitCandidate[] = [
  { unitId: "unit:100", label: "100 Birchwood Ln Unit A" },
  { unitId: "unit:220", label: "2200 Elmgrove Ave Unit 4" },
  { unitId: "unit:512", label: "512 Rosewood Ct" },
];

const liveConfig = { localDemoAuth: false };

beforeEach(() => {
  clearUnitIndexCache();
});

describe("getUnitIndex", () => {
  it("caches the ok outcome for the TTL, then re-probes", async () => {
    const load = vi.fn(
      async (): Promise<UnitSourceOutcome> => ({
        status: "ok",
        candidates: CANDIDATES,
        skipped: 0,
      }),
    );

    const first = await getUnitIndex({ load, config: liveConfig, now: T0 });
    expect(first).toEqual({ status: "ok", candidates: CANDIDATES });
    expect(load).toHaveBeenCalledTimes(1);

    // Within the TTL: cached, no new read.
    await getUnitIndex({ load, config: liveConfig, now: T0 + UNIT_INDEX_TTL_MS - 1 });
    expect(load).toHaveBeenCalledTimes(1);

    // Past the TTL: re-reads live.
    await getUnitIndex({ load, config: liveConfig, now: T0 + UNIT_INDEX_TTL_MS + 1 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches a failure outcome for the TTL too (no per-keystroke retry storm)", async () => {
    const load = vi.fn(
      async (): Promise<UnitSourceOutcome> => ({ status: "read_error" }),
    );
    const outcome = await getUnitIndex({ load, config: liveConfig, now: T0 });
    expect(outcome).toEqual({ status: "read_error" });
    await getUnitIndex({ load, config: liveConfig, now: T0 + 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("short-circuits to synthetic demo candidates under localDemoAuth (never reads live)", async () => {
    const load = vi.fn(async (): Promise<UnitSourceOutcome> => {
      throw new Error("load must not be called under demo auth");
    });
    const outcome = await getUnitIndex({
      load,
      config: { localDemoAuth: true },
      now: T0,
    });
    expect(outcome).toEqual({ status: "ok", candidates: [...DEMO_UNIT_CANDIDATES] });
    expect(load).not.toHaveBeenCalled();
  });
});

describe("searchUnits", () => {
  it("returns nothing for an empty query", () => {
    expect(searchUnits(CANDIDATES, "   ")).toEqual([]);
  });

  it("matches when every token is a substring of the label or id (case-insensitive)", () => {
    expect(searchUnits(CANDIDATES, "BIRCHWOOD").map((c) => c.unitId)).toEqual([
      "unit:100",
    ]);
    expect(searchUnits(CANDIDATES, "elmgrove 4").map((c) => c.unitId)).toEqual([
      "unit:220",
    ]);
    expect(searchUnits(CANDIDATES, "nowhere")).toEqual([]);
  });

  it("caps the result at the limit", () => {
    const many: UnitCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      unitId: `unit:${i}`,
      label: `Common Street ${i}`,
    }));
    expect(searchUnits(many, "common", 3)).toHaveLength(3);
  });
});
