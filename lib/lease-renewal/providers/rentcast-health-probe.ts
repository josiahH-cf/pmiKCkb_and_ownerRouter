// Real transport for the `health.rentcast.api_key` contract (AC-S59-10), reporting authentication
// and rate limit as OBSERVED values rather than contract metadata.
//
// Cost-aware by construction: the single memoized probe calls the AVM endpoint with NO address, so
// a valid key produces a 4xx parameter error — which RentCast does NOT bill (only a 2xx with a body
// is billable) — while a bad key produces 401/403. Authentication is proven without spending a
// request from the monthly allowance. Every detail string carries status codes and header NAMES
// only; never the key, never an address.

import type {
  HealthCheckContract,
  HealthCheckProbeResult,
  HealthCheckStep,
  HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import { RENTCAST_AVM_URL } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

const RATE_LIMIT_HEADER_RE = /(rate.?limit|ratelimit|retry.?after)/i;

export interface RentcastProbeResponse {
  status: number;
  /** Lowercased header names → values. Values are never printed; names only. */
  headers: Record<string, string>;
  error?: string;
}

export interface RentcastProbeTransport {
  get(url: string, headers: Record<string, string>): Promise<RentcastProbeResponse>;
}

function createFetchProbeTransport(timeoutMs = 15_000): RentcastProbeTransport {
  return {
    async get(url, headers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        const collected: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          collected[key.toLowerCase()] = value;
        });
        return { status: response.status, headers: collected };
      } catch (error) {
        return {
          status: 0,
          headers: {},
          error: error instanceof Error ? error.name : String(error),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function createRentcastHealthCheckTransport(
  config: { apiKey?: string },
  options: { transport?: RentcastProbeTransport } = {},
): HealthCheckTransport {
  const transport = options.transport ?? createFetchProbeTransport();
  let probe: Promise<RentcastProbeResponse> | null = null;
  const getProbe = (): Promise<RentcastProbeResponse> => {
    // Deliberately parameterless: a valid key answers 4xx (unbilled), a bad key 401/403.
    probe ??= transport.get(RENTCAST_AVM_URL, {
      "X-Api-Key": config.apiKey?.trim() ?? "",
      accept: "application/json",
    });
    return probe;
  };

  return {
    async probe(
      _contract: HealthCheckContract,
      step: HealthCheckStep,
    ): Promise<HealthCheckProbeResult> {
      switch (step.kind) {
        case "config_presence": {
          const present = Boolean(config.apiKey?.trim());
          return present
            ? { ok: true, detail: "RENTCAST_API_KEY is configured (value not shown)." }
            : { ok: false, detail: "RENTCAST_API_KEY is not configured." };
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
          return {
            ok: true,
            detail: `Key accepted; unbilled parameter probe answered HTTP ${result.status}.`,
          };
        }
        case "endpoint_probe": {
          const result = await getProbe();
          if (result.status === 0) {
            return {
              ok: false,
              detail: `Endpoint unreachable: ${result.error ?? "network error"}.`,
            };
          }
          return {
            ok: true,
            detail: `AVM endpoint answered HTTP ${result.status} (no billable body requested).`,
          };
        }
        case "rate_limit_read": {
          const result = await getProbe();
          const names = Object.keys(result.headers)
            .filter((name) => RATE_LIMIT_HEADER_RE.test(name))
            .sort();
          return {
            ok: true,
            detail: names.length
              ? `Observed rate-limit headers: ${names.join(", ")}.`
              : "No rate-limit headers on the probe response (recorded as observed; the documented limit is 20 requests per second).",
          };
        }
        default:
          return { ok: false, detail: `Unhandled health step kind: ${step.kind}.` };
      }
    },
  };
}
