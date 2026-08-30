import type { Capability } from "@/lib/auth/roles";
import { requireCapabilityInSpace, type AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getWorkflowRun } from "@/lib/firestore/workflows";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { assertWorkflowRunAccess } from "@/lib/space-scope-resources";

/**
 * Authorize a browser-supplied context before any Gmail client is constructed. Entity existence,
 * scope, and data lane are all checked. Retired Test/sample renewal contexts never construct a
 * Gmail client; renewal communication must arrive through an ordinary Live-backed workflow target.
 */
export async function requireWorkflowCommunicationContext(
  context: WorkflowCommunicationContext,
  capability: Capability,
): Promise<AuthenticatedUser> {
  const user = await requireCapabilityInSpace(capability, context.lane);

  if (context.entityType === "maintenance_ticket") {
    const ticket = await getMaintenanceTicket(user, context.entityId);
    if (!ticket) {
      throw new EditableLayerError(
        "The maintenance communication target does not exist.",
        404,
      );
    }
    if (ticket.data_mode !== "live") {
      throw new EditableLayerError(
        "Test maintenance tickets cannot access Live Gmail communication.",
        409,
      );
    }
    return user;
  }

  if (context.entityType === "renewal_run") {
    throw new EditableLayerError(
      "A renewal run context does not identify a Live-backed Gmail target.",
      409,
    );
  }

  if (context.entityType === "renewal_lease") {
    const expectedSourceRef = `rentvine:lease:${context.entityId}`;
    if (context.sourceRefs.length !== 1 || context.sourceRefs[0] !== expectedSourceRef) {
      throw new EditableLayerError(
        "Renewal communication must carry the exact live lease source reference.",
        409,
      );
    }
    const config = buildLiveRentVineConfig();
    if (!config.ok) {
      throw new EditableLayerError(
        "Live RentVine must be connected before linking a renewal thread.",
        409,
      );
    }
    let views;
    try {
      views = await requireCurrentLeaseViews(config.rentvineClient, Date.now());
    } catch {
      throw new EditableLayerError(
        "Current live lease evidence is unavailable; refresh it before linking Gmail.",
        409,
      );
    }
    if (!views.some((view) => leaseViewId(view) === context.entityId)) {
      throw new EditableLayerError(
        "The renewal communication target does not exist in the current live lease read.",
        404,
      );
    }
    return user;
  }

  const run = await getWorkflowRun(user, context.entityId);
  assertWorkflowRunAccess(user, run);
  if (!run.definition_id.includes("renewal")) {
    throw new EditableLayerError(
      "That workflow run is not a renewal communication target.",
      409,
    );
  }
  return user;
}
