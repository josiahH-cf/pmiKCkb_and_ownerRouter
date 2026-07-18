import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vendor/admin-runtime", () => ({
  listProductionTestVendorAudit: vi.fn(),
}));

import { GET } from "@/app/api/admin/vendors/test/[vendorId]/audit/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { listProductionTestVendorAudit } from "@/lib/vendor/admin-runtime";
import { VendorBoundaryError } from "@/lib/vendor/model";

const vendorId = "vendor:test-summit-plumbing";

function actor(role: "Editor" | "Admin") {
  setAuthResolverForTest(() => ({
    uid: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  }));
}

function context(id = vendorId) {
  return { params: Promise.resolve({ vendorId: id }) };
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("Test Vendor bodyless audit route", () => {
  it("returns projected lifecycle history to an Admin", async () => {
    actor("Admin");
    vi.mocked(listProductionTestVendorAudit).mockResolvedValue([
      {
        action: "vendor.disabled",
        createdAt: "2026-07-18T12:00:00.000Z",
        mailboxScoped: false,
        reasonRecorded: true,
        ticketScoped: false,
      },
    ]);

    const response = await GET(
      new Request(`http://localhost/api/admin/vendors/test/${vendorId}/audit`),
      context(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      audit: [
        {
          action: "vendor.disabled",
          createdAt: "2026-07-18T12:00:00.000Z",
          mailboxScoped: false,
          reasonRecorded: true,
          ticketScoped: false,
        },
      ],
    });
    expect(listProductionTestVendorAudit).toHaveBeenCalledWith(vendorId);
  });

  it("rejects a non-Admin before reading audit records", async () => {
    actor("Editor");
    const response = await GET(
      new Request(`http://localhost/api/admin/vendors/test/${vendorId}/audit`),
      context(),
    );
    expect(response.status).toBe(403);
    expect(listProductionTestVendorAudit).not.toHaveBeenCalled();
  });

  it("preserves the canonical boundary error without leaking records", async () => {
    actor("Admin");
    vi.mocked(listProductionTestVendorAudit).mockRejectedValue(
      new VendorBoundaryError(
        "Only an approved Test Vendor audit can be viewed here.",
        404,
      ),
    );
    const response = await GET(
      new Request("http://localhost/api/admin/vendors/test/vendor:other/audit"),
      context("vendor:other"),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Only an approved Test Vendor audit can be viewed here.",
    });
  });
});
