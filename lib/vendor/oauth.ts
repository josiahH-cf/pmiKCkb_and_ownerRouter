import { createHash, randomBytes } from "node:crypto";

import {
  VENDOR_OAUTH_SCOPES,
  VendorBoundaryError,
  assertLiveVendorPrincipal,
  type VendorMailboxConnection,
  type VendorOAuthScope,
  type VendorPrincipal,
} from "@/lib/vendor/model";
import {
  assertActiveVendor,
  type VendorAssignmentRepository,
} from "@/lib/vendor/assignment";

export interface VendorOAuthState {
  stateHash: string;
  vendorId: string;
  actorUid: string;
  redirectUri: string;
  pkceVerifier: string;
  expiresAtMs: number;
  usedAtMs?: number;
}

export interface VendorOAuthStore extends Pick<
  VendorAssignmentRepository,
  "isVendorActive"
> {
  saveState(state: VendorOAuthState): Promise<void>;
  claimState(stateHash: string, nowMs: number): Promise<VendorOAuthState | null>;
  saveConnection(connection: VendorMailboxConnection): Promise<void>;
}

export interface VendorTokenVault {
  storeRefreshToken(input: {
    vendorId: string;
    mailboxEmail: string;
    refreshToken: string;
  }): Promise<string>;
  destroySecret(secretRef: string): Promise<void>;
}

export interface VendorOAuthProvider {
  exchange(input: { code: string; redirectUri: string; pkceVerifier: string }): Promise<{
    mailboxEmail: string;
    refreshToken: string;
    scopes: readonly string[];
    provider: "google";
  }>;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const STATE_TTL_MS = 10 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function exactScopes(scopes: readonly string[]): scopes is readonly VendorOAuthScope[] {
  const unique = [...new Set(scopes)].sort();
  return (
    unique.length === VENDOR_OAUTH_SCOPES.length &&
    [...VENDOR_OAUTH_SCOPES].sort().every((scope, index) => unique[index] === scope)
  );
}

export async function beginVendorOAuth(
  input: {
    principal: VendorPrincipal;
    clientId: string;
    redirectUri: string;
    expectedRedirectUri: string;
  },
  store: VendorOAuthStore,
  nowMs = Date.now(),
) {
  assertLiveVendorPrincipal(input.principal, "Vendor OAuth");
  if (!input.clientId.trim())
    throw new VendorBoundaryError("Vendor OAuth is unavailable.", 503);
  if (input.redirectUri !== input.expectedRedirectUri) {
    throw new VendorBoundaryError("Vendor OAuth redirect URI is not approved.", 409);
  }
  await assertActiveVendor(input.principal, store);
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  await store.saveState({
    stateHash: sha256(state),
    vendorId: input.principal.vendorId,
    actorUid: input.principal.uid,
    redirectUri: input.redirectUri,
    pkceVerifier: verifier,
    expiresAtMs: nowMs + STATE_TTL_MS,
  });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", VENDOR_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return { authorizationUrl: url.toString(), expiresAtMs: nowMs + STATE_TTL_MS };
}

export async function completeVendorOAuth(
  input: {
    principal: VendorPrincipal;
    state: string;
    code: string;
    redirectUri: string;
    expectedRedirectUri: string;
  },
  dependencies: {
    store: VendorOAuthStore;
    provider: VendorOAuthProvider;
    vault: VendorTokenVault;
    now?: () => number;
  },
) {
  assertLiveVendorPrincipal(input.principal, "Vendor OAuth");
  const nowMs = (dependencies.now ?? Date.now)();
  if (!input.state || !input.code) {
    throw new VendorBoundaryError("Vendor OAuth callback is incomplete.", 400);
  }
  if (input.redirectUri !== input.expectedRedirectUri) {
    throw new VendorBoundaryError("Vendor OAuth redirect URI is not approved.", 409);
  }
  await assertActiveVendor(input.principal, dependencies.store);
  const state = await dependencies.store.claimState(sha256(input.state), nowMs);
  if (
    !state ||
    state.expiresAtMs <= nowMs ||
    state.actorUid !== input.principal.uid ||
    state.vendorId !== input.principal.vendorId ||
    state.redirectUri !== input.redirectUri ||
    !state.pkceVerifier
  ) {
    throw new VendorBoundaryError("Vendor OAuth state is invalid or expired.", 403);
  }
  const token = await dependencies.provider.exchange({
    code: input.code,
    redirectUri: input.redirectUri,
    pkceVerifier: state.pkceVerifier,
  });
  const mailboxEmail = token.mailboxEmail.trim().toLowerCase();
  if (token.provider !== "google" || mailboxEmail !== input.principal.email) {
    throw new VendorBoundaryError(
      "Connect the same Gmail or Google Workspace address used for Vendor sign-in.",
      403,
    );
  }
  if (!exactScopes(token.scopes)) {
    throw new VendorBoundaryError("Vendor Gmail returned an unexpected scope set.", 403);
  }
  if (!token.refreshToken) {
    throw new VendorBoundaryError("Vendor Gmail did not return offline access.", 409);
  }
  await assertActiveVendor(input.principal, dependencies.store);
  const tokenSecretRef = await dependencies.vault.storeRefreshToken({
    vendorId: input.principal.vendorId,
    mailboxEmail,
    refreshToken: token.refreshToken,
  });
  const connectedAt = new Date(nowMs).toISOString();
  const connection: VendorMailboxConnection = {
    vendorId: input.principal.vendorId,
    mailboxEmail,
    provider: "google",
    status: "connected",
    scopes: [...VENDOR_OAUTH_SCOPES],
    tokenSecretRef,
    connectedAt,
    updatedAt: connectedAt,
  };
  try {
    await assertActiveVendor(input.principal, dependencies.store);
    await dependencies.store.saveConnection(connection);
  } catch (error) {
    await dependencies.vault.destroySecret(tokenSecretRef).catch(() => undefined);
    throw error;
  }
  // Return only bounded connection metadata. The secret reference is server-only too.
  return { provider: "google" as const, mailboxEmail, status: "connected" as const };
}
