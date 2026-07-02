// Live connector verification for the Connection Center (S13 D1, decision 6). Runs the EXISTING
// read-only health-check transports (RentVine, Google Sheets) through `runHealthCheck` and reduces
// each run to one boolean per connector — the `verifiedIds` seam `buildConnectionView` has carried
// since Phase-2a. Cached in-process for ~10 minutes so automatic checks stay free-tier and a page
// render never fans out probes on every request.
//
// Server-only. Read-only probes, never a write. Every probe is non-fatal (an unconfigured or failing
// connector is simply not verified) and soft-timed-out so a stalled network call can never hang a
// page render. Only connector IDS leave this module — no values, no error bodies.

import { createGoogleSheetsHealthCheckTransport } from "@/lib/google-sheets/health-probe";
import {
  getHealthCheckContract,
  runHealthCheck,
  type HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import { createRentVineHealthCheckTransport } from "@/lib/integrations/rentvine/health-probe";
import {
  buildLiveRentVineConfig,
  buildLiveRenewalConfig,
} from "@/lib/lease-renewal/live-config";

export const VERIFICATION_TTL_MS = 10 * 60 * 1000;

/** A single live probe may not hold a render longer than this. */
const PROBE_TIMEOUT_MS = 5_000;

type EnvLike = Record<string, string | undefined>;

interface LiveProbeDef {
  connectorId: string;
  contractId: string;
  /** Null when the connector is not (fully) configured — then there is nothing to verify. */
  buildTransport(env: EnvLike): HealthCheckTransport | null;
}

// The two connectors with BUILT live read paths. Others join here as their clients are built.
const LIVE_PROBES: readonly LiveProbeDef[] = [
  {
    connectorId: "rentvine",
    contractId: "health.rentvine.api_key",
    buildTransport(env) {
      const config = buildLiveRentVineConfig(env);
      return config.ok ? createRentVineHealthCheckTransport(config.rentvineClient) : null;
    },
  },
  {
    connectorId: "google_sheets",
    contractId: "health.google_sheets.api",
    buildTransport(env) {
      const config = buildLiveRenewalConfig(env);
      return config.ok
        ? createGoogleSheetsHealthCheckTransport(
            config.sheetsReader,
            config.spreadsheetId,
          )
        : null;
    },
  },
];

/** Connector ids an Admin can trigger a fresh live verification for (S13 D5). */
export const LIVE_VERIFIABLE_CONNECTOR_IDS: readonly string[] = LIVE_PROBES.map(
  (probe) => probe.connectorId,
);

let cache: { ids: ReadonlySet<string>; expiresAt: number } | null = null;

/** Test seam: drop the in-process cache. */
export function clearConnectorVerificationCache(): void {
  cache = null;
}

async function probeOne(def: LiveProbeDef, env: EnvLike): Promise<boolean> {
  try {
    const transport = def.buildTransport(env);
    if (!transport) return false;
    const contract = getHealthCheckContract(def.contractId);
    if (!contract) return false;

    const run = runHealthCheck(contract, transport).then((result) => result.ok);
    const timeout = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), PROBE_TIMEOUT_MS),
    );
    return await Promise.race([run, timeout]);
  } catch {
    return false;
  }
}

/**
 * The set of connector ids whose live read-only probe passed, cached for ~10 minutes. Runs for every
 * role (non-Admins see the same read-only truth — decision 6). Never throws.
 */
export async function getVerifiedConnectorIds(
  env: EnvLike = process.env,
  now: number = Date.now(),
): Promise<ReadonlySet<string>> {
  if (cache && cache.expiresAt > now) return cache.ids;

  const outcomes = await Promise.all(
    LIVE_PROBES.map(async (def) => [def.connectorId, await probeOne(def, env)] as const),
  );
  const ids: ReadonlySet<string> = new Set(
    outcomes.filter(([, ok]) => ok).map(([id]) => id),
  );
  cache = { ids, expiresAt: now + VERIFICATION_TTL_MS };
  return ids;
}

export interface VerifyConnectorResult {
  /** False when this connector has no built live probe yet. */
  supported: boolean;
  verified: boolean;
}

/**
 * Run ONE connector's probe fresh (Admin "Verify connection" — S13 D5), bypassing its cached
 * verdict, and fold the result back into the cached set so every surface agrees immediately.
 */
export async function verifyConnectorNow(
  connectorId: string,
  env: EnvLike = process.env,
  now: number = Date.now(),
): Promise<VerifyConnectorResult> {
  const def = LIVE_PROBES.find((probe) => probe.connectorId === connectorId);
  if (!def) return { supported: false, verified: false };

  // Refresh the baseline first (no-op when cached), then overlay this connector's fresh verdict,
  // keeping the baseline's expiry so the other verdicts age on their own clock.
  const baseline = new Set(await getVerifiedConnectorIds(env, now));
  const verified = await probeOne(def, env);
  if (verified) {
    baseline.add(connectorId);
  } else {
    baseline.delete(connectorId);
  }
  cache = { ids: baseline, expiresAt: cache?.expiresAt ?? now + VERIFICATION_TTL_MS };
  return { supported: true, verified };
}
