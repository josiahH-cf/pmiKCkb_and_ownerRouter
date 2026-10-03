import { redirect } from "next/navigation";
import { type Capability, type Role } from "@/lib/auth/roles";
import type { SpaceScope } from "@/lib/constants";
import {
  AuthError,
  hasSpaceAccess,
  requireCapability,
  requireRole,
  requireUser,
  type AuthenticatedUser,
} from "@/lib/auth/session";

export async function requirePageCapability(
  capability: Capability,
): Promise<AuthenticatedUser> {
  try {
    return await requireCapability(capability);
  } catch (error) {
    handlePageAuthError(error);
  }
}

export async function requirePageRole(role: Role): Promise<AuthenticatedUser> {
  try {
    return await requireRole(role);
  } catch (error) {
    handlePageAuthError(error);
  }
}

/** Where a refused Space or resource page sends a signed-in staff account: the Dashboard. */
export function primarySpaceHref() {
  return "/";
}

export async function requirePageSpaceAccess(
  scope: SpaceScope,
): Promise<AuthenticatedUser> {
  try {
    const user = await requireUser();

    if (!hasSpaceAccess(user, scope)) {
      redirect(primarySpaceHref());
    }

    return user;
  } catch (error) {
    handlePageAuthError(error);
  }
}

function handlePageAuthError(error: unknown): never {
  if (error instanceof AuthError) {
    const target = error.status === 401 ? "/sign-in" : "/sign-in?error=forbidden";
    redirect(target);
  }

  throw error;
}
