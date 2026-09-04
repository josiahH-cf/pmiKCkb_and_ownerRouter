import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import {
  DOTLOOP_API_BASE,
  DOTLOOP_MAX_BATCH_SIZE,
  DOTLOOP_SCOPES,
  DotloopClient,
  DotloopClientError,
} from "@/lib/integrations/dotloop/client";
import {
  DOTLOOP_READINESS_REASONS,
  projectDotloopReadiness,
  type DotloopReadinessInput,
} from "@/lib/connections/dotloop-readiness";
import {
  LiveDotloopTokenExchanger,
  beginDotloopConnection,
  completeDotloopConnection,
  dotloopHealthCheckTransport,
} from "@/lib/connections/dotloop-connection-service";
import { getHealthCheckContract, runHealthCheck } from "@/lib/integrations/health-checks";
import { createDotloopFake, createMemoryVault } from "@/tests/helpers/dotloop-fake";

// S106: the whole Dotloop connection lifecycle is proved against the provider fake. The live check
// is the only externally blocked part, because the OAuth application and account are owner inputs.

/** The callback is a Live provider action, so the fixtures state the exact serving context. */
const PRODUCTION_LIVE = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
} as const;

const ENV = {
  DOTLOOP_OAUTH_CLIENT_ID: "client-1",
  DOTLOOP_OAUTH_CLIENT_SECRET: "secret-1",
  DOTLOOP_OAUTH_REDIRECT_URI:
    "https://pmi-kc-app.example/api/connections/dotloop/callback",
};

interface FakeStateStore {
  readonly issued: string[];
  readonly consumed: string[];
  mint(input: { state: string; actorUid: string; nowIso: string }): Promise<void>;
  consume(input: { state: string; nowIso: string }): Promise<{ actorUid: string } | null>;
}

function stateStore(): FakeStateStore {
  const open = new Map<string, string>();
  const issued: string[] = [];
  const consumed: string[] = [];
  return {
    issued,
    consumed,
    async mint(input) {
      open.set(input.state, input.actorUid);
      issued.push(input.state);
    },
    async consume(input) {
      const actorUid = open.get(input.state);
      if (actorUid === undefined) return null;
      open.delete(input.state);
      consumed.push(input.state);
      return { actorUid };
    },
  };
}

interface FakeConnectionStore {
  readonly created: { connectorId: string; secretRef: string }[];
  createConnectedConnection(input: {
    connectorId: string;
    method: string;
    secretRef: string;
    connectedByUid: string;
    connectedAt: string;
    generationId: string;
  }): Promise<{ status: "connected" }>;
}

function connectionStore(): FakeConnectionStore {
  const created: { connectorId: string; secretRef: string }[] = [];
  return {
    created,
    async createConnectedConnection(input) {
      created.push({ connectorId: input.connectorId, secretRef: input.secretRef });
      return { status: "connected" as const };
    },
  };
}

function tokens(fake: ReturnType<typeof createDotloopFake>, initial: string) {
  let access = initial;
  let refreshCount = 0;
  return {
    get refreshCount() {
      return refreshCount;
    },
    async accessToken() {
      return access;
    },
    async refresh() {
      refreshCount += 1;
      const response = await fake.fetch({
        url: "https://auth.dotloop.com/oauth/token",
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "refresh-1",
        }).toString(),
      });
      if (response.status !== 200) return null;
      const body = (await response.json()) as { access_token?: string };
      access = body.access_token ?? access;
      return access;
    },
  };
}

let fake: ReturnType<typeof createDotloopFake>;

beforeEach(() => {
  fake = createDotloopFake();
});

