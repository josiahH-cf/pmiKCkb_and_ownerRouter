import { randomUUID } from "node:crypto";

import type {
  ConnectorConnectionRecord,
  ConnectorConnectedRecord,
} from "@/lib/connections/connector-connection";
import {
  resolveConnectorSecretVault,
  type ConnectorSecretVault,
} from "@/lib/connections/connector-secret-vault";
import {
  buildDotloopTokenRequest,
  readDotloopOAuthConfig,
  type DotloopOAuthConfig,
} from "@/lib/connections/dotloop-oauth";
import {
  isSupportedDotloopProfileType,
  projectDotloopReadiness,
  type DotloopObservedResources,
  type DotloopReadiness,
} from "@/lib/connections/dotloop-readiness";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import {
  DOTLOOP_OBSERVED_PROFILE_LIMIT,
  FirestoreDotloopObservationStore,
  type DotloopObservationStore,
  type DotloopReadFailure,
  type DotloopResourceObservation,
} from "@/lib/firestore/dotloop-connection-observations";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  DOTLOOP_MAX_BATCH_SIZE,
  DotloopClient,
  DotloopClientError,
  type DotloopAccessTokenProvider,
  type DotloopHttpTransport,
} from "@/lib/integrations/dotloop/client";

export interface DotloopRefreshResult {
  generationId: string;
  operationId: string;
  nowIso: string;
  failed?: boolean;
  /** True only when the provider may have issued tokens the application does not hold. */
  providerAttempted?: boolean;
  accessTokenRef?: string;
  refreshTokenRef?: string;
  tokenExpiresAt?: string;
  retainedSecretRefs?: string[];
}

export interface DotloopRuntimeStore {
  getConnection(connectorId: string): Promise<ConnectorConnectionRecord | null>;
  claimDotloopRefresh(input: {
    generationId: string;
    revision: number;
    operationId: string;
    nowIso: string;
  }): Promise<ConnectorConnectedRecord | null>;
  completeDotloopRefresh(input: DotloopRefreshResult): Promise<boolean>;
}

export const dotloopRuntimeTransport: DotloopHttpTransport = {
  async fetch(input) {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      ...(input.body === undefined ? {} : { body: input.body }),
      signal: AbortSignal.timeout(15_000),
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      json: () => response.json(),
    };
  },
};

/** How long a caller waits for another owner's refresh of the same generation. */
export const DOTLOOP_PEER_REFRESH_WAIT_MS = 15_000;
const PEER_REFRESH_POLL_MS = 500;

/** In-process single flight: concurrent callers for one generation share one refresh. */
const inflightRefreshes = new Map<string, Promise<string | null>>();

/** Tests only. */
export function resetDotloopRefreshFlightsForTests(): void {
  inflightRefreshes.clear();
}

class RefreshOutcome extends Error {
  constructor(readonly uncertain: boolean) {
    super(uncertain ? "refresh_outcome_uncertain" : "refresh_refused");
  }
}

export class DotloopRuntimeTokenProvider implements DotloopAccessTokenProvider {
  #lastSecretRef: string | null = null;

  constructor(
    private readonly deps: {
      store: DotloopRuntimeStore;
      vault: ConnectorSecretVault;
      transport: DotloopHttpTransport;
      config: DotloopOAuthConfig;
      descriptor: EnvironmentDescriptor;
      now?: () => string;
      sleep?: (ms: number) => Promise<void>;
      peerWaitMs?: number;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  private sleep(ms: number) {
    return (
      this.deps.sleep?.(ms) ??
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      })
    );
  }

  private async readToken(secretRef: string): Promise<string> {
    if (!this.deps.vault.readSecret)
      throw new DotloopClientError(
        "refresh_needed",
        "Reconnect Dotloop before continuing.",
      );
    const result = await this.deps.vault.readSecret({ secretRef });
    if (!result.ok)
      throw new DotloopClientError(
        "unavailable",
        "Secure credential storage is unavailable.",
      );
    this.#lastSecretRef = secretRef;
    return result.secret;
  }

