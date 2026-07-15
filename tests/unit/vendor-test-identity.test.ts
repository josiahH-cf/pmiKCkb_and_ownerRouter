import { describe, expect, it, vi } from "vitest";

import { beginVendorOAuth } from "@/lib/vendor/oauth";
import { validateVendorClaims } from "@/lib/vendor/auth";
import { VendorGmailService } from "@/lib/vendor/gmail";
import type { VendorRecord } from "@/lib/vendor/model";
import {
  provisionTestVendor,
  testVendorProvisionPreview,
} from "@/lib/vendor/test-identity";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

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
