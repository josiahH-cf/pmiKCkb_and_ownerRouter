import type { Capability } from "@/lib/auth/roles";
import { requireCapabilityInSpace, type AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getWorkflowRun } from "@/lib/firestore/workflows";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { getSimulationRun } from "@/lib/lease-renewal/simulation";
import { assertWorkflowRunAccess } from "@/lib/space-scope-resources";

/**
 * Authorize a browser-supplied context before any Gmail client is constructed. Entity existence and
 * scope are both checked. Simulation/test runs are never eligible for an external Gmail mutation.
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
    return user;
  }

  if (context.entityType === "renewal_run") {
    if (!getSimulationRun(context.entityId)) {
      throw new EditableLayerError(
        "The renewal communication target does not exist.",
        404,
      );
    }
    if (capability !== "read") {
      throw new EditableLayerError(
        "Simulation renewal runs are preview-only and cannot execute Gmail actions.",
        409,
      );
    }
    return user;
  }

  const run = await getWorkflowRun(user, context.entityId);
  assertWorkflowRunAccess(user, run);
  if (run.is_test_run || run.simulation_only) {
    if (capability !== "read") {
      throw new EditableLayerError(
        "Test workflow runs cannot execute Gmail actions.",
        409,
      );
    }
  }
  if (!run.definition_id.includes("renewal")) {
    throw new EditableLayerError(
      "That workflow run is not a renewal communication target.",
      409,
    );
  }
  return user;
}
