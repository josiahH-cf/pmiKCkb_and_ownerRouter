import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { getSessionCookieName } from "@/lib/auth/session";
import {
  createFirebaseSessionCookie,
  verifyFirebaseIdToken,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase/admin";
import { VendorBoundaryError, type VendorPrincipal } from "@/lib/vendor/model";

const VENDOR_SESSION_MAX_AGE_SECONDS = 60 * 60;
const VENDOR_SESSION_MAX_AGE_MS = VENDOR_SESSION_MAX_AGE_SECONDS * 1000;

export interface VendorAuthClaims {
  uid?: unknown;
  email?: unknown;
  email_verified?: unknown;
  vendor?: unknown;
  vendor_id?: unknown;
  auth_time?: unknown;
  firebase?: unknown;
}

type ClaimsVerifier = (value: string) => VendorAuthClaims | Promise<VendorAuthClaims>;

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new VendorBoundaryError(`Missing Vendor ${field}.`, 403);
  }
  return value.trim();
}

function signInSecondFactor(firebaseClaim: unknown) {
  if (
    typeof firebaseClaim === "object" &&
    firebaseClaim !== null &&
    "sign_in_second_factor" in firebaseClaim
  ) {
    return (firebaseClaim as { sign_in_second_factor?: unknown }).sign_in_second_factor;
  }
  return undefined;
}

export function validateVendorClaims(
  claims: VendorAuthClaims,
  nowSeconds = Math.floor(Date.now() / 1000),
): VendorPrincipal {
  const uid = requiredString(claims.uid, "uid");
  const email = requiredString(claims.email, "email").toLowerCase();
  const vendorId = requiredString(claims.vendor_id, "vendor id");
  const authTime = claims.auth_time;

  if (claims.vendor !== true) {
    throw new VendorBoundaryError("This account is not a Vendor account.", 403);
  }
  if (claims.email_verified !== true) {
    throw new VendorBoundaryError("Verify the Vendor email before continuing.", 403);
  }
  if (signInSecondFactor(claims.firebase) !== "totp") {
    throw new VendorBoundaryError("TOTP verification is required.", 403);
  }
  if (
    typeof authTime !== "number" ||
    !Number.isFinite(authTime) ||
    authTime <= 0 ||
    nowSeconds - authTime > VENDOR_SESSION_MAX_AGE_SECONDS
  ) {
    throw new VendorBoundaryError("A recent Vendor MFA sign-in is required.", 401);
  }

  return {
    uid,
    vendorId,
    email,
    emailVerified: true,
    totpVerified: true,
    sessionIssuedAt: authTime,
  };
}

export async function authenticateVendorIdToken(
  idToken: string,
  verifier: ClaimsVerifier = verifyFirebaseIdToken,
) {
  let claims: VendorAuthClaims;
  try {
    claims = await verifier(idToken);
  } catch {
    throw new VendorBoundaryError("Vendor authentication is required.", 401);
  }
  return validateVendorClaims(claims);
}

export async function createVendorSession(idToken: string) {
  const principal = await authenticateVendorIdToken(idToken);
  const sessionCookie = await createFirebaseSessionCookie(
    idToken,
    VENDOR_SESSION_MAX_AGE_MS,
  );
  return {
    principal,
    sessionCookie,
    maxAgeSeconds: VENDOR_SESSION_MAX_AGE_SECONDS,
  };
}

export async function getVendorSession(
  verifier: ClaimsVerifier = verifyFirebaseSessionCookie,
): Promise<VendorPrincipal | null> {
  const value = (await cookies()).get(getSessionCookieName())?.value;
  if (!value) return null;

  return decodeVendorSessionCookie(value, verifier);
}

export async function decodeVendorSessionCookie(
  value: string,
  verifier: ClaimsVerifier = verifyFirebaseSessionCookie,
): Promise<VendorPrincipal | null> {
  let claims: VendorAuthClaims;
  try {
    claims = await verifier(value);
  } catch {
    // Internal staff/demo cookies, malformed cookies, and revoked Vendor
    // cookies are all unauthenticated at this separate external boundary.
    // Fail closed without breaking the public Vendor sign-in surface.
    return null;
  }

  try {
    return validateVendorClaims(claims);
  } catch (error) {
    if (error instanceof VendorBoundaryError) return null;
    throw error;
  }
}

export async function requireVendorSession() {
  const vendor = await getVendorSession();
  if (!vendor) throw new VendorBoundaryError("Vendor authentication is required.", 401);
  return vendor;
}

export function vendorMailboxKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function vendorErrorResponse(error: unknown) {
  if (error instanceof VendorBoundaryError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
