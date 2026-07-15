import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vendor/admin-runtime", () => ({
  listProductionTestVendors: vi.fn(),
  provisionProductionTestVendor: vi.fn(),
  disableProductionTestVendor: vi.fn(),
}));

import { GET, POST } from "@/app/api/admin/vendors/test/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  disableProductionTestVendor,
  listProductionTestVendors,
  provisionProductionTestVendor,
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
    expect(provisionProductionTestVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        aliasKey: "summit-plumbing",
        confirmedPreviewHash: "reviewed-hash",
      }),
    );
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