describe("S106 Dotloop client over the documented endpoints (ARCH-S106-1)", () => {
  it("reads the account, profiles, and templates through the documented base and scopes", async () => {
    const client = new DotloopClient({
      transport: fake,
      tokens: tokens(fake, "access-1"),
      sleep: async () => undefined,
    });
    await expect(client.getAccount()).resolves.toMatchObject({ id: "55" });
    await expect(client.listProfiles()).resolves.toEqual([
      { id: "profile-1", name: "PMI KC Metro" },
    ]);
    await expect(client.listLoopTemplates("profile-1")).resolves.toEqual([
      { id: "template-1", name: "Renewal packet" },
    ]);
    expect(fake.calls.every((call) => call.url.startsWith(DOTLOOP_API_BASE))).toBe(true);
    expect(DOTLOOP_SCOPES).toContain("loop:write");
    expect(DOTLOOP_MAX_BATCH_SIZE).toBe(100);
  });

  it("bounds pagination to the documented batch parameters", async () => {
    const client = new DotloopClient({
      transport: fake,
      tokens: tokens(fake, "access-1"),
      sleep: async () => undefined,
    });
    await client.listProfiles({ batchSize: 500, batchNumber: 3 });
    const url = new URL(fake.calls.at(-1)!.url);
    expect(url.searchParams.get("batch_size")).toBe(String(DOTLOOP_MAX_BATCH_SIZE));
    expect(url.searchParams.get("batch_number")).toBe("3");
  });

  it("refreshes an expired token exactly once for an interactive read (BEH-S106-2)", async () => {
    const provider = tokens(fake, "stale-token");
    const client = new DotloopClient({
      transport: fake,
      tokens: provider,
      sleep: async () => undefined,
    });
    await expect(client.listProfiles()).resolves.toHaveLength(1);
    expect(provider.refreshCount).toBe(1);

    // A second, background-style read reuses the refreshed token without another refresh.
    await expect(client.getAccount()).resolves.toMatchObject({ id: "55" });
    expect(provider.refreshCount).toBe(1);
  });

  it("reports refresh_needed rather than looping when the refresh token is revoked", async () => {
    fake.revokeRefreshTokens();
    const provider = tokens(fake, "stale-token");
    const client = new DotloopClient({
      transport: fake,
      tokens: provider,
      sleep: async () => undefined,
    });
    await expect(client.listProfiles()).rejects.toMatchObject({
      kind: "refresh_needed",
    });
    expect(provider.refreshCount).toBe(1);
  });

  it("backs off once on a documented rate limit and then surfaces it", async () => {
    const limited = createDotloopFake({ transientStatuses: [429] });
    const waits: number[] = [];
    const client = new DotloopClient({
      transport: limited,
      tokens: tokens(limited, "access-1"),
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await expect(client.listProfiles()).resolves.toHaveLength(1);
    expect(waits).toHaveLength(1);

    const persistent = createDotloopFake({ transientStatuses: [429, 429] });
    const persistentClient = new DotloopClient({
      transport: persistent,
      tokens: tokens(persistent, "access-1"),
      sleep: async () => undefined,
    });
    await expect(persistentClient.listProfiles()).rejects.toBeInstanceOf(
      DotloopClientError,
    );
  });

  it("exposes no generic request function", () => {
    const source = readFileSync("lib/integrations/dotloop/client.ts", "utf8");
    expect(source).not.toMatch(/export\s+(async\s+)?function\s+request\b/);
    expect(Object.getOwnPropertyNames(DotloopClient.prototype)).not.toContain("request");
  });
});

describe("S106 connect and callback lifecycle (BEH-S106-1 / AC-S106-2)", () => {
  it("mints a single-use state and returns the documented authorize URL", async () => {
    const states = stateStore();
    const result = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states,
      env: ENV,
    });
    expect(result.status).toBe("authorize_url");
    if (result.status !== "authorize_url") return;
    const url = new URL(result.authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://auth.dotloop.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("state")).toBe(states.issued[0]);
    // The client secret is never a query parameter.
    expect(result.authorizeUrl).not.toContain("secret-1");
  });

  it("reports the missing configuration names instead of a fake connection", async () => {
    const result = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states: stateStore(),
      env: {},
    });
    expect(result).toMatchObject({
      status: "credentials_not_configured",
      missing: expect.arrayContaining(["DOTLOOP_OAUTH_CLIENT_ID"]),
    });
  });

  it("stores only vault refs and creates one connection on a successful callback", async () => {
    const states = stateStore();
    const connections = connectionStore();
    const vault = createMemoryVault();
    const begun = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states,
      env: ENV,
    });
    if (begun.status !== "authorize_url") throw new Error(begun.status);

    const result = await completeDotloopConnection({
      state: states.issued[0],
      code: "good-code",
      nowIso: "2026-09-03T00:01:00.000Z",
      generationId: "11111111-2222-4333-8444-555555555555",
      states,
      connections,
      vault,
      exchanger: new LiveDotloopTokenExchanger({ transport: fake }),
      env: ENV,
      descriptor: PRODUCTION_LIVE,
    });
    expect(result.status).toBe("connected");
    expect(connections.created).toHaveLength(1);
    expect(connections.created[0].secretRef).toMatch(/^vault:\/\/dotloop\//);
    // Both the access and refresh token live only in the vault.
    expect([...vault.secrets.keys()]).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/access-\d|refresh-\d/);
  });

  it("refuses a forged or replayed state without creating a connection (AC-S106-2)", async () => {
    const states = stateStore();
    const connections = connectionStore();
    const vault = createMemoryVault();
    const shared = {
      code: "good-code",
      nowIso: "2026-09-03T00:01:00.000Z",
      generationId: "11111111-2222-4333-8444-555555555555",
      states,
      connections,
      vault,
      exchanger: new LiveDotloopTokenExchanger({ transport: fake }),
      env: ENV,
      descriptor: PRODUCTION_LIVE,
    };
    await expect(
      completeDotloopConnection({ ...shared, state: "forged-state" }),
    ).resolves.toMatchObject({ status: "invalid_state" });

    const begun = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states,
      env: ENV,
    });
    if (begun.status !== "authorize_url") throw new Error(begun.status);
    await completeDotloopConnection({ ...shared, state: states.issued[0] });
    // Replaying the same state is refused because it was consumed.
    await expect(
      completeDotloopConnection({ ...shared, state: states.issued[0] }),
    ).resolves.toMatchObject({ status: "invalid_state" });
    expect(connections.created).toHaveLength(1);
  });

  it("records a denial or callback error without a connection", async () => {
    const states = stateStore();
    const connections = connectionStore();
    const begun = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states,
      env: ENV,
    });
    if (begun.status !== "authorize_url") throw new Error(begun.status);
    const denied = await completeDotloopConnection({
      state: states.issued[0],
      providerError: "access_denied",
      nowIso: "2026-09-03T00:01:00.000Z",
      generationId: "11111111-2222-4333-8444-555555555555",
      states,
      connections,
      vault: createMemoryVault(),
      exchanger: new LiveDotloopTokenExchanger({ transport: fake }),
      env: ENV,
      descriptor: PRODUCTION_LIVE,
    });
    expect(denied).toMatchObject({ status: "authorization_denied" });
    expect(connections.created).toHaveLength(0);
  });

  it("refuses to record a connection when secure storage is unavailable", async () => {
    const states = stateStore();
    const connections = connectionStore();
    const begun = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states,
      env: ENV,
    });
    if (begun.status !== "authorize_url") throw new Error(begun.status);
    const result = await completeDotloopConnection({
      state: states.issued[0],
      code: "good-code",
      nowIso: "2026-09-03T00:01:00.000Z",
      generationId: "11111111-2222-4333-8444-555555555555",
      states,
      connections,
      vault: {
        async capability() {
          return "not_configured" as const;
        },
        async storeSecret() {
          return { ok: false as const, reason: "not_configured" as const };
        },
        async destroySecret() {
          return { ok: false as const, reason: "not_configured" as const };
        },
      },
      exchanger: new LiveDotloopTokenExchanger({ transport: fake }),
      env: ENV,
      descriptor: PRODUCTION_LIVE,
    });
    expect(result).toMatchObject({ status: "secure_storage_unavailable" });
    expect(connections.created).toHaveLength(0);
  });

  it("refuses the whole callback in the Live-read-only rehearsal context", async () => {
    const states = stateStore();
    const connections = connectionStore();
    const begun = await beginDotloopConnection({
      actorUid: "admin-1",
      nowIso: "2026-09-03T00:00:00.000Z",
      states,
      env: ENV,
    });
    if (begun.status !== "authorize_url") throw new Error(begun.status);
    await expect(
      completeDotloopConnection({
        state: states.issued[0],
        code: "good-code",
        nowIso: "2026-09-03T00:01:00.000Z",
        generationId: "11111111-2222-4333-8444-555555555555",
        states,
        connections,
        vault: createMemoryVault(),
        exchanger: new LiveDotloopTokenExchanger({ transport: fake }),
        env: ENV,
        descriptor: {
          environmentKind: "demo",
          dataContext: "live_readonly",
          source: "explicit",
        },
      }),
    ).rejects.toThrow(/Live provider action/i);
    expect(connections.created).toHaveLength(0);
    // The state is not consumed by a refused attempt, so a legitimate callback can still complete.
    expect(states.consumed).toHaveLength(0);
  });

  it("keeps every token value out of the module surface (AC-S106-1)", () => {
    for (const path of [
      "lib/connections/dotloop-connection-service.ts",
      "lib/integrations/dotloop/client.ts",
      "app/api/connections/dotloop/callback/route.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/console\.(log|info|warn|error)/);
      expect(source).not.toMatch(/accessToken:\s*token/);
    }
  });
});

