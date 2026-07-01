import { describe, expect, it } from "vitest";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import type { RentVineClient } from "@/lib/integrations/rentvine/client";
import { RentVineAuthError } from "@/lib/integrations/rentvine/client";
import { loadLiveUnitCandidates } from "@/lib/maintenance/live-unit-source";

function clientReturning(rows: Record<string, unknown>[]): RentVineClient {
  return { listLeasesExport: async () => rows } as unknown as RentVineClient;
}

function clientThrowing(error: unknown): RentVineClient {
  return {
    listLeasesExport: async () => {
      throw error;
    },
  } as unknown as RentVineClient;
}

describe("buildLiveRentVineConfig", () => {
  const FULL = {
    RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
    RENTVINE_API_KEY: "key",
    RENTVINE_API_SECRET: "secret",
  };

  it("builds the RentVine client with no Sheets config required", () => {
    const config = buildLiveRentVineConfig(FULL);
    expect(config.ok).toBe(true);
  });

  it("reports not_configured when a RentVine value is missing", () => {
    expect(buildLiveRentVineConfig({ ...FULL, RENTVINE_API_SECRET: undefined })).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("reports account_mismatch for a non-pmikcmetro tenant", () => {
    expect(
      buildLiveRentVineConfig({
        ...FULL,
        RENTVINE_API_BASE_URL: "https://someoneelse.rentvine.com/api/manager",
      }),
    ).toEqual({ ok: false, reason: "account_mismatch" });
  });
});

describe("loadLiveUnitCandidates", () => {
  it("derives candidates from the live export", async () => {
    const outcome = await loadLiveUnitCandidates({
      ok: true,
      rentvineClient: clientReturning([
        { unit: { unitID: "456", streetNumber: "123", streetName: "Main Street" } },
      ]),
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.candidates).toEqual([
        { unitId: "unit:456", label: "123 Main Street" },
      ]);
    }
  });

  it("passes through the config reason when RentVine is not configured", async () => {
    expect(
      (await loadLiveUnitCandidates({ ok: false, reason: "not_configured" })).status,
    ).toBe("not_configured");
    expect(
      (await loadLiveUnitCandidates({ ok: false, reason: "account_mismatch" })).status,
    ).toBe("account_mismatch");
  });

  it("maps a RentVine auth failure to auth_error (no message leak)", async () => {
    const outcome = await loadLiveUnitCandidates({
      ok: true,
      rentvineClient: clientThrowing(new RentVineAuthError(401)),
    });
    expect(outcome.status).toBe("auth_error");
  });

  it("maps any other read failure to read_error", async () => {
    const outcome = await loadLiveUnitCandidates({
      ok: true,
      rentvineClient: clientThrowing(new Error("socket hang up")),
    });
    expect(outcome.status).toBe("read_error");
  });
});
