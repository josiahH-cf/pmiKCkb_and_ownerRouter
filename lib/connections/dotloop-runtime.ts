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
  DOTLOOP_OAUTH_TOKEN_URL,
  readDotloopOAuthConfig,
  type DotloopOAuthConfig,
} from "@/lib/connections/dotloop-oauth";
import {
  projectDotloopReadiness,
  type DotloopReadiness,
} from "@/lib/connections/dotloop-readiness";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
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

export class DotloopRuntimeTokenProvider implements DotloopAccessTokenProvider {
  constructor(
    private readonly deps: {
      store: DotloopRuntimeStore;
      vault: ConnectorSecretVault;
      transport: DotloopHttpTransport;
      config: DotloopOAuthConfig;
      descriptor: EnvironmentDescriptor;
      now?: () => string;
    },
  ) {}
  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  async accessToken(): Promise<string> {
    const record = await this.deps.store.getConnection("dotloop");
    if (
      !record ||
      record.status !== "connected" ||
      record.oauthState === "refresh_needed" ||
      record.oauthState === "refreshing" ||
      !this.deps.vault.readSecret
    ) {
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
    const result = await this.deps.vault.readSecret({ secretRef: record.secretRef });
    if (!result.ok)
      throw new DotloopClientError(
        "unavailable",
        "Secure credential storage is unavailable.",
      );
    return result.secret;
  }

  async refresh(): Promise<string | null> {
    assertLiveProviderActionAllowed(this.deps.descriptor);
    const record = await this.deps.store.getConnection("dotloop");
    if (
      !record ||
      record.status !== "connected" ||
      !record.generationId ||
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
    if (!claimed) return null;
    const createdRefs: string[] = [];
    let providerAttempted = false;
    try {
      const refresh = await this.deps.vault.readSecret({
        secretRef: record.refreshTokenRef,
      });
      if (!refresh.ok) throw new Error("credential_unavailable");
      providerAttempted = true;
      const response = await this.deps.transport.fetch({
        url: DOTLOOP_OAUTH_TOKEN_URL,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${Buffer.from(`${this.deps.config.clientId}:${this.deps.config.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refresh.secret,
        }).toString(),
      });
      if (response.status !== 200) throw new Error("refresh_refused");
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
        throw new Error("refresh_invalid");
      const access = await this.deps.vault.storeSecret({
        connectorId: "dotloop",
        secret: body.access_token,
      });
      if (!access.ok) throw new Error("credential_unavailable");
      createdRefs.push(access.secretRef);
      let refreshTokenRef = record.refreshTokenRef;
      if (typeof body.refresh_token === "string" && body.refresh_token) {
        const stored = await this.deps.vault.storeSecret({
          connectorId: "dotloop",
          secret: body.refresh_token,
        });
        if (!stored.ok) throw new Error("credential_unavailable");
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
      if (!committed) throw new Error("connection_changed");
      for (const secretRef of oldRefs) {
        try {
          await this.deps.vault.destroySecret({ secretRef, operationId });
        } catch {
          /* The record retains the exact cleanup target for disconnect recovery. */
        }
      }
      return body.access_token;
    } catch {
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
        providerAttempted,
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

export async function readDotloopRuntimeReadiness(
  env: Record<string, string | undefined> = process.env,
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
  };
  if (!config.configured || base.vaultCapability !== "configured")
    return projectDotloopReadiness(base);
  try {
    const runtime = createDotloopRuntime(env)!;
    const connection = await runtime.store.getConnection("dotloop");
    const settings = await (await import("@/lib/firestore/admin"))
      .getAdminFirestore()
      .collection("dotloop_renewal_settings")
      .doc("current")
      .get();
    const selection = settings.data();
    if (!connection || connection.status !== "connected")
      return projectDotloopReadiness({
        ...base,
        connection: { status: connection?.status ?? "none" },
      });
    const profiles = await runtime.client.listProfiles();
    const profileId =
      typeof selection?.profile_id === "string" ? selection.profile_id : null;
    const templates = profileId ? await runtime.client.listLoopTemplates(profileId) : [];
    const templateId =
      typeof selection?.template_id === "string" ? selection.template_id : null;
    return projectDotloopReadiness({
      ...base,
      connection: { status: "connected" },
      selection: {
        profileId: profiles.some((p) => p.id === profileId) ? profileId : null,
        templateId: templates.some((t) => t.id === templateId) ? templateId : null,
      },
      probe: {
        profileOk: true,
        grantedScopes: connection.grantedScopes ?? [],
        subscriptionsReadable: await runtime.client.readSubscriptionsAvailable(),
      },
    });
  } catch (error) {
    if (error instanceof Error && /^Secure credential/.test(error.message))
      return {
        state: "unavailable",
        reasons: ["secure_storage"],
        webhooksAvailable: false,
        signatureApiAvailable: false,
      };
    return projectDotloopReadiness({
      ...base,
      connection: {
        status:
          error instanceof DotloopClientError && error.kind === "refresh_needed"
            ? "refresh_needed"
            : "connected",
      },
    });
  }
}