  async accessToken(): Promise<string> {
    const record = await this.deps.store.getConnection("dotloop");
    if (
      !record ||
      record.status !== "connected" ||
      record.oauthState === "refresh_needed" ||
      !this.deps.vault.readSecret
    ) {
      throw new DotloopClientError(
        "refresh_needed",
        "Reconnect Dotloop before continuing.",
      );
    }
    if (record.oauthState === "refreshing") {
      // Another owner holds this generation's refresh: reuse its result instead of failing.
      const token = await this.awaitPeerRefresh(
        record.generationId ?? null,
        record.secretRef,
      );
      if (token) return token;
      throw new DotloopClientError(
        "refresh_needed",
        "Reconnect Dotloop before continuing.",
      );
    }
    if (
      record.tokenExpiresAt &&
      Date.parse(record.tokenExpiresAt) <= Date.parse(this.now())
    ) {
      const refreshed = await this.refresh();
      if (refreshed) return refreshed;
      throw new DotloopClientError(
        "refresh_needed",
        "Reconnect Dotloop before continuing.",
      );
    }
    return this.readToken(record.secretRef);
  }

  /** One generation-owned refresh; concurrent callers share it or reuse a peer's result. */
  async refresh(): Promise<string | null> {
    const record = await this.deps.store.getConnection("dotloop");
    if (!record || record.status !== "connected" || !record.generationId) return null;
    const key = record.generationId;
    const existing = inflightRefreshes.get(key);
    if (existing) return existing;
    const attempt = this.refreshOnce(record).finally(() => {
      inflightRefreshes.delete(key);
    });
    inflightRefreshes.set(key, attempt);
    return attempt;
  }

  /**
   * Bounded wait for another owner's refresh of the same generation. It returns only a token the
   * peer produced: never the known-stale reference and never an expired one.
   */
  private async awaitPeerRefresh(
    generationId: string | null,
    staleSecretRef: string | null,
  ): Promise<string | null> {
    if (!generationId) return null;
    const limit = this.deps.peerWaitMs ?? DOTLOOP_PEER_REFRESH_WAIT_MS;
    for (let waited = 0; waited < limit; waited += PEER_REFRESH_POLL_MS) {
      await this.sleep(PEER_REFRESH_POLL_MS);
      const current = await this.deps.store.getConnection("dotloop");
      if (
        !current ||
        current.status !== "connected" ||
        current.generationId !== generationId
      )
        return null;
      if (current.oauthState === "refresh_needed") return null;
      if (current.oauthState === "refreshing") continue;
      if (staleSecretRef && current.secretRef === staleSecretRef) return null;
      if (
        current.tokenExpiresAt &&
        Date.parse(current.tokenExpiresAt) <= Date.parse(this.now())
      )
        return null;
      return this.readToken(current.secretRef);
    }
    return null;
  }

