import { SPACE_SCOPES, type SpaceScope } from "@/lib/constants";
import type { RentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

export type RentVineProofActorErrorCode =
  | "actor_read_failed"
  | "actor_identity_mismatch"
  | "actor_disabled"
  | "actor_provider_mismatch"
  | "actor_claims_mismatch";

export class RentVineProofActorError extends Error {
  constructor(public readonly code: RentVineProofActorErrorCode) {
    super(`S30 actor readback refused (${code}).`);
    this.name = "RentVineProofActorError";
  }
}

export interface RentVineProofAuthUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
  providerData?: readonly { providerId?: string; email?: string }[];
}

export interface RentVineProofActorReader {
  getUser(uid: string): Promise<RentVineProofAuthUser>;
}

export async function verifyRentVineProofActor(
  reader: RentVineProofActorReader,
  runtime: RentVineProofRuntimeConfig,
): Promise<void> {
  let user: RentVineProofAuthUser;
  try {
    user = await reader.getUser(runtime.actor.uid);
  } catch {
    throw new RentVineProofActorError("actor_read_failed");
  }
  const email = user.email?.trim().toLowerCase();
  if (
    user.uid !== runtime.actor.uid ||
    email !== runtime.actor.email ||
    !email.endsWith("@pmikcmetro.com") ||
    user.emailVerified !== true
  ) {
    throw new RentVineProofActorError("actor_identity_mismatch");
  }
  if (user.disabled === true) {
    throw new RentVineProofActorError("actor_disabled");
  }
  const googleIdentity = user.providerData?.some(
    (provider) =>
      provider.providerId === "google.com" &&
      provider.email?.trim().toLowerCase() === runtime.actor.email,
  );
  if (googleIdentity !== true) {
    throw new RentVineProofActorError("actor_provider_mismatch");
  }
  const claims = user.customClaims;
  if (
    !claims ||
    claims.role !== "Admin" ||
    claims.vendor !== undefined ||
    claims.vendor_id !== undefined ||
    claims.data_mode !== undefined ||
    !claimsAuthorizeScopes(claims.scopes, runtime.actor.scopes)
  ) {
    throw new RentVineProofActorError("actor_claims_mismatch");
  }
}

function claimsAuthorizeScopes(value: unknown, required: readonly SpaceScope[]): boolean {
  // An absent claim is the established internal All-Spaces wildcard. A present claim must be a
  // complete, unique allowlist containing every scope bound into the proof packet.
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const scopes = value.filter(
    (scope): scope is SpaceScope =>
      typeof scope === "string" && SPACE_SCOPES.includes(scope as SpaceScope),
  );
  return (
    scopes.length === value.length &&
    new Set(scopes).size === scopes.length &&
    required.every((scope) => scopes.includes(scope))
  );
}
