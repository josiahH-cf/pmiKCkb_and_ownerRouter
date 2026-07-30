import { describe, expect, it, vi } from "vitest";

import {
  VendorSetupDependencyError,
  VendorSetupPublicError,
  completeVendorSetup,
  createVendorSetupChallenge,
  vendorSetupEmailHash,
  vendorSetupTokenHash,
  type VendorSetupAuth,
  type VendorSetupChallenge,
  type VendorSetupChallengeStore,
  type VendorSetupClaimResult,
} from "@/lib/vendor/live-setup";

const TOKEN = "A".repeat(43);
const SECOND_TOKEN = "B".repeat(43);
const NOW = new Date("2026-07-30T12:00:00.000Z");
const CLAIM_ID = "claim-000000000001";
const EMAIL = "dispatch@vendor.example";
const VENDOR_ID = "vendor-live-1";
const UID = "firebase-live-vendor-1";
const INVITE_VERSION = 1;
const LIFECYCLE_EXECUTION_ID = "1".repeat(64);
const FIREBASE_AUTH_DOMAIN = "pmi-kc-kb-prod.firebaseapp.com";
const FIREBASE_RESET_PATH = "/__/auth/action";
const VALID_RESET_LINK = `https://${FIREBASE_AUTH_DOMAIN}${FIREBASE_RESET_PATH}?mode=resetPassword&oobCode=opaque`;

class MemoryChallengeStore implements VendorSetupChallengeStore {
  readonly records = new Map<string, VendorSetupChallenge>();
  createResults: boolean[] = [];
  consumeFailures = 0;
  consumeResult = true;
  trace: string[] = [];

  async create(challenge: VendorSetupChallenge) {
    this.trace.push("create");
    const configured = this.createResults.shift();
    if (configured === false || this.records.has(challenge.tokenHash)) return false;
    this.records.set(challenge.tokenHash, structuredClone(challenge));
    return true;
  }

  async claim(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    claimExpiresAt: string;
  }): Promise<VendorSetupClaimResult> {
    this.trace.push("claim");
    const record = this.records.get(input.tokenHash);
    if (!record) return { kind: "missing" };
    if (record.status === "consumed") return { kind: "consumed" };
    if (record.status === "effect_started") return { kind: "busy" };
    if (Date.parse(record.expiresAt) <= Date.parse(input.now)) {
      record.status = "consumed";
      record.outcome = "expired";
      return { kind: "expired" };
    }
    if (
      record.status === "claimed" &&
      record.claimExpiresAt &&
      Date.parse(record.claimExpiresAt) > Date.parse(input.now)
    ) {
      return { kind: "busy" };
    }
    Object.assign(record, {
      status: "claimed",
      claimId: input.claimId,
      claimedAt: input.now,
      claimExpiresAt: input.claimExpiresAt,
      updatedAt: input.now,
    });
    return { kind: "claimed", challenge: structuredClone(record) };
  }

  async consume(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    outcome: "completed" | "rejected";
  }) {
    this.trace.push(`consume:${input.outcome}`);
    if (this.consumeFailures > 0) {
      this.consumeFailures -= 1;
      throw new Error("transient persistence failure");
    }
    const record = this.records.get(input.tokenHash);
    if (
      !this.consumeResult ||
      !record ||
      (record.status !== "claimed" && record.status !== "effect_started") ||
      record.claimId !== input.claimId
    ) {
      return false;
    }
    Object.assign(record, {
      status: "consumed",
      outcome: input.outcome,
      consumedAt: input.now,
      updatedAt: input.now,
    });
    return true;
  }

  async startEffects(input: { tokenHash: string; claimId: string; now: string }) {
    this.trace.push("startEffects");
    const record = this.records.get(input.tokenHash);
    if (!record || record.status !== "claimed" || record.claimId !== input.claimId) {
      return false;
    }
    if (Date.parse(record.expiresAt) <= Date.parse(input.now)) {
      record.status = "consumed";
      record.outcome = "expired";
      record.consumedAt = input.now;
      record.updatedAt = input.now;
      return false;
    }
    record.status = "effect_started";
    record.effectStartedAt = input.now;
    record.updatedAt = input.now;
    delete record.claimExpiresAt;
    return true;
  }

  async release(input: { tokenHash: string; claimId: string; now: string }) {
    this.trace.push("release");
    const record = this.records.get(input.tokenHash);
    if (!record || record.status !== "claimed" || record.claimId !== input.claimId) {
      return false;
    }
    record.status = "pending";
    record.updatedAt = input.now;
    delete record.claimId;
    delete record.claimedAt;
    delete record.claimExpiresAt;
    return true;
  }
}