  private async refreshOnce(record: ConnectorConnectionRecord): Promise<string | null> {
    assertLiveProviderActionAllowed(this.deps.descriptor);
    if (record.status !== "connected" || !record.generationId) return null;
    const expired =
      Boolean(record.tokenExpiresAt) &&
      Date.parse(record.tokenExpiresAt!) <= Date.parse(this.now());
    const staleSecretRef = this.#lastSecretRef ?? (expired ? record.secretRef : null);
    if (record.oauthState === "refreshing")
      return this.awaitPeerRefresh(record.generationId, staleSecretRef);
    if (record.oauthState === "refresh_needed") return null;
    // A peer already replaced the token this caller last used: reuse it, never refresh twice.
    if (this.#lastSecretRef && record.secretRef !== this.#lastSecretRef) {
      return this.readToken(record.secretRef);
    }
    if (
      !record.revision ||
      !record.refreshTokenRef ||
      !this.deps.vault.readSecret ||
      !this.deps.config.clientSecret
    )
      return null;
    const operationId = randomUUID();
    const claimed = await this.deps.store.claimDotloopRefresh({
      generationId: record.generationId,
      revision: record.revision,
      operationId,
      nowIso: this.now(),
    });
    // Another process owns this generation's refresh: wait for and reuse its token.
    if (!claimed) return this.awaitPeerRefresh(record.generationId, staleSecretRef);
    const createdRefs: string[] = [];
    let uncertain = false;
    try {
      const refresh = await this.deps.vault.readSecret({
        secretRef: record.refreshTokenRef,
      });
      if (!refresh.ok) throw new RefreshOutcome(false);
      const request = buildDotloopTokenRequest({
        config: this.deps.config,
        grant: { type: "refresh_token", refreshToken: refresh.secret },
      });
      let response;
      try {
        response = await this.deps.transport.fetch({
          url: request.url,
          method: "POST",
          headers: request.headers,
          body: request.body,
        });
      } catch {
        uncertain = true;
        throw new RefreshOutcome(true);
      }
      if (response.status === 408 || response.status >= 500) {
        uncertain = true;
        throw new RefreshOutcome(true);
      }
      // Any other non-200 is the provider's definitive refusal: no token was issued.
      if (response.status !== 200) throw new RefreshOutcome(false);
      // From here the provider has issued tokens; losing them leaves an unknown provider state.
      uncertain = true;
      const body = (await response.json()) as {
        access_token?: unknown;
        refresh_token?: unknown;
        expires_in?: unknown;
      };
      if (
        typeof body.access_token !== "string" ||
        !body.access_token ||
        typeof body.expires_in !== "number" ||
        !Number.isFinite(body.expires_in) ||
        body.expires_in <= 0
      )
        throw new RefreshOutcome(true);
      const access = await this.deps.vault.storeSecret({
        connectorId: "dotloop",
        secret: body.access_token,
      });
      if (!access.ok) throw new RefreshOutcome(true);
      createdRefs.push(access.secretRef);
      let refreshTokenRef = record.refreshTokenRef;
      if (typeof body.refresh_token === "string" && body.refresh_token) {
        const stored = await this.deps.vault.storeSecret({
          connectorId: "dotloop",
          secret: body.refresh_token,
        });
        if (!stored.ok) throw new RefreshOutcome(true);
        refreshTokenRef = stored.secretRef;
        createdRefs.push(refreshTokenRef);
      }
      // Old refs remain named on the record until disconnect, including any failed cleanup.
      const oldRefs = [
        ...new Set([
          ...(record.retainedSecretRefs ?? []),
          record.secretRef,
          ...(refreshTokenRef === record.refreshTokenRef ? [] : [record.refreshTokenRef]),
        ]),
      ];
      const committed = await this.deps.store.completeDotloopRefresh({
        generationId: record.generationId,
        operationId,
        nowIso: this.now(),
        accessTokenRef: access.secretRef,
        refreshTokenRef,
        tokenExpiresAt: new Date(
          Date.parse(this.now()) + body.expires_in * 1000,
        ).toISOString(),
        retainedSecretRefs: oldRefs,
      });
      if (!committed) throw new RefreshOutcome(true);
      for (const secretRef of oldRefs) {
        try {
          await this.deps.vault.destroySecret({ secretRef, operationId });
        } catch {
          /* The record retains the exact cleanup target for disconnect recovery. */
        }
      }
      this.#lastSecretRef = access.secretRef;
      return body.access_token;
    } catch (error) {
      const outcomeUncertain =
        error instanceof RefreshOutcome ? error.uncertain : uncertain;
      const retained: string[] = [];
      for (const secretRef of createdRefs) {
        try {
          const result = await this.deps.vault.destroySecret({ secretRef, operationId });
          if (!result.ok) retained.push(secretRef);
        } catch {
          retained.push(secretRef);
        }
      }
      await this.deps.store.completeDotloopRefresh({
        generationId: record.generationId,
        operationId,
        nowIso: this.now(),
        failed: true,
        providerAttempted: outcomeUncertain,
        retainedSecretRefs: retained,
      });
      return null;
    }
  }
}

export function createDotloopRuntime(
  env: Record<string, string | undefined> = process.env,
) {
  const config = readDotloopOAuthConfig(env);
  if (!config.configured) return null;
  const vault = resolveConnectorSecretVault("dotloop", env);
  const store = new FirestoreConnectorConnectionStore();
  const tokens = new DotloopRuntimeTokenProvider({
    store,
    vault,
    config: config.config,
    descriptor: requireEnvironmentDescriptor(env),
    transport: dotloopRuntimeTransport,
  });
  return {
    store,
    vault,
    client: new DotloopClient({ tokens, transport: dotloopRuntimeTransport }),
  };
}

function failureKind(error: unknown): DotloopReadFailure {
  return error instanceof DotloopClientError ? error.kind : "unknown";
}

