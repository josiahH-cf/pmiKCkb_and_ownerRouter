import { afterEach, describe, expect, it, vi } from "vitest";

import type { VendorRecord } from "@/lib/vendor/model";
import { testVendorSetupLinkRegenerationPreview } from "@/lib/vendor/test-identity";

const runtime = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  generatePasswordResetLink: vi.fn(),
  getVendorById: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    getUserByEmail: runtime.getUserByEmail,
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
      appendAudit: runtime.appendAudit,
    };
  }),
}));

import { regenerateProductionTestVendorSetupLink } from "@/lib/vendor/admin-runtime";

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
