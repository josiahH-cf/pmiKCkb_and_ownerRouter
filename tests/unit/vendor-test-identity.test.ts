import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { FirestoreVendorStore, VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import { beginVendorOAuth } from "@/lib/vendor/oauth";
import { validateVendorClaims } from "@/lib/vendor/auth";
import { VendorGmailService } from "@/lib/vendor/gmail";
import type { VendorRecord } from "@/lib/vendor/model";
import {
  provisionTestVendor,
  regenerateTestVendorSetupLink,
  resetTestVendorAuthentication,
  TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT,
  TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS,
  TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
  testVendorAuthenticationResetPreview,
  testVendorAuthenticationResetPreviewForRecord,
  testVendorProvisionPreview,
  testVendorSetupLinkRegenerationPreview,
} from "@/lib/vendor/test-identity";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

const canonicalTestVendor: VendorRecord = {
  id: "vendor:test-summit-plumbing",
  uid: "uid-test-summit",
  email: "service@summit-plumbing.example.invalid",
  displayName: "Summit Plumbing Test Vendor",
  status: "pending_setup",
  inviteVersion: 1,
  data_mode: "test",
  identityState: {
    emailVerified: true,
    totpRequired: true,
    totpVerified: false,
  },
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

const canonicalFirebaseUser = {
  uid: canonicalTestVendor.uid,
  email: canonicalTestVendor.email,
  emailVerified: true,
  disabled: false,
};

const canonicalFirebaseResetUser = {
  ...canonicalFirebaseUser,
  customClaims: {
    vendor: true,
    vendor_id: canonicalTestVendor.id,
    data_mode: "test",
  },
};

function resetBinding(record: VendorRecord) {
  return {
    uid: record.uid,
    status: record.status,
    inviteVersion: record.inviteVersion,
  };
}

describe("production Test Vendor identity", () => {
  it("provisions only the canonical non-routable alias and returns its setup link once", async () => {
    const reason = "Exercise the assigned maintenance lifecycle";
    const preview = testVendorProvisionPreview("summit-plumbing", reason);
    let saved: VendorRecord | null = null;
    const claims = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    const result = await provisionTestVendor(
      {
        actor: admin,
        aliasKey: "summit-plumbing",
        reason,
        confirmedPreviewHash: preview.previewHash,
      },
      {
        auth: {
          createUser: vi.fn().mockResolvedValue({ uid: "uid-test-summit" }),
          setCustomUserClaims: claims,
          generatePasswordResetLink: vi
            .fn()
            .mockResolvedValue("https://auth.example.invalid/action?code=single-use"),
          deleteUser: vi.fn(),
        },
        store: {
          findVendorByEmail: vi.fn().mockResolvedValue(null),
          saveVendor: async (record) => void (saved = record),
          removeVendor: vi.fn(),
          appendAudit: audit,
        },
        now: () => new Date("2026-07-15T12:00:00.000Z"),
      },
    );

    expect(result.vendor).toMatchObject({
      id: "vendor:test-summit-plumbing",
      email: "service@summit-plumbing.example.invalid",
      displayName: "Summit Plumbing Test Vendor",
      data_mode: "test",
      status: "pending_setup",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: false,
      },
    });
    expect(result.setup).toMatchObject({
      oneTime: true,
      deliveredExternally: false,
    });
    expect(claims).toHaveBeenCalledWith("uid-test-summit", {
      vendor: true,
      vendor_id: "vendor:test-summit-plumbing",
      data_mode: "test",
    });
    expect(JSON.stringify(saved)).not.toContain("single-use");
    expect(JSON.stringify(audit.mock.calls)).not.toContain("single-use");
    expect(result.callout.liveEvidenceEligible).toBe(false);
  });

  it("rejects an unapproved alias and stale exact preview before constructing auth", async () => {
    expect(() => testVendorProvisionPreview("custom", "valid reason")).toThrow();
    const createUser = vi.fn();
    await expect(
      provisionTestVendor(
        {
          actor: admin,
          aliasKey: "summit-plumbing",
          reason: "valid reason",
          confirmedPreviewHash: "stale",
        },
        {
          auth: {
            createUser,
            setCustomUserClaims: vi.fn(),
            generatePasswordResetLink: vi.fn(),
            deleteUser: vi.fn(),
          },
          store: {
            findVendorByEmail: vi.fn(),
            saveVendor: vi.fn(),
            removeVendor: vi.fn(),
            appendAudit: vi.fn(),
          },
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("regenerates a canonical pending Test Vendor setup link without altering the user or record", async () => {
    const reason = "Recover the interrupted V1 setup journey";
    const preview = testVendorSetupLinkRegenerationPreview(
      canonicalTestVendor.id,
      reason,
    );
    const expectedPreviewHash = createHash("sha256")
      .update(
        JSON.stringify({
          action: "Regenerate Test Vendor setup link",
          artifact: TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
          vendorId: canonicalTestVendor.id,
          email: canonicalTestVendor.email,
          reason,
        }),
      )
      .digest("hex");
    expect(preview).toMatchObject({
      previewHash: expectedPreviewHash,
      artifact: TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
      vendorId: canonicalTestVendor.id,
      email: canonicalTestVendor.email,
      dataMode: "test",
      externalDelivery: false,
      liveEvidenceEligible: false,
    });
    expect(
      testVendorSetupLinkRegenerationPreview(
        canonicalTestVendor.id,
        "A different recovery reason",
      ).previewHash,
    ).not.toBe(preview.previewHash);

    const setupLink =
      "https://auth.example.invalid/action?mode=resetPassword&oobCode=single-use";
    const findUserByEmail = vi.fn().mockResolvedValue(canonicalFirebaseUser);
    const generatePasswordResetLink = vi.fn().mockResolvedValue(setupLink);
    const completeVendorSetupLinkRegeneration = vi.fn().mockResolvedValue(true);
    const result = await regenerateTestVendorSetupLink(
      {
        actor: admin,
        vendorId: canonicalTestVendor.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      },
      {
        auth: { findUserByEmail, generatePasswordResetLink },
        store: {
          getVendorById: vi.fn().mockResolvedValue(canonicalTestVendor),
          claimVendorSetupLinkRegeneration: vi.fn().mockResolvedValue("claimed"),
          renewVendorSetupLinkRegenerationClaim: vi.fn().mockResolvedValue(true),
          completeVendorSetupLinkRegeneration,
          releaseVendorSetupLinkRegenerationClaim: vi.fn().mockResolvedValue(true),
        },
        now: () => new Date("2026-07-15T13:00:00.000Z"),
      },
    );

    expect(findUserByEmail).toHaveBeenCalledWith(canonicalTestVendor.email);
    expect(generatePasswordResetLink).toHaveBeenCalledWith(canonicalTestVendor.email);
    expect(result).toMatchObject({
      vendor: canonicalTestVendor,
      setup: {
        artifact: TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
        setupLink,
        oneTime: true,
        regenerated: true,
        deliveredExternally: false,
      },
      callout: {
        dataMode: "test",
        externalEffect: false,
        liveEvidenceEligible: false,
      },
    });
    expect(completeVendorSetupLinkRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: admin.uid,
        vendorId: canonicalTestVendor.id,
        expectedUid: canonicalTestVendor.uid,
        expectedInviteVersion: canonicalTestVendor.inviteVersion,
        previewHash: preview.previewHash,
        claimId: expect.any(String),
        reasonHash: createHash("sha256").update(reason).digest("hex"),
        nowIso: "2026-07-15T13:00:00.000Z",
      }),
    );
    expect(JSON.stringify(completeVendorSetupLinkRegeneration.mock.calls)).not.toContain(
      "single-use",
    );
    expect(JSON.stringify(completeVendorSetupLinkRegeneration.mock.calls)).not.toContain(
      "oobCode",
    );
  });

  it("keeps setup-link recovery Admin-only and exact-preview-bound", async () => {
    const reason = "Recover the pending setup";
    const preview = testVendorSetupLinkRegenerationPreview(
      canonicalTestVendor.id,
      reason,
    );
    const getVendorById = vi.fn();
    const findUserByEmail = vi.fn();
    const generatePasswordResetLink = vi.fn();
    const claimVendorSetupLinkRegeneration = vi.fn();
    const dependencies = {
      auth: { findUserByEmail, generatePasswordResetLink },
      store: {
        getVendorById,
        claimVendorSetupLinkRegeneration,
        renewVendorSetupLinkRegenerationClaim: vi.fn(),
        completeVendorSetupLinkRegeneration: vi.fn(),
        releaseVendorSetupLinkRegenerationClaim: vi.fn(),
      },
    };

    await expect(
      regenerateTestVendorSetupLink(
        {
          actor: { ...admin, role: "Editor" },
          vendorId: canonicalTestVendor.id,
          reason,
          confirmedPreviewHash: preview.previewHash,
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      regenerateTestVendorSetupLink(
        {
          actor: admin,
          vendorId: canonicalTestVendor.id,
          reason,
          confirmedPreviewHash: "stale-preview",
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(getVendorById).not.toHaveBeenCalled();
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(generatePasswordResetLink).not.toHaveBeenCalled();
    expect(claimVendorSetupLinkRegeneration).not.toHaveBeenCalled();
  });

  it.each([
    ["missing record", null, canonicalFirebaseUser],
    [
      "active record",
      { ...canonicalTestVendor, status: "active" },
      canonicalFirebaseUser,
    ],
    [
      "disabled record",
      { ...canonicalTestVendor, status: "disabled" },
      canonicalFirebaseUser,
    ],
    ["Live record", { ...canonicalTestVendor, data_mode: "live" }, canonicalFirebaseUser],
    [
      "mismatched record id",
      { ...canonicalTestVendor, id: "vendor:test-other" },
      canonicalFirebaseUser,
    ],
    [
      "mismatched record email",
      { ...canonicalTestVendor, email: "other@example.invalid" },
      canonicalFirebaseUser,
    ],
    ["missing Firebase user", canonicalTestVendor, null],
    [
      "mismatched Firebase uid",
      canonicalTestVendor,
      { ...canonicalFirebaseUser, uid: "uid-other" },
    ],
    [
      "mismatched Firebase email",
      canonicalTestVendor,
      { ...canonicalFirebaseUser, email: "other@example.invalid" },
    ],
    [
      "disabled Firebase user",
      canonicalTestVendor,
      { ...canonicalFirebaseUser, disabled: true },
    ],
    [
      "unverified Firebase user",
      canonicalTestVendor,
      { ...canonicalFirebaseUser, emailVerified: false },
    ],
  ] as const)(
    "rejects %s with one non-enumerating recovery error",
    async (_name, record, user) => {
      const reason = "Recover the pending setup";
      const preview = testVendorSetupLinkRegenerationPreview(
        canonicalTestVendor.id,
        reason,
      );
      const generatePasswordResetLink = vi.fn();
      const completeVendorSetupLinkRegeneration = vi.fn();
      await expect(
        regenerateTestVendorSetupLink(
          {
            actor: admin,
            vendorId: canonicalTestVendor.id,
            reason,
            confirmedPreviewHash: preview.previewHash,
          },
          {
            auth: {
              findUserByEmail: vi.fn().mockResolvedValue(user),
              generatePasswordResetLink,
            },
            store: {
              getVendorById: vi.fn().mockResolvedValue(record),
              claimVendorSetupLinkRegeneration: vi.fn().mockResolvedValue("claimed"),
              renewVendorSetupLinkRegenerationClaim: vi.fn().mockResolvedValue(true),
              completeVendorSetupLinkRegeneration,
              releaseVendorSetupLinkRegenerationClaim: vi.fn().mockResolvedValue(true),
            },
          },
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: "Test Vendor setup-link recovery is unavailable.",
      });
      expect(generatePasswordResetLink).not.toHaveBeenCalled();
      expect(completeVendorSetupLinkRegeneration).not.toHaveBeenCalled();
    },
  );

  it("rejects arbitrary Vendor identifiers and non-HTTPS links without audit evidence", async () => {
    expect(() =>
      testVendorSetupLinkRegenerationPreview(
        "vendor:arbitrary",
        "Probe an arbitrary account",
      ),
    ).toThrow("approved Test Vendor");

    const reason = "Recover the pending setup";
    const preview = testVendorSetupLinkRegenerationPreview(
      canonicalTestVendor.id,
      reason,
    );
    const completeVendorSetupLinkRegeneration = vi.fn();
    await expect(
      regenerateTestVendorSetupLink(
        {
          actor: admin,
          vendorId: canonicalTestVendor.id,
          reason,
          confirmedPreviewHash: preview.previewHash,
        },
        {
          auth: {
            findUserByEmail: vi.fn().mockResolvedValue(canonicalFirebaseUser),
            generatePasswordResetLink: vi
              .fn()
              .mockResolvedValue("http://auth.example.invalid/action?code=unsafe"),
          },
          store: {
            getVendorById: vi.fn().mockResolvedValue(canonicalTestVendor),
            claimVendorSetupLinkRegeneration: vi.fn().mockResolvedValue("claimed"),
            renewVendorSetupLinkRegenerationClaim: vi.fn().mockResolvedValue(true),
            completeVendorSetupLinkRegeneration,
            releaseVendorSetupLinkRegenerationClaim: vi.fn().mockResolvedValue(true),
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(completeVendorSetupLinkRegeneration).not.toHaveBeenCalled();
  });

  it("returns and audits only one overlapping setup-link regeneration", async () => {
    const fake = new FakeFirestore();
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/${canonicalTestVendor.id}`, {
      ...canonicalTestVendor,
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    const reason = "Serialize overlapping setup-link regeneration";
    const preview = testVendorSetupLinkRegenerationPreview(
      canonicalTestVendor.id,
      reason,
    );
    let releaseFirstMint!: () => void;
    let reportFirstMint!: () => void;
    const firstMintStarted = new Promise<void>((resolve) => {
      reportFirstMint = resolve;
    });
    const firstMintGate = new Promise<void>((resolve) => {
      releaseFirstMint = resolve;
    });
    let mintCount = 0;
    const generatePasswordResetLink = vi.fn(async () => {
      mintCount += 1;
      if (mintCount === 1) {
        reportFirstMint();
        await firstMintGate;
      }
      return `https://auth.example.invalid/action?code=setup-${mintCount}`;
    });
    const auth = {
      findUserByEmail: vi.fn().mockResolvedValue(canonicalFirebaseUser),
      generatePasswordResetLink,
    };
    const input = {
      actor: admin,
      vendorId: canonicalTestVendor.id,
      reason,
      confirmedPreviewHash: preview.previewHash,
    };
    const dependencies = {
      auth,
      store,
      now: () => new Date("2026-07-15T13:00:00.000Z"),
    };

    const winner = regenerateTestVendorSetupLink(input, dependencies);
    await firstMintStarted;
    await expect(
      regenerateTestVendorSetupLink(input, dependencies),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor setup-link recovery is unavailable.",
    });
    expect(generatePasswordResetLink).toHaveBeenCalledTimes(1);

    releaseFirstMint();
    await expect(winner).resolves.toMatchObject({
      setup: { setupLink: "https://auth.example.invalid/action?code=setup-1" },
    });
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_setup_link_regenerated",
      ),
    ).toHaveLength(1);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_setup_link_regeneration_claimed",
      ),
    ).toHaveLength(1);
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${canonicalTestVendor.id}`),
    ).toMatchObject({
      setupLinkRegeneration: { status: "completed" },
    });

    const laterReason = "Regenerate again after the prior claim completed";
    const laterPreview = testVendorSetupLinkRegenerationPreview(
      canonicalTestVendor.id,
      laterReason,
    );
    await expect(
      regenerateTestVendorSetupLink(
        {
          ...input,
          reason: laterReason,
          confirmedPreviewHash: laterPreview.previewHash,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({
      setup: { setupLink: "https://auth.example.invalid/action?code=setup-2" },
    });
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_setup_link_regenerated",
      ),
    ).toHaveLength(2);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_setup_link_regeneration_claimed",
      ),
    ).toHaveLength(2);
  });

  it("lets reset supersede an expired in-flight setup-link claim without returning its stale link", async () => {
    const fake = new FakeFirestore();
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/${canonicalTestVendor.id}`, {
      ...canonicalTestVendor,
    });
    const preservedMailboxPath = `${VENDOR_COLLECTIONS.testMailboxes}/${canonicalTestVendor.id}:ticket:test-preserved`;
    fake.seed(preservedMailboxPath, {
      id: `${canonicalTestVendor.id}:ticket:test-preserved`,
      vendorId: canonicalTestVendor.id,
      ticketId: "ticket:test-preserved",
      data_mode: "test",
      sentinel: "preserve-through-reset",
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    let clockMs = Date.parse("2026-07-15T13:00:00.000Z");
    let currentUser: {
      uid: string;
      email: string;
      emailVerified: boolean;
      disabled: boolean;
      customClaims?: Record<string, unknown>;
    } | null = { ...canonicalFirebaseResetUser };
    const winningUid = "uid-reset-after-expired-setup-claim";
    let releaseStaleMint!: () => void;
    let reportStaleMint!: () => void;
    const staleMintStarted = new Promise<void>((resolve) => {
      reportStaleMint = resolve;
    });
    const staleMintGate = new Promise<void>((resolve) => {
      releaseStaleMint = resolve;
    });
    let mintCount = 0;
    const generatePasswordResetLink = vi.fn(async () => {
      mintCount += 1;
      if (mintCount === 1) {
        reportStaleMint();
        await staleMintGate;
        return "https://auth.example.invalid/action?code=stale-setup-link";
      }
      return "https://auth.example.invalid/action?code=reset-winner";
    });
    const auth = {
      findUserByEmail: vi.fn(async () =>
        currentUser ? structuredClone(currentUser) : null,
      ),
      createUser: vi.fn(async () => {
        currentUser = {
          ...canonicalFirebaseResetUser,
          uid: winningUid,
          disabled: true,
        };
        return { uid: winningUid };
      }),
      setCustomUserClaims: vi.fn(async (uid: string, claims: Record<string, unknown>) => {
        if (currentUser?.uid === uid)
          currentUser = { ...currentUser, customClaims: claims };
      }),
      updateUser: vi.fn(async (uid: string, value: { disabled: boolean }) => {
        if (currentUser?.uid === uid) {
          currentUser = { ...currentUser, disabled: value.disabled };
        }
      }),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn(async (uid: string) => {
        if (currentUser?.uid === uid) currentUser = null;
      }),
      generatePasswordResetLink,
    };
    const setupReason = "Regenerate while proving reset supersession";
    const setupPreview = testVendorSetupLinkRegenerationPreview(
      canonicalTestVendor.id,
      setupReason,
    );
    const setupRequest = regenerateTestVendorSetupLink(
      {
        actor: admin,
        vendorId: canonicalTestVendor.id,
        reason: setupReason,
        confirmedPreviewHash: setupPreview.previewHash,
      },
      { auth, store, now: () => new Date(clockMs) },
    );
    await staleMintStarted;

    clockMs += TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS + 1;
    const resetReason = "Supersede the expired setup-link operation";
    const resetPreview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      resetReason,
      resetBinding(canonicalTestVendor),
    );
    const resetResult = await resetTestVendorAuthentication(
      {
        actor: admin,
        vendorId: canonicalTestVendor.id,
        reason: resetReason,
        confirmedPreviewHash: resetPreview.previewHash,
      },
      { auth, store, now: () => new Date(clockMs) },
    );
    expect(resetResult).toMatchObject({
      vendor: { uid: winningUid, inviteVersion: 2 },
      setup: {
        setupLink: "https://auth.example.invalid/action?code=reset-winner",
      },
    });

    releaseStaleMint();
    await expect(setupRequest).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor setup-link recovery is unavailable.",
    });
    expect(currentUser).toMatchObject({ uid: winningUid, disabled: false });
    expect(generatePasswordResetLink).toHaveBeenCalledTimes(2);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_setup_link_regenerated",
      ),
    ).toHaveLength(0);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_authentication_reset",
      ),
    ).toHaveLength(1);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_setup_link_regeneration_claimed",
      ),
    ).toHaveLength(1);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_authentication_reset_claimed",
      ),
    ).toHaveLength(1);
    expect(fake.store.get(preservedMailboxPath)).toMatchObject({
      sentinel: "preserve-through-reset",
    });
  });

  it("rotates an active canonical Test Vendor UID behind an exact lifecycle-bound preview", async () => {
    const reason = "Reset the completed Vendor acceptance identity";
    const activeRecord: VendorRecord = {
      ...canonicalTestVendor,
      status: "active",
      inviteVersion: 4,
      activatedAt: "2026-07-15T12:00:00.000Z",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: true,
      },
    };
    const preview = testVendorAuthenticationResetPreview(
      activeRecord.id,
      reason,
      resetBinding(activeRecord),
    );
    expect(preview).toMatchObject({
      artifact: TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT,
      currentStatus: "active",
      currentInviteVersion: 4,
      nextStatus: "pending_setup",
      nextInviteVersion: 5,
      dataMode: "test",
      externalDelivery: false,
      liveEvidenceEligible: false,
    });
    expect(preview).not.toHaveProperty("currentUid");
    expect(preview.exactEffect).toContain("Delete the current Firebase principal");
    expect(preview.exactEffect).toContain("new Firebase UID");

    const resetRecord: VendorRecord = {
      ...activeRecord,
      uid: "uid-test-summit-rotated",
      status: "pending_setup",
      inviteVersion: 5,
      updatedAt: "2026-07-15T14:00:00.000Z",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: false,
      },
    };
    delete resetRecord.activatedAt;
    const updateUser = vi.fn().mockResolvedValue(undefined);
    const revokeRefreshTokens = vi.fn().mockResolvedValue(undefined);
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const createUser = vi.fn().mockResolvedValue({ uid: "uid-test-summit-rotated" });
    const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
    const claimVendorAuthenticationReset = vi.fn().mockResolvedValue({
      outcome: "claimed",
      record: activeRecord,
      recoveredExpiredClaim: false,
    });
    const renewVendorAuthenticationResetClaim = vi.fn().mockResolvedValue(true);
    const resetVendorAuthentication = vi.fn().mockResolvedValue(resetRecord);
    const completeVendorAuthenticationReset = vi.fn().mockResolvedValue(resetRecord);
    const result = await resetTestVendorAuthentication(
      {
        actor: admin,
        vendorId: activeRecord.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      },
      {
        auth: {
          findUserByEmail: vi
            .fn()
            .mockResolvedValue({ ...canonicalFirebaseResetUser, uid: activeRecord.uid }),
          createUser,
          setCustomUserClaims,
          updateUser,
          revokeRefreshTokens,
          deleteUser,
          generatePasswordResetLink: vi
            .fn()
            .mockResolvedValue(
              "https://auth.example.invalid/action?mode=resetPassword&oobCode=reset-once",
            ),
        },
        store: {
          getVendorById: vi.fn().mockResolvedValue(activeRecord),
          getConnection: vi.fn().mockResolvedValue(null),
          claimVendorAuthenticationReset,
          renewVendorAuthenticationResetClaim,
          resetVendorAuthentication,
          completeVendorAuthenticationReset,
        },
        now: () => new Date("2026-07-15T14:00:00.000Z"),
      },
    );

    expect(updateUser).toHaveBeenNthCalledWith(1, activeRecord.uid, {
      disabled: true,
      password: expect.any(String),
      multiFactor: { enrolledFactors: null },
    });
    const hardenedPassword = updateUser.mock.calls[0]?.[1]?.password as string;
    expect(hardenedPassword.length).toBeGreaterThanOrEqual(32);
    expect(revokeRefreshTokens).toHaveBeenCalledWith(activeRecord.uid);
    expect(deleteUser).toHaveBeenCalledWith(activeRecord.uid);
    expect(createUser).toHaveBeenCalledWith({
      email: activeRecord.email,
      emailVerified: true,
      disabled: true,
      displayName: activeRecord.displayName,
      password: expect.any(String),
    });
    expect(setCustomUserClaims).toHaveBeenCalledWith("uid-test-summit-rotated", {
      vendor: true,
      vendor_id: activeRecord.id,
      data_mode: "test",
    });
    const resetClaimId = claimVendorAuthenticationReset.mock.calls[0]?.[0]
      ?.claimId as string;
    expect(resetClaimId).toEqual(expect.any(String));
    expect(resetVendorAuthentication).toHaveBeenCalledWith({
      actorUid: admin.uid,
      vendorId: activeRecord.id,
      expectedUid: activeRecord.uid,
      expectedStatus: "active",
      expectedInviteVersion: 4,
      replacementUid: "uid-test-summit-rotated",
      expectedEmail: activeRecord.email,
      previewHash: preview.previewHash,
      claimId: resetClaimId,
      reasonHash: createHash("sha256").update(reason).digest("hex"),
      nowMs: Date.parse("2026-07-15T14:00:00.000Z"),
      nowIso: "2026-07-15T14:00:00.000Z",
    });
    expect(updateUser).toHaveBeenLastCalledWith("uid-test-summit-rotated", {
      disabled: false,
    });
    expect(completeVendorAuthenticationReset).toHaveBeenCalledWith({
      vendorId: activeRecord.id,
      replacementUid: "uid-test-summit-rotated",
      previewHash: preview.previewHash,
      claimId: resetClaimId,
      nowMs: Date.parse("2026-07-15T14:00:00.000Z"),
    });
    expect(renewVendorAuthenticationResetClaim).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: resetClaimId }),
    );
    expect(result).toMatchObject({
      vendor: { uid: "uid-test-summit-rotated", inviteVersion: 5 },
      setup: {
        artifact: TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT,
        oneTime: true,
        authenticationReset: true,
        deliveredExternally: false,
      },
      callout: {
        dataMode: "test",
        externalEffect: false,
        liveEvidenceEligible: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(hardenedPassword);
    expect(JSON.stringify(resetVendorAuthentication.mock.calls)).not.toContain(
      hardenedPassword,
    );
  });

  it("lets only one overlapping same-preview request mutate Auth or mint a setup link", async () => {
    const fake = new FakeFirestore();
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/${canonicalTestVendor.id}`, {
      ...canonicalTestVendor,
      status: "active",
      inviteVersion: 4,
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: true,
      },
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    const reason = "Prove overlapping reset serialization";
    const preview = testVendorAuthenticationResetPreview(canonicalTestVendor.id, reason, {
      uid: canonicalTestVendor.uid,
      status: "active",
      inviteVersion: 4,
    });
    let currentUser: {
      uid: string;
      email: string;
      emailVerified: boolean;
      disabled: boolean;
      customClaims?: Record<string, unknown>;
    } | null = {
      ...canonicalFirebaseResetUser,
    };
    let releaseFirstHarden!: () => void;
    let reportFirstHarden!: () => void;
    const firstHardenStarted = new Promise<void>((resolve) => {
      reportFirstHarden = resolve;
    });
    const firstHardenGate = new Promise<void>((resolve) => {
      releaseFirstHarden = resolve;
    });
    let firstHarden = true;
    const updateUser = vi.fn(
      async (
        uid: string,
        value:
          | {
              disabled: true;
              password: string;
              multiFactor: { enrolledFactors: null };
            }
          | { disabled: false },
      ) => {
        if ("password" in value && uid === canonicalTestVendor.uid && firstHarden) {
          firstHarden = false;
          reportFirstHarden();
          await firstHardenGate;
        }
        if (currentUser?.uid === uid) {
          currentUser = { ...currentUser, disabled: value.disabled };
        }
      },
    );
    const generatePasswordResetLink = vi
      .fn()
      .mockResolvedValue("https://auth.example.invalid/action?code=only-winner");
    const auth = {
      findUserByEmail: vi.fn(async () =>
        currentUser ? structuredClone(currentUser) : null,
      ),
      createUser: vi.fn(async () => {
        currentUser = {
          ...canonicalFirebaseResetUser,
          uid: "uid-overlap-winner",
          disabled: true,
        };
        return { uid: currentUser.uid };
      }),
      setCustomUserClaims: vi.fn(async (uid: string, claims: Record<string, unknown>) => {
        if (currentUser?.uid === uid) {
          currentUser = { ...currentUser, customClaims: claims };
        }
      }),
      updateUser,
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn(async (uid: string) => {
        if (currentUser?.uid === uid) currentUser = null;
      }),
      generatePasswordResetLink,
    };
    const input = {
      actor: admin,
      vendorId: canonicalTestVendor.id,
      reason,
      confirmedPreviewHash: preview.previewHash,
    };
    const dependencies = {
      auth,
      store,
      now: () => new Date("2026-07-15T14:00:00.000Z"),
    };

    const winner = resetTestVendorAuthentication(input, dependencies);
    await firstHardenStarted;
    const loser = resetTestVendorAuthentication(input, dependencies);
    await expect(loser).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor authentication reset is unavailable.",
    });
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(generatePasswordResetLink).not.toHaveBeenCalled();

    releaseFirstHarden();
    await expect(winner).resolves.toMatchObject({
      vendor: {
        uid: "uid-overlap-winner",
        status: "pending_setup",
        inviteVersion: 5,
      },
      setup: {
        setupLink: "https://auth.example.invalid/action?code=only-winner",
      },
    });
    expect(generatePasswordResetLink).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(
      Array.from(fake.store.keys()).filter((path) =>
        path.startsWith(`${VENDOR_COLLECTIONS.audit}/`),
      ),
    ).toHaveLength(2);
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${canonicalTestVendor.id}`),
    ).toMatchObject({
      uid: "uid-overlap-winner",
      inviteVersion: 5,
      authenticationReset: { status: "completed" },
    });
  });

  it("rotates an expired prepared UID before a delayed old owner can affect the winner", async () => {
    const fake = new FakeFirestore();
    const sourceRecord: VendorRecord = {
      ...canonicalTestVendor,
      status: "active",
      inviteVersion: 4,
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: true,
      },
    };
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/${canonicalTestVendor.id}`, {
      ...sourceRecord,
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    const reason = "Recover an expired prepared reset without reusing its UID";
    const preview = testVendorAuthenticationResetPreview(
      sourceRecord.id,
      reason,
      resetBinding(sourceRecord),
    );
    const abandonedUid = "uid-expired-old-attempt";
    const winningUid = "uid-expired-takeover-winner";
    let clockMs = Date.parse("2026-07-15T14:00:00.000Z");
    let currentUser: {
      uid: string;
      email: string;
      emailVerified: boolean;
      disabled: boolean;
      customClaims?: Record<string, unknown>;
    } | null = {
      ...canonicalFirebaseResetUser,
      uid: sourceRecord.uid,
    };
    let createdUserCount = 0;
    let releaseOldEnable!: () => void;
    let reportOldEnable!: () => void;
    const oldEnableStarted = new Promise<void>((resolve) => {
      reportOldEnable = resolve;
    });
    const oldEnableGate = new Promise<void>((resolve) => {
      releaseOldEnable = resolve;
    });
    let deferOldEnable = true;
    const updateUser = vi.fn(
      async (
        uid: string,
        value:
          | {
              disabled: true;
              password: string;
              multiFactor: { enrolledFactors: null };
            }
          | { disabled: false },
      ) => {
        if (!("password" in value) && uid === abandonedUid && deferOldEnable) {
          deferOldEnable = false;
          reportOldEnable();
          await oldEnableGate;
        }
        if (currentUser?.uid === uid) {
          currentUser = { ...currentUser, disabled: value.disabled };
        }
      },
    );
    const deleteUser = vi.fn(async (uid: string) => {
      if (currentUser?.uid === uid) currentUser = null;
    });
    const generatePasswordResetLink = vi
      .fn()
      .mockResolvedValue("https://auth.example.invalid/action?code=takeover-only");
    const auth = {
      findUserByEmail: vi.fn(async () =>
        currentUser ? structuredClone(currentUser) : null,
      ),
      createUser: vi.fn(async () => {
        const uid = createdUserCount++ === 0 ? abandonedUid : winningUid;
        currentUser = {
          uid,
          email: canonicalTestVendor.email,
          emailVerified: true,
          disabled: true,
        };
        return { uid };
      }),
      setCustomUserClaims: vi.fn(async (uid: string, claims: Record<string, unknown>) => {
        if (currentUser?.uid === uid) {
          currentUser = { ...currentUser, customClaims: claims };
        }
      }),
      updateUser,
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
      deleteUser,
      generatePasswordResetLink,
    };
    const input = {
      actor: admin,
      vendorId: sourceRecord.id,
      reason,
      confirmedPreviewHash: preview.previewHash,
    };
    const dependencies = {
      auth,
      store,
      now: () => new Date(clockMs),
    };

    const oldOwner = resetTestVendorAuthentication(input, dependencies);
    await oldEnableStarted;
    const preparedRecord = fake.store.get(
      `${VENDOR_COLLECTIONS.vendors}/${sourceRecord.id}`,
    ) as unknown as VendorRecord;
    expect(preparedRecord).toMatchObject({
      uid: abandonedUid,
      inviteVersion: 5,
      authenticationReset: { status: "prepared" },
    });
    const reloadedPreview = testVendorAuthenticationResetPreviewForRecord(
      sourceRecord.id,
      reason,
      preparedRecord,
    );
    expect(reloadedPreview.previewHash).toBe(preview.previewHash);
    expect(reloadedPreview).toMatchObject({
      currentStatus: "active",
      currentInviteVersion: 4,
      nextStatus: "pending_setup",
      nextInviteVersion: 5,
    });
    expect(reloadedPreview).not.toHaveProperty("currentUid");

    const setupRecoveryReason = "Do not race the prepared authentication reset";
    const setupRecoveryPreview = testVendorSetupLinkRegenerationPreview(
      sourceRecord.id,
      setupRecoveryReason,
    );
    const firebaseReadsBeforeSetupConflict = auth.findUserByEmail.mock.calls.length;
    await expect(
      regenerateTestVendorSetupLink(
        {
          actor: admin,
          vendorId: sourceRecord.id,
          reason: setupRecoveryReason,
          confirmedPreviewHash: setupRecoveryPreview.previewHash,
        },
        dependencies,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor setup-link recovery is unavailable.",
    });
    expect(auth.findUserByEmail).toHaveBeenCalledTimes(firebaseReadsBeforeSetupConflict);
    expect(generatePasswordResetLink).not.toHaveBeenCalled();

    const mutationCountsBeforeBusyRetry = {
      create: auth.createUser.mock.calls.length,
      delete: deleteUser.mock.calls.length,
      update: updateUser.mock.calls.length,
      link: generatePasswordResetLink.mock.calls.length,
    };
    await expect(
      resetTestVendorAuthentication(
        { ...input, confirmedPreviewHash: reloadedPreview.previewHash },
        dependencies,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor authentication reset is unavailable.",
    });
    expect({
      create: auth.createUser.mock.calls.length,
      delete: deleteUser.mock.calls.length,
      update: updateUser.mock.calls.length,
      link: generatePasswordResetLink.mock.calls.length,
    }).toEqual(mutationCountsBeforeBusyRetry);

    clockMs += TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS + 1;
    const recoveryReason =
      "A different Admin recovers the expired prepared reset after reload";
    const recoveryAdmin = { ...admin, uid: "admin-prepared-recovery" };
    const recoveryPreview = testVendorAuthenticationResetPreviewForRecord(
      sourceRecord.id,
      recoveryReason,
      preparedRecord,
      clockMs,
    );
    expect(recoveryPreview.previewHash).not.toBe(reloadedPreview.previewHash);
    const takeover = await resetTestVendorAuthentication(
      {
        ...input,
        actor: recoveryAdmin,
        reason: recoveryReason,
        confirmedPreviewHash: recoveryPreview.previewHash,
      },
      dependencies,
    );
    expect(takeover).toMatchObject({
      vendor: { uid: winningUid, status: "pending_setup", inviteVersion: 5 },
      setup: {
        setupLink: "https://auth.example.invalid/action?code=takeover-only",
      },
    });
    expect(currentUser).toMatchObject({ uid: winningUid, disabled: false });

    releaseOldEnable();
    await expect(oldOwner).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor authentication reset is unavailable.",
    });
    expect(currentUser).toMatchObject({ uid: winningUid, disabled: false });
    expect(generatePasswordResetLink).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalledWith(winningUid);
    expect(updateUser.mock.calls.filter(([uid]) => uid === winningUid)).toEqual([
      [winningUid, { disabled: false }],
    ]);
    expect(
      Array.from(fake.store.keys()).filter((path) =>
        path.startsWith(`${VENDOR_COLLECTIONS.audit}/`),
      ),
    ).toHaveLength(3);
    expect(
      Array.from(fake.store.values()).filter(
        (value) => value.action === "test_vendor_authentication_reset_recovery_claimed",
      ),
    ).toEqual([
      expect.objectContaining({
        actorUid: recoveryAdmin.uid,
        reasonHash: createHash("sha256").update(recoveryReason).digest("hex"),
      }),
    ]);
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${sourceRecord.id}`),
    ).toMatchObject({
      uid: winningUid,
      inviteVersion: 5,
      authenticationReset: { status: "completed" },
    });
  });

  it.each(["pending_setup", "active", "disabled"] as const)(
    "binds the reset preview to the current %s lifecycle version",
    (status) => {
      const record = {
        ...canonicalTestVendor,
        status,
        inviteVersion: 7,
      };
      const preview = testVendorAuthenticationResetPreview(
        record.id,
        "Rotate the canonical acceptance identity",
        resetBinding(record),
      );
      expect(
        testVendorAuthenticationResetPreview(
          record.id,
          "Rotate the canonical acceptance identity",
          { ...resetBinding(record), inviteVersion: 8 },
        ).previewHash,
      ).not.toBe(preview.previewHash);
      expect(
        testVendorAuthenticationResetPreview(
          record.id,
          "Rotate the canonical acceptance identity",
          { ...resetBinding(record), uid: "uid-after-reset" },
        ).previewHash,
      ).not.toBe(preview.previewHash);
    },
  );

  it.each([
    ["disable", "active", "disabled"],
    ["activation", "pending_setup", "active"],
  ] as const)(
    "%s wins before reset: stale confirmation fails and a fresh %s-state reset succeeds",
    async (lifecycleAction, initialStatus, transitionedStatus) => {
      const fake = new FakeFirestore();
      const sourceRecord: VendorRecord = {
        ...canonicalTestVendor,
        status: initialStatus,
        inviteVersion: 4,
        identityState: {
          emailVerified: true,
          totpRequired: true,
          totpVerified: initialStatus === "active",
        },
      };
      fake.seed(`${VENDOR_COLLECTIONS.vendors}/${sourceRecord.id}`, {
        ...sourceRecord,
      });
      const store = new FirestoreVendorStore(fake as unknown as Firestore);
      const reason = `Reset after ${lifecycleAction} wins its transaction`;
      const stalePreview = testVendorAuthenticationResetPreview(
        sourceRecord.id,
        reason,
        resetBinding(sourceRecord),
      );

      if (lifecycleAction === "disable") {
        await expect(
          store.disableVendor({
            vendorId: sourceRecord.id,
            expectedUid: sourceRecord.uid,
            nowIso: "2026-07-15T14:00:00.000Z",
          }),
        ).resolves.toBe("disabled");
      } else {
        await expect(
          store.activateVendor(
            sourceRecord.id,
            sourceRecord.uid,
            sourceRecord.email,
            "2026-07-15T14:00:00.000Z",
            "test",
          ),
        ).resolves.toBe(true);
      }
      const transitionedRecord = (await store.getVendorById(
        sourceRecord.id,
      )) as VendorRecord;
      expect(transitionedRecord.status).toBe(transitionedStatus);

      let currentUser: {
        uid: string;
        email: string;
        emailVerified: boolean;
        disabled: boolean;
        customClaims?: Record<string, unknown>;
      } | null = {
        ...canonicalFirebaseResetUser,
        uid: sourceRecord.uid,
        disabled: transitionedStatus === "disabled",
      };
      const winningUid = `uid-after-${lifecycleAction}-winner`;
      const findUserByEmail = vi.fn(async () =>
        currentUser ? structuredClone(currentUser) : null,
      );
      const auth = {
        findUserByEmail,
        createUser: vi.fn(async () => {
          currentUser = {
            ...canonicalFirebaseResetUser,
            uid: winningUid,
            disabled: true,
          };
          return { uid: winningUid };
        }),
        setCustomUserClaims: vi.fn(
          async (uid: string, claims: Record<string, unknown>) => {
            if (currentUser?.uid === uid)
              currentUser = { ...currentUser, customClaims: claims };
          },
        ),
        updateUser: vi.fn(async (uid: string, value: { disabled: boolean }) => {
          if (currentUser?.uid === uid) {
            currentUser = { ...currentUser, disabled: value.disabled };
          }
        }),
        revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
        deleteUser: vi.fn(async (uid: string) => {
          if (currentUser?.uid === uid) currentUser = null;
        }),
        generatePasswordResetLink: vi
          .fn()
          .mockResolvedValue(
            `https://auth.example.invalid/action?code=${lifecycleAction}-winner`,
          ),
      };
      const resetInput = {
        actor: admin,
        vendorId: sourceRecord.id,
        reason,
        confirmedPreviewHash: stalePreview.previewHash,
      };

      await expect(
        resetTestVendorAuthentication(resetInput, { auth, store }),
      ).rejects.toMatchObject({ status: 409 });
      expect(findUserByEmail).not.toHaveBeenCalled();

      const freshPreview = testVendorAuthenticationResetPreviewForRecord(
        transitionedRecord.id,
        reason,
        transitionedRecord,
      );
      await expect(
        resetTestVendorAuthentication(
          { ...resetInput, confirmedPreviewHash: freshPreview.previewHash },
          { auth, store },
        ),
      ).resolves.toMatchObject({
        vendor: {
          uid: winningUid,
          status: "pending_setup",
          inviteVersion: 5,
        },
      });
      expect(currentUser).toMatchObject({ uid: winningUid, disabled: false });
      expect(
        Array.from(fake.store.values()).filter(
          (value) => value.action === "test_vendor_authentication_reset",
        ),
      ).toHaveLength(1);
    },
  );

  it.each([
    ["stale lifecycle", { inviteVersion: 99 }],
    ["unrelated claimed", { status: "claimed" as const }],
    ["completed reset", { status: "completed" as const }],
  ])("does not let an %s marker influence a fresh preview", (_name, markerChange) => {
    const reason = "Preview the current replacement lifecycle";
    const sourceBinding = {
      uid: canonicalTestVendor.uid,
      status: "active" as const,
      inviteVersion: 4,
    };
    const sourcePreview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      reason,
      sourceBinding,
    );
    const currentRecord = {
      ...canonicalTestVendor,
      uid: "uid-current-replacement",
      status: "pending_setup" as const,
      inviteVersion: 5,
      authenticationReset: {
        previewHash: sourcePreview.previewHash,
        inviteVersion: 5,
        sourceUid: sourceBinding.uid,
        sourceStatus: sourceBinding.status,
        sourceInviteVersion: sourceBinding.inviteVersion,
        status: "prepared" as const,
        claimId: "marker-that-must-not-bind",
        claimExpiresAtMs: Date.parse("2026-07-15T14:02:00.000Z"),
        ...markerChange,
      },
    };
    const currentPreview = testVendorAuthenticationResetPreview(
      currentRecord.id,
      reason,
      resetBinding(currentRecord),
    );

    const preview = testVendorAuthenticationResetPreviewForRecord(
      currentRecord.id,
      reason,
      currentRecord,
    );

    expect(preview.previewHash).toBe(currentPreview.previewHash);
    expect(preview.previewHash).not.toBe(sourcePreview.previewHash);
    expect(preview).toMatchObject({
      currentStatus: "pending_setup",
      currentInviteVersion: 5,
      nextInviteVersion: 6,
    });
    expect(preview).not.toHaveProperty("currentUid");
  });

  it("requires the original exact reason while a lifecycle-consistent reset lease is live", () => {
    const originalReason = "Resume the exact interrupted authentication reset";
    const sourceBinding = {
      uid: canonicalTestVendor.uid,
      status: "active" as const,
      inviteVersion: 4,
    };
    const sourcePreview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      originalReason,
      sourceBinding,
    );
    const preparedRecord = {
      ...canonicalTestVendor,
      uid: "uid-prepared-for-exact-reason",
      status: "pending_setup" as const,
      inviteVersion: 5,
      authenticationReset: {
        previewHash: sourcePreview.previewHash,
        inviteVersion: 5,
        sourceUid: sourceBinding.uid,
        sourceStatus: sourceBinding.status,
        sourceInviteVersion: sourceBinding.inviteVersion,
        status: "prepared" as const,
        claimId: "exact-reason-owner",
        claimExpiresAtMs: Date.now() + 120_000,
      },
    };

    expect(() =>
      testVendorAuthenticationResetPreviewForRecord(
        preparedRecord.id,
        "Use a different reason after reload",
        preparedRecord,
      ),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        message: "Test Vendor authentication reset is unavailable.",
      }),
    );
  });

  it("builds a fresh confirmable reason against an expired marker's immutable source tuple", () => {
    const sourceBinding = {
      uid: canonicalTestVendor.uid,
      status: "active" as const,
      inviteVersion: 4,
    };
    const originalPreview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      "Original reason lost with the browser",
      sourceBinding,
    );
    const preparedRecord = {
      ...canonicalTestVendor,
      uid: "uid-expired-prepared-replacement",
      status: "pending_setup" as const,
      inviteVersion: 5,
      authenticationReset: {
        previewHash: originalPreview.previewHash,
        inviteVersion: 5,
        sourceUid: sourceBinding.uid,
        sourceStatus: sourceBinding.status,
        sourceInviteVersion: sourceBinding.inviteVersion,
        status: "prepared" as const,
        claimId: "expired-reason-owner",
        claimExpiresAtMs: 10,
      },
    };
    const recovered = testVendorAuthenticationResetPreviewForRecord(
      preparedRecord.id,
      "A fresh Admin reason after the expired lease",
      preparedRecord,
      11,
    );

    expect(recovered.previewHash).not.toBe(originalPreview.previewHash);
    expect(recovered).toMatchObject({
      currentStatus: "active",
      currentInviteVersion: 4,
      nextInviteVersion: 5,
    });
    expect(recovered).not.toHaveProperty("currentUid");
  });

  it.each([
    ["non-object", "corrupt-marker"],
    ["wrong source UID type", { status: "prepared", sourceUid: 42 }],
    ["non-finite lease", { status: "claimed", claimExpiresAtMs: Infinity }],
  ])("fails closed without a runtime crash for a %s reset marker", (_name, marker) => {
    expect(() =>
      testVendorAuthenticationResetPreviewForRecord(
        canonicalTestVendor.id,
        "Safely inspect malformed marker data",
        {
          ...canonicalTestVendor,
          authenticationReset: marker,
        } as VendorRecord,
      ),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        message: "Test Vendor authentication reset is unavailable.",
      }),
    );
  });

  it("rejects a stale or completed reset preview before any Firebase mutation", async () => {
    const reason = "Rotate the canonical acceptance identity";
    const preview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      reason,
      resetBinding(canonicalTestVendor),
    );
    const changedRecord = {
      ...canonicalTestVendor,
      uid: "uid-after-completed-reset",
      inviteVersion: 2,
      authenticationReset: {
        previewHash: preview.previewHash,
        inviteVersion: 2,
        sourceUid: canonicalTestVendor.uid,
        sourceStatus: canonicalTestVendor.status,
        sourceInviteVersion: canonicalTestVendor.inviteVersion,
        status: "completed" as const,
        claimId: "completed-claim",
        claimExpiresAtMs: Date.now() + 120_000,
      },
    };
    const findUserByEmail = vi.fn();
    const updateUser = vi.fn();
    await expect(
      resetTestVendorAuthentication(
        {
          actor: admin,
          vendorId: canonicalTestVendor.id,
          reason,
          confirmedPreviewHash: preview.previewHash,
        },
        {
          auth: {
            findUserByEmail,
            createUser: vi.fn(),
            setCustomUserClaims: vi.fn(),
            updateUser,
            revokeRefreshTokens: vi.fn(),
            deleteUser: vi.fn(),
            generatePasswordResetLink: vi.fn(),
          },
          store: {
            getVendorById: vi.fn().mockResolvedValue(changedRecord),
            getConnection: vi.fn().mockResolvedValue(null),
            claimVendorAuthenticationReset: vi.fn(),
            renewVendorAuthenticationResetClaim: vi.fn(),
            resetVendorAuthentication: vi.fn(),
            completeVendorAuthenticationReset: vi.fn(),
          },
        },
      ),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("changed") });
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["missing claims", undefined],
    [
      "wrong Vendor claim",
      {
        vendor: true,
        vendor_id: "vendor:test-wrong",
        data_mode: "test",
      },
    ],
    [
      "wrong data-mode claim",
      {
        vendor: true,
        vendor_id: canonicalTestVendor.id,
        data_mode: "live",
      },
    ],
    [
      "an extra internal privilege claim",
      {
        vendor: true,
        vendor_id: canonicalTestVendor.id,
        data_mode: "test",
        role: "Admin",
      },
    ],
  ])(
    "rejects a disabled different-UID Firebase user with %s before any mutation",
    async (_name, customClaims) => {
      const reason = "Recover a staged replacement safely";
      const preview = testVendorAuthenticationResetPreview(
        canonicalTestVendor.id,
        reason,
        resetBinding(canonicalTestVendor),
      );
      const claimVendorAuthenticationReset = vi.fn();
      const updateUser = vi.fn();
      const deleteUser = vi.fn();
      await expect(
        resetTestVendorAuthentication(
          {
            actor: admin,
            vendorId: canonicalTestVendor.id,
            reason,
            confirmedPreviewHash: preview.previewHash,
          },
          {
            auth: {
              findUserByEmail: vi.fn().mockResolvedValue({
                ...canonicalFirebaseUser,
                uid: "uid-untrusted-staged-user",
                disabled: true,
                customClaims,
              }),
              createUser: vi.fn(),
              setCustomUserClaims: vi.fn(),
              updateUser,
              revokeRefreshTokens: vi.fn(),
              deleteUser,
              generatePasswordResetLink: vi.fn(),
            },
            store: {
              getVendorById: vi.fn().mockResolvedValue(canonicalTestVendor),
              getConnection: vi.fn().mockResolvedValue(null),
              claimVendorAuthenticationReset,
              renewVendorAuthenticationResetClaim: vi.fn(),
              resetVendorAuthentication: vi.fn(),
              completeVendorAuthenticationReset: vi.fn(),
            },
          },
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: "Test Vendor authentication reset is unavailable.",
      });
      expect(claimVendorAuthenticationReset).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
    },
  );

  it("rotates a staged Firebase UID instead of adopting it after an expired claim", async () => {
    const reason = "Original claimed-reset reason lost with the browser";
    const preview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      reason,
      resetBinding(canonicalTestVendor),
    );
    const stagedUid = "uid-expired-staged-replacement";
    const winningUid = "uid-fresh-staged-takeover";
    const claimedRecord = {
      ...canonicalTestVendor,
      authenticationReset: {
        previewHash: preview.previewHash,
        inviteVersion: canonicalTestVendor.inviteVersion,
        sourceUid: canonicalTestVendor.uid,
        sourceStatus: canonicalTestVendor.status,
        sourceInviteVersion: canonicalTestVendor.inviteVersion,
        status: "claimed" as const,
        claimId: "expired-staged-owner",
        claimExpiresAtMs: 1,
      },
    };
    const recoveryReason = "A different Admin recovers the expired claimed reset";
    const recoveryPreview = testVendorAuthenticationResetPreviewForRecord(
      claimedRecord.id,
      recoveryReason,
      claimedRecord,
      2,
    );
    const recoveredClaimedRecord = {
      ...claimedRecord,
      authenticationReset: {
        ...claimedRecord.authenticationReset,
        previewHash: recoveryPreview.previewHash,
        claimId: "fresh-recovery-owner",
      },
    };
    const resetRecord = {
      ...canonicalTestVendor,
      uid: winningUid,
      inviteVersion: 2,
    };
    const createUser = vi.fn().mockResolvedValue({ uid: winningUid });
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const resetVendorAuthentication = vi.fn().mockResolvedValue(resetRecord);

    await resetTestVendorAuthentication(
      {
        actor: admin,
        vendorId: canonicalTestVendor.id,
        reason: recoveryReason,
        confirmedPreviewHash: recoveryPreview.previewHash,
      },
      {
        auth: {
          findUserByEmail: vi.fn().mockResolvedValue({
            ...canonicalFirebaseResetUser,
            uid: stagedUid,
            disabled: true,
          }),
          createUser,
          setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
          updateUser: vi.fn().mockResolvedValue(undefined),
          revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
          deleteUser,
          generatePasswordResetLink: vi
            .fn()
            .mockResolvedValue(
              "https://auth.example.invalid/action?code=staged-takeover",
            ),
        },
        store: {
          getVendorById: vi.fn().mockResolvedValue(claimedRecord),
          getConnection: vi.fn().mockResolvedValue(null),
          claimVendorAuthenticationReset: vi.fn().mockResolvedValue({
            outcome: "claimed",
            record: recoveredClaimedRecord,
            recoveredExpiredClaim: true,
          }),
          renewVendorAuthenticationResetClaim: vi.fn().mockResolvedValue(true),
          resetVendorAuthentication,
          completeVendorAuthenticationReset: vi.fn().mockResolvedValue(resetRecord),
        },
      },
    );

    expect(deleteUser).toHaveBeenCalledWith(stagedUid);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(resetVendorAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({ replacementUid: winningUid }),
    );
  });

  it("rejects reuse of a missing prepared principal's abandoned Firestore UID", async () => {
    const reason = "Refuse abandoned prepared UID reuse";
    const sourceRecord: VendorRecord = {
      ...canonicalTestVendor,
      status: "disabled",
      inviteVersion: 3,
    };
    const preview = testVendorAuthenticationResetPreview(
      sourceRecord.id,
      reason,
      resetBinding(sourceRecord),
    );
    const abandonedUid = "uid-missing-prepared-principal";
    const preparedRecord = {
      ...canonicalTestVendor,
      uid: abandonedUid,
      inviteVersion: 4,
      authenticationReset: {
        previewHash: preview.previewHash,
        inviteVersion: 4,
        sourceUid: sourceRecord.uid,
        sourceStatus: sourceRecord.status,
        sourceInviteVersion: sourceRecord.inviteVersion,
        status: "prepared" as const,
        claimId: "expired-prepared-owner",
        claimExpiresAtMs: 1,
      },
    };
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const setCustomUserClaims = vi.fn();
    const resetVendorAuthentication = vi.fn();

    await expect(
      resetTestVendorAuthentication(
        {
          actor: admin,
          vendorId: sourceRecord.id,
          reason,
          confirmedPreviewHash: preview.previewHash,
        },
        {
          auth: {
            findUserByEmail: vi.fn().mockResolvedValue(null),
            createUser: vi.fn().mockResolvedValue({ uid: abandonedUid }),
            setCustomUserClaims,
            updateUser: vi.fn(),
            revokeRefreshTokens: vi.fn(),
            deleteUser,
            generatePasswordResetLink: vi.fn(),
          },
          store: {
            getVendorById: vi.fn().mockResolvedValue(preparedRecord),
            getConnection: vi.fn().mockResolvedValue(null),
            claimVendorAuthenticationReset: vi.fn().mockResolvedValue({
              outcome: "claimed",
              record: preparedRecord,
              recoveredExpiredClaim: true,
            }),
            renewVendorAuthenticationResetClaim: vi.fn(),
            resetVendorAuthentication,
            completeVendorAuthenticationReset: vi.fn(),
          },
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor authentication reset is unavailable.",
    });
    expect(deleteUser).toHaveBeenCalledWith(abandonedUid);
    expect(setCustomUserClaims).not.toHaveBeenCalled();
    expect(resetVendorAuthentication).not.toHaveBeenCalled();
  });

  it("resumes after the UID-swap transaction without incrementing or creating again", async () => {
    const reason = "Resume an interrupted authentication reset";
    const sourceRecord: VendorRecord = {
      ...canonicalTestVendor,
      status: "disabled",
      inviteVersion: 3,
      disabledAt: "2026-07-15T13:00:00.000Z",
    };
    const preview = testVendorAuthenticationResetPreview(
      sourceRecord.id,
      reason,
      resetBinding(sourceRecord),
    );
    const preparedRecord = {
      ...canonicalTestVendor,
      uid: "uid-staged-replacement",
      status: "pending_setup" as const,
      inviteVersion: 4,
      authenticationReset: {
        previewHash: preview.previewHash,
        inviteVersion: 4,
        sourceUid: sourceRecord.uid,
        sourceStatus: sourceRecord.status,
        sourceInviteVersion: sourceRecord.inviteVersion,
        status: "prepared" as const,
        claimId: "interrupted-claim",
        claimExpiresAtMs: Date.now() + 120_000,
      },
    };
    const createUser = vi.fn();
    const deleteUser = vi.fn();
    const resetVendorAuthentication = vi.fn().mockResolvedValue(preparedRecord);
    const completeVendorAuthenticationReset = vi.fn().mockResolvedValue(preparedRecord);
    await resetTestVendorAuthentication(
      {
        actor: admin,
        vendorId: sourceRecord.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      },
      {
        auth: {
          findUserByEmail: vi.fn().mockResolvedValue({
            ...canonicalFirebaseResetUser,
            uid: preparedRecord.uid,
            disabled: true,
          }),
          createUser,
          setCustomUserClaims: vi.fn(),
          updateUser: vi.fn().mockResolvedValue(undefined),
          revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
          deleteUser,
          generatePasswordResetLink: vi
            .fn()
            .mockResolvedValue("https://auth.example.invalid/action?code=resumed"),
        },
        store: {
          getVendorById: vi.fn().mockResolvedValue(preparedRecord),
          getConnection: vi.fn().mockResolvedValue(null),
          claimVendorAuthenticationReset: vi.fn().mockResolvedValue({
            outcome: "claimed",
            record: preparedRecord,
            recoveredExpiredClaim: false,
          }),
          renewVendorAuthenticationResetClaim: vi.fn().mockResolvedValue(true),
          resetVendorAuthentication,
          completeVendorAuthenticationReset,
        },
      },
    );

    expect(createUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(resetVendorAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUid: sourceRecord.uid,
        expectedStatus: "disabled",
        expectedInviteVersion: 3,
        replacementUid: preparedRecord.uid,
      }),
    );
  });

  it("recovers a missing old Firebase user and compensates a failed claim assignment", async () => {
    const reason = "Recover the interrupted UID rotation";
    const preview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      reason,
      resetBinding(canonicalTestVendor),
    );
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const resetVendorAuthentication = vi.fn();
    await expect(
      resetTestVendorAuthentication(
        {
          actor: admin,
          vendorId: canonicalTestVendor.id,
          reason,
          confirmedPreviewHash: preview.previewHash,
        },
        {
          auth: {
            findUserByEmail: vi.fn().mockResolvedValue(null),
            createUser: vi.fn().mockResolvedValue({ uid: "uid-partial-replacement" }),
            setCustomUserClaims: vi
              .fn()
              .mockRejectedValue(new Error("claim assignment interrupted")),
            updateUser: vi.fn(),
            revokeRefreshTokens: vi.fn(),
            deleteUser,
            generatePasswordResetLink: vi.fn(),
          },
          store: {
            getVendorById: vi.fn().mockResolvedValue(canonicalTestVendor),
            getConnection: vi.fn().mockResolvedValue(null),
            claimVendorAuthenticationReset: vi.fn().mockResolvedValue({
              outcome: "claimed",
              record: canonicalTestVendor,
              recoveredExpiredClaim: false,
            }),
            renewVendorAuthenticationResetClaim: vi.fn().mockResolvedValue(true),
            resetVendorAuthentication,
            completeVendorAuthenticationReset: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("claim assignment interrupted");
    expect(deleteUser).toHaveBeenCalledWith("uid-partial-replacement");
    expect(resetVendorAuthentication).not.toHaveBeenCalled();
  });

  it("refuses unexpected mailbox connection metadata before touching Firebase", async () => {
    const reason = "Reset the app-only Test Vendor";
    const preview = testVendorAuthenticationResetPreview(
      canonicalTestVendor.id,
      reason,
      resetBinding(canonicalTestVendor),
    );
    const findUserByEmail = vi.fn();
    const updateUser = vi.fn();
    await expect(
      resetTestVendorAuthentication(
        {
          actor: admin,
          vendorId: canonicalTestVendor.id,
          reason,
          confirmedPreviewHash: preview.previewHash,
        },
        {
          auth: {
            findUserByEmail,
            createUser: vi.fn(),
            setCustomUserClaims: vi.fn(),
            updateUser,
            revokeRefreshTokens: vi.fn(),
            deleteUser: vi.fn(),
            generatePasswordResetLink: vi.fn(),
          },
          store: {
            getVendorById: vi.fn().mockResolvedValue(canonicalTestVendor),
            getConnection: vi.fn().mockResolvedValue({
              vendorId: canonicalTestVendor.id,
              mailboxEmail: canonicalTestVendor.email,
              provider: "google",
              status: "connected",
              scopes: [],
              tokenSecretRef: "projects/p/secrets/unexpected",
              connectedAt: "2026-07-15T00:00:00.000Z",
              updatedAt: "2026-07-15T00:00:00.000Z",
            }),
            claimVendorAuthenticationReset: vi.fn(),
            renewVendorAuthenticationResetClaim: vi.fn(),
            resetVendorAuthentication: vi.fn(),
            completeVendorAuthenticationReset: vi.fn(),
          },
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor authentication reset is unavailable.",
    });
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("requires verified-email TOTP for Test sessions and binds their mode claim", () => {
    const now = 2_000_000;
    expect(
      validateVendorClaims(
        {
          uid: "uid-test-summit",
          email: "service@summit-plumbing.example.invalid",
          email_verified: true,
          vendor: true,
          vendor_id: "vendor:test-summit-plumbing",
          data_mode: "test",
          auth_time: now,
          firebase: { sign_in_second_factor: "totp" },
        },
        now,
      ),
    ).toMatchObject({ dataMode: "test", emailVerified: true, totpVerified: true });
    expect(() =>
      validateVendorClaims(
        {
          uid: "uid-test-summit",
          email: "service@summit-plumbing.example.invalid",
          email_verified: true,
          vendor: true,
          vendor_id: "vendor:test-summit-plumbing",
          data_mode: "test",
          auth_time: now,
          firebase: {},
        },
        now,
      ),
    ).toThrow("TOTP");
  });

  it("rejects a Test principal before OAuth or live Gmail can call a provider", async () => {
    const principal = {
      uid: "uid-test-summit",
      vendorId: "vendor:test-summit-plumbing",
      email: "service@summit-plumbing.example.invalid",
      emailVerified: true as const,
      totpVerified: true as const,
      sessionIssuedAt: 1,
      dataMode: "test" as const,
    };
    const saveState = vi.fn();
    await expect(
      beginVendorOAuth(
        {
          principal,
          clientId: "should-never-be-used",
          redirectUri: "https://app.example.com/callback",
          expectedRedirectUri: "https://app.example.com/callback",
        },
        {
          isVendorActive: vi.fn(),
          saveState,
          claimState: vi.fn(),
          saveConnection: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(saveState).not.toHaveBeenCalled();

    const getClient = vi.fn();
    expect(
      () =>
        new VendorGmailService(principal, principal.email, {
          assignments: {
            isVendorActive: vi.fn(),
            listAssignedTickets: vi.fn(),
            getAssignedTicket: vi.fn(),
            isThreadLinked: vi.fn(),
            getGmailLaneContext: vi.fn(),
          },
          provider: { getClient },
          confirmations: {
            createConfirmation: vi.fn(),
            claimConfirmation: vi.fn(),
            markConfirmation: vi.fn(),
          },
        }),
    ).toThrow("Test workspace");
    expect(getClient).not.toHaveBeenCalled();
  });
});
