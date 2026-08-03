import type { Capability } from "@/lib/auth/roles";
import { requireCapabilityInSpace, type AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getWorkflowRun } from "@/lib/firestore/workflows";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
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
