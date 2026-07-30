import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import {
  VENDOR_SETUP_CHALLENGE_COLLECTION,
  completeVendorSetup,
  vendorSetupEmailHash,
  vendorSetupTokenHash,
  type VendorSetupChallenge,
} from "@/lib/vendor/live-setup";
import { LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION } from "@/lib/vendor/live-lifecycle-contract";
import {
  FirestoreVendorSetupChallengeStore,
  VENDOR_SETUP_EFFECT_FENCE_FIELD,
} from "@/lib/vendor/live-setup-runtime";

const TOKEN = "D".repeat(43);
const TOKEN_HASH = vendorSetupTokenHash(TOKEN);
const NOW = "2026-07-30T18:00:00.000Z";
const VENDOR_ID = "vendor-live-1";
const VENDOR_UID = "firebase-vendor-1";
const INVITE_VERSION = 1;
const LIFECYCLE_EXECUTION_ID = "3".repeat(64);

function challenge(overrides: Partial<VendorSetupChallenge> = {}): VendorSetupChallenge {
  return {
    schemaVersion: 2,
    tokenHash: TOKEN_HASH,
    vendorRef: `vendors/${VENDOR_ID}`,
    uid: VENDOR_UID,
    inviteVersion: INVITE_VERSION,
    lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
    emailHash: vendorSetupEmailHash("dispatch@vendor.example"),
    dataMode: "live",
    status: "pending",
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: "2026-07-31T18:00:00.000Z",
    ...overrides,
  };
}

function fakeFirestore() {
  const records = new Map<string, Record<string, unknown>>();
  const pathFor = (collection: string, id: string) => `${collection}/${id}`;
  const vendorPath = pathFor("vendors", VENDOR_ID);
  const identityClaimPath = pathFor(
    LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION,
    vendorSetupEmailHash("dispatch@vendor.example"),
  );
  records.set(vendorPath, {
    id: VENDOR_ID,
    uid: VENDOR_UID,
    status: "pending_setup",
    inviteVersion: INVITE_VERSION,
    data_mode: "live",
  });
  records.set(identityClaimPath, {
    schemaVersion: 1,
    emailHash: vendorSetupEmailHash("dispatch@vendor.example"),
    vendorRef: VENDOR_ID,
    vendorUid: VENDOR_UID,
    executionId: LIFECYCLE_EXECUTION_ID,
    dataMode: "live",
  });
  const db = {
    collection(collection: string) {
      return {
        doc(id: string) {
          const path = pathFor(collection, id);
          return {
            path,
            async create(value: Record<string, unknown>) {
              if (records.has(path)) {
                throw { code: 6 };
              }
              records.set(path, structuredClone(value));
            },
          };
        },
      };
    },
    async runTransaction<T>(
      callback: (transaction: {
        get(ref: { path: string }): Promise<{
          exists: boolean;
          data(): Record<string, unknown> | undefined;
        }>;
        update(ref: { path: string }, patch: Record<string, unknown>): void;
      }) => Promise<T>,
    ) {
      const pending: Array<{ path: string; patch: Record<string, unknown> }> = [];
      const result = await callback({
        async get(ref) {
          const value = records.get(ref.path);
          return {
            exists: value !== undefined,
            data: () => (value ? structuredClone(value) : undefined),
          };
        },
        update(ref, patch) {
          pending.push({ path: ref.path, patch });
        },
      });
      for (const { path, patch } of pending) {
        const current = records.get(path);
        if (!current) throw new Error("missing fake document");
        for (const [field, value] of Object.entries(patch)) {
          // Firebase Admin represents delete() as a FieldValue transform. The exact private shape is
          // irrelevant; recognizing its constructor lets this fake model the public update result.
          if (value?.constructor?.name === "DeleteTransform") {
            delete current[field];
          } else {
            current[field] = value;
          }
        }
      }
      return result;
    },
  };
  return {
    records,
    db: db as unknown as Firestore,
    path: pathFor(VENDOR_SETUP_CHALLENGE_COLLECTION, TOKEN_HASH),
    vendorPath,
    identityClaimPath,
  };
}

