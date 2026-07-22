import { describe, expect, it, vi } from "vitest";

import { CONNECTORS } from "@/lib/connections/connector-catalog";
import type { ConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import {
  DOTLOOP_OAUTH_AUTHORIZE_URL,
  NotConnectedDotloopTokenExchanger,
  beginDotloopConnect,
  buildDotloopAuthorizeUrl,
  readDotloopOAuthConfig,
  revokeDotloopConnection,
} from "@/lib/connections/dotloop-oauth";
import { isActionExecutable } from "@/lib/integrations/action-gate";

describe("buildDotloopAuthorizeUrl", () => {
  it("builds the auth-code URL with the public params and never the secret", () => {
    const url = new URL(
      buildDotloopAuthorizeUrl({
        clientId: "client-123",
        redirectUri: "https://app.example/connections/dotloop/callback",
        state: "nonce-xyz",
        scope: "profile documents",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(DOTLOOP_OAUTH_AUTHORIZE_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/connections/dotloop/callback",
    );
    expect(url.searchParams.get("state")).toBe("nonce-xyz");
    expect(url.searchParams.get("scope")).toBe("profile documents");
    // No client secret parameter is ever present.
    expect(url.searchParams.get("client_secret")).toBeNull();
  });
});

describe("readDotloopOAuthConfig", () => {
  it("is configured when client id + redirect uri are present", () => {
    const result = readDotloopOAuthConfig({
      DOTLOOP_OAUTH_CLIENT_ID: "client-123",
      DOTLOOP_OAUTH_REDIRECT_URI: "https://app.example/cb",
      DOTLOOP_OAUTH_CLIENT_SECRET: "secret-abc",
    });
    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.config.clientId).toBe("client-123");
      expect(result.config.clientSecret).toBe("secret-abc");
    }
  });

  it("reports the missing NAMES when credentials are absent", () => {
    const result = readDotloopOAuthConfig({});
    expect(result.configured).toBe(false);
    if (!result.configured) {
      expect(result.missing).toContain("DOTLOOP_OAUTH_CLIENT_ID");
      expect(result.missing).toContain("DOTLOOP_OAUTH_REDIRECT_URI");
    }
  });
});

describe("beginDotloopConnect", () => {
  it("returns the authorize URL when configured, with no secret in the URL", () => {
    const result = beginDotloopConnect({
      state: "nonce-1",
      env: {
        DOTLOOP_OAUTH_CLIENT_ID: "client-123",
        DOTLOOP_OAUTH_REDIRECT_URI: "https://app.example/cb",
        DOTLOOP_OAUTH_CLIENT_SECRET: "super-secret-value",
      },
    });
    expect(result.status).toBe("authorize_url");
    if (result.status === "authorize_url") {
      expect(result.authorizeUrl).not.toContain("super-secret-value");
      expect(result.authorizeUrl).toContain("client_id=client-123");
    }
  });

  it("reports credentials_not_configured (authorize in the morning) when unset", () => {
    const result = beginDotloopConnect({ state: "nonce-1", env: {} });
    expect(result.status).toBe("credentials_not_configured");
  });
});

describe("Dotloop token exchanger + revoke seams", () => {
  it("refuses to exchange a code with no live exchanger wired (never fabricates a token)", async () => {
    const vault: ConnectorSecretVault = {
      storeSecret: vi.fn(),
      destroySecret: vi.fn(),
    };
    await expect(
      new NotConnectedDotloopTokenExchanger().exchangeCode({
        code: "auth-code",
        config: { clientId: "c", redirectUri: "r", clientSecret: "s" },
        vault,
      }),
    ).rejects.toThrow(/not connected/i);
  });

  it("revoke destroys the stored secret ref through the vault", async () => {
    const destroySecret = vi.fn().mockResolvedValue(undefined);
    const vault: ConnectorSecretVault = { storeSecret: vi.fn(), destroySecret };
    await revokeDotloopConnection({ secretRef: "opaque-ref", vault });
    expect(destroySecret).toHaveBeenCalledWith("opaque-ref");
  });
});

describe("Dotloop connector governance", () => {
  it("catalogs the OAuth setup note + the three OAuth env names (presence only)", () => {
    const dotloop = CONNECTORS.find((connector) => connector.id === "dotloop");
    expect(dotloop?.method).toBe("oauth");
    expect(dotloop?.setupNote).toMatch(/authorization in the morning/i);
    expect(dotloop?.requiredConfig).toEqual([
      "DOTLOOP_OAUTH_CLIENT_ID",
      "DOTLOOP_OAUTH_CLIENT_SECRET",
      "DOTLOOP_OAUTH_REDIRECT_URI",
    ]);
  });

  it("keeps every Dotloop action non-executable (gated false)", () => {
    expect(isActionExecutable("dotloop.loop.create_from_template")).toBe(false);
    expect(isActionExecutable("dotloop.document.upload")).toBe(false);
  });
});
