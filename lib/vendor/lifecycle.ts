import { createHash } from "node:crypto";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { VendorBoundaryError, type VendorMailboxConnection } from "@/lib/vendor/model";

export interface VendorLifecycleStore {
  disableVendor(input: {
    vendorId: string;
    nowIso: string;
  }): Promise<"disabled" | "already_disabled">;
  getConnection(vendorId: string): Promise<VendorMailboxConnection | null>;
  markConnectionRevocationPending(vendorId: string, nowIso: string): Promise<void>;
  appendAudit(input: {
    actorUid: string;
    vendorId: string;
    action: string;
    reasonHash: string;
    createdAt: string;
  }): Promise<void>;
}

export interface VendorLifecycleAuth {
  revokeRefreshTokens(uid: string): Promise<void>;
  updateUser(uid: string, input: { disabled: true }): Promise<void>;
}

export interface VendorRevocationQueue {
  enqueue(input: { vendorId: string; tokenSecretRef: string }): Promise<void>;
}

export async function disableVendor(
  input: {
    actor: AuthenticatedUser;
    vendorId: string;
    vendorUid: string;
    reason: string;
  },
  dependencies: {
    store: VendorLifecycleStore;
    auth: VendorLifecycleAuth;
    revocations: VendorRevocationQueue;
    now?: () => Date;
  },
) {
  if (!can(input.actor.role, "manageAdmin")) {
    throw new VendorBoundaryError("Admin access is required.", 403);
  }
  const reason = input.reason.trim();
  if (reason.length < 3)
    throw new VendorBoundaryError("A disable reason is required.", 400);
  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const result = await dependencies.store.disableVendor({
    vendorId: input.vendorId,
    nowIso: createdAt,
  });
  if (result === "already_disabled")
    return { status: "disabled" as const, duplicate: true };

  await dependencies.auth.updateUser(input.vendorUid, { disabled: true });
  await dependencies.auth.revokeRefreshTokens(input.vendorUid);
  const connection = await dependencies.store.getConnection(input.vendorId);
  if (connection && connection.status === "connected") {
    await dependencies.store.markConnectionRevocationPending(input.vendorId, createdAt);
    await dependencies.revocations.enqueue({
      vendorId: input.vendorId,
      tokenSecretRef: connection.tokenSecretRef,
    });
  }
  await dependencies.store.appendAudit({
    actorUid: input.actor.uid,
    vendorId: input.vendorId,
    action: "vendor_disabled",
    reasonHash: createHash("sha256").update(reason).digest("hex"),
    createdAt,
  });
  return { status: "disabled" as const, duplicate: false };
}