describe("Firestore Live Vendor setup challenge store", () => {
  it("uses create-only hash ids and atomically permits only one active claim", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    expect(await store.create(challenge())).toBe(true);
    expect(await store.create(challenge())).toBe(false);

    const first = await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "first-claim-000001",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });
    expect(first).toMatchObject({ kind: "claimed" });
    await expect(
      store.claim({
        tokenHash: TOKEN_HASH,
        claimId: "second-claim-00001",
        now: "2026-07-30T18:01:30.000Z",
        claimExpiresAt: "2026-07-30T18:03:30.000Z",
      }),
    ).resolves.toEqual({ kind: "busy" });
    expect(fake.records.get(fake.path)).toMatchObject({
      tokenHash: TOKEN_HASH,
      status: "claimed",
      claimId: "first-claim-000001",
    });
  });

  it("requires exact claim ownership to consume and makes replay terminal", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "owner-claim-000001",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });
    await expect(
      store.consume({
        tokenHash: TOKEN_HASH,
        claimId: "wrong-claim-000001",
        now: "2026-07-30T18:01:30.000Z",
        outcome: "completed",
      }),
    ).resolves.toBe(false);
    await expect(
      store.consume({
        tokenHash: TOKEN_HASH,
        claimId: "owner-claim-000001",
        now: "2026-07-30T18:01:30.000Z",
        outcome: "completed",
      }),
    ).resolves.toBe(true);
    await expect(
      store.claim({
        tokenHash: TOKEN_HASH,
        claimId: "replay-claim-00001",
        now: "2026-07-30T18:02:00.000Z",
        claimExpiresAt: "2026-07-30T18:04:00.000Z",
      }),
    ).resolves.toEqual({ kind: "consumed" });
  });

  it("atomically starts effects once and never reclaims after the former lease", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "owner-claim-000001",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });

    await expect(
      Promise.all([
        store.startEffects({
          tokenHash: TOKEN_HASH,
          claimId: "owner-claim-000001",
          now: "2026-07-30T18:01:30.000Z",
        }),
        store.startEffects({
          tokenHash: TOKEN_HASH,
          claimId: "other-claim-000001",
          now: "2026-07-30T18:01:30.000Z",
        }),
      ]),
    ).resolves.toEqual([true, false]);
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "effect_started",
      claimId: "owner-claim-000001",
      effectStartedAt: "2026-07-30T18:01:30.000Z",
    });
    expect(fake.records.get(fake.path)).not.toHaveProperty("claimExpiresAt");
    expect(fake.records.get(fake.vendorPath)).toMatchObject({
      [VENDOR_SETUP_EFFECT_FENCE_FIELD]: {
        schemaVersion: 1,
        tokenHash: TOKEN_HASH,
        inviteVersion: INVITE_VERSION,
        lifecycleExecutionId: LIFECYCLE_EXECUTION_ID,
        startedAt: "2026-07-30T18:01:30.000Z",
        dataMode: "live",
      },
    });
    const serializedFence = JSON.stringify(
      fake.records.get(fake.vendorPath)?.[VENDOR_SETUP_EFFECT_FENCE_FIELD],
    );
    expect(serializedFence).not.toContain("owner-claim-000001");
    expect(serializedFence).not.toContain(TOKEN);
    expect(serializedFence).not.toContain("dispatch@vendor.example");

    await expect(
      store.claim({
        tokenHash: TOKEN_HASH,
        claimId: "late-claim-0000001",
        now: "2026-07-30T18:10:00.000Z",
        claimExpiresAt: "2026-07-30T18:12:00.000Z",
      }),
    ).resolves.toEqual({ kind: "busy" });
    await expect(
      store.release({
        tokenHash: TOKEN_HASH,
        claimId: "owner-claim-000001",
        now: "2026-07-30T18:10:00.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      store.consume({
        tokenHash: TOKEN_HASH,
        claimId: "owner-claim-000001",
        now: "2026-07-30T18:10:00.000Z",
        outcome: "completed",
      }),
    ).resolves.toBe(true);
    expect(fake.records.get(fake.vendorPath)).not.toHaveProperty(
      VENDOR_SETUP_EFFECT_FENCE_FIELD,
    );
  });

  it("keeps an effect owner busy after token expiry instead of stranding its fence", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge({ expiresAt: "2026-07-30T18:02:00.000Z" }));
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "owner-claim-000001",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:01:30.000Z",
    });
    await expect(
      store.startEffects({
        tokenHash: TOKEN_HASH,
        claimId: "owner-claim-000001",
        now: "2026-07-30T18:01:15.000Z",
      }),
    ).resolves.toBe(true);

    await expect(
      store.claim({
        tokenHash: TOKEN_HASH,
        claimId: "expired-replay-001",
        now: "2026-07-30T18:03:00.000Z",
        claimExpiresAt: "2026-07-30T18:05:00.000Z",
      }),
    ).resolves.toEqual({ kind: "busy" });
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "effect_started",
      claimId: "owner-claim-000001",
    });
    expect(fake.records.get(fake.vendorPath)).toHaveProperty(
      VENDOR_SETUP_EFFECT_FENCE_FIELD,
    );
  });

  it("discards setup completion after the disable off switch wins", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "disable-race-claim",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });
    await expect(
      store.startEffects({
        tokenHash: TOKEN_HASH,
        claimId: "disable-race-claim",
        now: "2026-07-30T18:01:15.000Z",
      }),
    ).resolves.toBe(true);

    const disabledVendor: Record<string, unknown> = {
      ...fake.records.get(fake.vendorPath)!,
      status: "disabled",
      disabledAt: "2026-07-30T18:01:20.000Z",
      updatedAt: "2026-07-30T18:01:20.000Z",
    };
    delete disabledVendor[VENDOR_SETUP_EFFECT_FENCE_FIELD];
    fake.records.set(fake.vendorPath, disabledVendor);

    await expect(
      store.consume({
        tokenHash: TOKEN_HASH,
        claimId: "disable-race-claim",
        now: "2026-07-30T18:01:30.000Z",
        outcome: "completed",
      }),
    ).resolves.toBe(false);
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "effect_started",
      claimId: "disable-race-claim",
    });
    expect(fake.records.get(fake.vendorPath)).toMatchObject({
      status: "disabled",
    });
  });

  it("releases only the owner's retryable claim and consumes expired challenges", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "owner-claim-000001",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });
    expect(
      await store.release({
        tokenHash: TOKEN_HASH,
        claimId: "wrong-claim-000001",
        now: "2026-07-30T18:01:30.000Z",
      }),
    ).toBe(false);
    expect(
      await store.release({
        tokenHash: TOKEN_HASH,
        claimId: "owner-claim-000001",
        now: "2026-07-30T18:01:30.000Z",
      }),
    ).toBe(true);
    expect(fake.records.get(fake.path)).toMatchObject({ status: "pending" });
    expect(fake.records.get(fake.path)).not.toHaveProperty("claimId");

    fake.records.set(
      fake.path,
      challenge({ expiresAt: "2026-07-30T18:02:00.000Z" }) as unknown as Record<
        string,
        unknown
      >,
    );
    await expect(
      store.claim({
        tokenHash: TOKEN_HASH,
        claimId: "late-claim-0000001",
        now: "2026-07-30T18:03:00.000Z",
        claimExpiresAt: "2026-07-30T18:05:00.000Z",
      }),
    ).resolves.toEqual({ kind: "expired" });
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "consumed",
      outcome: "expired",
    });
  });

  it.each([
    ["missing Vendor", null],
    [
      "wrong Vendor id",
      {
        id: "other-vendor",
        uid: VENDOR_UID,
        status: "pending_setup",
        inviteVersion: INVITE_VERSION,
        data_mode: "live",
      },
    ],
    [
      "wrong uid",
      {
        id: VENDOR_ID,
        uid: "other-vendor-uid",
        status: "pending_setup",
        inviteVersion: INVITE_VERSION,
        data_mode: "live",
      },
    ],
    [
      "non-pending status",
      {
        id: VENDOR_ID,
        uid: VENDOR_UID,
        status: "active",
        inviteVersion: INVITE_VERSION,
        data_mode: "live",
      },
    ],
    [
      "non-Live data",
      {
        id: VENDOR_ID,
        uid: VENDOR_UID,
        status: "pending_setup",
        inviteVersion: INVITE_VERSION,
        data_mode: "test",
      },
    ],
    [
      "stale invite generation",
      {
        id: VENDOR_ID,
        uid: VENDOR_UID,
        status: "pending_setup",
        inviteVersion: INVITE_VERSION + 1,
        data_mode: "live",
      },
    ],
  ])("terminally rejects a challenge bound to %s", async (_label, vendor) => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    if (vendor) {
      fake.records.set(fake.vendorPath, vendor);
    } else {
      fake.records.delete(fake.vendorPath);
    }

    await expect(
      store.claim({
        tokenHash: TOKEN_HASH,
        claimId: "stale-claim-000001",
        now: "2026-07-30T18:01:00.000Z",
        claimExpiresAt: "2026-07-30T18:03:00.000Z",
      }),
    ).resolves.toEqual({ kind: "invalid" });
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "consumed",
      outcome: "rejected",
    });
  });

  it("invalidates an older invite generation before any Firebase Auth call", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    fake.records.set(fake.vendorPath, {
      id: VENDOR_ID,
      uid: VENDOR_UID,
      status: "pending_setup",
      inviteVersion: INVITE_VERSION + 1,
      data_mode: "live",
    });
    const auth = {
      getUser: vi.fn(),
      markEmailVerified: vi.fn(),
      generatePasswordResetLink: vi.fn(),
    };

    await expect(
      completeVendorSetup(TOKEN, {
        store,
        auth,
        now: () => new Date("2026-07-30T18:01:00.000Z"),
        claimId: () => "stale-auth-claim-01",
        expectedFirebaseAuthDomain: "pmi-kc-kb-prod.firebaseapp.com",
        expectedPasswordResetPath: "/__/auth/action",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.markEmailVerified).not.toHaveBeenCalled();
    expect(auth.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("rechecks the invite generation at the external-effect boundary", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "generation-claim-01",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });
    fake.records.set(fake.vendorPath, {
      id: VENDOR_ID,
      uid: VENDOR_UID,
      status: "pending_setup",
      inviteVersion: INVITE_VERSION + 1,
      data_mode: "live",
    });

    await expect(
      store.startEffects({
        tokenHash: TOKEN_HASH,
        claimId: "generation-claim-01",
        now: "2026-07-30T18:01:30.000Z",
      }),
    ).resolves.toBe(false);
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "consumed",
      outcome: "rejected",
    });
  });

  it("rejects a claimed old link when same-version delivery recovery repoints identity", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge());
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "recovery-race-claim",
      now: "2026-07-30T18:01:00.000Z",
      claimExpiresAt: "2026-07-30T18:03:00.000Z",
    });

    fake.records.set(fake.identityClaimPath, {
      ...fake.records.get(fake.identityClaimPath)!,
      executionId: "4".repeat(64),
      updatedAt: "2026-07-30T18:01:15.000Z",
    });

    await expect(
      store.startEffects({
        tokenHash: TOKEN_HASH,
        claimId: "recovery-race-claim",
        now: "2026-07-30T18:01:30.000Z",
      }),
    ).resolves.toBe(false);
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "consumed",
      outcome: "rejected",
    });
    expect(fake.records.get(fake.vendorPath)).not.toHaveProperty(
      VENDOR_SETUP_EFFECT_FENCE_FIELD,
    );
  });

  it("refuses to start effects after exact setup-token expiry", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreVendorSetupChallengeStore(fake.db);
    await store.create(challenge({ expiresAt: "2026-07-30T18:02:00.000Z" }));
    await store.claim({
      tokenHash: TOKEN_HASH,
      claimId: "expiry-race-claim",
      now: "2026-07-30T18:01:59.000Z",
      claimExpiresAt: "2026-07-30T18:03:59.000Z",
    });

    await expect(
      store.startEffects({
        tokenHash: TOKEN_HASH,
        claimId: "expiry-race-claim",
        now: "2026-07-30T18:02:00.000Z",
      }),
    ).resolves.toBe(false);
    expect(fake.records.get(fake.path)).toMatchObject({
      status: "consumed",
      outcome: "expired",
    });
    expect(fake.records.get(fake.vendorPath)).not.toHaveProperty(
      VENDOR_SETUP_EFFECT_FENCE_FIELD,
    );
  });
});
