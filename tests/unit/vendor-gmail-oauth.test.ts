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
});
