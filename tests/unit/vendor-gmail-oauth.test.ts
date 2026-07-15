import { describe, expect, it, vi } from "vitest";

import { VENDOR_OAUTH_SCOPES } from "@/lib/vendor/model";
import {
  beginVendorOAuth,
  completeVendorOAuth,
  type VendorOAuthState,
} from "@/lib/vendor/oauth";

const principal = {
  uid: "uid-a",
  vendorId: "vendor-a",
  email: "trade@example.com",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: 1,
};
const redirectUri = "https://app.example.com/api/vendor/oauth/callback";

describe("Vendor Gmail OAuth", () => {
  it("uses state, PKCE, offline access, exact scopes, and token-vault storage", async () => {
    let saved: VendorOAuthState | undefined;
    const store = {
      isVendorActive: async (_vendorId: string, _uid: string, email: string) =>
        email === principal.email,
      saveState: async (state: VendorOAuthState) => void (saved = state),
      claimState: async () => saved ?? null,
      saveConnection: vi.fn().mockResolvedValue(undefined),
    };
    const started = await beginVendorOAuth(
      { principal, clientId: "client-id", redirectUri, expectedRedirectUri: redirectUri },
      store,
      1_000,
    );
    const url = new URL(started.authorizationUrl);
    const state = url.searchParams.get("state")!;
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(
      [...VENDOR_OAUTH_SCOPES].sort(),
    );
    const vault = vi.fn().mockResolvedValue("projects/p/secrets/vendor-a");
    const result = await completeVendorOAuth(
      { principal, state, code: "code", redirectUri, expectedRedirectUri: redirectUri },
      {
        store,
        provider: {
          exchange: vi.fn().mockResolvedValue({
            mailboxEmail: principal.email,
            refreshToken: "refresh-secret",
            scopes: VENDOR_OAUTH_SCOPES,
            provider: "google",
          }),
        },
        vault: { storeRefreshToken: vault, destroySecret: vi.fn() },
        now: () => 2_000,
      },
    );
    expect(result).toEqual({
      provider: "google",
      mailboxEmail: principal.email,
      status: "connected",
    });
    expect(JSON.stringify(store.saveConnection.mock.calls)).not.toContain(
      "refresh-secret",
    );
    expect(vault).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: "refresh-secret" }),
    );
  });

  it.each([
    {
      mailboxEmail: "other@example.com",
      scopes: VENDOR_OAUTH_SCOPES,
      provider: "google",
    },
    {
      mailboxEmail: principal.email,
      scopes: [VENDOR_OAUTH_SCOPES[0]],
      provider: "google",
    },
    {
      mailboxEmail: principal.email,
      scopes: [...VENDOR_OAUTH_SCOPES, "extra"],
      provider: "google",
    },
  ])("rejects mailbox/scope/provider drift before vault write", async (token) => {
    const vault = vi.fn();
    await expect(
      completeVendorOAuth(
        {
          principal,
          state: "state",
          code: "code",
          redirectUri,
          expectedRedirectUri: redirectUri,
        },
        {
          store: {
            isVendorActive: vi.fn().mockResolvedValue(true),
            saveState: vi.fn(),
            claimState: vi.fn().mockResolvedValue({
              stateHash: "hash",
              vendorId: principal.vendorId,
              actorUid: principal.uid,
              redirectUri,
              pkceVerifier: "verifier",
              expiresAtMs: 10_000,
            }),
            saveConnection: vi.fn(),
          },
          provider: {
            exchange: vi.fn().mockResolvedValue({ ...token, refreshToken: "secret" }),
          } as never,
          vault: { storeRefreshToken: vault, destroySecret: vi.fn() },
          now: () => 2_000,
        },
      ),
    ).rejects.toBeDefined();
    expect(vault).not.toHaveBeenCalled();
  });

  it("rejects a changed verified login email before saving OAuth state", async () => {
    const saveState = vi.fn();
    await expect(
      beginVendorOAuth(
        {
          principal: { ...principal, email: "changed@example.com" },
          clientId: "client-id",
          redirectUri,
          expectedRedirectUri: redirectUri,
        },
        {
          isVendorActive: async (_vendorId, _uid, email) => email === principal.email,
          saveState,
          claimState: vi.fn(),
          saveConnection: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(saveState).not.toHaveBeenCalled();
  });

  it("rejects invited-email drift at callback before state claim or provider exchange", async () => {
    const claimState = vi.fn();
    const exchange = vi.fn();
    await expect(
      completeVendorOAuth(
        {
          principal: { ...principal, email: "changed@example.com" },
          state: "state",
          code: "code",
          redirectUri,
          expectedRedirectUri: redirectUri,
        },
        {
          store: {
            isVendorActive: async (_vendorId, _uid, email) => email === principal.email,
            saveState: vi.fn(),
            claimState,
            saveConnection: vi.fn(),
          },
          provider: { exchange },
          vault: { storeRefreshToken: vi.fn(), destroySecret: vi.fn() },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(claimState).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("revalidates the invited email before exchange and connection persistence", async () => {
    const state: VendorOAuthState = {
      stateHash: "hash",
      vendorId: principal.vendorId,
      actorUid: principal.uid,
      redirectUri,
      pkceVerifier: "verifier",
      expiresAtMs: 10_000,
    };
    const exchange = vi.fn().mockResolvedValue({
      mailboxEmail: principal.email,
      refreshToken: "refresh-secret",
      scopes: VENDOR_OAUTH_SCOPES,
      provider: "google",
    });
    const vault = vi.fn().mockResolvedValue("projects/p/secrets/vendor-a");
    const destroySecret = vi.fn().mockResolvedValue(undefined);
    const saveConnection = vi.fn();
    const active = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      completeVendorOAuth(
        {
          principal,
          state: "state",
          code: "code",
          redirectUri,
          expectedRedirectUri: redirectUri,
        },
        {
          store: {
            isVendorActive: active,
            saveState: vi.fn(),
            claimState: vi.fn().mockResolvedValue(state),
            saveConnection,
          },
          provider: { exchange },
          vault: { storeRefreshToken: vault, destroySecret },
          now: () => 2_000,
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(vault).toHaveBeenCalledTimes(1);
    expect(destroySecret).toHaveBeenCalledWith("projects/p/secrets/vendor-a");
    expect(saveConnection).not.toHaveBeenCalled();
  });
});
