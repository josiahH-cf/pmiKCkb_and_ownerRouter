import { AuthError, hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import type { SpaceScope } from "@/lib/constants";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
import { launchSpaces, type LaunchSpace } from "@/lib/spaces";

type ScopedAskInput = {
  space?: string;
  process_id?: string;
};

/** The operator-desk scope a Space maps to, when it has one. */
export function mappedScopeForSpaceId(spaceId: string): SpaceScope | undefined {
  return launchSpaces.find((space) => space.id === spaceId)?.scope;
}

export function mappedScopeForProcessDefinitionId(
  definitionId: string,
): SpaceScope | undefined {
  return launchSpaces.find(
    (space) => space.processDefinitionId === definitionId && space.scope !== undefined,
  )?.scope;
}

export function mappedSpaceIdForProcessDefinitionId(
  definitionId: string,
): string | undefined {
  return launchSpaces.find((space) => space.processDefinitionId === definitionId)?.id;
}

export function spaceIdForProcessDefinition(
  definition: Pick<ProcessDefinitionRecord, "id" | "space_id">,
): string | undefined {
  return definition.space_id ?? mappedSpaceIdForProcessDefinitionId(definition.id);
}

/**
 * S167: every existing internal Space is open to an authenticated staff account, whether or not
 * the Space maps to an operator-desk scope. Callers keep naming the Space they serve.
 */
export function canAccessMappedScope(
  user: AuthenticatedUser,
  scope: SpaceScope | undefined,
): boolean {
  return scope === undefined ? user.uid.length > 0 : hasSpaceAccess(user, scope);
}

export function canAccessLaunchSpace(
  user: AuthenticatedUser,
  space: Pick<LaunchSpace, "scope">,
): boolean {
  return canAccessMappedScope(user, space.scope);
}

export function canAccessSpaceId(user: AuthenticatedUser, spaceId: string): boolean {
  return canAccessMappedScope(user, mappedScopeForSpaceId(spaceId));
}

export function canAccessProcessDefinitionId(
  user: AuthenticatedUser,
  definitionId: string,
): boolean {
  return canAccessMappedScope(user, mappedScopeForProcessDefinitionId(definitionId));
}

export function canAccessProcessDefinition(
  user: AuthenticatedUser,
  definition: Pick<ProcessDefinitionRecord, "id" | "space_id">,
): boolean {
  const spaceId = spaceIdForProcessDefinition(definition);
  return spaceId
    ? canAccessSpaceId(user, spaceId)
    : canAccessProcessDefinitionId(user, definition.id);
}

export function canAccessWorkflowRun(
  user: AuthenticatedUser,
  run: Pick<WorkflowRunRecord, "definition_id"> & { space_id?: string },
): boolean {
  // New runs retain the exact Space resolved from their definition at creation; legacy runs without
  // the field keep the established definition-id mapping.
  if (run.space_id) {
    return canAccessSpaceId(user, run.space_id);
  }
  return canAccessProcessDefinitionId(user, run.definition_id);
}

export function assertSpaceIdAccess(user: AuthenticatedUser, spaceId: string): void {
  if (!canAccessSpaceId(user, spaceId)) {
    throwScopeDenied();
  }
}

export function assertProcessDefinitionAccess(
  user: AuthenticatedUser,
  definitionId: string,
): void {
  if (!canAccessProcessDefinitionId(user, definitionId)) {
    throwScopeDenied();
  }
}

export function assertProcessDefinitionRecordAccess(
  user: AuthenticatedUser,
  definition: Pick<ProcessDefinitionRecord, "id" | "space_id">,
): void {
  if (!canAccessProcessDefinition(user, definition)) throwScopeDenied();
}

export function assertWorkflowRunAccess(
  user: AuthenticatedUser,
  run: Pick<WorkflowRunRecord, "definition_id"> & { space_id?: string },
): void {
  if (!canAccessWorkflowRun(user, run)) {
    throwScopeDenied();
  }
}

export function filterProcessDefinitionsForUser(
  user: AuthenticatedUser,
  definitions: readonly ProcessDefinitionRecord[],
): ProcessDefinitionRecord[] {
  return definitions.filter((definition) => {
    return canAccessProcessDefinition(user, definition);
  });
}

export function filterWorkflowRunsForUser(
  user: AuthenticatedUser,
  runs: readonly WorkflowRunRecord[],
): WorkflowRunRecord[] {
  return runs.filter((run) => canAccessWorkflowRun(user, run));
}

/**
 * S167: Ask keeps the whole-KB behavior for every staff account, so a request is no longer
 * narrowed to one Space. The Space and process boundaries are still named here.
 */
export function scopeAskRequest<T extends ScopedAskInput>(
  user: AuthenticatedUser,
  request: T,
): T & { space?: string } {
  if (request.space) {
    assertSpaceIdAccess(user, request.space);
  }
  if (request.process_id) {
    assertProcessDefinitionAccess(user, request.process_id);
  }
  return request;
}

function throwScopeDenied(): never {
  throw new AuthError("This user is not authorized for the requested space.", 403);
}
