import { describe, expect, it, vi } from "vitest";

import {
  preflightProductionAssurance,
  verifiedAssuranceClient,
  type AssuranceAuth,
} from "../../scripts/production-assurance-preflight";

const PROJECT = "pmi-kc-kb-prod";
const LIVE_ENV = {
  NODE_ENV: "production",
  ENVIRONMENT_KIND: "production",
  DATA_CONTEXT: "live",
  GOOGLE_CLOUD_PROJECT: PROJECT,
  FIRESTORE_DATABASE_ID: "(default)",
} satisfies NodeJS.ProcessEnv;

function fakeAuth(email: string | null): {
  readonly auth: AssuranceAuth;
  readonly getCredentials: ReturnType<typeof vi.fn>;
  readonly getClient: ReturnType<typeof vi.fn>;
  readonly request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async () => ({ data: { email } }));
  const getCredentials = vi.fn(async () => ({ client_email: email }));
  const getClient = vi.fn(async () => ({ request }) as never);
  return {
    auth: { getCredentials, getClient },
    getCredentials,
    getClient,
    request,
  };
}

async function runAfterPreflight(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly auth: AssuranceAuth;
  readonly operation: () => Promise<void>;
}): Promise<void> {
  const context = await preflightProductionAssurance(
    {
      project: PROJECT,
      deadlineAtMs: Date.now() + 5_000,
    },
    {
      env: input.env,
      loadEnvironment: vi.fn(),
      createAuth: () => input.auth,
    },
  );
  verifiedAssuranceClient(context, PROJECT);
  await input.operation();
}

describe("production assurance aggregate preflight", () => {
  it.each([
    ["key file", { GOOGLE_APPLICATION_CREDENTIALS: "/tmp/foreign.json" }],
    ["emulator", { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }],
  ])(
    "refuses a %s before constructing a client or starting live work",
    async (_name, patch) => {
      const fake = fakeAuth("assurance@pmi-kc-kb-prod.iam.gserviceaccount.com");
      const createAuth = vi.fn(() => fake.auth);
      const operation = vi.fn(async () => undefined);

      await expect(
        preflightProductionAssurance(
          { project: PROJECT, deadlineAtMs: Date.now() + 5_000 },
          {
            env: { ...LIVE_ENV, ...patch },
            loadEnvironment: vi.fn(),
            createAuth,
          },
        ).then(operation),
      ).rejects.toThrow(/^assurance_/);
      expect(createAuth).not.toHaveBeenCalled();
      expect(fake.getCredentials).not.toHaveBeenCalled();
      expect(fake.getClient).not.toHaveBeenCalled();
      expect(fake.request).not.toHaveBeenCalled();
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it("refuses a foreign declared ADC principal before constructing a client or live work", async () => {
    const fake = fakeAuth("operator@gmail.com");
    const operation = vi.fn(async () => undefined);

    await expect(
      runAfterPreflight({ env: LIVE_ENV, auth: fake.auth, operation }),
    ).rejects.toThrow("assurance_adc_identity_invalid");
    expect(fake.getCredentials).toHaveBeenCalledOnce();
    expect(fake.getClient).not.toHaveBeenCalled();
    expect(fake.request).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("returns and reuses the exact client only after a managed principal passes", async () => {
    const fake = fakeAuth("assurance@pmi-kc-kb-prod.iam.gserviceaccount.com");
    const context = await preflightProductionAssurance(
      { project: PROJECT, deadlineAtMs: Date.now() + 5_000 },
      {
        env: LIVE_ENV,
        loadEnvironment: vi.fn(),
        createAuth: () => fake.auth,
      },
    );

    expect(verifiedAssuranceClient(context, PROJECT)).toBe(context.client);
    expect(fake.getCredentials).toHaveBeenCalledOnce();
    expect(fake.getClient).toHaveBeenCalledOnce();
    expect(fake.request).not.toHaveBeenCalled();
  });
});

describe("user-credential identity read (S51 quota-header fix)", () => {
  it("reads userinfo with only the bearer token and never the ADC quota-project header", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(Object.keys(headers).map((key) => key.toLowerCase())).toEqual([
        "authorization",
      ]);
      expect(headers.Authorization).toBe("Bearer synthetic-token");
      return new Response(JSON.stringify({ email: "operator@pmikcmetro.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const request = vi.fn();
    const client = {
      request,
      getAccessToken: vi.fn(async () => ({ token: "synthetic-token" })),
    };
    const auth = {
      getCredentials: vi.fn(async () => ({})),
      getClient: vi.fn(async () => client as never),
    };
    const context = await preflightProductionAssurance(
      { project: "pmi-kc-kb-prod", deadlineAtMs: Date.now() + 60_000 },
      {
        env: {
          ENVIRONMENT_KIND: "production",
          DATA_CONTEXT: "live",
        } as unknown as NodeJS.ProcessEnv,
        loadEnvironment: () => undefined,
        createAuth: () => auth,
        fetch: fetchImpl as unknown as typeof fetch,
      },
    );
    expect(context.project).toBe("pmi-kc-kb-prod");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });
});