function exactUser(
  overrides: Partial<Awaited<ReturnType<VendorSetupAuth["getUser"]>>> = {},
) {
  return {
    uid: UID,
    email: EMAIL,
    emailVerified: false,
    disabled: false,
    customClaims: {
      vendor: true,
      vendor_id: VENDOR_ID,
      data_mode: "live",
    },
    ...overrides,
  };
}

function auth(
  store: MemoryChallengeStore,
  overrides: Partial<VendorSetupAuth> = {},
): VendorSetupAuth {
  let user = exactUser();
  return {
    getUser: vi.fn(async () => {
      store.trace.push("getUser");
      return user;
    }),
    markEmailVerified: vi.fn(async () => {
      store.trace.push("markEmailVerified");
      user = { ...user, emailVerified: true };
    }),
    generatePasswordResetLink: vi.fn(async () => {
      store.trace.push("generatePasswordResetLink");
      return VALID_RESET_LINK;
    }),
    ...overrides,
  };
}

async function issuedChallenge(store: MemoryChallengeStore, token = TOKEN) {
  return createVendorSetupChallenge(
    {
      vendorId: VENDOR_ID,
      uid: UID,
      email: EMAIL,
      dataMode: "live",
      inviteVersion: INVITE_VERSION,
      lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
      appBaseUrl: "https://app.pmikcmetro.com",
    },
    {
      store,
      now: () => NOW,
      token: () => token,
    },
  );
}

function completionDependencies(store: MemoryChallengeStore, vendorAuth = auth(store)) {
  return {
    store,
    auth: vendorAuth,
    now: () => new Date(NOW.getTime() + 1_000),
    claimId: () => CLAIM_ID,
    expectedFirebaseAuthDomain: FIREBASE_AUTH_DOMAIN,
    expectedPasswordResetPath: FIREBASE_RESET_PATH,
  };
}

