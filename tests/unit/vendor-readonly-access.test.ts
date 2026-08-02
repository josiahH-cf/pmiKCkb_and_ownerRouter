import { describe, expect, it, vi } from "vitest";

import { confirmVendorPortalAccess } from "@/lib/vendor/access";

const principal = {
  dataMode: "live" as const,
  email: "vendor@pmikcmetro.com",
  vendorId: "vendor-1",
  uid: "vendor-uid-1",
};

function repository() {
  return {
    activateVendor: vi.fn(async () => true),
    isVendorActive: vi.fn(async () => true),
  };
}

describe("Vendor portal environment access", () => {
  it("uses an existing active record without writing in local Live-read-only", async () => {
    const store = repository();

    await expect(
      confirmVendorPortalAccess(principal, store, {
        DATA_CONTEXT: "live_readonly",
        ENVIRONMENT_KIND: "demo",
      }),
    ).resolves.toBe(true);

    expect(store.isVendorActive).toHaveBeenCalledWith(
      principal.vendorId,
      principal.uid,
      principal.email,
      "live",
    );
    expect(store.activateVendor).not.toHaveBeenCalled();
  });

  it("preserves the existing activation transition in Production Live", async () => {
    const store = repository();

    await expect(
      confirmVendorPortalAccess(
        principal,
        store,
        { DATA_CONTEXT: "live", ENVIRONMENT_KIND: "production" },
        "2026-08-02T12:00:00.000Z",
      ),
    ).resolves.toBe(true);

    expect(store.activateVendor).toHaveBeenCalledWith(
      principal.vendorId,
      principal.uid,
      principal.email,
      "2026-08-02T12:00:00.000Z",
      "live",
    );
    expect(store.isVendorActive).not.toHaveBeenCalled();
  });

  it("fails before either store operation when the descriptor is invalid", async () => {
    const store = repository();

    await expect(
      confirmVendorPortalAccess(principal, store, {
        ENVIRONMENT_KIND: "demo",
      }),
    ).rejects.toThrow(/descriptor is invalid/i);
    expect(store.activateVendor).not.toHaveBeenCalled();
    expect(store.isVendorActive).not.toHaveBeenCalled();
  });
});
