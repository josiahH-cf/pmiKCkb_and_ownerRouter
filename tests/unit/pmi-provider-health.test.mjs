import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalRevisionName,
  safeProviderFailure,
  verifyProviderHealth as runProviderHealth,
} from "../../scripts/auth/provider-health.mjs";

const verifyProviderHealth = (options = {}) =>
  runProviderHealth({
    ...options,
    configRoot: "/fixture/registered",
    localRentvineProbe: async () => ({
      state: "ok",
      detail: "local fixture metadata read verified",
    }),
  });
const f = vi.hoisted(() => ({
  request: vi.fn(),
  connection: {},
  email: "integrations@pmikcmetro.com",
  access: vi.fn(),
  readSecret: vi.fn(),
  del: vi.fn(),
  gmail: vi.fn(),
  storeRead: vi.fn(),
  storeClose: vi.fn(),
}));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { request: f.request };
    }
  },
}));
vi.mock("../../lib/integrations/rentvine/client.ts", () => ({
  assertRentVineAccount: vi.fn(),
  createFetchTransport: vi.fn(),
  RentVineClient: class {
    async listLeaseStatuses() {
      return [{}, {}];
    }
  },
}));
vi.mock("../../lib/google-sheets/read-client.ts", () => ({
  GoogleSheetsApiReader: class {
    async listTabTitles() {
      return ["tab"];
    }
  },
}));
vi.mock("../../lib/google-drive/drive-dwd.ts", () => ({
  GoogleDriveClient: class {
    async findFolder() {
      return null;
    }
  },
}));
vi.mock("../../lib/gmail-runtime/dwd-token.ts", () => ({ mintGmailDwdToken: f.gmail }));
vi.mock("@google-cloud/discoveryengine", () => ({
  v1beta: {
    DataStoreServiceClient: class {
      getDataStore = f.storeRead;
      close = f.storeClose;
    },
  },
}));
vi.mock("firebase-admin/app", () => ({
  initializeApp: () => ({}),
  applicationDefault: () => ({}),
  deleteApp: f.del,
}));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({}) }));
vi.mock("../../lib/firestore/connector-connections.ts", () => ({
  FirestoreConnectorConnectionStore: class {
    async getConnection() {
      return f.connection;
    }
  },
}));
vi.mock("../../lib/connections/secret-manager-connector-vault.ts", () => ({
  SecretManagerConnectorSecretVault: class {
    readSecret = f.readSecret;
  },
}));
vi.mock("../../lib/connections/dotloop-runtime.ts", () => ({
  DotloopRuntimeTokenProvider: class {
    accessToken = f.access;
  },
  dotloopRuntimeTransport: {},
}));
vi.mock("../../lib/connections/dotloop-oauth.ts", () => ({
  readDotloopOAuthConfig: () => ({ configured: true, config: {} }),
}));
vi.mock("../../lib/integrations/dotloop/client.ts", () => ({
  DotloopClient: class {
    constructor({ tokens }) {
      this.tokens = tokens;
    }
    async getAccount() {
      await this.tokens.accessToken();
      return { email: f.email };
    }
  },
}));

