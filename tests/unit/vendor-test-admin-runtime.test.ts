import { afterEach, describe, expect, it, vi } from "vitest";

import type { VendorRecord } from "@/lib/vendor/model";
import {
  testVendorAuthenticationResetPreview,
  testVendorSetupLinkRegenerationPreview,
} from "@/lib/vendor/test-identity";

const runtime = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  setCustomUserClaims: vi.fn(),
  updateUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  deleteUser: vi.fn(),
  generatePasswordResetLink: vi.fn(),
  getVendorById: vi.fn(),
  getConnection: vi.fn(),
  claimVendorSetupLinkRegeneration: vi.fn(),
  renewVendorSetupLinkRegenerationClaim: vi.fn(),
  completeVendorSetupLinkRegeneration: vi.fn(),
  releaseVendorSetupLinkRegenerationClaim: vi.fn(),
  claimVendorAuthenticationReset: vi.fn(),
  renewVendorAuthenticationResetClaim: vi.fn(),
  resetVendorAuthentication: vi.fn(),
  completeVendorAuthenticationReset: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    getUserByEmail: runtime.getUserByEmail,
    createUser: runtime.createUser,
    setCustomUserClaims: runtime.setCustomUserClaims,
    updateUser: runtime.updateUser,
    revokeRefreshTokens: runtime.revokeRefreshTokens,
    deleteUser: runtime.deleteUser,
    generatePasswordResetLink: runtime.generatePasswordResetLink,
  }),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminApp: () => ({ name: "test-admin-app" }),
}));

vi.mock("@/lib/firestore/vendors", () => ({
  FirestoreVendorStore: vi.fn(function FirestoreVendorStore() {
    return {
      getVendorById: runtime.getVendorById,
      getConnection: runtime.getConnection,
      claimVendorSetupLinkRegeneration: runtime.claimVendorSetupLinkRegeneration,
      renewVendorSetupLinkRegenerationClaim:
        runtime.renewVendorSetupLinkRegenerationClaim,
      completeVendorSetupLinkRegeneration: runtime.completeVendorSetupLinkRegeneration,
      releaseVendorSetupLinkRegenerationClaim:
        runtime.releaseVendorSetupLinkRegenerationClaim,
      claimVendorAuthenticationReset: runtime.claimVendorAuthenticationReset,
      renewVendorAuthenticationResetClaim: runtime.renewVendorAuthenticationResetClaim,
      resetVendorAuthentication: runtime.resetVendorAuthentication,
      completeVendorAuthenticationReset: runtime.completeVendorAuthenticationReset,
      appendAudit: runtime.appendAudit,
    };
  }),
}));

import {
  previewProductionTestVendorAuthenticationReset,
  regenerateProductionTestVendorSetupLink,
  resetProductionTestVendorAuthentication,
} from "@/lib/vendor/admin-runtime";

const actor = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

