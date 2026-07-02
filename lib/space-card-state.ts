// Pure, read-only Space card state for the Spaces directory (A-IA-V2). Given a Space, the set of
// seeded process-definition ids, and connector presence (booleans, never values), derive a single
// badge so a card reflects real state: connections still needed, no process yet, or process ready.
// No I/O — the caller passes the (server-resolved) definition ids + presence map.

import { CONNECTORS } from "@/lib/connections/connector-catalog";
import type { LaunchSpace } from "@/lib/spaces";

export type SpaceCardState =
  | "connections-needed"
  | "needs-a-process"
  | "has-a-process"
  | "reference";

// Which connector(s) each Space's BUILT functionality depends on. Conservative on purpose: only map
// Spaces with a known connector dependency, so an unmapped Space is never mislabeled
// "connections-needed". Renewals reconciles RentVine + the renewal sheet; Maintenance capture syncs
// photos to Drive.
export const SPACE_CONNECTOR_IDS: Readonly<Record<string, readonly string[]>> = {
  "lease-renewals": ["rentvine", "google_sheets"],
  "maintenance-work-order-intake": ["google_drive"],
  // Move-In / Move-Out content-key off the renewal sheet's Tab 1 / Tab 2 and read RentVine as the
  // read-authoritative system of record — same connector dependency as lease-renewals.
  "move-in": ["rentvine", "google_sheets"],
  "move-out-deposit-disposition": ["rentvine", "google_sheets"],
};

export const SPACE_CARD_STATE_LABEL: Record<SpaceCardState, string> = {
  "connections-needed": "Connections needed",
  "needs-a-process": "Needs a process",
  "has-a-process": "Process ready",
  reference: "Reference (read-only)",
};

/** True when any connector the Space depends on is missing a required config value (presence=false). */
function hasMissingConnection(
  spaceId: string,
  presence: Record<string, boolean>,
): boolean {
  const connectorIds = SPACE_CONNECTOR_IDS[spaceId] ?? [];
  return connectorIds.some((connectorId) => {
    const def = CONNECTORS.find((connector) => connector.id === connectorId);
    if (!def || def.requiredConfig.length === 0) {
      return false;
    }
    return def.requiredConfig.some((name) => !presence[name]);
  });
}

/**
 * Badge priority surfaces the blocking gap first: connections-needed > needs-a-process >
 * has-a-process. Read-only reference Spaces (e.g. Owner Email) short-circuit to "reference".
 */
export function computeSpaceCardState(
  space: LaunchSpace,
  definitionIds: ReadonlySet<string>,
  presence: Record<string, boolean>,
): SpaceCardState {
  if (space.readOnly) {
    return "reference";
  }
  if (hasMissingConnection(space.id, presence)) {
    return "connections-needed";
  }
  const hasProcess = Boolean(
    space.processDefinitionId && definitionIds.has(space.processDefinitionId),
  );
  return hasProcess ? "has-a-process" : "needs-a-process";
}