describe("Live Vendor setup challenge creation", () => {
  it("returns one app URL while storing only exact hashes and Live authority", async () => {
    const store = new MemoryChallengeStore();
    const result = await issuedChallenge(store);
    const url = new URL(result.setupUrl);
    expect(url.origin).toBe("https://app.pmikcmetro.com");
    expect(url.pathname).toBe("/vendor/setup");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(TOKEN);
    expect(Object.keys(result).sort()).toEqual(["expiresAt", "setupUrl"]);

    const persisted = store.records.get(vendorSetupTokenHash(TOKEN));
    expect(persisted).toEqual({
      schemaVersion: 2,
      tokenHash: vendorSetupTokenHash(TOKEN),
      vendorRef: `vendors/${VENDOR_ID}`,
      uid: UID,
      inviteVersion: INVITE_VERSION,
      lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
      emailHash: vendorSetupEmailHash(EMAIL),
      dataMode: "live",
      status: "pending",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      expiresAt: result.expiresAt,
    });
    expect(JSON.stringify(persisted)).not.toContain(TOKEN);
    expect(JSON.stringify(persisted)).not.toContain(EMAIL);
  });

  it("uses the exact delivery-claim expiry instead of starting a later token clock", async () => {
    const store = new MemoryChallengeStore();
    const expiresAt = new Date(NOW.getTime() + 23 * 60 * 60 * 1000).toISOString();

    const result = await createVendorSetupChallenge(
      {
        vendorId: VENDOR_ID,
        uid: UID,
        email: EMAIL,
        dataMode: "live",
        inviteVersion: INVITE_VERSION,
        lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
        appBaseUrl: "https://app.pmikcmetro.com",
        expiresAt,
      },
      { store, now: () => NOW, token: () => TOKEN },
    );

    expect(result.expiresAt).toBe(expiresAt);
    expect(store.records.get(vendorSetupTokenHash(TOKEN))?.expiresAt).toBe(expiresAt);
    await expect(
      createVendorSetupChallenge(
        {
          vendorId: VENDOR_ID,
          uid: UID,
          email: EMAIL,
          dataMode: "live",
          inviteVersion: INVITE_VERSION,
          lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
          appBaseUrl: "https://app.pmikcmetro.com",
          expiresAt,
          ttlMs: 60 * 60 * 1000,
        },
        { store: new MemoryChallengeStore(), now: () => NOW, token: () => TOKEN },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("retries a create-only hash collision without returning the abandoned token", async () => {
    const store = new MemoryChallengeStore();
    store.createResults.push(false, true);
    const tokens = [TOKEN, SECOND_TOKEN];
    const result = await createVendorSetupChallenge(
      {
        vendorId: VENDOR_ID,
        uid: UID,
        email: EMAIL,
        dataMode: "live",
        inviteVersion: INVITE_VERSION,
        lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
        appBaseUrl: "https://app.pmikcmetro.com",
      },
      { store, now: () => NOW, token: () => tokens.shift()! },
    );
    const url = new URL(result.setupUrl);
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(SECOND_TOKEN);
    expect(store.records.has(vendorSetupTokenHash(SECOND_TOKEN))).toBe(true);
  });

  it("refuses Test authority, plaintext/credentialed base URLs, and weak tokens", async () => {
    const store = new MemoryChallengeStore();
    await expect(
      createVendorSetupChallenge(
        {
          vendorId: VENDOR_ID,
          uid: UID,
          email: EMAIL,
          dataMode: "test" as "live",
          inviteVersion: INVITE_VERSION,
          lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
          appBaseUrl: "https://app.pmikcmetro.com",
        },
        { store, now: () => NOW, token: () => TOKEN },
      ),
    ).rejects.toMatchObject({ status: 400 });
    for (const appBaseUrl of [
      "http://app.pmikcmetro.com",
      "https://user:password@app.pmikcmetro.com",
      "https://app.pmikcmetro.com?secret=value",
    ]) {
      await expect(
        createVendorSetupChallenge(
          {
            vendorId: VENDOR_ID,
            uid: UID,
            email: EMAIL,
            dataMode: "live",
            inviteVersion: INVITE_VERSION,
            lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
            appBaseUrl,
          },
          { store, now: () => NOW, token: () => TOKEN },
        ),
      ).rejects.toBeInstanceOf(VendorSetupPublicError);
    }
    await expect(
      createVendorSetupChallenge(
        {
          vendorId: VENDOR_ID,
          uid: UID,
          email: EMAIL,
          dataMode: "live",
          inviteVersion: INVITE_VERSION,
          lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
          appBaseUrl: "https://app.pmikcmetro.com",
        },
        { store, now: () => NOW, token: () => "short" },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ["zero invite version", { inviteVersion: 0 }],
    ["fractional invite version", { inviteVersion: 1.5 }],
    ["missing lifecycle execution", { lifecycleExecutionId: "" }],
    ["non-hash lifecycle execution", { lifecycleExecutionId: "not-an-id" }],
  ])("refuses %s before persisting a challenge", async (_label, override) => {
    const store = new MemoryChallengeStore();
    await expect(
      createVendorSetupChallenge(
        {
          vendorId: VENDOR_ID,
          uid: UID,
          email: EMAIL,
          dataMode: "live",
          inviteVersion: INVITE_VERSION,
          lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
          appBaseUrl: "https://app.pmikcmetro.com",
          ...override,
        },
        { store, now: () => NOW, token: () => TOKEN },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(store.records).toHaveLength(0);
  });
});

describe("Live Vendor setup completion", () => {
  it("claims first, verifies exact Live Firebase authority, then verifies email and consumes", async () => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    const result = await completeVendorSetup(TOKEN, completionDependencies(store));
    expect(result).toEqual({
      redirectUrl: VALID_RESET_LINK,
    });
    expect(store.trace).toEqual([
      "create",
      "claim",
      "getUser",
      "startEffects",
      "markEmailVerified",
      "generatePasswordResetLink",
      "consume:completed",
    ]);
    expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
      status: "consumed",
      outcome: "completed",
      claimId: CLAIM_ID,
    });
  });

  it.each([
    ["wrong uid", { uid: "other-uid" }],
    ["wrong email", { email: "other@vendor.example" }],
    ["disabled", { disabled: true }],
    [
      "not a Vendor",
      { customClaims: { vendor: false, vendor_id: VENDOR_ID, data_mode: "live" } },
    ],
    [
      "wrong Vendor",
      { customClaims: { vendor: true, vendor_id: "other", data_mode: "live" } },
    ],
    [
      "Test lane",
      { customClaims: { vendor: true, vendor_id: VENDOR_ID, data_mode: "test" } },
    ],
    [
      "extra staff authority",
      {
        customClaims: {
          vendor: true,
          vendor_id: VENDOR_ID,
          data_mode: "live",
          role: "Admin",
        },
      },
    ],
  ])(
    "terminally rejects %s Firebase authority without creating a reset link",
    async (_label, userOverride) => {
      const store = new MemoryChallengeStore();
      await issuedChallenge(store);
      const markEmailVerified = vi.fn();
      const generatePasswordResetLink = vi.fn();
      const vendorAuth: VendorSetupAuth = {
        getUser: vi.fn(async () => exactUser(userOverride)),
        markEmailVerified,
        generatePasswordResetLink,
      };
      await expect(
        completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
      ).rejects.toMatchObject({ status: 404 });
      expect(markEmailVerified).not.toHaveBeenCalled();
      expect(generatePasswordResetLink).not.toHaveBeenCalled();
      expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
        status: "consumed",
        outcome: "rejected",
      });
    },
  );

  it("releases a retryable pre-effect dependency failure and permits one later completion", async () => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    let first = true;
    const vendorAuth = auth(store, {
      getUser: vi.fn(async () => {
        store.trace.push("getUser");
        if (first) {
          first = false;
          throw new VendorSetupDependencyError(false);
        }
        return exactUser();
      }),
    });
    await expect(
      completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
    ).rejects.toMatchObject({ status: 503 });
    expect(store.records.get(vendorSetupTokenHash(TOKEN))?.status).toBe("pending");

    await expect(
      completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
    ).resolves.toEqual({
      redirectUrl: VALID_RESET_LINK,
    });
    expect(vendorAuth.markEmailVerified).toHaveBeenCalledTimes(1);
    expect(store.records.get(vendorSetupTokenHash(TOKEN))?.status).toBe("consumed");
  });

  it("terminally rejects a definitive auth error and an unsafe reset target", async () => {
    for (const vendorAuth of [
      {
        getUser: vi.fn(async () => {
          throw new VendorSetupDependencyError(true);
        }),
        markEmailVerified: vi.fn(),
        generatePasswordResetLink: vi.fn(),
      },
      {
        getUser: vi.fn(async () => exactUser()),
        markEmailVerified: vi.fn(),
        generatePasswordResetLink: vi.fn(
          async () =>
            `http://${FIREBASE_AUTH_DOMAIN}${FIREBASE_RESET_PATH}?mode=resetPassword&oobCode=opaque`,
        ),
      },
      {
        getUser: vi.fn(async () => exactUser()),
        markEmailVerified: vi.fn(),
        generatePasswordResetLink: vi.fn(
          async () =>
            `https://${FIREBASE_AUTH_DOMAIN}${FIREBASE_RESET_PATH}?mode=resetPassword&oobCode=${TOKEN}`,
        ),
      },
    ]) {
      const store = new MemoryChallengeStore();
      await issuedChallenge(store);
      await expect(
        completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
      ).rejects.toMatchObject({ status: 404 });
      expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
        status: "consumed",
        outcome: "rejected",
      });
    }
  });

  it.each([
    [
      "HTTPS lookalike host",
      `https://${FIREBASE_AUTH_DOMAIN}.evil.example${FIREBASE_RESET_PATH}?mode=resetPassword&oobCode=opaque`,
    ],
    [
      "wrong action path",
      `https://${FIREBASE_AUTH_DOMAIN}/reset?mode=resetPassword&oobCode=opaque`,
    ],
    [
      "wrong action mode",
      `https://${FIREBASE_AUTH_DOMAIN}${FIREBASE_RESET_PATH}?mode=verifyEmail&oobCode=opaque`,
    ],
    [
      "duplicate action mode",
      `https://${FIREBASE_AUTH_DOMAIN}${FIREBASE_RESET_PATH}?mode=resetPassword&mode=verifyEmail&oobCode=opaque`,
    ],
  ])("rejects a reset link with %s before challenge completion", async (_label, link) => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    const vendorAuth = auth(store, {
      generatePasswordResetLink: vi.fn(async () => link),
    });

    await expect(
      completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
    ).rejects.toMatchObject({ status: 404 });
    expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
      status: "consumed",
      outcome: "rejected",
    });
  });

  it.each([
    ["missing auth domain", "", FIREBASE_RESET_PATH],
    ["URL-shaped auth domain", `https://${FIREBASE_AUTH_DOMAIN}`, FIREBASE_RESET_PATH],
    ["missing reset path", FIREBASE_AUTH_DOMAIN, ""],
    ["query-bearing reset path", FIREBASE_AUTH_DOMAIN, `${FIREBASE_RESET_PATH}?x=1`],
  ])(
    "fails before claiming or touching Auth for %s config",
    async (_label, expectedFirebaseAuthDomain, expectedPasswordResetPath) => {
      const store = new MemoryChallengeStore();
      await issuedChallenge(store);
      const vendorAuth = auth(store);

      await expect(
        completeVendorSetup(TOKEN, {
          ...completionDependencies(store, vendorAuth),
          expectedFirebaseAuthDomain,
          expectedPasswordResetPath,
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(store.trace).toEqual(["create"]);
      expect(store.records.get(vendorSetupTokenHash(TOKEN))?.status).toBe("pending");
      expect(vendorAuth.getUser).not.toHaveBeenCalled();
      expect(vendorAuth.markEmailVerified).not.toHaveBeenCalled();
      expect(vendorAuth.generatePasswordResetLink).not.toHaveBeenCalled();
    },
  );

  it("never replays Auth effects after a retryable post-start dependency failure", async () => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    const vendorAuth = auth(store, {
      generatePasswordResetLink: vi.fn(async () => {
        store.trace.push("generatePasswordResetLink");
        throw new VendorSetupDependencyError(false);
      }),
    });

    await expect(
      completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
    ).rejects.toMatchObject({ status: 503 });
    expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
      status: "consumed",
      outcome: "rejected",
    });
    await expect(
      completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
    ).rejects.toMatchObject({ status: 410 });
    expect(vendorAuth.markEmailVerified).toHaveBeenCalledTimes(1);
    expect(vendorAuth.generatePasswordResetLink).toHaveBeenCalledTimes(1);
  });

  it("retries terminal persistence without replaying Auth effects", async () => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    store.consumeFailures = 2;
    const vendorAuth = auth(store);

    await expect(
      completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
    ).resolves.toEqual({ redirectUrl: VALID_RESET_LINK });
    expect(vendorAuth.markEmailVerified).toHaveBeenCalledTimes(1);
    expect(vendorAuth.generatePasswordResetLink).toHaveBeenCalledTimes(1);
    expect(store.trace.filter((event) => event === "consume:completed")).toHaveLength(3);
    expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
      status: "consumed",
      outcome: "completed",
    });
  });

  it("keeps effect ownership non-reclaimable after the former lease expires", async () => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    let releaseMark!: () => void;
    const markBlocked = new Promise<void>((resolve) => {
      releaseMark = resolve;
    });
    const vendorAuth = auth(store, {
      markEmailVerified: vi.fn(async () => {
        store.trace.push("markEmailVerified");
        await markBlocked;
      }),
    });

    const first = completeVendorSetup(TOKEN, {
      ...completionDependencies(store, vendorAuth),
      claimId: () => "first-effect-claim",
      claimLeaseMs: 30_000,
    });
    await vi.waitFor(() => {
      expect(vendorAuth.markEmailVerified).toHaveBeenCalledTimes(1);
    });

    await expect(
      completeVendorSetup(TOKEN, {
        ...completionDependencies(store, vendorAuth),
        now: () => new Date(NOW.getTime() + 5 * 60 * 1000),
        claimId: () => "second-effect-claim",
        claimLeaseMs: 30_000,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(vendorAuth.getUser).toHaveBeenCalledTimes(1);
    expect(vendorAuth.generatePasswordResetLink).not.toHaveBeenCalled();

    releaseMark();
    await expect(first).resolves.toEqual({ redirectUrl: VALID_RESET_LINK });
    expect(vendorAuth.markEmailVerified).toHaveBeenCalledTimes(1);
    expect(vendorAuth.generatePasswordResetLink).toHaveBeenCalledTimes(1);
  });

  it("rechecks the setup expiry after Auth readback and before any external effect", async () => {
    const store = new MemoryChallengeStore();
    await issuedChallenge(store);
    const record = store.records.get(vendorSetupTokenHash(TOKEN))!;
    record.expiresAt = new Date(NOW.getTime() + 1_500).toISOString();
    let clock = new Date(NOW.getTime() + 1_000);
    const vendorAuth = auth(store, {
      getUser: vi.fn(async () => {
        store.trace.push("getUser");
        clock = new Date(NOW.getTime() + 1_500);
        return exactUser();
      }),
    });

    await expect(
      completeVendorSetup(TOKEN, {
        ...completionDependencies(store, vendorAuth),
        now: () => clock,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.records.get(vendorSetupTokenHash(TOKEN))).toMatchObject({
      status: "consumed",
      outcome: "expired",
    });
    expect(vendorAuth.markEmailVerified).not.toHaveBeenCalled();
    expect(vendorAuth.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("refuses concurrent, expired, consumed, and lost-claim requests without auth effects", async () => {
    for (const state of ["busy", "expired", "consumed"] as const) {
      const store = new MemoryChallengeStore();
      await issuedChallenge(store);
      const record = store.records.get(vendorSetupTokenHash(TOKEN))!;
      if (state === "busy") {
        Object.assign(record, {
          status: "claimed",
          claimId: "another-claim-0001",
          claimExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
        });
      } else if (state === "expired") {
        record.expiresAt = new Date(NOW.getTime() + 500).toISOString();
      } else {
        record.status = "consumed";
        record.outcome = "completed";
      }
      const vendorAuth = auth(store);
      await expect(
        completeVendorSetup(TOKEN, completionDependencies(store, vendorAuth)),
      ).rejects.toMatchObject({ status: state === "busy" ? 409 : 410 });
      expect(vendorAuth.getUser).not.toHaveBeenCalled();
    }

    const lostStore = new MemoryChallengeStore();
    await issuedChallenge(lostStore);
    lostStore.consumeResult = false;
    await expect(
      completeVendorSetup(TOKEN, completionDependencies(lostStore)),
    ).rejects.toMatchObject({ status: 409 });
  });
});
