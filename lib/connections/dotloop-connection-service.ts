// S106: the one server-owned Dotloop connection service.
//
// It owns beginning an authorization, completing the callback, and the health-check transport. It
// stores access and refresh tokens ONLY as opaque `ConnectorSecretVault` refs, never returns a token
// to a caller, never logs one, and never places one in a URL. A denial, a callback error, a forged
// or replayed `state`, or unconfigured secure storage all end without a connection record.
//
// Disconnect and reconnect deliberately stay on the existing S96 lifecycle
// (`claimRevocation`/`completeRevocation` plus `revokeDotloopConnection`), so this module adds no
// second revocation scheme.

import {
  DOTLOOP_OAUTH_TOKEN_URL,
  buildDotloopAuthorizeUrl,
  readDotloopOAuthConfig,
  type DotloopOAuthConfig,
  type DotloopTokenSet,
} from "@/lib/connections/dotloop-oauth";
import type { ConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  DOTLOOP_SCOPES,
  DotloopClient,
  DotloopClientError,
  type DotloopHttpTransport,
} from "@/lib/integrations/dotloop/client";
import type {
  HealthCheckContract,
  HealthCheckProbeResult,
  HealthCheckStep,
  HealthCheckTransport,
} from "@/lib/integrations/health-checks";

export const DOTLOOP_CONNECTOR_ID = "dotloop";

/** Single-use CSRF state storage. The route supplies a Firestore-backed implementation. */
export interface DotloopOAuthStateStore {
  mint(input: { state: string; actorUid: string; nowIso: string }): Promise<void>;
  /** Returns the minting actor once and only once; a forged or replayed state returns null. */
  consume(input: { state: string; nowIso: string }): Promise<{ actorUid: string } | null>;
}

/** The exact connector-store capability this service needs; the Firestore store satisfies it. */
export interface DotloopConnectionRecorder {
  createConnectedConnection(input: {
    connectorId: string;
    method: "oauth";
    secretRef: string;
    connectedByUid: string;
    connectedAt: string;
    generationId: string;
  }): Promise<unknown>;
}

export type BeginDotloopConnectionResult =
  | { status: "authorize_url"; authorizeUrl: string; state: string }
  | { status: "credentials_not_configured"; missing: string[] };

export interface BeginDotloopConnectionInput {
  readonly actorUid: string;
  readonly nowIso: string;
  readonly states: DotloopOAuthStateStore;
  readonly env?: Record<string, string | undefined>;
  /** Injected only so tests are deterministic; production mints a random UUID. */
  readonly stateValue?: string;
}

/** Mint one single-use state and return the documented authorize URL. No token is involved yet. */
export async function beginDotloopConnection(
  input: BeginDotloopConnectionInput,
): Promise<BeginDotloopConnectionResult> {
  const config = readDotloopOAuthConfig(input.env ?? process.env);
  if (!config.configured) {
    return { status: "credentials_not_configured", missing: config.missing };
  }
  const state = input.stateValue ?? crypto.randomUUID();
  await input.states.mint({ state, actorUid: input.actorUid, nowIso: input.nowIso });
  return {
    status: "authorize_url",
    state,
    authorizeUrl: buildDotloopAuthorizeUrl({
      clientId: config.config.clientId,
      redirectUri: config.config.redirectUri,
      state,
      scope: DOTLOOP_SCOPES.join(" "),
    }),
  };
}

export type CompleteDotloopConnectionResult =
  | { status: "connected"; generationId: string }
  | { status: "invalid_state" }
  | { status: "authorization_denied"; providerError: string }
  | { status: "exchange_failed" }
  | { status: "secure_storage_unavailable" }
  | { status: "credentials_not_configured"; missing: string[] };

export interface CompleteDotloopConnectionInput {
  readonly state: string;
  readonly code?: string;
  /** The provider's `error` query value on a denial or callback error. */
  readonly providerError?: string;
  readonly nowIso: string;
  readonly generationId: string;
  readonly states: DotloopOAuthStateStore;
  readonly connections: DotloopConnectionRecorder;
  readonly vault: ConnectorSecretVault;
  readonly exchanger: DotloopTokenExchangeSeam;
  readonly env?: Record<string, string | undefined>;
  /** Defaults to the process environment; an explicit descriptor keeps tests deterministic. */
  readonly descriptor?: EnvironmentDescriptor;
}

/** The exchange seam this service depends on; `LiveDotloopTokenExchanger` implements it. */
export interface DotloopTokenExchangeSeam {
  exchangeCode(input: {
    code: string;
    config: DotloopOAuthConfig;
    vault: ConnectorSecretVault;
  }): Promise<DotloopTokenSet>;
}

/**
 * Complete one authorization callback. The state is consumed first, so a forged or replayed value
 * can never reach the provider or create a connection.
 */