/**
 * Explicit, bounded resource discovery for the current connection generation: the account, the
 * profiles, the templates of each supported (and the selected) profile, and the optional
 * subscription read. It is run only by an Admin's refresh, the post-consent verification and
 * provider-write admission; ordinary page renders reuse its labeled result.
 */
export async function observeDotloopResources(input: {
  client: DotloopClient;
  generationId: string;
  actorUid: string;
  selectedProfileId?: string | null;
  nowIso?: string;
}): Promise<DotloopResourceObservation> {
  const observedAt = input.nowIso ?? new Date().toISOString();
  let account: DotloopResourceObservation["account"] = null;
  let accountError: DotloopReadFailure | null = null;
  try {
    account = await input.client.getAccount();
  } catch (error) {
    if (error instanceof DotloopClientError && error.kind === "refresh_needed")
      throw error;
    accountError = failureKind(error);
  }
  let profiles: DotloopResourceObservation["profiles"] = [];
  let profilesError: DotloopReadFailure | null = null;
  try {
    profiles = await input.client.listProfiles({ batchSize: DOTLOOP_MAX_BATCH_SIZE });
  } catch (error) {
    if (error instanceof DotloopClientError && error.kind === "refresh_needed")
      throw error;
    profilesError = failureKind(error);
  }
  const candidates = [
    ...new Set([
      ...(input.selectedProfileId ? [input.selectedProfileId] : []),
      ...profiles
        .filter((profile) => isSupportedDotloopProfileType(profile.type))
        .map((profile) => profile.id),
    ]),
  ];
  const profilesTruncated = candidates.length > DOTLOOP_OBSERVED_PROFILE_LIMIT;
  const templates: DotloopResourceObservation["templates"][number][] = [];
  for (const profileId of candidates.slice(0, DOTLOOP_OBSERVED_PROFILE_LIMIT)) {
    try {
      templates.push({
        profileId,
        error: null,
        templates: await input.client.listLoopTemplates(profileId, {
          batchSize: DOTLOOP_MAX_BATCH_SIZE,
        }),
      });
    } catch (error) {
      if (error instanceof DotloopClientError && error.kind === "refresh_needed")
        throw error;
      templates.push({ profileId, error: failureKind(error), templates: [] });
    }
  }
  let subscriptionsReadable: boolean | null = null;
  try {
    subscriptionsReadable = await input.client.readSubscriptionsAvailable();
  } catch (error) {
    if (error instanceof DotloopClientError && error.kind === "refresh_needed")
      throw error;
    subscriptionsReadable = null;
  }
  return {
    generationId: input.generationId,
    observedAt,
    observedByUid: input.actorUid,
    account,
    accountError,
    profiles,
    profilesError,
    profilesTruncated,
    templates,
    subscriptionsReadable,
  };
}

/** The readiness projection's view of one stored observation. */
export function toObservedResources(
  observation: DotloopResourceObservation | null,
): DotloopObservedResources | null {
  if (!observation) return null;
  return {
    generationId: observation.generationId,
    observedAt: observation.observedAt,
    accountOk: observation.account !== null && observation.accountError === null,
    accountEmail: observation.account?.email ?? null,
    profiles: observation.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      type: profile.type,
    })),
    profilesOk: observation.profilesError === null,
    templates: observation.templates.map((entry) => ({
      profileId: entry.profileId,
      ok: entry.error === null,
      templates: entry.templates.map((template) => ({
        id: template.id,
        name: template.name,
        transactionType: template.transactionType,
      })),
    })),
    subscriptionsReadable: observation.subscriptionsReadable,
  };
}

