import { describe, expect, it, vi } from "vitest";

import * as setupRoute from "@/app/api/vendor/setup/route";
import { createVendorSetupPostHandler } from "@/app/api/vendor/setup/route";
import {
  createVendorSetupChallenge,
  type VendorSetupAuth,
  type VendorSetupChallenge,
  type VendorSetupChallengeStore,
  type VendorSetupClaimResult,
} from "@/lib/vendor/live-setup";

const TOKEN = "C".repeat(43);
const NOW = new Date("2026-07-30T15:00:00.000Z");
const EXPLICIT_PRODUCTION_LIVE = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
} as const;

class RouteStore implements VendorSetupChallengeStore {
  record: VendorSetupChallenge | null = null;

  async create(challenge: VendorSetupChallenge) {
    this.record = structuredClone(challenge);
    return true;
  }

  async claim(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    claimExpiresAt: string;
  }): Promise<VendorSetupClaimResult> {
    if (!this.record || this.record.tokenHash !== input.tokenHash) {
      return { kind: "missing" };
    }
    if (this.record.status === "consumed") return { kind: "consumed" };
    if (this.record.status === "effect_started") return { kind: "busy" };
    this.record = {
      ...this.record,
      status: "claimed",
      claimId: input.claimId,
      claimedAt: input.now,
      claimExpiresAt: input.claimExpiresAt,
      updatedAt: input.now,
    };
    return { kind: "claimed", challenge: structuredClone(this.record) };
  }

  async startEffects(input: { tokenHash: string; claimId: string; now: string }) {
    if (
      !this.record ||
      this.record.tokenHash !== input.tokenHash ||
      this.record.status !== "claimed" ||
      this.record.claimId !== input.claimId
    ) {
      return false;
    }
    this.record.status = "effect_started";
    this.record.effectStartedAt = input.now;
    delete this.record.claimExpiresAt;
    return true;
  }

  async consume(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    outcome: "completed" | "rejected";
  }) {
    if (
      !this.record ||
      this.record.tokenHash !== input.tokenHash ||
      (this.record.status !== "claimed" && this.record.status !== "effect_started") ||
      this.record.claimId !== input.claimId
    ) {
      return false;
    }
    this.record.status = "consumed";
    this.record.outcome = input.outcome;
    this.record.consumedAt = input.now;
    return true;
  }

  async release() {
    if (!this.record || this.record.status !== "claimed") return false;
    this.record.status = "pending";
    return true;
  }
}

async function routeHarness() {
  const store = new RouteStore();
  await createVendorSetupChallenge(
    {
      vendorId: "vendor-1",
      uid: "vendor-uid-1",
      email: "dispatch@vendor.example",
      dataMode: "live",
      inviteVersion: 1,
      lifecycleExecutionId: "2".repeat(64),
      appBaseUrl: "https://app.pmikcmetro.com",
    },
    { store, now: () => NOW, token: () => TOKEN },
  );
  const auth: VendorSetupAuth = {
    getUser: vi.fn(async () => ({
      uid: "vendor-uid-1",
      email: "dispatch@vendor.example",
      emailVerified: false,
      disabled: false,
      customClaims: {
        vendor: true,
        vendor_id: "vendor-1",
        data_mode: "live",
      },
    })),
    markEmailVerified: vi.fn(),
    generatePasswordResetLink: vi.fn(
      async () =>
        "https://pmi-kc-kb-prod.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=secret-reset-code",
    ),
  };
  return {
    store,
    auth,
    handler: createVendorSetupPostHandler(
      {
        store,
        auth,
        now: () => new Date(NOW.getTime() + 1_000),
        claimId: () => "route-claim-00000001",
        expectedFirebaseAuthDomain: "pmi-kc-kb-prod.firebaseapp.com",
        expectedPasswordResetPath: "/__/auth/action",
      },
      { resolveDescriptor: () => EXPLICIT_PRODUCTION_LIVE },
    ),
  };
}

