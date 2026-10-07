// Live connector verification for the Connection Center (S13 D1, decision 6). Runs the EXISTING
// read-only health-check transports (RentVine, Google Sheets) through `runHealthCheck` and reduces
// each run to one boolean per connector — the `verifiedIds` seam `buildConnectionView` has carried
// since Phase-2a. Cached in-process for ~10 minutes so automatic checks stay free-tier and a page
// render never fans out probes on every request.
//
// Server-only. Read-only probes, never a write. Every probe is non-fatal (an unconfigured or failing
// connector is simply not verified) and soft-timed-out so a stalled network call can never hang a
// page render. Only connector IDS leave this module — no values, no error bodies.

import { readDotloopOAuthConfig } from "@/lib/connections/dotloop-oauth";
import {
  readDotloopRuntimeReadiness,
  refreshDotloopResourceReadiness,
} from "@/lib/connections/dotloop-runtime";
import { createGoogleSheetsHealthCheckTransport } from "@/lib/google-sheets/health-probe";
import {
  getHealthCheckContract,
  runHealthCheck,
  type HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import { createRentVineHealthCheckTransport } from "@/lib/integrations/rentvine/health-probe";
import { createRentcastHealthCheckTransport } from "@/lib/lease-renewal/providers/rentcast-health-probe";
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
  /**
   * S106 (AC-S106-9): a connector whose verdict comes from its cached labeled observation on
   * ordinary renders. Only an explicit Admin check (`fresh`) contacts the provider.
   */
  cached?: {
    verdict(env: EnvLike): Promise<boolean>;
    fresh(env: EnvLike, actorUid: string): Promise<boolean>;
  };
  /** Its verdict is derived from provider API data, so AI context reads exclude it (S182). */
  providerDerived?: boolean;
}

function dotloopConfigured(env: EnvLike): boolean {
  return (
    readDotloopOAuthConfig(env).configured &&
    Boolean(env.CONNECTOR_SECRET_VAULT_PROJECT_ID?.trim())
  );
}

// The connectors with BUILT live read paths. Others join here as their clients are built.
const LIVE_PROBES: readonly LiveProbeDef[] = [
  {
    connectorId: "dotloop",
    contractId: "health.dotloop.oauth_app",
    buildTransport() {
      // Dotloop renders never probe live; see `cached`.
      return null;
    },
    cached: {
      async verdict(env) {
        if (!dotloopConfigured(env)) return false;
        const readiness = await readDotloopRuntimeReadiness(env);
        return (
          readiness.freshness?.stale === false &&
          readiness.state !== "unavailable" &&
          readiness.state !== "disconnected" &&
          readiness.state !== "refresh_needed"
        );
      },
      async fresh(env, actorUid) {
        if (!dotloopConfigured(env)) return false;
        const { observation } = await refreshDotloopResourceReadiness({ actorUid, env });
        return Boolean(
          observation &&
          observation.account &&
          observation.accountError === null &&
          observation.profilesError === null,
        );
      },
    },
    providerDerived: true,
  },
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
  // S59: the RentCast key probe. Cost-aware — the auth probe is an unbilled parameter error, so a
  // verification run never spends the monthly allowance.
  {
    connectorId: "rentcast",
    contractId: "health.rentcast.api_key",
    buildTransport(env) {
      const apiKey = env.RENTCAST_API_KEY?.trim();
      return apiKey ? createRentcastHealthCheckTransport({ apiKey }) : null;
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

async function probeOne(
  def: LiveProbeDef,
  env: EnvLike,
  mode: { fresh: false } | { fresh: true; actorUid: string } = { fresh: false },
): Promise<boolean> {
  try {
    if (def.cached) {
      return mode.fresh
        ? await def.cached.fresh(env, mode.actorUid)
        : await def.cached.verdict(env);
    }
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

/** Connector ids whose verdict is derived from provider API data (excluded from AI context). */
export const PROVIDER_DERIVED_VERIFICATION_IDS: readonly string[] = LIVE_PROBES.filter(
  (probe) => probe.providerDerived,
).map((probe) => probe.connectorId);

/**
 * S182: the verified set an AI context may use. Provider-derived verdicts (Dotloop) are removed
 * before they can reach a model, a saved answer or a reused history, and are never computed for it.
 */
export async function getVerifiedConnectorIdsForAiContext(
  env: EnvLike = process.env,
  now: number = Date.now(),
): Promise<ReadonlySet<string>> {
  if (cache && cache.expiresAt > now) {
    return new Set(
      [...cache.ids].filter((id) => !PROVIDER_DERIVED_VERIFICATION_IDS.includes(id)),
    );
  }
  const outcomes = await Promise.all(
    LIVE_PROBES.filter((def) => !def.providerDerived).map(
      async (def) => [def.connectorId, await probeOne(def, env)] as const,
    ),
  );
  return new Set(outcomes.filter(([, ok]) => ok).map(([id]) => id));
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
  actorUid = "connection-verification",
): Promise<VerifyConnectorResult> {
  const def = LIVE_PROBES.find((probe) => probe.connectorId === connectorId);
  if (!def) return { supported: false, verified: false };

  // A deliberate connector check must run exactly one probe. Reuse other connector verdicts only
  // while the shared cache is still valid; a cold or expired cache starts empty instead of fanning
  // out through getVerifiedConnectorIds before checking the selected connector.
  const validCache = cache && cache.expiresAt > now ? cache : null;
  const baseline = new Set(validCache?.ids ?? []);
  const verified = await probeOne(def, env, { fresh: true, actorUid });
  if (verified) {
    baseline.add(connectorId);
  } else {
    baseline.delete(connectorId);
  }
  cache = {
    ids: baseline,
    expiresAt: validCache?.expiresAt ?? now + VERIFICATION_TTL_MS,
  };
  return { supported: true, verified };
}
