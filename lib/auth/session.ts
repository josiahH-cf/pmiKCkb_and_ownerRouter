import { cookies } from "next/headers";
import { can, type Capability, type Role } from "@/lib/auth/roles";
import { readServerConfig } from "@/lib/config/server";
import { SPACE_SCOPES, type SpaceScope } from "@/lib/constants";
import {
  createFirebaseSessionCookie,
  verifyFirebaseIdToken,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase/admin";

export const SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
export const SESSION_COOKIE_MAX_AGE_MS = SESSION_COOKIE_MAX_AGE_SECONDS * 1000;
export const AUTH_ABSOLUTE_MAX_AGE_SECONDS = 12 * 60 * 60;
export const LOCAL_DEMO_SESSION_VALUE = "local-demo";
export const LOCAL_DEMO_ROLES: readonly Role[] = ["Editor", "Approver", "Admin"];

export interface AuthenticatedUser {
  uid: string;
  email: string;
  hd: string;
  role: Role;
  scopes?: readonly SpaceScope[];
}

export interface AuthClaims {
  uid?: unknown;
  email?: unknown;
  hd?: unknown;
  role?: unknown;
  scopes?: unknown;
  vendor?: unknown;
  vendor_id?: unknown;
  data_mode?: unknown;
}

interface FirebaseAuthClaims extends AuthClaims {
  email_verified?: unknown;
  firebase?: unknown;
  auth_time?: unknown;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

type AuthResolver = () =>
  | AuthClaims
  | AuthenticatedUser
  | null
  | Promise<AuthClaims | AuthenticatedUser | null>;
type SessionCookieVerifier = (
  sessionCookie: string,
) => FirebaseAuthClaims | Promise<FirebaseAuthClaims>;
type IdTokenVerifier = (
  idToken: string,
) => FirebaseAuthClaims | Promise<FirebaseAuthClaims>;
type SessionCookieCreator = (
  idToken: string,
  expiresInMs: number,
) => string | Promise<string>;

let testAuthResolver: AuthResolver | null = null;
let sessionCookieVerifier: SessionCookieVerifier = verifyFirebaseSessionCookie;
let idTokenVerifier: IdTokenVerifier = verifyFirebaseIdToken;
let sessionCookieCreator: SessionCookieCreator = createFirebaseSessionCookie;

export function setAuthResolverForTest(resolver: AuthResolver | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test auth resolver can only be set under NODE_ENV=test.");
  }

  testAuthResolver = resolver;
}

export function setSessionCookieVerifierForTest(verifier: SessionCookieVerifier | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test session verifier can only be set under NODE_ENV=test.");
  }

  sessionCookieVerifier = verifier ?? verifyFirebaseSessionCookie;
}

export function setIdTokenVerifierForTest(verifier: IdTokenVerifier | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test ID token verifier can only be set under NODE_ENV=test.");
  }

  idTokenVerifier = verifier ?? verifyFirebaseIdToken;
}

