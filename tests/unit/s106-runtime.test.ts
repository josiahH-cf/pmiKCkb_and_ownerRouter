import { describe, expect, it, vi } from "vitest";

import { SecretManagerConnectorSecretVault } from "@/lib/connections/secret-manager-connector-vault";
import { DotloopRuntimeTokenProvider } from "@/lib/connections/dotloop-runtime";
import { LiveDotloopTokenExchanger } from "@/lib/connections/dotloop-connection-service";

const now = "2026-09-07T12:00:00.000Z";
const generationId = "11111111-1111-4111-8111-111111111111";
const connection = () => ({
  connectorId: "dotloop",
  method: "oauth" as const,
  status: "connected" as const,
  generationId,
  revision: 1,
  connectedByUid: "admin",
  connectedAt: now,
  updatedAt: now,
  secretRef: "access-ref",
  refreshTokenRef: "refresh-ref",
  tokenExpiresAt: "2026-09-08T00:00:00.000Z",
});

function harness() {
  const record = connection();
  const store = {
    getConnection: vi.fn(async () => record),
    claimDotloopRefresh: vi.fn(async () => record),
    completeDotloopRefresh: vi.fn(async () => true),
  };
  const vault = {
    capability: vi.fn(async () => "configured" as const),
    readSecret: vi.fn(async ({ secretRef }: { secretRef: string }) => ({
      ok: true as const,
      secret: secretRef === "access-ref" ? "access-token" : "refresh-token",
    })),
    storeSecret: vi.fn(async ({ secret }: { secret: string }) => ({
      ok: true as const,
      secretRef: `${secret}-ref`,
    })),
    destroySecret: vi.fn(async () => ({
      ok: true as const,
      outcome: "destroyed" as const,
    })),
  };
  const transport = {
    fetch: vi.fn(async (_input: unknown) => ({
      status: 200,
      headers: {},
      json: async () => ({
        access_token: "next-access",
        refresh_token: "next-refresh",
        expires_in: 3600,
      }),
    })),
  };
  const tokens = new DotloopRuntimeTokenProvider({
    store,
    vault,
    transport,
    config: {
      clientId: "client",
      clientSecret: "secret",
      redirectUri: "https://app.example/callback",
    },
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    now: () => now,
  });
  return { tokens, store, vault, transport, record };
}

describe("S106 runtime token ownership", () => {
  it("destroys the stored access reference when the callback cannot store its refresh token", async () => {
    const h = harness();
    h.vault.storeSecret
      .mockResolvedValueOnce({ ok: true, secretRef: "callback-access-ref" })
      .mockRejectedValueOnce(new Error("refresh_storage_refused"));
    const exchanger = new LiveDotloopTokenExchanger({ transport: h.transport });
    await expect(
      exchanger.exchangeCode({
        code: "fixture-code",
        config: {
          clientId: "client",
          clientSecret: "secret",
          redirectUri: "https://app.example/callback",
        },
        vault: h.vault,
      }),
    ).rejects.toThrow();
    expect(h.vault.destroySecret).toHaveBeenCalledTimes(1);
    expect(h.vault.destroySecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretRef: "callback-access-ref" }),
    );
  });

  it("reads the current access token only from its generation's vault reference", async () => {
    const h = harness();
    await expect(h.tokens.accessToken()).resolves.toBe("access-token");
    expect(h.vault.readSecret).toHaveBeenCalledWith({ secretRef: "access-ref" });
    expect(h.transport.fetch).not.toHaveBeenCalled();
  });

  it("claims one refresh and persists both new references and expiry before returning a token", async () => {
    const h = harness();
    await expect(h.tokens.refresh()).resolves.toBe("next-access");
    expect(h.store.claimDotloopRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ generationId, revision: 1 }),
    );
    expect(h.transport.fetch.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("grant_type=refresh_token"),
      }),
    );
    expect(h.store.completeDotloopRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId,
        accessTokenRef: "next-access-ref",
        refreshTokenRef: "next-refresh-ref",
        tokenExpiresAt: "2026-09-07T13:00:00.000Z",
      }),
    );
  });

  it("uses the provider-required Basic client authentication without credentials in the URL", async () => {
    const h = harness();
    await h.tokens.refresh();
    expect(h.transport.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://auth.dotloop.com/oauth/token",
        headers: expect.objectContaining({
          authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        }),
      }),
    );
  });

  it("never calls the provider after a lost refresh claim", async () => {
    const h = harness();
    h.store.claimDotloopRefresh.mockResolvedValue(null as never);
    await expect(h.tokens.refresh()).resolves.toBeNull();
    expect(h.transport.fetch).not.toHaveBeenCalled();
  });

  it("destroys new refs if disconnect wins before the token commit", async () => {
    const h = harness();
    h.store.completeDotloopRefresh.mockResolvedValue(false);
    await expect(h.tokens.refresh()).resolves.toBeNull();
    expect(h.vault.destroySecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretRef: "next-access-ref" }),
    );
    expect(h.vault.destroySecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretRef: "next-refresh-ref" }),
    );
  });

  it("records a revoked refresh as refresh-needed without retrying or leaking its body", async () => {
    const h = harness();
    h.transport.fetch.mockResolvedValue({
      status: 400,
      headers: {},
      json: vi.fn(async () => ({ secret: "must-not-be-read" })),
    } as never);
    await expect(h.tokens.refresh()).resolves.toBeNull();
    expect(h.transport.fetch).toHaveBeenCalledTimes(1);
    expect(h.store.completeDotloopRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ failed: true }),
    );
  });
});