const service = "projects/pmi-kc-kb-prod/locations/us-central1/services/pmi-kc-app";
const env = {
  ENVIRONMENT_KIND: "production",
  DATA_CONTEXT: "live",
  CONNECTOR_SECRET_VAULT_PROJECT_ID: "pmi-kc-kb-prod",
  MARKET_COMP_PROVIDER: "rentcast",
  RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager/",
  SHEETS_IMPERSONATE_SA: "reader@pmi-kc-kb-prod.iam.gserviceaccount.com",
  SHEETS_DWD_SUBJECT: "integrations@pmikcmetro.com",
  RENEWAL_SHEET_ID: "sheet",
  SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({ space: "store" }),
};
beforeEach(() => {
  vi.clearAllMocks();
  f.email = "integrations@pmikcmetro.com";
  f.connection = {
    status: "connected",
    oauthState: "ready",
    tokenExpiresAt: "2099-01-01T00:00:00Z",
    secretRef: "existing-opaque-reference",
  };
  f.access.mockResolvedValue("fixture-existing-token");
  f.readSecret.mockResolvedValue({ ok: true, secret: "fixture-existing-token" });
  f.gmail.mockResolvedValue("fixture-readonly-token");
  f.storeRead.mockResolvedValue([{}]);
  f.storeClose.mockResolvedValue();
  f.del.mockResolvedValue();
  f.request.mockImplementation(async ({ url }) => {
    if (url.endsWith("/pmi-kc-app"))
      return {
        data: {
          trafficStatuses: [
            { revision: "pmi-kc-app-current", percent: 100 },
            { revision: "pmi-kc-app-candidate", tag: "candidate" },
          ],
        },
      };
    if (url.includes("/revisions/"))
      return {
        data: {
          containers: [
            {
              env: [
                ...Object.entries(env).map(([name, value]) => ({ name, value })),
                ...[
                  "RENTVINE_API_KEY",
                  "RENTVINE_API_SECRET",
                  "DOTLOOP_OAUTH_CLIENT_SECRET",
                  "RENTCAST_API_KEY",
                ].map((name) => ({
                  name,
                  valueSource: {
                    secretKeyRef: {
                      secret: `projects/pmi-kc-kb-prod/secrets/${name}`,
                      version: "1",
                    },
                  },
                })),
              ],
            },
          ],
        },
      };
    if (url.startsWith("https://secretmanager.googleapis.com/"))
      return {
        data: {
          payload: { data: Buffer.from("fixture-secret-never-log").toString("base64") },
        },
      };
    throw new Error("unexpected provider request");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ emailAddress: "integrations@pmikcmetro.com" }),
    })),
  );
});

