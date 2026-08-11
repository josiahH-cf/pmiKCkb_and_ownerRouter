import { listAppUsers, type AdminAuthLike } from "@/lib/admin/users";
import { LOCAL_DEMO_ROLES, localDemoUser } from "@/lib/auth/session";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import type { WorkAssignableUser } from "@/lib/work-accountability/types";

export interface WorkRosterDependencies {
  config?: ServerConfig;
  auth?: AdminAuthLike;
}

/** Active, managed, internal principals only. Vendor and malformed identity claims fail closed. */
export async function listWorkAssignableUsers(
  dependencies: WorkRosterDependencies = {},
): Promise<WorkAssignableUser[]> {
  const config = dependencies.config ?? readServerConfig();
  if (config.localDemoAuth) {
    return LOCAL_DEMO_ROLES.map((role) => {
      const user = localDemoUser(role);
      return { uid: user.uid, email: user.email, role, scopes: user.scopes };
    });
  }

  const hostedDomain = config.allowedHostedDomain.toLowerCase();
  return (await listAppUsers(dependencies.auth))
    .filter(
      (user) =>
        !user.disabled &&
        !user.scopeClaimInvalid &&
        user.email.toLowerCase().endsWith(`@${hostedDomain}`),
    )
    .map(({ uid, email, role, scopes }) => ({ uid, email, role, scopes }));
}
