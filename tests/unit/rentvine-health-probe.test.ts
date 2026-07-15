import { describe, expect, it } from "vitest";
import {
  RentVineClient,
  type RentVineHttpResponse,
  type RentVineHttpTransport,
} from "@/lib/integrations/rentvine/client";
import { createRentVineHealthCheckTransport } from "@/lib/integrations/rentvine/health-probe";
import { getHealthCheckContract, runHealthCheck } from "@/lib/integrations/health-checks";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
const FAKE_KEY = "demo-key";
const FAKE_SECRET = "demo-secret";

function clientReturning(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): { client: RentVineClient; sendCount: () => number } {
  let calls = 0;
  const bodyText = JSON.stringify(body);
  const transport: RentVineHttpTransport = {
    async send(): Promise<RentVineHttpResponse> {
      calls += 1;
      return {
        status,
        headers,
        text: async () => bodyText,
        json: async () => JSON.parse(bodyText) as unknown,
      };
    },
  };
  const client = new RentVineClient(
    { baseUrl: BASE_URL, apiKey: FAKE_KEY, apiSecret: FAKE_SECRET },
    transport,
  );
  return { client, sendCount: () => calls };
}

const contract = getHealthCheckContract("health.rentvine.api_key");
if (!contract) {
  throw new Error("Expected the health.rentvine.api_key contract to exist.");
}

describe("createRentVineHealthCheckTransport", () => {
  it("passes all four steps on a healthy list response and records rate-limit headers", async () => {
    const { client } = clientReturning(200, [{ lease: { leaseID: 1 } }], {
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "99",
    });
    const result = await runHealthCheck(
      contract,
      createRentVineHealthCheckTransport(client),
    );

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.step_id)).toEqual(
      contract.steps.map((step) => step.id),
    );
    expect(result.steps.every((step) => step.ok)).toBe(true);
    const rateStep = result.steps.find((step) => step.step_id === "rentvine.rate_limit");
    expect(rateStep?.detail).toContain("x-ratelimit-limit");
  });

  it("fails at auth on 401 and marks later steps not attempted", async () => {
    const { client } = clientReturning(401, { error: "unauthorized" });
    const result = await runHealthCheck(
      contract,
      createRentVineHealthCheckTransport(client),
    );

    expect(result.ok).toBe(false);
    expect(result.steps[0]).toMatchObject({ step_id: "rentvine.config", ok: true });
    expect(result.steps[1]).toMatchObject({ step_id: "rentvine.auth", ok: false });
    expect(result.steps[2]).toMatchObject({
      step_id: "rentvine.probe",
      ok: false,
      detail: "not attempted",
    });
    expect(result.steps[3]).toMatchObject({
      step_id: "rentvine.rate_limit",
      ok: false,
      detail: "not attempted",
    });
  });

  it("makes at most one network call across the steps and leaks no secret in detail", async () => {
    const { client, sendCount } = clientReturning(200, [{ lease: { leaseID: 1 } }]);
    const result = await runHealthCheck(
      contract,
      createRentVineHealthCheckTransport(client),
    );

    expect(sendCount()).toBe(1);
    const token = Buffer.from(`${FAKE_KEY}:${FAKE_SECRET}`).toString("base64");
    const allDetail = result.steps.map((step) => step.detail ?? "").join(" ");
    expect(allDetail).not.toContain(FAKE_SECRET);
    expect(allDetail).not.toContain(token);
  });
});

describe("Action Registry stays non-executable for the live read paths", () => {
  it("keeps rentvine.lease.read and google_sheets.renewal_checklist.read production_allowed:false", () => {
    for (const key of ["rentvine.lease.read", "google_sheets.renewal_checklist.read"]) {
      const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
      expect(entry, key).toBeDefined();
      expect(entry?.production_allowed, key).toBe(false);
    }
  });

  it("keeps every seed entry non-executable except the allow-listed Gmail actions", () => {
    expect(
      ACTION_REGISTRY_SEED.filter((entry) => entry.production_allowed).map(
        (entry) => entry.key,
      ),
    ).toEqual(["gmail.mailbox.read", "gmail.thread.reply", "gmail.label.apply"]);
  });
});
