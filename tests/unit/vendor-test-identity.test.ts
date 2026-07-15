import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { beginVendorOAuth } from "@/lib/vendor/oauth";
import { validateVendorClaims } from "@/lib/vendor/auth";
import { VendorGmailService } from "@/lib/vendor/gmail";
import type { VendorRecord } from "@/lib/vendor/model";
import {
  provisionTestVendor,
  regenerateTestVendorSetupLink,
  TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
  testVendorProvisionPreview,
  testVendorSetupLinkRegenerationPreview,
} from "@/lib/vendor/test-identity";

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
    const appendAudit = vi.fn().mockResolvedValue(undefined);
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
          appendAudit,
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
    expect(appendAudit).toHaveBeenCalledWith({
      actorUid: admin.uid,
      vendorId: canonicalTestVendor.id,
      action: "test_vendor_setup_link_regenerated",
      reasonHash: createHash("sha256").update(reason).digest("hex"),
      createdAt: "2026-07-15T13:00:00.000Z",
    });
    expect(JSON.stringify(appendAudit.mock.calls)).not.toContain("single-use");
    expect(JSON.stringify(appendAudit.mock.calls)).not.toContain("oobCode");
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
    const appendAudit = vi.fn();
    const dependencies = {
      auth: { findUserByEmail, generatePasswordResetLink },
      store: { getVendorById, appendAudit },
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
    expect(appendAudit).not.toHaveBeenCalled();
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
      const appendAudit = vi.fn();
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
              appendAudit,
            },
          },
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: "Test Vendor setup-link recovery is unavailable.",
      });
      expect(generatePasswordResetLink).not.toHaveBeenCalled();
      expect(appendAudit).not.toHaveBeenCalled();
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
    const appendAudit = vi.fn();
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
            appendAudit,
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(appendAudit).not.toHaveBeenCalled();
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
