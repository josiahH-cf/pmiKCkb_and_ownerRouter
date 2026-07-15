import { describe, expect, it, vi } from "vitest";

import { inviteVendor, vendorInvitePreviewHash } from "@/lib/vendor/invite";
import type { VendorRecord } from "@/lib/vendor/model";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

describe("Vendor invite", () => {
  it("fake-delivers one setup link while returning and auditing no credential", async () => {
    const vendors: VendorRecord[] = [];
    const delivery = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    const result = await inviteVendor(
      {
        actor: admin,
        email: "trade@example.com",
        reason: "Assigned plumbing work",
        confirmedPreviewHash: vendorInvitePreviewHash(
          "trade@example.com",
          "Assigned plumbing work",
        ),
      },
      {
        auth: {
          createUser: vi.fn().mockResolvedValue({ uid: "vendor-uid" }),
          setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
          generatePasswordResetLink: vi
            .fn()
            .mockResolvedValue("https://example.invalid/single-use-secret"),
          deleteUser: vi.fn().mockResolvedValue(undefined),
        },
        delivery: { deliver: delivery },
        store: {
          findVendorByEmail: async () => null,
          saveVendor: async (record) => void vendors.push(record),
          removeVendor: async () => undefined,
          appendAudit: audit,
        },
        id: () => "vendor-1",
        now: () => new Date("2026-07-14T12:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      vendorId: "vendor-1",
      email: "trade@example.com",
      status: "pending_setup",
      invitedAt: "2026-07-14T12:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("single-use-secret");
    expect(delivery).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Assigned plumbing work");
    expect(vendors[0]).not.toHaveProperty("password");
  });

  it("denies Editor and stale-preview attempts before auth construction", async () => {
    const createUser = vi.fn();
    const base = {
      auth: {
        createUser,
        setCustomUserClaims: vi.fn(),
        generatePasswordResetLink: vi.fn(),
        deleteUser: vi.fn(),
      },
      delivery: { deliver: vi.fn() },
      store: {
        findVendorByEmail: vi.fn().mockResolvedValue(null),
        saveVendor: vi.fn(),
        removeVendor: vi.fn(),
        appendAudit: vi.fn(),
      },
    };
    await expect(
      inviteVendor(
        {
          actor: { ...admin, role: "Editor" },
          email: "trade@example.com",
          reason: "Assigned work",
          confirmedPreviewHash: "wrong",
        },
        base,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      inviteVendor(
        {
          actor: admin,
          email: "trade@example.com",
          reason: "Assigned work",
          confirmedPreviewHash: "wrong",
        },
        base,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(createUser).not.toHaveBeenCalled();
  });
});
