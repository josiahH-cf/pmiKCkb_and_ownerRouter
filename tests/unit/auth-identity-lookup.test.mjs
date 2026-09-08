import { describe, expect, it, vi } from "vitest";
import { probeAdc, readPrincipal } from "../../scripts/auth/ensure.mjs";
import { assessCredentials, exitCodeFor } from "../../scripts/auth/plan.mjs";
import { resolveIdentities } from "../../scripts/auth/identities.mjs";

const owner = "josiah@pmikcmetro.com";
const token = "fixture-opaque-token";
const inspect = () => ({ present: true, principal: owner, credentials: {} });
const createClient = async () => ({ getAccessToken: async () => ({ token }) });

describe("Google identity lookup after verified ADC enrollment", () => {
  it.each([503, 429])(
    "retries transient HTTP %s once before accepting the exact identity",
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ email: owner }) });
      expect(await readPrincipal(token, fetchImpl, 2_000)).toBe(owner);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps the enrolled identity but refuses readiness after bounded network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fixture-private-provider-body");
    });
    const adc = await probeAdc(
      {},
      { inspect, createClient, fetchImpl, timeoutMs: 2_000 },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(adc).toMatchObject({
      principal: owner,
      fresh: false,
      errorKind: "identity_probe_unavailable",
    });
    expect(JSON.stringify(adc)).not.toContain("fixture-");
    const assessed = assessCredentials(
      { platform: "linux", wsl: true, adc },
      {
        identities: resolveIdentities({}),
        need: ["adc"],
        unattended: true,
      },
    );
    expect(exitCodeFor(assessed.items)).not.toBe(0);
    const item = assessed.items.find((entry) => entry.credential === "adc");
    expect(item.code).toBe("identity_probe_unavailable");
    expect(item.humanStep).toBe("npm run auth:ensure -- --unattended");
    expect(JSON.stringify(item)).not.toContain("enroll");
  });

  it("does not retry or accept an actual different Google identity", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ email: "someone@gmail.com" }),
    }));
    const adc = await probeAdc({}, { inspect, createClient, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(adc).toMatchObject({
      principal: "someone@gmail.com",
      fresh: false,
      errorKind: "principal_mismatch",
    });
  });

  it("does not treat a missing email claim as a verified identity", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    await expect(readPrincipal(token, fetchImpl, 2_000)).rejects.toThrow(
      "identity_probe_unavailable",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not repeat a non-transient identity endpoint rejection", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }));
    await expect(readPrincipal(token, fetchImpl, 2_000)).rejects.toThrow(
      "identity_probe_unavailable",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
