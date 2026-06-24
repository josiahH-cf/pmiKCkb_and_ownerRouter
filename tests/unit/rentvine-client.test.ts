import { describe, expect, it } from "vitest";
import {
  RentVineAuthError,
  RentVineClient,
  RentVineError,
  RentVineRateLimitError,
  assertRentVineAccount,
  rentVineAccountCode,
  unwrapLeases,
  type RentVineHttpRequest,
  type RentVineHttpResponse,
  type RentVineHttpTransport,
} from "@/lib/integrations/rentvine/client";

const BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
// Obviously-fake credentials: no digits and <20 chars, so the falsification secret scanner never
// treats them as real, and the expected Basic token is computed at runtime (never a literal).
const FAKE_KEY = "demo-key";
const FAKE_SECRET = "demo-secret";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): RentVineHttpResponse {
  const bodyText = JSON.stringify(body);
  return {
    status,
    headers,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText) as unknown,
  };
}

function makeClient(handler: (request: RentVineHttpRequest) => RentVineHttpResponse) {
  const requests: RentVineHttpRequest[] = [];
  const transport: RentVineHttpTransport = {
    async send(request) {
      requests.push(request);
      return handler(request);
    },
  };
  const client = new RentVineClient(
    { baseUrl: BASE_URL, apiKey: FAKE_KEY, apiSecret: FAKE_SECRET },
    transport,
  );
  return { client, requests };
}

describe("RentVineClient request shape", () => {
  it("sends HTTP Basic auth (base64 of key:secret) and JSON content type", async () => {
    const { client, requests } = makeClient(() => jsonResponse(200, []));
    await client.listLeases();

    const expectedToken = Buffer.from(`${FAKE_KEY}:${FAKE_SECRET}`).toString("base64");
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.Authorization).toBe(`Basic ${expectedToken}`);
    expect(requests[0].headers["Content-Type"]).toBe("application/json");
    expect(requests[0].url).toBe(`${BASE_URL}/leases`);
    expect(requests[0].method).toBe("GET");
  });

  it("serializes query params", async () => {
    const { client, requests } = makeClient(() => jsonResponse(200, []));
    await client.listLeases({ limit: 1, leaseIDs: "1,2" });
    expect(requests[0].url).toContain("limit=1");
    expect(requests[0].url).toContain("leaseIDs=1%2C2");
  });
});

describe("RentVineClient response handling", () => {
  it("unwraps a { lease } list envelope", async () => {
    const { client } = makeClient(() =>
      jsonResponse(200, [{ lease: { leaseID: 1 } }, { lease: { leaseID: 2 } }]),
    );
    await expect(client.listLeases()).resolves.toEqual([{ leaseID: 1 }, { leaseID: 2 }]);
  });

  it("tolerates a { leases: [...] } envelope and a bare array", () => {
    expect(unwrapLeases({ leases: [{ lease: { leaseID: 9 } }] })).toEqual([
      { leaseID: 9 },
    ]);
    expect(unwrapLeases([{ leaseID: 3 }])).toEqual([{ leaseID: 3 }]);
    expect(unwrapLeases({ lease: { leaseID: 5 } })).toEqual([{ leaseID: 5 }]);
  });

  it("returns [] for an empty list", async () => {
    const { client } = makeClient(() => jsonResponse(200, []));
    await expect(client.listLeases()).resolves.toEqual([]);
  });

  it("throws RentVineAuthError on 401 without leaking the secret or token", async () => {
    const { client } = makeClient(() => jsonResponse(401, { error: "unauthorized" }));
    const token = Buffer.from(`${FAKE_KEY}:${FAKE_SECRET}`).toString("base64");

    let caught: unknown;
    try {
      await client.listLeases();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RentVineAuthError);
    const serialized = `${(caught as Error).message} ${JSON.stringify(caught)}`;
    expect(serialized).not.toContain(FAKE_SECRET);
    expect(serialized).not.toContain(token);
  });

  it("throws RentVineRateLimitError on 429 with the parsed Retry-After", async () => {
    const { client } = makeClient(() => jsonResponse(429, {}, { "retry-after": "7" }));
    let caught: unknown;
    try {
      await client.listLeases();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RentVineRateLimitError);
    expect((caught as RentVineRateLimitError).retryAfterSeconds).toBe(7);
  });

  it("throws RentVineError on other non-2xx", async () => {
    const { client } = makeClient(() => jsonResponse(500, {}));
    await expect(client.listLeases()).rejects.toBeInstanceOf(RentVineError);
  });

  it("probeLeases never throws: 401 -> status only, network error -> status 0", async () => {
    const { client: authClient } = makeClient(() => jsonResponse(401, {}));
    await expect(authClient.probeLeases()).resolves.toMatchObject({
      status: 401,
      count: null,
    });

    const throwing = new RentVineClient(
      { baseUrl: BASE_URL, apiKey: FAKE_KEY, apiSecret: FAKE_SECRET },
      {
        async send() {
          throw new Error("network down");
        },
      },
    );
    const probe = await throwing.probeLeases();
    expect(probe.status).toBe(0);
    expect(probe.count).toBeNull();
  });
});

describe("RentVine identity guard", () => {
  it("derives the account code from the base-url host", () => {
    expect(rentVineAccountCode(BASE_URL)).toBe("pmikcmetro");
  });

  it("accepts the expected account and rejects others", () => {
    expect(() => assertRentVineAccount(BASE_URL, "pmikcmetro")).not.toThrow();
    expect(() => assertRentVineAccount(BASE_URL, "someoneelse")).toThrow(
      /identity guard/i,
    );
  });

  it("refuses a non-Rentvine base URL host", () => {
    expect(
      () =>
        new RentVineClient(
          {
            baseUrl: "https://evil.example.com/api/manager",
            apiKey: FAKE_KEY,
            apiSecret: FAKE_SECRET,
          },
          {
            async send() {
              return jsonResponse(200, []);
            },
          },
        ),
    ).toThrow(/non-Rentvine/i);
  });

  it("requires a non-empty key and secret", () => {
    expect(
      () =>
        new RentVineClient(
          { baseUrl: BASE_URL, apiKey: "", apiSecret: FAKE_SECRET },
          {
            async send() {
              return jsonResponse(200, []);
            },
          },
        ),
    ).toThrow(/apiKey/i);
  });
});