describe("canonical serving revision selection", () => {
  it("uses canonical traffic's short revision rather than the latest zero-traffic candidate", () => {
    expect(
      canonicalRevisionName({
        latestReadyRevision: `${service}/revisions/pmi-kc-app-candidate`,
        trafficStatuses: [
          { revision: "pmi-kc-app-current", percent: 100 },
          { revision: "pmi-kc-app-candidate", tag: "cand" },
        ],
      }),
    ).toBe(`${service}/revisions/pmi-kc-app-current`);
  });
  it("accepts an already qualified current-service revision", () => {
    expect(
      canonicalRevisionName({
        trafficStatuses: [
          { revision: `${service}/revisions/pmi-kc-app-current`, percent: 100 },
        ],
      }),
    ).toBe(`${service}/revisions/pmi-kc-app-current`);
  });
  it.each([
    { trafficStatuses: [] },
    {
      trafficStatuses: [
        { revision: "pmi-kc-app-a", percent: 50 },
        { revision: "pmi-kc-app-b", percent: 50 },
      ],
    },
    { trafficStatuses: [{ revision: "../../other-project", percent: 100 }] },
  ])("fails closed for unresolved traffic %j", (input) => {
    expect(() => canonicalRevisionName(input)).toThrow("canonical_revision_unresolved");
  });
});
describe("provider health boundaries", () => {
  it("refuses provider maintenance when serving configuration is outside explicit Production/Live", async () => {
    const original = f.request.getMockImplementation();
    f.request.mockImplementation(async (input) => {
      const result = await original(input);
      if (input.url.includes("/revisions/"))
        result.data.containers[0].env = result.data.containers[0].env.map((entry) =>
          entry.name === "ENVIRONMENT_KIND" ? { ...entry, value: "demo" } : entry,
        );
      return result;
    });
    const result = await verifyProviderHealth();
    expect(result.state).toBe("blocked");
    expect(f.access).not.toHaveBeenCalled();
    expect(
      f.request.mock.calls.some(([input]) =>
        input.url.startsWith("https://secretmanager.googleapis.com/"),
      ),
    ).toBe(false);
  });
  it("does not substitute another vault project for the configured existing binding", async () => {
    const original = f.request.getMockImplementation();
    f.request.mockImplementation(async (input) => {
      const result = await original(input);
      if (input.url.includes("/revisions/"))
        result.data.containers[0].env = result.data.containers[0].env.filter(
          (entry) => entry.name !== "CONNECTOR_SECRET_VAULT_PROJECT_ID",
        );
      return result;
    });
    const result = await verifyProviderHealth();
    expect(result.checks.find((item) => item.service === "dotloop")).toMatchObject({
      state: "blocked",
      code: "dotloop_vault_binding_mismatch",
    });
    expect(f.access).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain earlier credential refresh", async () => {
    f.connection.refreshOutcomeUncertain = true;
    const result = await verifyProviderHealth();
    expect(result.checks.find((item) => item.service === "dotloop")).toMatchObject({
      state: "blocked",
      code: "dotloop_refresh_outcome_uncertain",
    });
    expect(f.access).not.toHaveBeenCalled();
  });
  it("cannot declare selected RentCast authentication ready without a configured binding", async () => {
    const original = f.request.getMockImplementation();
    f.request.mockImplementation(async (input) => {
      const result = await original(input);
      if (input.url.includes("/revisions/"))
        result.data.containers[0].env = result.data.containers[0].env.filter(
          (entry) => entry.name !== "RENTCAST_API_KEY",
        );
      return result;
    });
    const result = await verifyProviderHealth();
    expect(result.state).toBe("blocked");
    expect(result.checks.find((item) => item.service === "rentcast")).toMatchObject({
      configured: false,
      state: "blocked",
      code: "rentcast_key_missing",
    });
  });

  it("verifies safe reads while retaining paid/generation exceptions", async () => {
    const lines = [];
    const result = await verifyProviderHealth({
      checkOnly: true,
      emit: (line) => lines.push(line),
    });
    expect(result.state).toBe("verified_with_exceptions");
    expect(result.checks.find((item) => item.service === "rentcast")).toMatchObject({
      state: "not_tested",
    });
    expect(f.access).not.toHaveBeenCalled();
    expect(f.readSecret).toHaveBeenCalledOnce();
    expect(f.gmail).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        subject: "integrations@pmikcmetro.com",
      }),
    );
    expect(JSON.stringify({ lines, result })).not.toContain("fixture-secret");
    expect(JSON.stringify({ lines, result })).not.toContain("fixture-existing-token");
    expect(f.storeClose).toHaveBeenCalledOnce();
    expect(f.del).toHaveBeenCalledOnce();
  });
  it("does not refresh expired Dotloop credentials in check mode", async () => {
    f.connection.tokenExpiresAt = "2000-01-01T00:00:00Z";
    const result = await verifyProviderHealth({ checkOnly: true });
    expect(result.state).toBe("conditional");
    expect(result.checks.find((item) => item.service === "dotloop").code).toBe(
      "dotloop_refresh_required",
    );
    expect(f.access).not.toHaveBeenCalled();
    expect(f.readSecret).not.toHaveBeenCalled();
  });
  it("uses only the existing managed token provider in default mode", async () => {
    f.connection.tokenExpiresAt = "2000-01-01T00:00:00Z";
    const result = await verifyProviderHealth();
    expect(result.state).toBe("verified_with_exceptions");
    expect(f.access).toHaveBeenCalledOnce();
  });
  it("reports revoked authorization without starting a new grant", async () => {
    f.connection.oauthState = "refresh_needed";
    const result = await verifyProviderHealth();
    expect(result.state).toBe("blocked");
    expect(result.checks.find((item) => item.service === "dotloop").code).toBe(
      "dotloop_reconnect_required",
    );
    expect(f.access).not.toHaveBeenCalled();
  });
  it("blocks unexpected Dotloop account after a real account read", async () => {
    f.email = "unexpected@pmikcmetro.com";
    const result = await verifyProviderHealth();
    expect(result.checks.find((item) => item.service === "dotloop")).toMatchObject({
      state: "blocked",
      code: "wrong_provider_identity",
    });
  });
  it("distinguishes permission denial and suppresses provider bodies and token-like messages", () => {
    const result = safeProviderFailure({
      response: { status: 403, data: { token: "sensitive" } },
      message: "sensitive",
    });
    expect(result.code).toBe("permission_denied");
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
});