describe("S106 readiness projection (ARCH-S106-2 / BEH-S106-3)", () => {
  const base: DotloopReadinessInput = {
    config: { configured: true, missing: [] },
    vaultCapability: "configured",
    connection: { status: "connected" },
    probe: {
      profileOk: true,
      grantedScopes: [...DOTLOOP_SCOPES],
      subscriptionsReadable: true,
    },
    selection: { profileId: "profile-1", templateId: "template-1" },
  };

  it("reports connected only with a probe success and a complete selection", () => {
    expect(projectDotloopReadiness(base)).toMatchObject({
      state: "connected",
      reasons: [],
      webhooksAvailable: true,
      signatureApiAvailable: false,
    });
  });

  it("never reports connected without a profile probe success (AC-S106-3)", () => {
    expect(projectDotloopReadiness({ ...base, probe: null })).toMatchObject({
      state: "unavailable",
      reasons: ["account_connection"],
    });
    expect(
      projectDotloopReadiness({
        ...base,
        probe: { ...base.probe!, profileOk: false },
      }),
    ).toMatchObject({ state: "unavailable", reasons: ["account_connection"] });
  });

  it("names the exact missing resource", () => {
    expect(
      projectDotloopReadiness({
        ...base,
        selection: { profileId: null, templateId: null },
      }),
    ).toMatchObject({
      state: "missing_resources",
      reasons: ["compatible_profile", "renewal_template"],
    });
    expect(
      projectDotloopReadiness({
        ...base,
        selection: { profileId: "profile-1", templateId: null },
      }),
    ).toMatchObject({ state: "missing_resources", reasons: ["renewal_template"] });
    expect(
      projectDotloopReadiness({
        ...base,
        probe: { ...base.probe!, grantedScopes: ["profile:read"] },
      }),
    ).toMatchObject({ state: "missing_resources", reasons: ["loop_write_scope"] });
  });

  it("distinguishes disconnected, connecting, refresh_needed, and unavailable", () => {
    expect(
      projectDotloopReadiness({ ...base, connection: { status: "none" }, probe: null }),
    ).toMatchObject({ state: "disconnected" });
    expect(
      projectDotloopReadiness({
        ...base,
        connection: { status: "connecting" },
        probe: null,
      }),
    ).toMatchObject({ state: "connecting" });
    expect(
      projectDotloopReadiness({
        ...base,
        connection: { status: "refresh_needed" },
        probe: null,
      }),
    ).toMatchObject({ state: "refresh_needed" });
    expect(
      projectDotloopReadiness({
        ...base,
        config: {
          configured: false,
          missing: ["DOTLOOP_OAUTH_CLIENT_ID", "DOTLOOP_OAUTH_REDIRECT_URI"],
        },
      }),
    ).toMatchObject({
      state: "unavailable",
      reasons: ["client_registration", "callback_configuration"],
    });
    expect(
      projectDotloopReadiness({ ...base, vaultCapability: "not_configured" }),
    ).toMatchObject({ state: "unavailable", reasons: ["secure_storage"] });
  });

  it("keeps loops usable when webhooks are unreadable and never claims a signature API", () => {
    const readiness = projectDotloopReadiness({
      ...base,
      probe: { ...base.probe!, subscriptionsReadable: false },
    });
    expect(readiness).toMatchObject({
      state: "connected",
      webhooksAvailable: false,
      signatureApiAvailable: false,
    });
  });

  it("declares every reason in one vocabulary", () => {
    expect([...DOTLOOP_READINESS_REASONS]).toEqual([
      "client_registration",
      "callback_configuration",
      "secure_storage",
      "account_connection",
      "compatible_profile",
      "renewal_template",
      "loop_write_scope",
    ]);
  });
});

describe("S106 health check wiring (DLCONN-05)", () => {
  it("reports config, auth, profile, and subscription readability truthfully", async () => {
    const contract = getHealthCheckContract("health.dotloop.oauth_app")!;
    const client = new DotloopClient({
      transport: fake,
      tokens: tokens(fake, "access-1"),
      sleep: async () => undefined,
    });
    const result = await runHealthCheck(
      contract,
      dotloopHealthCheckTransport({ client, env: ENV }),
    );
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.step_id)).toEqual([
      "dotloop.config",
      "dotloop.auth",
      "dotloop.probe",
      "dotloop.webhooks",
    ]);
  });

  it("stops at the first honest failure instead of claiming health", async () => {
    const contract = getHealthCheckContract("health.dotloop.oauth_app")!;
    const client = new DotloopClient({
      transport: fake,
      tokens: tokens(fake, "access-1"),
      sleep: async () => undefined,
    });
    const result = await runHealthCheck(
      contract,
      dotloopHealthCheckTransport({ client, env: {} }),
    );
    expect(result.ok).toBe(false);
    expect(result.steps[0]).toMatchObject({ step_id: "dotloop.config", ok: false });
    expect(result.steps[1]).toMatchObject({ ok: false, detail: "not attempted" });
  });
});
