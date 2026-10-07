// S182 AC (Dotloop AI boundary, fail-first): a Dotloop verdict is derived from provider API reads,
// so the AI-facing verified set never contains it and never computes it, even after an Admin's
// fresh check folded it into the Connections page's shared cache.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readiness: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/connections/dotloop-runtime", () => ({
  readDotloopRuntimeReadiness: mocks.readiness,
  refreshDotloopResourceReadiness: mocks.refresh,
}));

import {
  clearConnectorVerificationCache,
  getVerifiedConnectorIds,
  getVerifiedConnectorIdsForAiContext,
  PROVIDER_DERIVED_VERIFICATION_IDS,
  verifyConnectorNow,
} from "@/lib/connections/verification";

const env = {
  DOTLOOP_OAUTH_CLIENT_ID: "client",
  DOTLOOP_OAUTH_CLIENT_SECRET: "secret",
  DOTLOOP_OAUTH_REDIRECT_URI: "https://a.example/api/connections/dotloop/callback",
  CONNECTOR_SECRET_VAULT_PROJECT_ID: "pmi-kc-kb-prod",
};
const now = Date.parse("2026-10-07T12:00:00.000Z");

beforeEach(() => {
  clearConnectorVerificationCache();
  mocks.readiness.mockReset();
  mocks.refresh.mockReset();
  mocks.readiness.mockResolvedValue({
    state: "connected",
    reasons: [],
    freshness: { observedAt: "2026-10-07T11:00:00.000Z", stale: false },
  });
  mocks.refresh.mockResolvedValue({
    readiness: { state: "connected" },
    observation: {
      account: { id: "55", email: "integrations@pmikcmetro.com" },
      accountError: null,
      profilesError: null,
    },
  });
});

describe("S182 provider-derived verification stays out of AI context", () => {
  it("labels Dotloop as provider-derived", () => {
    expect(PROVIDER_DERIVED_VERIFICATION_IDS).toContain("dotloop");
  });

  it("never computes the Dotloop verdict for an AI context", async () => {
    const ids = await getVerifiedConnectorIdsForAiContext(env, now);
    expect(ids.has("dotloop")).toBe(false);
    expect(mocks.readiness).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("removes a cached Dotloop verdict before the AI context sees the set", async () => {
    await expect(verifyConnectorNow("dotloop", env, now, "admin-1")).resolves.toEqual({
      supported: true,
      verified: true,
    });
    expect(mocks.refresh).toHaveBeenCalledWith({ actorUid: "admin-1", env });
    expect((await getVerifiedConnectorIds(env, now)).has("dotloop")).toBe(true);
    expect((await getVerifiedConnectorIdsForAiContext(env, now)).has("dotloop")).toBe(
      false,
    );
  });

  it("renders the Connections page verdict from the cached observation without a provider read", async () => {
    const ids = await getVerifiedConnectorIds(env, now);
    expect(ids.has("dotloop")).toBe(true);
    expect(mocks.readiness).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
