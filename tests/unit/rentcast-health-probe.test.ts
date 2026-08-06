// AC-S59-10: the RentCast health transport reports authentication and rate limit as OBSERVED
// values, and its probe is cost-aware — one memoized parameterless AVM request that a valid key
// answers with an UNBILLED 4xx.

import { describe, expect, it, vi } from "vitest";

import { getHealthCheckContract, runHealthCheck } from "@/lib/integrations/health-checks";
import {
  createRentcastHealthCheckTransport,
  type RentcastProbeTransport,
} from "@/lib/lease-renewal/providers/rentcast-health-probe";

const CONTRACT = getHealthCheckContract("health.rentcast.api_key")!;

function stub(response: {
  status: number;
  headers?: Record<string, string>;
  error?: string;
}): { transport: RentcastProbeTransport; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async () => ({
    status: response.status,
    headers: response.headers ?? {},
    ...(response.error ? { error: response.error } : {}),
  }));
  return { transport: { get }, get };
}

describe("createRentcastHealthCheckTransport", () => {
  it("passes all four steps on an unbilled 400 with observed rate-limit headers, in ONE request", async () => {
    const { transport, get } = stub({
      status: 400,
      headers: { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "19" },
    });
    const run = await runHealthCheck(
      CONTRACT,
      createRentcastHealthCheckTransport({ apiKey: "k" }, { transport }),
    );
    expect(run.ok).toBe(true);
    const byId = Object.fromEntries(run.steps.map((s) => [s.step_id, s]));
    expect(byId["rentcast.auth"].detail).toContain("HTTP 400");
    expect(byId["rentcast.rate_limit"].detail).toContain("x-ratelimit-limit");
    // Cost control: the whole run makes exactly one probe request.
    expect(get).toHaveBeenCalledTimes(1);
    // No secret in any detail string.
    expect(JSON.stringify(run)).not.toContain('"k"');
  });

  it("fails auth on 401 and marks later steps not attempted", async () => {
    const { transport } = stub({ status: 401 });
    const run = await runHealthCheck(
      CONTRACT,
      createRentcastHealthCheckTransport({ apiKey: "bad" }, { transport }),
    );
    expect(run.ok).toBe(false);
    const byId = Object.fromEntries(run.steps.map((s) => [s.step_id, s]));
    expect(byId["rentcast.auth"].ok).toBe(false);
    expect(byId["rentcast.auth"].detail).toContain("401");
    expect(byId["rentcast.rate_limit"].detail).toBe("not attempted");
  });

  it("fails config_presence with no key and never probes", async () => {
    const { transport, get } = stub({ status: 400 });
    const run = await runHealthCheck(
      CONTRACT,
      createRentcastHealthCheckTransport({}, { transport }),
    );
    expect(run.ok).toBe(false);
    expect(run.steps[0]).toMatchObject({ step_id: "rentcast.config", ok: false });
    expect(get).not.toHaveBeenCalled();
  });

  it("records the absence of rate-limit headers as an observation, not a failure", async () => {
    const { transport } = stub({ status: 404, headers: {} });
    const run = await runHealthCheck(
      CONTRACT,
      createRentcastHealthCheckTransport({ apiKey: "k" }, { transport }),
    );
    const byId = Object.fromEntries(run.steps.map((s) => [s.step_id, s]));
    expect(byId["rentcast.rate_limit"].ok).toBe(true);
    expect(byId["rentcast.rate_limit"].detail).toContain("No rate-limit headers");
  });

  it("reports an unreachable endpoint as a failure with the error name only", async () => {
    const { transport } = stub({ status: 0, error: "AbortError" });
    const run = await runHealthCheck(
      CONTRACT,
      createRentcastHealthCheckTransport({ apiKey: "k" }, { transport }),
    );
    expect(run.ok).toBe(false);
    const byId = Object.fromEntries(run.steps.map((s) => [s.step_id, s]));
    expect(byId["rentcast.auth"].detail).toContain("AbortError");
  });
});
