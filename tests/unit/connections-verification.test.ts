// S13 D1/D5 — live connector verification. Mocks the client factories + transports (no network);
// the contract runner (runHealthCheck) executes for real so the wiring is exercised end to end.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { buildLiveRentVineConfig, buildLiveRenewalConfig, rentvineOk, sheetsOk } =
  vi.hoisted(() => ({
    buildLiveRentVineConfig: vi.fn(),
    buildLiveRenewalConfig: vi.fn(),
    rentvineOk: { value: true },
    sheetsOk: { value: true },
  }));

vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig,
  buildLiveRenewalConfig,
}));
// The transports answer every contract step from the shared flags — flipping a flag simulates a
// failing live probe without any network.
vi.mock("@/lib/integrations/rentvine/health-probe", () => ({
  createRentVineHealthCheckTransport: () => ({
    probe: async () => ({ ok: rentvineOk.value, detail: "counts-only" }),
  }),
}));
vi.mock("@/lib/google-sheets/health-probe", () => ({
  createGoogleSheetsHealthCheckTransport: () => ({
    probe: async () => ({ ok: sheetsOk.value, detail: "counts-only" }),
  }),
}));

import {
  clearConnectorVerificationCache,
  getVerifiedConnectorIds,
  LIVE_VERIFIABLE_CONNECTOR_IDS,
  VERIFICATION_TTL_MS,
  verifyConnectorNow,
} from "@/lib/connections/verification";

const T0 = 1_000_000;

beforeEach(() => {
  clearConnectorVerificationCache();
  rentvineOk.value = true;
  sheetsOk.value = true;
  buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: {} });
  buildLiveRenewalConfig.mockReturnValue({
    ok: true,
    rentvineClient: {},
    sheetsReader: {},
    spreadsheetId: "sheet-1",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getVerifiedConnectorIds", () => {
  it("verifies both built connectors when their live probes pass", async () => {
    const ids = await getVerifiedConnectorIds({}, T0);
    expect([...ids].sort()).toEqual(["google_sheets", "rentvine"]);
    expect(LIVE_VERIFIABLE_CONNECTOR_IDS).toEqual(["rentvine", "google_sheets"]);
  });

  it("treats an unconfigured connector as unverified, never an error", async () => {
    buildLiveRentVineConfig.mockReturnValue({ ok: false, reason: "not_configured" });
    const ids = await getVerifiedConnectorIds({}, T0);
    expect([...ids]).toEqual(["google_sheets"]);
  });

  it("treats a failing probe as unverified", async () => {
    sheetsOk.value = false;
    const ids = await getVerifiedConnectorIds({}, T0);
    expect([...ids]).toEqual(["rentvine"]);
  });

  it("caches the verdict for ~10 minutes, then re-probes", async () => {
    await getVerifiedConnectorIds({}, T0);
    expect(buildLiveRentVineConfig).toHaveBeenCalledTimes(1);

    // Within the TTL: cached, no new probe.
    await getVerifiedConnectorIds({}, T0 + VERIFICATION_TTL_MS - 1);
    expect(buildLiveRentVineConfig).toHaveBeenCalledTimes(1);

    // Past the TTL: probes run again and pick up the new truth.
    rentvineOk.value = false;
    const ids = await getVerifiedConnectorIds({}, T0 + VERIFICATION_TTL_MS + 1);
    expect(buildLiveRentVineConfig).toHaveBeenCalledTimes(2);
    expect([...ids]).toEqual(["google_sheets"]);
  });
});

describe("verifyConnectorNow", () => {
  it("re-runs one probe fresh and folds the verdict into the cached set", async () => {
    await getVerifiedConnectorIds({}, T0); // cache: both verified

    rentvineOk.value = false; // the live truth changed
    const result = await verifyConnectorNow("rentvine", {}, T0 + 1);

    expect(result).toEqual({ supported: true, verified: false });
    // The shared cache agrees immediately; the other verdict is untouched.
    const ids = await getVerifiedConnectorIds({}, T0 + 2);
    expect([...ids]).toEqual(["google_sheets"]);
  });

  it("reports an unbuilt connector as unsupported", async () => {
    const result = await verifyConnectorNow("dotloop", {}, T0);
    expect(result).toEqual({ supported: false, verified: false });
  });
});
