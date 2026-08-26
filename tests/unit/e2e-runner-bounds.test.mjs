import { describe, expect, it } from "vitest";

import { resolveE2eTimeouts } from "@/scripts/run-e2e-tests.mjs";

describe("e2e runner safety bounds", () => {
  it("always supplies finite defaults", () => {
    expect(resolveE2eTimeouts({})).toEqual({ runMs: 600_000, probeMs: 90_000 });
  });

  it("accepts smaller explicit bounds and refuses unbounded or malformed values", () => {
    expect(
      resolveE2eTimeouts({ E2E_RUN_TIMEOUT_MS: "120000", E2E_PROBE_TIMEOUT_MS: "30000" }),
    ).toEqual({ runMs: 120_000, probeMs: 30_000 });

    for (const env of [
      { E2E_RUN_TIMEOUT_MS: "0" },
      { E2E_RUN_TIMEOUT_MS: "900001" },
      { E2E_PROBE_TIMEOUT_MS: "unbounded" },
    ]) {
      expect(() => resolveE2eTimeouts(env)).toThrow(/positive integer/);
    }
  });
});