describe("S106 Secret Manager boundary", () => {
  it("refuses references outside the configured project's Dotloop namespace before requesting credentials", async () => {
    const request = vi.fn();
    const vault = new SecretManagerConnectorSecretVault({
      projectId: "pmi-kc-kb-prod",
      request,
    });
    await expect(
      vault.readSecret({ secretRef: "projects/other/secrets/arbitrary/versions/1" }),
    ).rejects.toThrow("Credential reference is invalid");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not enable another connector's credential storage", async () => {
    const request = vi.fn();
    const vault = new SecretManagerConnectorSecretVault({
      projectId: "pmi-kc-kb-prod",
      request,
    });
    await expect(
      vault.storeSecret({ connectorId: "other", secret: "not-stored" }),
    ).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("S106 vault write readback", () => {
  function vaultHarness(readback: string) {
    let name = "";
    let destroyed = false;
    const request = vi.fn(
      async (input: { method: "GET" | "POST"; url: string; data?: unknown }) => {
        if (input.url.includes("?secretId=")) {
          name = `projects/123456/secrets/${new URL(input.url).searchParams.get("secretId")}`;
          return { status: 200, data: { name } };
        }
        if (input.url.endsWith(":addVersion"))
          return { status: 200, data: { name: `${name}/versions/1` } };
        if (input.url.endsWith(":access"))
          return {
            status: 200,
            data: { payload: { data: Buffer.from(readback).toString("base64") } },
          };
        if (input.url.endsWith(":destroy")) destroyed = true;
        return { status: 200, data: { state: destroyed ? "DESTROYED" : "ENABLED" } };
      },
    );
    const vault = new SecretManagerConnectorSecretVault({
      projectId: "pmi-kc-kb-prod",
      request,
      descriptor: {
        environmentKind: "production",
        dataContext: "live",
        source: "explicit",
      },
    });
    return { vault, request };
  }
  it("normalizes the provider project alias only after exact secret/version readback", async () => {
    const h = vaultHarness("fixture-secret");
    const result = await h.vault.storeSecret({
      connectorId: "dotloop",
      secret: "fixture-secret",
    });
    expect(result).toEqual({
      ok: true,
      secretRef: expect.stringMatching(
        /^projects\/pmi-kc-kb-prod\/secrets\/pmi-kc-dotloop-[0-9a-f-]+\/versions\/1$/,
      ),
    });
    expect(h.request.mock.calls.some(([call]) => call.url.endsWith(":access"))).toBe(
      true,
    );
  });
  it("destroys and reads back the exact new version after a mismatching credential readback", async () => {
    const h = vaultHarness("mismatch");
    await expect(
      h.vault.storeSecret({ connectorId: "dotloop", secret: "fixture-secret" }),
    ).rejects.toThrow("Secure credential readback");
    const calls = h.request.mock.calls.map(([call]) => call);
    const destroy = calls.find((call) => call.url.endsWith(":destroy"));
    expect(destroy).toBeDefined();
    expect(calls.at(-1)).toEqual({
      method: "GET",
      url: destroy!.url.replace(":destroy", ""),
    });
  });
});
