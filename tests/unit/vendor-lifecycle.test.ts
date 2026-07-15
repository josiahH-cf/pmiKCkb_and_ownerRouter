import { describe, expect, it, vi } from "vitest";

import { disableVendor } from "@/lib/vendor/lifecycle";
import { VENDOR_OAUTH_SCOPES } from "@/lib/vendor/model";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

describe("Vendor lifecycle", () => {
  it.each(["reset_in_progress", "stale"] as const)(
    "maps a %s conflict before Firebase, revocation, or audit effects",
    async (conflict) => {
      const updateUser = vi.fn();
      const revokeRefreshTokens = vi.fn();
      const getConnection = vi.fn();
      const markConnectionRevocationPending = vi.fn();
      const appendAudit = vi.fn();
      const enqueue = vi.fn();

      await expect(
        disableVendor(
          {
            actor: admin,
            vendorId: "vendor:test-summit-plumbing",
            vendorUid: "uid-reset-owner",
            reason: "Disable only after reset recovery",
          },
          {
            store: {
              disableVendor: vi.fn().mockResolvedValue(conflict),
              getConnection,
              markConnectionRevocationPending,
              appendAudit,
            },
            auth: { updateUser, revokeRefreshTokens },
            revocations: { enqueue },
          },
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: "Vendor lifecycle change is unavailable.",
      });
      expect(updateUser).not.toHaveBeenCalled();
      expect(revokeRefreshTokens).not.toHaveBeenCalled();
      expect(getConnection).not.toHaveBeenCalled();
      expect(markConnectionRevocationPending).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
      expect(appendAudit).not.toHaveBeenCalled();
    },
  );

  it("disables once, revokes sessions, and queues token destruction without token material", async () => {
    let disabled = false;
    const revokeRefreshTokens = vi.fn();
    const updateUser = vi.fn();
    const enqueue = vi.fn();
    const appendAudit = vi.fn();
    const dependencies = {
      store: {
        disableVendor: vi.fn(async () => {
          if (disabled) return "already_disabled" as const;
          disabled = true;
          return "disabled" as const;
        }),
        getConnection: vi.fn().mockResolvedValue({
          vendorId: "vendor-a",
          mailboxEmail: "trade@example.com",
          provider: "google",
          status: "connected",
          scopes: VENDOR_OAUTH_SCOPES,
          tokenSecretRef: "projects/p/secrets/vendor-a",
          connectedAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z",
        }),
        markConnectionRevocationPending: vi.fn(),
        appendAudit,
      },
      auth: { revokeRefreshTokens, updateUser },
      revocations: { enqueue },
      now: () => new Date("2026-07-14T12:00:00.000Z"),
    };
    const input = {
      actor: admin,
      vendorId: "vendor-a",
      vendorUid: "uid-a",
      reason: "Vendor relationship ended",
    };
    await expect(disableVendor(input, dependencies)).resolves.toMatchObject({
      duplicate: false,
    });
    await expect(disableVendor(input, dependencies)).resolves.toMatchObject({
      duplicate: true,
    });
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(revokeRefreshTokens).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(appendAudit.mock.calls)).not.toContain(
      "Vendor relationship ended",
    );
    expect(JSON.stringify(enqueue.mock.calls)).not.toMatch(/refresh[-_ ]?token/i);
  });
});
