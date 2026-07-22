// Connection status — pure classification of a connector's state from a PRESENCE map (never values)
// and an optional set of verified connectors. No I/O. Phase-2a passes no verified ids (status reflects
// configuration only); Phase-2b will pass the result of a live read-only verification probe.

import { CONNECTORS, type ConnectorDef } from "@/lib/connections/connector-catalog";
import type { ConnectorConnectionStatus } from "@/lib/connections/connector-connection";

export type ConnectionState = "connected" | "action" | "none";

/** The connection facts the classifier and card care about (status only, never a secretRef). */
export interface ConnectorConnectionView {
  status: ConnectorConnectionStatus;
}

export interface ConnectorStatus {
  id: string;
  state: ConnectionState;
  label: string;
  detail: string;
  configuredCount: number;
  requiredCount: number;
}

export interface ConnectorView {
  def: ConnectorDef;
  status: ConnectorStatus;
  /** Present only when the app holds a connection record for this connector (lets the card choose
      Connect vs Disconnect). Absent by default, so status reflects configuration alone. */
  connection?: ConnectorConnectionView;
}

export interface ConnectionSummary {
  connected: number;
  action: number;
  none: number;
  total: number;
}

export interface ConnectionCenterView {
  items: ConnectorView[];
  summary: ConnectionSummary;
}

/** Classify one connector. `verified` is true only after a live read-only check has succeeded.
 * `connection` is the app-held connection record (status only), if any. Precedence: a passed
 * `verified` wins (top), then a "connected" record, then a "revocation_pending" record, then the
 * existing presence logic. With no `connection` passed the output is unchanged. */
export function classifyConnector(
  def: ConnectorDef,
  presence: Record<string, boolean>,
  verified = false,
  connection?: ConnectorConnectionView,
): ConnectorStatus {
  const requiredCount = def.requiredConfig.length;
  const configuredCount = def.requiredConfig.filter((name) => presence[name]).length;
  const base = { id: def.id, configuredCount, requiredCount };

  if (verified) {
    return {
      ...base,
      state: "connected",
      label: "Connected",
      detail: "Verified and ready.",
    };
  }
  if (connection?.status === "connected") {
    return {
      ...base,
      state: "connected",
      label: "Connected",
      detail: "Set up by an Admin.",
    };
  }
  if (connection?.status === "revocation_pending") {
    return {
      ...base,
      state: "action",
      label: "Disconnecting",
      detail: "Finishing the disconnect.",
    };
  }
  if (requiredCount === 0) {
    return {
      ...base,
      state: "none",
      label: "Not connected",
      detail: `Connect to enable ${def.name}.`,
    };
  }
  if (configuredCount === 0) {
    return {
      ...base,
      state: "none",
      label: "Not connected",
      detail: `Add your ${def.name} details to connect.`,
    };
  }
  if (configuredCount < requiredCount) {
    return {
      ...base,
      state: "action",
      label: "Needs attention",
      detail: `${configuredCount} of ${requiredCount} details provided — finish connecting.`,
    };
  }
  return def.liveVerificationAvailable
    ? {
        ...base,
        state: "action",
        label: "Ready to verify",
        detail: "Configuration is present. Run the bounded read-only check.",
      }
    : {
        ...base,
        state: "action",
        label: "Setup complete",
        detail:
          "Configuration is present. No bounded live verification check is available yet.",
      };
}

export function summarizeConnections(statuses: ConnectorStatus[]): ConnectionSummary {
  return {
    connected: statuses.filter((s) => s.state === "connected").length,
    action: statuses.filter((s) => s.state === "action").length,
    none: statuses.filter((s) => s.state === "none").length,
    total: statuses.length,
  };
}

/** Build the whole Connection Center view from a presence map (pure). `connections` maps connectorId
 * to its app-held record status; the default empty map leaves behavior identical to configuration
 * only. */
export function buildConnectionView(
  presence: Record<string, boolean>,
  verifiedIds: ReadonlySet<string> = new Set(),
  connections: ReadonlyMap<string, ConnectorConnectionView> = new Map(),
): ConnectionCenterView {
  const items: ConnectorView[] = CONNECTORS.map((def) => {
    const connection = connections.get(def.id);
    return {
      def,
      status: classifyConnector(def, presence, verifiedIds.has(def.id), connection),
      ...(connection ? { connection } : {}),
    };
  });
  return { items, summary: summarizeConnections(items.map((item) => item.status)) };
}
