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
  | "planned"
  | "status-unavailable"
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
  planned: "Planned",
  "status-unavailable": "Status unavailable",
  reference: "Reference (read-only)",
};

// The color a card reads at (console overhaul Slice B). Pure map, no I/O: process-ready is green
// (ready), a missing connection is amber (attention), a genuinely-missing process is red (blocked),
// and a read-only reference space is purple. FTU-4 adds a neutral "planned" tone so intentionally
// unbuilt launch-planning spaces and a transient status-read failure never read as a red failure. The
// state LABEL always renders alongside the color, so severity is never conveyed by hue alone (the
// StatusPill a11y contract).
export type SpaceCardTone = "ready" | "attention" | "blocked" | "planned" | "reference";

export const SPACE_CARD_STATE_TONE: Record<SpaceCardState, SpaceCardTone> = {
  "has-a-process": "ready",
  "connections-needed": "attention",
  "needs-a-process": "blocked",
  planned: "planned",
  "status-unavailable": "planned",
  reference: "reference",
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
 *
 * FTU-4: a Space that carries no process-definition id at all is an intentional launch-planning
 * scaffold, so it reads as neutral "planned" rather than red "needs-a-process". When the caller could
 * not read the seeded definition set (`definitionsUnavailable`), a process-carrying Space reads as
 * neutral "status-unavailable" rather than falsely claiming its process is missing.
 */
export function computeSpaceCardState(
  space: LaunchSpace,
  definitionIds: ReadonlySet<string>,
  presence: Record<string, boolean>,
  definitionsUnavailable = false,
): SpaceCardState {
  if (space.readOnly) {
    return "reference";
  }
  if (hasMissingConnection(space.id, presence)) {
    return "connections-needed";
  }
  if (!space.processDefinitionId) {
    return "planned";
  }
  if (definitionsUnavailable) {
    return "status-unavailable";
  }
  return definitionIds.has(space.processDefinitionId)
    ? "has-a-process"
    : "needs-a-process";
}
