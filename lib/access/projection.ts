import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  ACCESS_CAPABILITIES,
  capabilityCatalogEntry,
  spaceCatalogEntry,
} from "@/lib/access/catalog";
import type { NormalizedAccess } from "@/lib/access/contracts";
import {
  readManagedDirectoryUser,
  type AccessDirectoryAuthLike,
} from "@/lib/access/directory";

export type AccessDirectorySyncState = "matched" | "refresh_required" | "unavailable";

export interface AccessEffectiveProjectionV1 {
  readonly schema_version: "access-effective-projection-v1";
  readonly role: "Editor" | "Approver" | "Admin";
  readonly space_access:
    | { readonly kind: "all_spaces" }
    | { readonly kind: "named"; readonly labels: readonly string[] };
  readonly capability_labels: readonly string[];
  readonly authority_source: "current_session";
  readonly directory_sync_state: AccessDirectorySyncState;
}

export function sessionNormalizedAccess(user: AuthenticatedUser): NormalizedAccess {
  return {
    role: user.role,
    scope: user.scopes
      ? {
          kind: "named_spaces",
          space_ids: [...new Set(user.scopes)].sort(compareCodePoint),
        }
      : { kind: "all_spaces", space_ids: [] },
  };
}

export function compareSessionAndDirectoryAccess(
  session: AuthenticatedUser,
  directory: NormalizedAccess,
): AccessDirectorySyncState {
  return JSON.stringify(sessionNormalizedAccess(session)) === JSON.stringify(directory)
    ? "matched"
    : "refresh_required";
}

export async function readDirectorySyncState(
  session: AuthenticatedUser,
  auth?: AccessDirectoryAuthLike,
): Promise<AccessDirectorySyncState> {
  try {
    const directory = await readManagedDirectoryUser(session.uid, auth);
    return compareSessionAndDirectoryAccess(session, directory.access);
  } catch {
    return "unavailable";
  }
}

export function buildAccessEffectiveProjection(
  session: AuthenticatedUser,
  directorySyncState: AccessDirectorySyncState,
): AccessEffectiveProjectionV1 {
  const current = sessionNormalizedAccess(session);
  const spaceAccess: AccessEffectiveProjectionV1["space_access"] =
    current.scope.kind === "all_spaces"
      ? { kind: "all_spaces" }
      : {
          kind: "named",
          labels: current.scope.space_ids.map(
            (space) => spaceCatalogEntry(space as never).label,
          ),
        };

  return {
    schema_version: "access-effective-projection-v1",
    role: current.role,
    space_access: spaceAccess,
    capability_labels: ACCESS_CAPABILITIES.filter((capability) =>
      can(current.role, capability),
    ).map((capability) => capabilityCatalogEntry(capability).label),
    authority_source: "current_session",
    directory_sync_state: directorySyncState,
  };
}

function compareCodePoint(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