export function setSessionCookieCreatorForTest(creator: SessionCookieCreator | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test session cookie creator can only be set under NODE_ENV=test.");
  }

  sessionCookieCreator = creator ?? createFirebaseSessionCookie;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  if (testAuthResolver) {
    const claims = await testAuthResolver();
    return claims ? validateAuthClaims(claims) : null;
  }

  const sessionCookie = await getSessionCookie();

  if (!sessionCookie) {
    return null;
  }

  const localDemoRole = readLocalDemoSessionRole(sessionCookie);

  if (localDemoRole) {
    return localDemoUser(localDemoRole);
  }

  try {
    return await authenticateSessionCookie(sessionCookie);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function authenticateSessionCookie(
  sessionCookie: string,
): Promise<AuthenticatedUser> {
  let claims: FirebaseAuthClaims;

  try {
    claims = await sessionCookieVerifier(sessionCookie);
  } catch {
    throw new AuthError("Authentication is required.", 401);
  }

  return validateFirebaseAuthClaims(claims);
}

export async function authenticateIdToken(idToken: string): Promise<AuthenticatedUser> {
  let claims: FirebaseAuthClaims;

  try {
    claims = await idTokenVerifier(idToken);
  } catch {
    throw new AuthError("Authentication is required.", 401);
  }

  return validateFirebaseAuthClaims(claims);
}

export async function createAuthenticatedSession(idToken: string): Promise<{
  user: AuthenticatedUser;
  sessionCookie: string;
  maxAgeSeconds: number;
}> {
  const user = await authenticateIdToken(idToken);

  let sessionCookie: string;

  try {
    sessionCookie = await sessionCookieCreator(idToken, SESSION_COOKIE_MAX_AGE_MS);
  } catch {
    throw new AuthError("Authentication is required.", 401);
  }

  return {
    user,
    sessionCookie,
    maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError("Authentication is required.", 401);
  }

  return user;
}

export async function requireRole(role: Role) {
  const user = await requireUser();

  if (user.role !== role) {
    throw new AuthError("This role is not authorized for the requested action.", 403);
  }

  return user;
}

export async function requireCapability(capability: Capability) {
  const user = await requireUser();

  if (!can(user.role, capability)) {
    throw new AuthError("This user is not authorized for the requested action.", 403);
  }

  return user;
}

export function hasSpaceAccess(user: AuthenticatedUser, scope: SpaceScope) {
  return user.scopes === undefined || user.scopes.includes(scope);
}

export async function requireSpaceAccess(scope: SpaceScope) {
  const user = await requireUser();

  if (!hasSpaceAccess(user, scope)) {
    throw new AuthError("This user is not authorized for the requested space.", 403);
  }

  return user;
}

export async function requireCapabilityInSpace(
  capability: Capability,
  scope: SpaceScope,
) {
  const user = await requireCapability(capability);

  if (!hasSpaceAccess(user, scope)) {
    throw new AuthError("This user is not authorized for the requested space.", 403);
  }

  return user;
}

export function validateAuthClaims(claims: AuthClaims): AuthenticatedUser {
  const uid = readRequiredString(claims.uid, "uid");
  const email = readRequiredString(claims.email, "email");
  const hd = readRequiredString(claims.hd, "hd").toLowerCase();
  const role = readRole(claims.role);
  const scopes = readSpaceScopes(claims.scopes);
  const allowedHd = getAllowedHostedDomain();

  // External Vendor principals are authenticated and authorized by the separate
  // Vendor boundary. Even a same-domain or Google-backed Vendor identity must
  // never fall through to the internal Editor default or receive staff scopes.
  if (
    claims.vendor !== undefined ||
    claims.vendor_id !== undefined ||
    claims.data_mode !== undefined
  ) {
    throw new AuthError(
      "Vendor identities cannot use the internal application session.",
      403,
    );
  }

  if (hd !== allowedHd) {
    throw new AuthError("Google Workspace hosted domain is not allowed.", 403);
  }

  return {
    uid,
    email,
    hd,
    role,
    ...(scopes === undefined ? {} : { scopes }),
  };
}

function validateFirebaseAuthClaims(claims: FirebaseAuthClaims): AuthenticatedUser {
  const email = readRequiredString(claims.email, "email");
  const hd = readFirebaseHostedDomain(claims, email);

  if (claims.email_verified !== true) {
    throw new AuthError("Authenticated Google email must be verified.", 403);
  }

  if (readSignInProvider(claims.firebase) !== "google.com") {
    throw new AuthError("Google sign-in is required.", 403);
  }

  assertFreshAuthTime(claims.auth_time);

  return validateAuthClaims({
    uid: claims.uid,
    email,
    hd,
    role: readFirebaseRole(claims.role),
    scopes: claims.scopes,
    vendor: claims.vendor,
    vendor_id: claims.vendor_id,
    data_mode: claims.data_mode,
  });
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  throw error;
}

export function getSessionCookieName() {
  return readServerConfig().authSessionCookie;
}

export function isLocalDemoAuthEnabled() {
  return readServerConfig().localDemoAuth;
}

function getAllowedHostedDomain() {
  return readServerConfig().allowedHostedDomain;
}

export function localDemoSessionValue(role: Role) {
  return role === "Admin"
    ? LOCAL_DEMO_SESSION_VALUE
    : `${LOCAL_DEMO_SESSION_VALUE}:${role}`;
}

export function readLocalDemoSessionRole(sessionCookie: string): Role | null {
  if (!isLocalDemoAuthEnabled()) {
    return null;
  }

  if (sessionCookie === LOCAL_DEMO_SESSION_VALUE) {
    return "Admin";
  }

  if (!sessionCookie.startsWith(`${LOCAL_DEMO_SESSION_VALUE}:`)) {
    return null;
  }

  const role = sessionCookie.slice(LOCAL_DEMO_SESSION_VALUE.length + 1);
  return LOCAL_DEMO_ROLES.includes(role as Role) ? (role as Role) : null;
}

export function localDemoUser(role: Role = "Admin"): AuthenticatedUser {
  const hd = getAllowedHostedDomain();
  const uid = `local-demo-${role.toLowerCase()}`;

  return {
    uid,
    email: role === "Admin" ? `local-demo@${hd}` : `${uid}@${hd}`,
    hd,
    role,
  };
}

async function getSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(getSessionCookieName())?.value ?? null;
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AuthError(`Missing authenticated user ${field}.`, 403);
  }

  return value.trim();
}

