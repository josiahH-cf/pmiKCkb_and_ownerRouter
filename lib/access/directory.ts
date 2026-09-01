import { getAuth } from "firebase-admin/auth";

import type { Role } from "@/lib/auth/roles";
import { isAccessRole, isAccessSpace } from "@/lib/access/catalog";
import type { NormalizedAccess } from "@/lib/access/contracts";
import { readServerConfig } from "@/lib/config/server";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";

export interface AccessDirectoryUserRecordLike {
  uid: string;
  email?: string;
  displayName?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown> | null;
}

export interface AccessDirectoryAuthLike {
  getUser(uid: string): Promise<AccessDirectoryUserRecordLike>;
  listUsers(
    maxResults?: number,
    pageToken?: string,
  ): Promise<{ users: AccessDirectoryUserRecordLike[]; pageToken?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
}

export interface ManagedDirectoryUser {
  readonly uid: string;
  readonly email: string;
  readonly label: string;
  readonly access: NormalizedAccess;
  readonly customClaims: Readonly<Record<string, unknown>>;
  readonly disabled: false;
}

export class AccessEligibilityError extends Error {
  constructor(
    message = "This account is not eligible for internal access requests.",
    public readonly status: 400 | 403 | 404 | 409 | 500 | 503 = 403,
  ) {
    super(message);
    this.name = "AccessEligibilityError";
  }
}

export function defaultAccessDirectoryAuth(): AccessDirectoryAuthLike {
  return getAuth(getFirebaseAdminApp()) as unknown as AccessDirectoryAuthLike;
}

export async function readManagedDirectoryUser(
  uid: string,
  auth: AccessDirectoryAuthLike = defaultAccessDirectoryAuth(),
): Promise<ManagedDirectoryUser> {
  let record: AccessDirectoryUserRecordLike;
  try {
    record = await auth.getUser(uid);
  } catch (error) {
    if (isDirectoryUserNotFound(error)) {
      throw new AccessEligibilityError("This managed user is no longer available.", 404);
    }
    throw new AccessEligibilityError("The managed user directory is unavailable.", 503);
  }
  return normalizeManagedDirectoryUser(record);
}

export function normalizeManagedDirectoryUser(
  record: AccessDirectoryUserRecordLike,
): ManagedDirectoryUser {
  const claims = record.customClaims ?? {};
  if (
    Object.prototype.hasOwnProperty.call(claims, "vendor") ||
    Object.prototype.hasOwnProperty.call(claims, "vendor_id") ||
    Object.prototype.hasOwnProperty.call(claims, "data_mode")
  ) {
    throw new AccessEligibilityError();
  }
  if (record.disabled) throw new AccessEligibilityError();
  if (!record.email) throw new AccessEligibilityError();

  const domain = readServerConfig().allowedHostedDomain.toLowerCase();
  if (!record.email.toLowerCase().endsWith(`@${domain}`)) {
    throw new AccessEligibilityError();
  }

  const roleClaim = claims.role;
  let role: Role;
  if (roleClaim === undefined || roleClaim === null || roleClaim === "") {
    role = "Editor";
  } else if (isAccessRole(roleClaim)) {
    role = roleClaim;
  } else {
    throw new AccessEligibilityError("Current directory access claims are invalid.", 409);
  }

  const access: NormalizedAccess = {
    role,
    scope: normalizeDirectoryScope(claims.scopes),
  };
  const label = normalizeDirectoryLabel(record.displayName) ?? record.email;
  return {
    uid: record.uid,
    email: record.email,
    label,
    access,
    customClaims: { ...claims },
    disabled: false,
  };
}

export async function listManagedDirectoryUsers(
  auth: AccessDirectoryAuthLike = defaultAccessDirectoryAuth(),
): Promise<ManagedDirectoryUser[]> {
  const users: ManagedDirectoryUser[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const record of page.users) {
      try {
        users.push(normalizeManagedDirectoryUser(record));
      } catch (error) {
        if (!(error instanceof AccessEligibilityError)) throw error;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return users.sort((left, right) => left.email.localeCompare(right.email));
}

export async function listManagedDirectoryUsersBounded(
  auth: AccessDirectoryAuthLike = defaultAccessDirectoryAuth(),
  maximum = 1000,
): Promise<ManagedDirectoryUser[]> {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1000) {
    throw new AccessEligibilityError("The managed user directory is unavailable.", 503);
  }
  let page: Awaited<ReturnType<AccessDirectoryAuthLike["listUsers"]>>;
  try {
    page = await auth.listUsers(maximum);
  } catch {
    throw new AccessEligibilityError("The managed user directory is unavailable.", 503);
  }
  if (page.pageToken) {
    throw new AccessEligibilityError(
      "The managed user directory exceeded its bounded read.",
      503,
    );
  }
  const users: ManagedDirectoryUser[] = [];
  for (const record of page.users) {
    try {
      users.push(normalizeManagedDirectoryUser(record));
    } catch (error) {
      if (!(error instanceof AccessEligibilityError)) throw error;
    }
  }
  return users.sort((left, right) => left.email.localeCompare(right.email));
}

export async function hasDifferentEligibleAdmin(
  requesterUid: string,
  auth: AccessDirectoryAuthLike = defaultAccessDirectoryAuth(),
): Promise<boolean> {
  const users = await listManagedDirectoryUsersBounded(auth);
  return users.some((user) => user.uid !== requesterUid && user.access.role === "Admin");
}

function normalizeDirectoryScope(value: unknown): NormalizedAccess["scope"] {
  if (value === undefined || value === null || value === "") {
    return { kind: "all_spaces", space_ids: [] };
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 50 ||
    value.some((space) => !isAccessSpace(space))
  ) {
    throw new AccessEligibilityError("Current directory access claims are invalid.", 409);
  }
  const ids = [...new Set(value as string[])].sort(compareCodePoint);
  return { kind: "named_spaces", space_ids: ids };
}

function normalizeDirectoryLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const label = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    !label ||
    Array.from(label).length > 160 ||
    /[\u0000-\u001f\u007f-\u009f<>]/u.test(label)
  ) {
    return undefined;
  }
  return label;
}

function isDirectoryUserNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/user-not-found" || code === "user-not-found";
}

function compareCodePoint(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
