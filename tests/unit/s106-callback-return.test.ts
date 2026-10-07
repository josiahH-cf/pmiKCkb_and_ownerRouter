// S106 AC-S106-1/2/5 (fail-first): the real callback route returns to the Connections screen with a
// safe result name for every outcome. The final URL never carries the code or state; a forged,
// replayed or other-actor state never connects; success needs the post-consent account check.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDotloopFake, createMemoryVault } from "@/tests/helpers/dotloop-fake";

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" } as {
    uid: string;
    email: string;
    role: string;
  } | null,
  authStatus: 401 as 401 | 403,
  states: new Map<string, { actorUid: string; consumed: boolean }>(),
  created: [] as { secretRef: string; generationId: string }[],
  verifyOk: true,
  transport: null as unknown,
  vault: null as unknown,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapability: async () => {
      if (!mocks.user) throw new actual.AuthError("Sign in required.", mocks.authStatus);
      return mocks.user;
    },
  };
});
vi.mock("@/lib/firestore/dotloop-oauth-states", () => ({
  FirestoreDotloopOAuthStateStore: class {
    async mint() {}
    async consume(input: { state: string; actorUid: string }) {
      const entry = mocks.states.get(input.state);
      if (!entry || entry.consumed) return null;
      entry.consumed = true;
      return entry.actorUid === input.actorUid ? { actorUid: entry.actorUid } : null;
    }
  },
}));
vi.mock("@/lib/firestore/connector-connections", () => ({
  FirestoreConnectorConnectionStore: class {
    async createConnectedConnection(input: { secretRef: string; generationId: string }) {
      mocks.created.push(input);
      return input;
    }
  },
}));
vi.mock("@/lib/connections/connector-secret-vault", () => ({
  resolveConnectorSecretVault: () => mocks.vault,
}));
vi.mock("@/lib/connections/dotloop-runtime", () => ({
  dotloopRuntimeTransport: {
    fetch: (input: unknown) =>
      (mocks.transport as { fetch: (i: unknown) => unknown }).fetch(input),
  },
  refreshDotloopResourceReadiness: async () => ({
    readiness: { state: "missing_resources" },
    observation: mocks.verifyOk
      ? {
          account: { id: "55", email: "integrations@pmikcmetro.com" },
          accountError: null,
        }
      : { account: null, accountError: "unavailable" },
  }),
}));

import { GET } from "@/app/api/connections/dotloop/callback/route";

const STATE = "0f1e2d3c-4b5a-4968-8776-655443322110";

function callback(query: string) {
  return GET(
    new Request(`https://pmi-kc-app.example/api/connections/dotloop/callback?${query}`),
  );
}

function expectReturn(response: Response, result: string) {
  expect(response.status).toBe(303);
  const location = response.headers.get("location") ?? "";
  expect(location).toBe(
    `https://pmi-kc-app.example/connections?dotloop=${result}#connector-dotloop`,
  );
  expect(location).not.toMatch(/code=|state=|good-code|access-|refresh-/);
  expect(response.headers.get("cache-control")).toBe("no-store");
}

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("DOTLOOP_OAUTH_CLIENT_ID", "client-public-1");
  vi.stubEnv("DOTLOOP_OAUTH_CLIENT_SECRET", "client-secret-1");
  vi.stubEnv(
    "DOTLOOP_OAUTH_REDIRECT_URI",
    "https://pmi-kc-app.example/api/connections/dotloop/callback",
  );
  mocks.user = { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" };
  mocks.authStatus = 401;
  mocks.states.clear();
  mocks.states.set(STATE, { actorUid: "admin-1", consumed: false });
  mocks.created.length = 0;
  mocks.verifyOk = true;
  mocks.transport = createDotloopFake();
  mocks.vault = createMemoryVault();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("S106 callback returns to the application (AC-S106-5)", () => {
  it("connects only after exchange, vault storage and the account check, then returns to Connections", async () => {
    const response = await callback(`code=good-code&state=${STATE}`);
    expectReturn(response, "connected");
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0].secretRef).toMatch(/^vault:\/\/dotloop\//);
  });

  it("reports a stored but unverified authorization as not yet connected", async () => {
    mocks.verifyOk = false;
    const response = await callback(`code=good-code&state=${STATE}`);
    expectReturn(response, "connected_unverified");
  });

  it("returns a denial to the application without a connection", async () => {
    const response = await callback(`error=access_denied&state=${STATE}`);
    expectReturn(response, "denied");
    expect(mocks.created).toHaveLength(0);
  });

  it("refuses forged, replayed and other-actor states (AC-S106-2)", async () => {
    expectReturn(
      await callback("code=good-code&state=forged-state-value-0000"),
      "invalid_state",
    );
    mocks.user = { uid: "admin-2", email: "other@pmikcmetro.com", role: "Admin" };
    expectReturn(await callback(`code=good-code&state=${STATE}`), "invalid_state");
    // The other actor's attempt burned the state; the original actor cannot replay it either.
    mocks.user = { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" };
    expectReturn(await callback(`code=good-code&state=${STATE}`), "invalid_state");
    expect(mocks.created).toHaveLength(0);
  });

  it("never exchanges a code for a non-Admin or a signed-out browser", async () => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    expectReturn(await callback(`code=good-code&state=${STATE}`), "not_permitted");
    mocks.user = null;
    expectReturn(await callback(`code=good-code&state=${STATE}`), "sign_in_required");
    expect(mocks.states.get(STATE)?.consumed).toBe(false);
    expect(mocks.created).toHaveLength(0);
  });

  it("returns a storage failure without claiming a connection", async () => {
    mocks.vault = {
      async capability() {
        return "not_configured" as const;
      },
      async storeSecret() {
        return { ok: false as const, reason: "not_configured" as const };
      },
      async destroySecret() {
        return { ok: false as const, reason: "not_configured" as const };
      },
    };
    expectReturn(await callback(`code=good-code&state=${STATE}`), "storage_unavailable");
    expect(mocks.created).toHaveLength(0);
  });
});