describe("public Live Vendor setup route", () => {
  function request(body: string, headers: Record<string, string> = {}) {
    return new Request("https://app.pmikcmetro.com/api/vendor/setup", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://app.pmikcmetro.com",
        "sec-fetch-site": "same-origin",
        ...headers,
      },
      body,
    });
  }

  it("303-redirects only after completion with no-store and no-referrer protections", async () => {
    const { handler, store } = await routeHarness();
    const submitted = request(`token=${TOKEN}`);
    expect(submitted.url).not.toContain(TOKEN);
    const response = await handler(submitted);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://pmi-kc-kb-prod.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=secret-reset-code",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("location")).not.toContain(TOKEN);
    expect(await response.text()).toBe("");
    expect(store.record).toMatchObject({
      status: "consumed",
      outcome: "completed",
    });
  });

  it("is POST-only and refuses JSON, duplicate, extra, oversized, and URL tokens", async () => {
    const { handler, auth } = await routeHarness();
    expect("GET" in setupRoute).toBe(false);

    const cases = [
      request("", { "content-length": "0" }),
      request(`token=${TOKEN}&token=${TOKEN}`),
      request(`token=${TOKEN}&extra=value`),
      request("token=raw-secret"),
      request(`token=${TOKEN}`, { "content-type": "application/json" }),
      request(`token=${TOKEN}`, { "content-length": "129" }),
      new Request(`https://app.pmikcmetro.com/api/vendor/setup?token=${TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `token=${TOKEN}`,
      }),
      new Request("https://app.pmikcmetro.com/api/vendor/setup", {
        method: "GET",
      }),
    ];
    for (const submitted of cases) {
      const response = await handler(submitted);
      expect([400, 405, 413, 415]).toContain(response.status);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const text = await response.text();
      expect(text).not.toContain("raw-secret");
      expect(text).not.toContain(TOKEN);
    }
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("requires both exact Origin and same-origin fetch metadata before runtime setup", async () => {
    const { auth, store } = await routeHarness();
    const initialize = vi.fn(() => ({
      store,
      auth,
      now: () => new Date(NOW.getTime() + 1_000),
      claimId: () => "route-claim-00000002",
      expectedFirebaseAuthDomain: "pmi-kc-kb-prod.firebaseapp.com",
      expectedPasswordResetPath: "/__/auth/action",
    }));
    const handler = createVendorSetupPostHandler(initialize, {
      resolveDescriptor: () => EXPLICIT_PRODUCTION_LIVE,
    });
    const cases = [
      new Request("https://app.pmikcmetro.com/api/vendor/setup", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `token=${TOKEN}`,
      }),
      request(`token=${TOKEN}`, { origin: "" }),
      request(`token=${TOKEN}`, { "sec-fetch-site": "" }),
      request(`token=${TOKEN}`, { origin: "https://scanner.example" }),
      request(`token=${TOKEN}`, { "sec-fetch-site": "cross-site" }),
    ];

    for (const submitted of cases) {
      const response = await handler(submitted);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(initialize).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("maps lazy runtime initialization failures to the generic protected 503", async () => {
    const handler = createVendorSetupPostHandler(
      () => {
        throw new Error("sensitive initialization detail");
      },
      { resolveDescriptor: () => EXPLICIT_PRODUCTION_LIVE },
    );

    const response = await handler(request(`token=${TOKEN}`));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe('{"error":"Vendor setup is unavailable."}');
  });

  it("makes a body token single-use without reflecting it on replay", async () => {
    const { handler } = await routeHarness();
    const first = await handler(request(`token=${TOKEN}`));
    expect(first.status).toBe(303);
    const replay = await handler(request(`token=${TOKEN}`));
    expect(replay.status).toBe(410);
    expect(replay.headers.get("location")).toBeNull();
    expect(await replay.text()).not.toContain(TOKEN);
  });

  it.each([
    ["Demo", { environmentKind: "demo", dataContext: "demo", source: "explicit" }],
    [
      "Live read-only",
      {
        environmentKind: "demo",
        dataContext: "live_readonly",
        source: "explicit",
      },
    ],
    [
      "legacy Production",
      {
        environmentKind: "production",
        dataContext: "live",
        source: "legacy-node-env",
      },
    ],
  ] as const)(
    "refuses %s before reading the challenge or constructing runtime clients",
    async (_label, descriptor) => {
      const initialize = vi.fn(() => {
        throw new Error("must not initialize");
      });
      const handler = createVendorSetupPostHandler(initialize, {
        resolveDescriptor: () => descriptor,
      });

      const response = await handler(request(`token=${TOKEN}`));

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.text()).toBe('{"error":"Vendor setup is unavailable."}');
      expect(initialize).not.toHaveBeenCalled();
    },
  );
});
