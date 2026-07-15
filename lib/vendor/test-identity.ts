import { createHash } from "node:crypto";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { assertNonRoutableTestEmail, executionEvidenceMarker } from "@/lib/data-mode";
import { VendorBoundaryError, type VendorRecord } from "@/lib/vendor/model";

export const TEST_VENDOR_ALIASES = [
  {
    key: "summit-plumbing",
    vendorId: "vendor:test-summit-plumbing",
    email: "service@summit-plumbing.example.invalid",
    displayName: "Summit Plumbing Test Vendor",
  },
] as const;

export type TestVendorAliasKey = (typeof TEST_VENDOR_ALIASES)[number]["key"];

export const TEST_VENDOR_SETUP_ARTIFACT = "vendor-test-setup:v1.0";

export interface TestVendorIdentityAuth {
  createUser(input: {
    email: string;
    emailVerified: true;
    disabled: false;
    displayName: string;
  }): Promise<{ uid: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  generatePasswordResetLink(email: string): Promise<string>;
  deleteUser(uid: string): Promise<void>;
}

export interface TestVendorIdentityStore {
  findVendorByEmail(email: string): Promise<VendorRecord | null>;
  saveVendor(record: VendorRecord): Promise<void>;
  removeVendor(vendorId: string): Promise<void>;
  appendAudit(input: {
    actorUid: string;
    vendorId: string;
    action: string;
    reasonHash: string;
    createdAt: string;
  }): Promise<void>;
}

function reasonValue(reason: string) {
  const value = reason.trim();
  if (value.length < 3) {
    throw new VendorBoundaryError("A plain-English Test Vendor reason is required.", 400);
  }
  return value;
}

export function getTestVendorAlias(key: string) {
  const alias = TEST_VENDOR_ALIASES.find((candidate) => candidate.key === key);
  if (!alias) {
    throw new VendorBoundaryError("Choose an approved Test Vendor alias.", 400);
  }
  return alias;
}

export function testVendorProvisionPreview(aliasKey: string, reason: string) {
  const alias = getTestVendorAlias(aliasKey);
  assertNonRoutableTestEmail(alias.email);
  const normalizedReason = reasonValue(reason);
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        artifact: TEST_VENDOR_SETUP_ARTIFACT,
        vendorId: alias.vendorId,
        email: alias.email,
        reason: normalizedReason,
        dataMode: "test",
      }),
    )
    .digest("hex");

  return {
    previewHash,
    vendorId: alias.vendorId,
    displayName: alias.displayName,
    email: alias.email,
    action: "Provision Test Vendor identity",
    target: `${alias.displayName} (${alias.email})`,
    externalDelivery: false,
    ...executionEvidenceMarker("test"),
    exactEffect:
      "Create one Firebase Test Vendor user, pre-verify only its non-routable alias, issue one password-setup link to this Admin response, and require TOTP before portal access.",
  };
}

export function testVendorDisablePreview(vendorId: string, reason: string) {
  const alias = TEST_VENDOR_ALIASES.find((candidate) => candidate.vendorId === vendorId);
  if (!alias) {
    throw new VendorBoundaryError(
      "Only an approved Test Vendor can use this action.",
      400,
    );
  }
  const normalizedReason = reasonValue(reason);
  return {
    previewHash: createHash("sha256")
      .update(
        JSON.stringify({
          action: "disable-test-vendor",
          vendorId,
          reason: normalizedReason,
        }),
      )
      .digest("hex"),
    vendorId,
    displayName: alias.displayName,
    action: "Disable Test Vendor identity",
    target: alias.displayName,
    externalDelivery: false,
    ...executionEvidenceMarker("test"),
    exactEffect:
      "Disable this Test Vendor user, revoke its Firebase sessions, and close its simulated mailbox access. No live provider is contacted.",
  };
}

export async function provisionTestVendor(
  input: {
    actor: AuthenticatedUser;
    aliasKey: string;
    reason: string;
    confirmedPreviewHash: string;
  },
  dependencies: {
    auth: TestVendorIdentityAuth;
    store: TestVendorIdentityStore;
    now?: () => Date;
  },
) {
  if (!can(input.actor.role, "manageAdmin")) {
    throw new VendorBoundaryError("Admin access is required.", 403);
  }
  const preview = testVendorProvisionPreview(input.aliasKey, input.reason);
  if (preview.previewHash !== input.confirmedPreviewHash) {
    throw new VendorBoundaryError(
      "The Test Vendor setup preview changed. Review it again.",
      409,
    );
  }
  if (await dependencies.store.findVendorByEmail(preview.email)) {
    throw new VendorBoundaryError("That Test Vendor account already exists.", 409);
  }

  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const user = await dependencies.auth.createUser({
    email: preview.email,
    emailVerified: true,
    disabled: false,
    displayName: preview.displayName,
  });
  let vendorSaved = false;
  try {
    await dependencies.auth.setCustomUserClaims(user.uid, {
      vendor: true,
      vendor_id: preview.vendorId,
      data_mode: "test",
    });
    const record: VendorRecord = {
      id: preview.vendorId,
      uid: user.uid,
      email: preview.email,
      displayName: preview.displayName,
      status: "pending_setup",
      inviteVersion: 1,
      data_mode: "test",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: false,
      },
      createdAt,
      updatedAt: createdAt,
    };
    await dependencies.store.saveVendor(record);
    vendorSaved = true;
    const setupLink = await dependencies.auth.generatePasswordResetLink(preview.email);
    const parsedSetupLink = new URL(setupLink);
    if (parsedSetupLink.protocol !== "https:") {
      throw new VendorBoundaryError("Firebase returned an invalid setup link.", 503);
    }
    await dependencies.store.appendAudit({
      actorUid: input.actor.uid,
      vendorId: preview.vendorId,
      action: "test_vendor_provisioned",
      reasonHash: createHash("sha256").update(input.reason.trim()).digest("hex"),
      createdAt,
    });

    // The Firebase action code is returned only in this response and is single-use.
    // It is never persisted, delivered, audited, or eligible as live evidence.
    return {
      vendor: record,
      setup: {
        artifact: TEST_VENDOR_SETUP_ARTIFACT,
        setupLink,
        oneTime: true as const,
        deliveredExternally: false as const,
      },
      callout: {
        ...executionEvidenceMarker("test"),
        externalEffect: false as const,
      },
    };
  } catch (error) {
    if (vendorSaved) {
      await dependencies.store.removeVendor(preview.vendorId).catch(() => undefined);
    }
    await dependencies.auth.deleteUser(user.uid).catch(() => undefined);
    throw error;
  }
}
