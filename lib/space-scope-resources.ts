import { AuthError, hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import type { SpaceScope } from "@/lib/constants";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
import { launchSpaces, type LaunchSpace } from "@/lib/spaces";

type ScopedAskInput = {
  space?: string;
  process_id?: string;
};

/** Only operator desks with an explicit S16 scope are mappable for restricted principals. */
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

export function defaultSpaceIdForScope(scope: SpaceScope): string {
  const spaceId = launchSpaces.find((space) => space.scope === scope)?.id;
  if (!spaceId) {
    throw new AuthError("This user has no mapped space for the requested action.", 403);
  }
  return spaceId;
}

export function canAccessMappedScope(
  user: AuthenticatedUser,
  scope: SpaceScope | undefined,
): boolean {
  if (user.scopes === undefined) {
    return true;
  }
  return scope !== undefined && hasSpaceAccess(user, scope);
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

export function canAccessWorkflowRun(
  user: AuthenticatedUser,
  run: Pick<WorkflowRunRecord, "definition_id">,
): boolean {
  if (user.scopes === undefined) {
    return true;
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

export function assertWorkflowRunAccess(
  user: AuthenticatedUser,
  run: Pick<WorkflowRunRecord, "definition_id">,
): void {
  if (!canAccessWorkflowRun(user, run)) {
    throwScopeDenied();
  }
}

/** New process definitions have no space id, so an explicitly scoped user cannot create one. */
export function assertWildcardResourceAccess(user: AuthenticatedUser): void {
  if (user.scopes !== undefined) {
    throwScopeDenied();
  }
}

export function filterProcessDefinitionsForUser(
  user: AuthenticatedUser,
  definitions: readonly ProcessDefinitionRecord[],
): ProcessDefinitionRecord[] {
  return definitions.filter((definition) =>
    canAccessProcessDefinitionId(user, definition.id),
  );
}

export function filterWorkflowRunsForUser(
  user: AuthenticatedUser,
  runs: readonly WorkflowRunRecord[],
): WorkflowRunRecord[] {
  return runs.filter((run) => canAccessWorkflowRun(user, run));
}

/**
 * Trust-boundary normalization for Ask. Wildcard users keep the historical whole-KB behavior.
 * Explicitly scoped users must use a mapped space/process, and an omitted space is derived from the
 * mapped process or their primary scope so retrieval can never fan out across the whole corpus.
 */
export function scopeAskRequest<T extends ScopedAskInput>(
  user: AuthenticatedUser,
  request: T,
): T & { space?: string } {
  if (user.scopes === undefined) {
    return request;
  }

  const requestedSpaceScope = request.space
    ? mappedScopeForSpaceId(request.space)
    : undefined;
  const processScope = request.process_id
    ? mappedScopeForProcessDefinitionId(request.process_id)
    : undefined;

  if (request.space) {
    assertSpaceIdAccess(user, request.space);
  }
  if (request.process_id) {
    assertProcessDefinitionAccess(user, request.process_id);
  }
  if (
    requestedSpaceScope !== undefined &&
    processScope !== undefined &&
    requestedSpaceScope !== processScope
  ) {
    throwScopeDenied();
  }

  const effectiveScope = requestedSpaceScope ?? processScope ?? user.scopes[0];
  if (!effectiveScope || !hasSpaceAccess(user, effectiveScope)) {
    throwScopeDenied();
  }

  return {
    ...request,
    space: request.space ?? defaultSpaceIdForScope(effectiveScope),
  };
}

function throwScopeDenied(): never {
  throw new AuthError("This user is not authorized for the requested space.", 403);
}
