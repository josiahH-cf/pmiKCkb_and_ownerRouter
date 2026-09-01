import { listAdminAccessRequests } from "@/lib/access/request-service";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  isProductionEnvironment,
  resolveEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { PrimaryNavigationProjection } from "@/lib/navigation/primary-navigation";

/**
 * Reuses S83's authoritative pending-count projection for both grouped entry points. Demo and local
 * rehearsal never delay the shell on an unavailable Live store; Production reads once, and pages
 * that already own the projection pass it into AppShell so no second count is issued.
 */
export async function readPrimaryNavigationProjection(
  user: AuthenticatedUser,
): Promise<PrimaryNavigationProjection> {
  if (!can(user.role, "manageAdmin")) return {};
  const environment = resolveEnvironmentDescriptor();
  if (!environment.ok || !isProductionEnvironment(environment.descriptor)) {
    return { pendingAccessRequestCount: null };
  }
  try {
    const result = await listAdminAccessRequests(user, {
      state: "pending",
      limit: 1,
    });
    return { pendingAccessRequestCount: result.pending_count };
  } catch {
    return { pendingAccessRequestCount: null };
  }
}