interface StoredSelection {
  profile_id?: unknown;
  profile_label?: unknown;
  template_id?: unknown;
  template_label?: unknown;
  transaction_type?: unknown;
  initial_status?: unknown;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

async function readStoredSelection(): Promise<StoredSelection | undefined> {
  const settings = await (await import("@/lib/firestore/admin"))
    .getAdminFirestore()
    .collection("dotloop_renewal_settings")
    .doc("current")
    .get();
  return settings.data() as StoredSelection | undefined;
}

export interface DotloopReadinessDeps {
  readonly connections?: Pick<DotloopRuntimeStore, "getConnection">;
  readonly observations?: Pick<DotloopObservationStore, "read">;
  readonly readSelection?: () => Promise<StoredSelection | undefined>;
  readonly nowIso?: string;
}

/**
 * Ordinary readiness: configuration, vault capability, the connection record, the saved selection
 * and the cached labeled observation. It makes no provider request, so page renders never repeat
 * discovery or subscription probes (AC-S106-9).
 */
export async function readDotloopRuntimeReadiness(
  env: Record<string, string | undefined> = process.env,
  deps: DotloopReadinessDeps = {},
): Promise<DotloopReadiness> {
  const config = readDotloopOAuthConfig(env);
  const vault = resolveConnectorSecretVault("dotloop", env);
  const base = {
    config: {
      configured: config.configured,
      missing: config.configured ? [] : config.missing,
    },
    vaultCapability: await vault.capability(),
    connection: { status: "none" as const },
    probe: null,
    selection: { profileId: null, templateId: null },
    ...(deps.nowIso ? { nowIso: deps.nowIso } : {}),
  };
  if (!config.configured || base.vaultCapability !== "configured")
    return projectDotloopReadiness(base);
  try {
    const connections = deps.connections ?? new FirestoreConnectorConnectionStore();
    const observations = deps.observations ?? new FirestoreDotloopObservationStore();
    const [connection, selection, observation] = await Promise.all([
      connections.getConnection("dotloop"),
      (deps.readSelection ?? readStoredSelection)(),
      observations.read(),
    ]);
    const selected = {
      profileId: stringOrNull(selection?.profile_id),
      templateId: stringOrNull(selection?.template_id),
      profileLabel: stringOrNull(selection?.profile_label),
      templateLabel: stringOrNull(selection?.template_label),
      transactionType: stringOrNull(selection?.transaction_type),
      initialStatus: stringOrNull(selection?.initial_status),
    };
    if (!connection || connection.status !== "connected")
      return projectDotloopReadiness({
        ...base,
        selection: selected,
        connection: { status: connection?.status ?? "none" },
      });
    return projectDotloopReadiness({
      ...base,
      selection: selected,
      connection: {
        status:
          connection.oauthState === "refresh_needed"
            ? "refresh_needed"
            : connection.oauthState === "refreshing"
              ? "connecting"
              : "connected",
        generationId: connection.generationId ?? null,
        grantedScopes:
          connection.grantedScopes && connection.grantedScopes.length > 0
            ? connection.grantedScopes
            : null,
      },
      observation: toObservedResources(observation),
    });
  } catch {
    return {
      state: "unavailable",
      reasons: ["secure_storage"],
      webhooksAvailable: false,
      signatureApiAvailable: false,
    };
  }
}

/**
 * Explicit refresh (Admin control, post-consent verification and provider-write admission): run
 * one bounded discovery for the current generation, store its labeled observation, and project
 * readiness from it. A token that needs reconnection is reported, never retried in a loop.
 */
export async function refreshDotloopResourceReadiness(input: {
  actorUid: string;
  env?: Record<string, string | undefined>;
  expectedGenerationId?: string;
}): Promise<{
  readiness: DotloopReadiness;
  observation: DotloopResourceObservation | null;
}> {
  const env = input.env ?? process.env;
  const runtime = createDotloopRuntime(env);
  if (!runtime)
    return { readiness: await readDotloopRuntimeReadiness(env), observation: null };
  const connection = await runtime.store.getConnection("dotloop");
  if (
    !connection ||
    connection.status !== "connected" ||
    !connection.generationId ||
    (input.expectedGenerationId && connection.generationId !== input.expectedGenerationId)
  )
    return { readiness: await readDotloopRuntimeReadiness(env), observation: null };
  const selection = await readStoredSelection();
  let observation: DotloopResourceObservation | null = null;
  try {
    observation = await observeDotloopResources({
      client: runtime.client,
      generationId: connection.generationId,
      actorUid: input.actorUid,
      selectedProfileId: stringOrNull(selection?.profile_id),
    });
    await new FirestoreDotloopObservationStore().write(observation);
  } catch (error) {
    if (!(error instanceof DotloopClientError)) throw error;
  }
  return { readiness: await readDotloopRuntimeReadiness(env), observation };
}