function readFirebaseHostedDomain(claims: FirebaseAuthClaims, email: string) {
  const emailDomain = readEmailHostedDomain(email);

  if (claims.hd === undefined || claims.hd === null || claims.hd === "") {
    return emailDomain;
  }

  const hd = readRequiredString(claims.hd, "hd").toLowerCase();

  if (hd !== emailDomain) {
    throw new AuthError("Google Workspace hosted domain is not allowed.", 403);
  }

  return hd;
}

function readEmailHostedDomain(email: string) {
  const atIndex = email.lastIndexOf("@");
  const domain =
    atIndex === -1
      ? ""
      : email
          .slice(atIndex + 1)
          .trim()
          .toLowerCase();

  if (!domain) {
    throw new AuthError("Authenticated user email is invalid.", 403);
  }

  return domain;
}

function readSignInProvider(firebaseClaim: unknown) {
  if (
    typeof firebaseClaim === "object" &&
    firebaseClaim !== null &&
    "sign_in_provider" in firebaseClaim
  ) {
    return (firebaseClaim as { sign_in_provider?: unknown }).sign_in_provider;
  }

  return null;
}

function assertFreshAuthTime(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AuthError("Recent Google sign-in is required.", 401);
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - value;

  if (ageSeconds > AUTH_ABSOLUTE_MAX_AGE_SECONDS) {
    throw new AuthError("Recent Google sign-in is required.", 401);
  }
}

function readFirebaseRole(value: unknown): Role {
  if (value === undefined || value === null || value === "") {
    return "Editor";
  }

  return readRole(value);
}

function readRole(value: unknown): Role {
  if (value === "Editor" || value === "Approver" || value === "Admin") {
    return value;
  }

  throw new AuthError("Missing or invalid authenticated user role.", 403);
}

function readSpaceScopes(value: unknown): readonly SpaceScope[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new AuthError("Missing or invalid authenticated user scopes.", 403);
  }

  const scopes = Array.from(value);

  if (!scopes.every(isSpaceScope)) {
    throw new AuthError("Missing or invalid authenticated user scopes.", 403);
  }

  return Object.freeze(SPACE_SCOPES.filter((scope) => scopes.includes(scope)));
}

function isSpaceScope(value: unknown): value is SpaceScope {
  return SPACE_SCOPES.includes(value as SpaceScope);
}