export async function completeDotloopConnection(
  input: CompleteDotloopConnectionInput,
): Promise<CompleteDotloopConnectionResult> {
  // This callback exchanges a code with the provider and writes a connection record, so it is a
  // Live provider action even though the protocol delivers it as a GET. Local rehearsal
  // (Live-read-only) must refuse it outright rather than reaching Dotloop.
  assertLiveProviderActionAllowed(
    input.descriptor ?? requireEnvironmentDescriptor(input.env ?? process.env),
  );
  const claimed = await input.states.consume({
    state: input.state,
    nowIso: input.nowIso,
  });
  if (!claimed) return { status: "invalid_state" };

  if (input.providerError) {
    return { status: "authorization_denied", providerError: input.providerError };
  }
  const config = readDotloopOAuthConfig(input.env ?? process.env);
  if (!config.configured) {
    return { status: "credentials_not_configured", missing: config.missing };
  }
  if ((await input.vault.capability()) !== "configured") {
    return { status: "secure_storage_unavailable" };
  }
  if (!input.code) return { status: "exchange_failed" };

  let tokens: DotloopTokenSet;
  try {
    tokens = await input.exchanger.exchangeCode({
      code: input.code,
      config: config.config,
      vault: input.vault,
    });
  } catch {
    // The provider's error body is deliberately not carried: it can contain credential material.
    return { status: "exchange_failed" };
  }
  if (!tokens.accessTokenRef) return { status: "secure_storage_unavailable" };

  await input.connections.createConnectedConnection({
    connectorId: DOTLOOP_CONNECTOR_ID,
    method: "oauth",
    secretRef: tokens.accessTokenRef,
    connectedByUid: claimed.actorUid,
    connectedAt: input.nowIso,
    generationId: input.generationId,
  });
  return { status: "connected", generationId: input.generationId };
}

/**
 * The live token exchanger. It posts the documented `authorization_code` grant server-side and hands
 * both tokens straight to the vault, so no token value survives in this process beyond the call.
 */
export class LiveDotloopTokenExchanger implements DotloopTokenExchangeSeam {
  readonly #transport: DotloopHttpTransport;

  constructor(deps: { transport: DotloopHttpTransport }) {
    this.#transport = deps.transport;
  }

  async exchangeCode(input: {
    code: string;
    config: DotloopOAuthConfig;
    vault: ConnectorSecretVault;
  }): Promise<DotloopTokenSet> {
    if (!input.config.clientSecret) {
      throw new Error("The Dotloop client secret is not configured.");
    }
    const response = await this.#transport.fetch({
      url: DOTLOOP_OAUTH_TOKEN_URL,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.config.redirectUri,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
      }).toString(),
    });
    if (response.status !== 200) {
      throw new Error("Dotloop refused the authorization code exchange.");
    }
    const body = (await response.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    const access = typeof body.access_token === "string" ? body.access_token : "";
    if (access === "") throw new Error("Dotloop returned no access token.");
    const stored = await input.vault.storeSecret({
      connectorId: DOTLOOP_CONNECTOR_ID,
      secret: access,
    });
    if (!stored.ok) throw new Error("Secure credential storage is not configured.");

    const tokenSet: DotloopTokenSet = { accessTokenRef: stored.secretRef };
    if (typeof body.refresh_token === "string" && body.refresh_token !== "") {
      const refresh = await input.vault.storeSecret({
        connectorId: DOTLOOP_CONNECTOR_ID,
        secret: body.refresh_token,
      });
      if (!refresh.ok) throw new Error("Secure credential storage is not configured.");
      tokenSet.refreshTokenRef = refresh.secretRef;
    }
    if (typeof body.expires_in === "number" && Number.isFinite(body.expires_in)) {
      tokenSet.expiresInSeconds = body.expires_in;
    }
    return tokenSet;
  }
}

/**
 * Wire the `health.dotloop.oauth_app` contract to the real client so the Connection Center reports
 * configuration, authorization, the profile probe, and subscription readability truthfully.
 */
export function dotloopHealthCheckTransport(deps: {
  readonly client: DotloopClient;
  readonly env?: Record<string, string | undefined>;
}): HealthCheckTransport {
  return {
    async probe(
      _contract: HealthCheckContract,
      step: HealthCheckStep,
    ): Promise<HealthCheckProbeResult> {
      switch (step.id) {
        case "dotloop.config": {
          const config = readDotloopOAuthConfig(deps.env ?? process.env);
          return config.configured
            ? { ok: true, detail: "Application credentials are configured." }
            : {
                ok: false,
                detail: `Missing configuration: ${config.missing.join(", ")}.`,
              };
        }
        case "dotloop.auth": {
          try {
            await deps.client.getAccount();
            return { ok: true, detail: "An authenticated account read succeeded." };
          } catch (error) {
            return { ok: false, detail: probeDetail(error) };
          }
        }
        case "dotloop.probe": {
          try {
            const profiles = await deps.client.listProfiles();
            return {
              ok: profiles.length > 0,
              detail:
                profiles.length > 0
                  ? "A profile read answered."
                  : "The profile read returned no profile.",
            };
          } catch (error) {
            return { ok: false, detail: probeDetail(error) };
          }
        }
        case "dotloop.webhooks": {
          const readable = await deps.client.readSubscriptionsAvailable();
          return {
            ok: readable,
            detail: readable
              ? "Subscriptions are readable."
              : "Subscriptions are not readable; loops and documents stay usable.",
          };
        }
        default:
          return { ok: false, detail: "Unknown Dotloop health step." };
      }
    },
  };
}

function probeDetail(error: unknown): string {
  if (error instanceof DotloopClientError) {
    return error.kind === "refresh_needed"
      ? "The Dotloop token needs reconnection."
      : `Dotloop did not answer this read (${error.kind}).`;
  }
  return "Dotloop did not answer this read.";
}
