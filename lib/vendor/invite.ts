import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { VendorBoundaryError, type VendorRecord } from "@/lib/vendor/model";

export interface VendorInviteAuth {
  createUser(input: {
    email: string;
    emailVerified: false;
    disabled: false;
  }): Promise<{ uid: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  generatePasswordResetLink(email: string): Promise<string>;
  deleteUser(uid: string): Promise<void>;
}

export interface VendorInviteDelivery {
  deliver(input: {
    email: string;
    setupLink: string;
    artifactRef: string;
  }): Promise<void>;
}

export interface VendorInviteStore {
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

export const VENDOR_INVITE_ARTIFACT = "vendor-invite:v1.0";

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(value)) {
    throw new VendorBoundaryError("Enter a valid Vendor email address.", 400);
  }
  return value;
}

export function vendorInvitePreviewHash(email: string, reason: string) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        artifact: VENDOR_INVITE_ARTIFACT,
        email: normalizeEmail(email),
        reason: reason.trim(),
      }),
    )
    .digest("hex");
}

export async function inviteVendor(
  input: {
    actor: AuthenticatedUser;
    email: string;
    reason: string;
    confirmedPreviewHash: string;
  },
  dependencies: {
    auth: VendorInviteAuth;
    delivery: VendorInviteDelivery;
    store: VendorInviteStore;
    now?: () => Date;
    id?: () => string;
  },
) {
  if (!can(input.actor.role, "manageAdmin")) {
    throw new VendorBoundaryError("Admin access is required.", 403);
  }
  const email = normalizeEmail(input.email);
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new VendorBoundaryError("A plain-English invite reason is required.", 400);
  }
  if (input.confirmedPreviewHash !== vendorInvitePreviewHash(email, reason)) {
    throw new VendorBoundaryError(
      "The Vendor invite preview changed. Review it again.",
      409,
    );
  }
  if (await dependencies.store.findVendorByEmail(email)) {
    throw new VendorBoundaryError("That Vendor account already exists.", 409);
  }

  const vendorId = (dependencies.id ?? uuidv7)();
  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const user = await dependencies.auth.createUser({
    email,
    emailVerified: false,
    disabled: false,
  });
  let vendorSaved = false;
  try {
    await dependencies.auth.setCustomUserClaims(user.uid, {
      vendor: true,
      vendor_id: vendorId,
    });
    const record: VendorRecord = {
      id: vendorId,
      uid: user.uid,
      email,
      status: "pending_setup",
      inviteVersion: 1,
      createdAt,
      updatedAt: createdAt,
    };
    await dependencies.store.saveVendor(record);
    vendorSaved = true;
    const setupLink = await dependencies.auth.generatePasswordResetLink(email);
    await dependencies.delivery.deliver({
      email,
      setupLink,
      artifactRef: VENDOR_INVITE_ARTIFACT,
    });
    await dependencies.store.appendAudit({
      actorUid: input.actor.uid,
      vendorId,
      action: "vendor_invited",
      reasonHash: createHash("sha256").update(reason).digest("hex"),
      createdAt,
    });
    // Deliberately return no setup link, password, token, or un-hashed reason.
    return { vendorId, email, status: "pending_setup" as const, invitedAt: createdAt };
  } catch (error) {
    if (vendorSaved)
      await dependencies.store.removeVendor(vendorId).catch(() => undefined);
    await dependencies.auth.deleteUser(user.uid).catch(() => undefined);
    throw error;
  }
}
