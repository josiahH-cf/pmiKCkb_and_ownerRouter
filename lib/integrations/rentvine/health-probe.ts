// Real transport for the `health.rentvine.api_key` contract, backed by the read-only RentVineClient.
//
// Fills the four contract steps (config_presence, auth_validation, endpoint_probe, rate_limit_read)
// through the existing `runHealthCheck` injection seam — this module adds a transport, not a new
// contract. One lightweight `probeLeases({ limit: 1 })` call is memoized across the network steps so a
// health run makes at most one live request. Every `detail` string carries counts / header NAMES /
// status only — never lease PII, never the auth token.

import type {
  HealthCheckContract,
  HealthCheckProbeResult,
  HealthCheckStep,
  HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import type {
  RentVineClient,
  RentVineProbeResult,
} from "@/lib/integrations/rentvine/client";

const RATE_LIMIT_HEADER_RE = /(rate.?limit|ratelimit|retry.?after)/i;

/** Header names that look like rate-limit posture (names only; no secret values). */
export function rateLimitHeaderNames(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((name) => RATE_LIMIT_HEADER_RE.test(name))
    .sort();
}

export function createRentVineHealthCheckTransport(
  client: RentVineClient,
): HealthCheckTransport {
  let probe: Promise<RentVineProbeResult> | null = null;
  const getProbe = (): Promise<RentVineProbeResult> => {
    probe ??= client.probeLeases({ limit: 1 });
    return probe;
  };

  return {
    async probe(
      _contract: HealthCheckContract,
      step: HealthCheckStep,
    ): Promise<HealthCheckProbeResult> {
      switch (step.kind) {
        case "config_presence": {
          const identity = client.identitySummary();
          return { ok: true, detail: `Configured for Rentvine host ${identity.host}.` };
        }
        case "auth_validation": {
          const result = await getProbe();
          if (result.status === 0) {
            return {
              ok: false,
              detail: `Request did not complete: ${result.error ?? "network error"}.`,
            };
          }
          if (result.status === 401 || result.status === 403) {
            return { ok: false, detail: `Auth rejected (HTTP ${result.status}).` };
          }
          if (result.status < 200 || result.status >= 300) {
            return { ok: false, detail: `Unexpected response (HTTP ${result.status}).` };
          }
          return { ok: true, detail: `Authenticated read (HTTP ${result.status}).` };
        }
        case "endpoint_probe": {
          const result = await getProbe();
          if (result.count === null) {
            return {
              ok: false,
              detail: `Lease list did not parse (HTTP ${result.status}).`,
            };
          }
          return { ok: true, detail: `Lease list returned ${result.count} record(s).` };
        }
        case "rate_limit_read": {
          const result = await getProbe();
          const names = rateLimitHeaderNames(result.headers);
          return {
            ok: true,
            detail: names.length
              ? `Observed rate-limit headers: ${names.join(", ")}.`
              : "No rate-limit headers on the probe response (recorded).",
          };
        }
        default:
          return { ok: false, detail: `Unhandled health step kind: ${step.kind}.` };
      }
    },
  };
}
