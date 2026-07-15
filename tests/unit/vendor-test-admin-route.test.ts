import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vendor/admin-runtime", () => ({
  listProductionTestVendors: vi.fn(),
  previewProductionTestVendorAuthenticationReset: vi.fn(),
  provisionProductionTestVendor: vi.fn(),
  regenerateProductionTestVendorSetupLink: vi.fn(),
  resetProductionTestVendorAuthentication: vi.fn(),
  disableProductionTestVendor: vi.fn(),
}));

import { GET, POST } from "@/app/api/admin/vendors/test/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  disableProductionTestVendor,
  listProductionTestVendors,
  previewProductionTestVendorAuthenticationReset,
  provisionProductionTestVendor,
  regenerateProductionTestVendorSetupLink,
  resetProductionTestVendorAuthentication,
} from "@/lib/vendor/admin-runtime";

function actor(role: "Editor" | "Admin") {
  setAuthResolverForTest(() => ({
    uid: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  }));
}

function request(body: unknown) {
  return new Request("http://localhost/api/admin/vendors/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("Test Vendor Admin route", () => {
  it("rejects non-Admins before any Firebase or Firestore runtime call", async () => {
    actor("Editor");
    const response = await POST(
      request({
        operation: "preview_provision",
        aliasKey: "summit-plumbing",
        reason: "valid reason",
      }),
    );
    expect(response.status).toBe(403);
    expect(provisionProductionTestVendor).not.toHaveBeenCalled();
  });

  it("returns the explicit Test-only exact preview without writing", async () => {
    actor("Admin");
    const response = await POST(
      request({
        operation: "preview_provision",
        aliasKey: "summit-plumbing",
        reason: "Exercise V1 Vendor setup",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preview: {
        vendorId: "vendor:test-summit-plumbing",
        email: "service@summit-plumbing.example.invalid",
        dataMode: "test",
        externalDelivery: false,
        liveEvidenceEligible: false,
      },
    });
    expect(provisionProductionTestVendor).not.toHaveBeenCalled();
  });

  it("provisions only after the reviewed hash is returned", async () => {
    actor("Admin");
    vi.mocked(provisionProductionTestVendor).mockResolvedValue({
      vendor: {
        vendorId: "vendor:test-summit-plumbing",
        uid: "uid-test-summit",
        displayName: "Summit Plumbing Test Vendor",
        email: "service@summit-plumbing.example.invalid",
        status: "pending_setup",
        dataMode: "test",
        emailVerified: true,
        totpVerified: false,
        createdAt: "2026-07-15T00:00:00.000Z",
      },
      setup: {
        artifact: "vendor-test-setup:v1.0",
        setupLink: "https://auth.example.invalid/action?code=one-time",
        oneTime: true,
        deliveredExternally: false,
      },
      callout: {
        dataMode: "test",
        externalEffect: false,
        liveEvidenceEligible: false,
      },
    });
    const response = await POST(
      request({
        operation: "provision",
        aliasKey: "summit-plumbing",
        reason: "Exercise V1 Vendor setup",
        confirmedPreviewHash: "reviewed-hash",
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(provisionProductionTestVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        aliasKey: "summit-plumbing",
        confirmedPreviewHash: "reviewed-hash",
      }),
    );
  });

  it("previews setup-link regeneration only for the canonical Test Vendor", async () => {
    actor("Admin");
    const response = await POST(
      request({
        operation: "preview_regenerate_setup",
        vendorId: "vendor:test-summit-plumbing",
        reason: "Recover the interrupted setup",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preview: {
        artifact: "vendor-test-setup-link-regeneration:v1.0",
        vendorId: "vendor:test-summit-plumbing",
        email: "service@summit-plumbing.example.invalid",
        action: "Regenerate Test Vendor setup link",
        dataMode: "test",
        externalDelivery: false,
        liveEvidenceEligible: false,
      },
    });
    expect(regenerateProductionTestVendorSetupLink).not.toHaveBeenCalled();

    const arbitraryResponse = await POST(
      request({
        operation: "preview_regenerate_setup",
        vendorId: "vendor:arbitrary",
        reason: "Probe an arbitrary account",
      }),
    );
    expect(arbitraryResponse.status).toBe(400);
    await expect(arbitraryResponse.json()).resolves.toEqual({
      error: "Only an approved Test Vendor can use this action.",
    });
    expect(regenerateProductionTestVendorSetupLink).not.toHaveBeenCalled();
  });

  it("returns a regenerated setup link only after exact Admin confirmation", async () => {
    actor("Admin");
    vi.mocked(regenerateProductionTestVendorSetupLink).mockResolvedValue({
      vendor: {
        vendorId: "vendor:test-summit-plumbing",
        uid: "uid-test-summit",
        displayName: "Summit Plumbing Test Vendor",
        email: "service@summit-plumbing.example.invalid",
        status: "pending_setup",
        dataMode: "test",
        emailVerified: true,
        totpVerified: false,
        createdAt: "2026-07-15T00:00:00.000Z",
      },
      setup: {
        artifact: "vendor-test-setup-link-regeneration:v1.0",
        setupLink: "https://auth.example.invalid/action?code=recovered-once",
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
    const response = await POST(
      request({
        operation: "regenerate_setup",
        vendorId: "vendor:test-summit-plumbing",
        reason: "Recover the interrupted setup",
        confirmedPreviewHash: "reviewed-recovery-hash",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      setup: {
        setupLink: "https://auth.example.invalid/action?code=recovered-once",
        regenerated: true,
        deliveredExternally: false,
      },
      callout: {
        dataMode: "test",
        externalEffect: false,
        liveEvidenceEligible: false,
      },
    });
    expect(regenerateProductionTestVendorSetupLink).toHaveBeenCalledWith({
      actor: expect.objectContaining({ role: "Admin" }),
      vendorId: "vendor:test-summit-plumbing",
      reason: "Recover the interrupted setup",
      confirmedPreviewHash: "reviewed-recovery-hash",
    });
  });

  it("previews an authentication reset through the current server lifecycle binding", async () => {
    actor("Admin");
    vi.mocked(previewProductionTestVendorAuthenticationReset).mockResolvedValue({
      previewHash: "lifecycle-bound-hash",
      artifact: "vendor-test-authentication-reset:v1.0",
      vendorId: "vendor:test-summit-plumbing",
      displayName: "Summit Plumbing Test Vendor",
      email: "service@summit-plumbing.example.invalid",
      currentStatus: "active",
      currentInviteVersion: 3,
      nextStatus: "pending_setup",
      nextInviteVersion: 4,
      action: "Reset Test Vendor authentication",
      target: "Summit Plumbing Test Vendor (service@summit-plumbing.example.invalid)",
      externalDelivery: false,
      dataMode: "test",
      liveEvidenceEligible: false,
      exactEffect: "Rotate the exact canonical Test identity.",
    });
    const response = await POST(
      request({
        operation: "preview_reset_authentication",
        vendorId: "vendor:test-summit-plumbing",
        reason: "Rotate the canonical acceptance identity",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preview: {
        previewHash: "lifecycle-bound-hash",
        currentStatus: "active",
        currentInviteVersion: 3,
        dataMode: "test",
        liveEvidenceEligible: false,
      },
    });
    expect(previewProductionTestVendorAuthenticationReset).toHaveBeenCalledWith({
      vendorId: "vendor:test-summit-plumbing",
      reason: "Rotate the canonical acceptance identity",
    });
    expect(resetProductionTestVendorAuthentication).not.toHaveBeenCalled();
  });

  it("returns the one-time reset link only in a no-store confirmed response", async () => {
    actor("Admin");
    vi.mocked(resetProductionTestVendorAuthentication).mockResolvedValue({
      vendor: {
        vendorId: "vendor:test-summit-plumbing",
        uid: "uid-test-summit-rotated",
        displayName: "Summit Plumbing Test Vendor",
        email: "service@summit-plumbing.example.invalid",
        status: "pending_setup",
        dataMode: "test",
        emailVerified: true,
        totpVerified: false,
        createdAt: "2026-07-15T00:00:00.000Z",
      },
      setup: {
        artifact: "vendor-test-authentication-reset:v1.0",
        setupLink: "https://auth.example.invalid/action?code=reset-once",
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
    const response = await POST(
      request({
        operation: "reset_authentication",
        vendorId: "vendor:test-summit-plumbing",
        reason: "Rotate the canonical acceptance identity",
        confirmedPreviewHash: "lifecycle-bound-hash",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      vendor: { uid: "uid-test-summit-rotated", status: "pending_setup" },
      setup: {
        setupLink: "https://auth.example.invalid/action?code=reset-once",
        authenticationReset: true,
      },
    });
    expect(resetProductionTestVendorAuthentication).toHaveBeenCalledWith({
      actor: expect.objectContaining({ role: "Admin" }),
      vendorId: "vendor:test-summit-plumbing",
      reason: "Rotate the canonical acceptance identity",
      confirmedPreviewHash: "lifecycle-bound-hash",
    });
  });

  it("lists and exact-disables only Test Vendor records", async () => {
    actor("Admin");
    vi.mocked(listProductionTestVendors).mockResolvedValue([]);
    await expect((await GET()).json()).resolves.toEqual({ vendors: [] });
    vi.mocked(disableProductionTestVendor).mockResolvedValue({
      status: "disabled",
      duplicate: false,
      vendorId: "vendor:test-summit-plumbing",
      callout: {
        dataMode: "test",
        externalEffect: false,
        liveEvidenceEligible: false,
      },
    });
    const response = await POST(
      request({
        operation: "disable",
        vendorId: "vendor:test-summit-plumbing",
        reason: "End the test session",
        confirmedPreviewHash: "reviewed-disable-hash",
      }),
    );
    expect(response.status).toBe(200);
    expect(disableProductionTestVendor).toHaveBeenCalledTimes(1);
  });
});