const record: VendorRecord = {
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("production Test Vendor setup-link recovery runtime", () => {
  it("reads the existing Firebase identity and returns a projected Test-only result", async () => {
    const reason = "Recover the interrupted setup";
    const preview = testVendorSetupLinkRegenerationPreview(record.id, reason);
    runtime.getVendorById.mockResolvedValue(record);
    runtime.getUserByEmail.mockResolvedValue({
      uid: record.uid,
      email: record.email,
      emailVerified: true,
      disabled: false,
    });
    runtime.claimVendorSetupLinkRegeneration.mockResolvedValue("claimed");
    runtime.renewVendorSetupLinkRegenerationClaim.mockResolvedValue(true);
    runtime.completeVendorSetupLinkRegeneration.mockResolvedValue(true);
    runtime.generatePasswordResetLink.mockResolvedValue(
      "https://auth.example.invalid/action?code=runtime-once",
    );
    runtime.appendAudit.mockResolvedValue(undefined);

    await expect(
      regenerateProductionTestVendorSetupLink({
        actor,
        vendorId: record.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      }),
    ).resolves.toMatchObject({
      vendor: {
        vendorId: record.id,
        uid: record.uid,
        status: "pending_setup",
        dataMode: "test",
      },
      setup: {
        setupLink: "https://auth.example.invalid/action?code=runtime-once",
        regenerated: true,
        deliveredExternally: false,
      },
      callout: {
        dataMode: "test",
        externalEffect: false,
        liveEvidenceEligible: false,
      },
    });
    expect(runtime.getUserByEmail).toHaveBeenCalledWith(record.email);
    expect(runtime.generatePasswordResetLink).toHaveBeenCalledWith(record.email);
  });

  it("maps a missing canonical Firebase user into the same non-enumerating rejection", async () => {
    const reason = "Recover the interrupted setup";
    const preview = testVendorSetupLinkRegenerationPreview(record.id, reason);
    runtime.getVendorById.mockResolvedValue(record);
    runtime.claimVendorSetupLinkRegeneration.mockResolvedValue("claimed");
    runtime.releaseVendorSetupLinkRegenerationClaim.mockResolvedValue(true);
    runtime.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });

    await expect(
      regenerateProductionTestVendorSetupLink({
        actor,
        vendorId: record.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor setup-link recovery is unavailable.",
    });
    expect(runtime.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(runtime.appendAudit).not.toHaveBeenCalled();
  });
});

describe("production Test Vendor authentication-reset runtime", () => {
  it("loads the current lifecycle binding for preview without exposing the UID", async () => {
    runtime.getVendorById.mockResolvedValue({
      ...record,
      status: "active",
      inviteVersion: 6,
    });
    runtime.getConnection.mockResolvedValue(null);

    await expect(
      previewProductionTestVendorAuthenticationReset({
        vendorId: record.id,
        reason: "Rotate the canonical acceptance identity",
      }),
    ).resolves.toMatchObject({
      vendorId: record.id,
      currentStatus: "active",
      currentInviteVersion: 6,
      dataMode: "test",
      externalDelivery: false,
      liveEvidenceEligible: false,
    });
    const preview = await previewProductionTestVendorAuthenticationReset({
      vendorId: record.id,
      reason: "Rotate the canonical acceptance identity",
    });
    expect(preview).not.toHaveProperty("currentUid");
  });

  it("reconstructs the original confirmable preview after a prepared reset reload", async () => {
    const reason = "Resume the exact interrupted reset after browser reload";
    const sourceBinding = {
      uid: record.uid,
      status: "active" as const,
      inviteVersion: 6,
    };
    const originalPreview = testVendorAuthenticationResetPreview(
      record.id,
      reason,
      sourceBinding,
    );
    runtime.getVendorById.mockResolvedValue({
      ...record,
      uid: "uid-prepared-runtime-replacement",
      status: "pending_setup",
      inviteVersion: 7,
      authenticationReset: {
        previewHash: originalPreview.previewHash,
        inviteVersion: 7,
        sourceUid: sourceBinding.uid,
        sourceStatus: sourceBinding.status,
        sourceInviteVersion: sourceBinding.inviteVersion,
        status: "prepared",
        claimId: "interrupted-runtime-owner",
        claimExpiresAtMs: 1,
      },
    });
    runtime.getConnection.mockResolvedValue(null);

    const reloadedPreview = await previewProductionTestVendorAuthenticationReset({
      vendorId: record.id,
      reason,
    });

    expect(reloadedPreview.previewHash).toBe(originalPreview.previewHash);
    expect(reloadedPreview).toMatchObject({
      currentStatus: "active",
      currentInviteVersion: 6,
      nextStatus: "pending_setup",
      nextInviteVersion: 7,
    });
    expect(reloadedPreview).not.toHaveProperty("currentUid");
  });

  it("rotates Firebase through the production adapters and projects the reset record", async () => {
    const reason = "Rotate the canonical acceptance identity";
    runtime.getVendorById.mockResolvedValue(record);
    runtime.getConnection.mockResolvedValue(null);
    const preview = await previewProductionTestVendorAuthenticationReset({
      vendorId: record.id,
      reason,
    });
    const resetRecord: VendorRecord = {
      ...record,
      uid: "uid-runtime-rotated",
      inviteVersion: 2,
    };
    runtime.getUserByEmail.mockResolvedValue({
      uid: record.uid,
      email: record.email,
      emailVerified: true,
      disabled: false,
      customClaims: {
        vendor: true,
        vendor_id: record.id,
        data_mode: "test",
      },
    });
    runtime.updateUser.mockResolvedValue({});
    runtime.revokeRefreshTokens.mockResolvedValue(undefined);
    runtime.deleteUser.mockResolvedValue(undefined);
    runtime.createUser.mockResolvedValue({ uid: "uid-runtime-rotated" });
    runtime.setCustomUserClaims.mockResolvedValue(undefined);
    runtime.claimVendorAuthenticationReset.mockResolvedValue({
      outcome: "claimed",
      record,
      recoveredExpiredClaim: false,
    });
    runtime.renewVendorAuthenticationResetClaim.mockResolvedValue(true);
    runtime.resetVendorAuthentication.mockResolvedValue(resetRecord);
    runtime.generatePasswordResetLink.mockResolvedValue(
      "https://auth.example.invalid/action?code=runtime-reset",
    );
    runtime.completeVendorAuthenticationReset.mockResolvedValue(resetRecord);

    await expect(
      resetProductionTestVendorAuthentication({
        actor,
        vendorId: record.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      }),
    ).resolves.toMatchObject({
      vendor: {
        vendorId: record.id,
        uid: "uid-runtime-rotated",
        status: "pending_setup",
        dataMode: "test",
      },
      setup: {
        setupLink: "https://auth.example.invalid/action?code=runtime-reset",
        authenticationReset: true,
        deliveredExternally: false,
      },
    });
    expect(runtime.updateUser).toHaveBeenNthCalledWith(
      1,
      record.uid,
      expect.objectContaining({
        disabled: true,
        password: expect.any(String),
        multiFactor: { enrolledFactors: null },
      }),
    );
    expect(runtime.deleteUser).toHaveBeenCalledWith(record.uid);
    expect(runtime.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: record.email,
        disabled: true,
        password: expect.any(String),
      }),
    );
    expect(runtime.completeVendorAuthenticationReset).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: record.id,
        replacementUid: "uid-runtime-rotated",
        previewHash: preview.previewHash,
        claimId: expect.any(String),
        nowMs: expect.any(Number),
      }),
    );
  });

  it("maps an expected concurrent Firebase identity race to one generic reset rejection", async () => {
    const reason = "Rotate the canonical acceptance identity";
    runtime.getVendorById.mockResolvedValue(record);
    runtime.getConnection.mockResolvedValue(null);
    const preview = await previewProductionTestVendorAuthenticationReset({
      vendorId: record.id,
      reason,
    });
    runtime.getUserByEmail.mockResolvedValue({
      uid: record.uid,
      email: record.email,
      emailVerified: true,
      disabled: false,
      customClaims: {
        vendor: true,
        vendor_id: record.id,
        data_mode: "test",
      },
    });
    runtime.updateUser.mockResolvedValue({});
    runtime.revokeRefreshTokens.mockResolvedValue(undefined);
    runtime.deleteUser.mockResolvedValue(undefined);
    runtime.claimVendorAuthenticationReset.mockResolvedValue({
      outcome: "claimed",
      record,
      recoveredExpiredClaim: false,
    });
    runtime.createUser.mockRejectedValue({ code: "auth/email-already-exists" });

    await expect(
      resetProductionTestVendorAuthentication({
        actor,
        vendorId: record.id,
        reason,
        confirmedPreviewHash: preview.previewHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Test Vendor authentication reset is unavailable.",
    });
    expect(runtime.resetVendorAuthentication).not.toHaveBeenCalled();
    expect(runtime.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("refuses preview when the canonical Test identity has mailbox metadata", async () => {
    runtime.getVendorById.mockResolvedValue(record);
    runtime.getConnection.mockResolvedValue({
      vendorId: record.id,
      mailboxEmail: record.email,
    });
    await expect(
      previewProductionTestVendorAuthenticationReset({
        vendorId: record.id,
        reason: "Refuse an unsafe reset",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(runtime.getUserByEmail).not.toHaveBeenCalled();
  });
});
