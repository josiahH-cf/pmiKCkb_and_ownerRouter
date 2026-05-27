import { redirect } from "next/navigation";
import { type Capability, type Role } from "@/lib/auth/roles";
import {
  AuthError,
  requireCapability,
  requireRole,
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

function handlePageAuthError(error: unknown): never {
  if (error instanceof AuthError) {
    const target = error.status === 401 ? "/sign-in" : "/sign-in?error=forbidden";
    redirect(target);
  }

  throw error;
}
