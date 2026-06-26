// Connection status — pure classification of a connector's state from a PRESENCE map (never values)
// and an optional set of verified connectors. No I/O. Phase-2a passes no verified ids (status reflects
// configuration only); Phase-2b will pass the result of a live read-only verification probe.

import { CONNECTORS, type ConnectorDef } from "@/lib/connections/connector-catalog";

export type ConnectionState = "connected" | "action" | "none";

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

/** Classify one connector. `verified` is true only after a live read-only check has succeeded. */
export function classifyConnector(
  def: ConnectorDef,
  presence: Record<string, boolean>,
  verified = false,
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
  return {
    ...base,
    state: "action",
    label: "Ready to verify",
    detail: "Ready to connect.",
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

/** Build the whole Connection Center view from a presence map (pure). */
export function buildConnectionView(
  presence: Record<string, boolean>,
  verifiedIds: ReadonlySet<string> = new Set(),
): ConnectionCenterView {
  const items: ConnectorView[] = CONNECTORS.map((def) => ({
    def,
    status: classifyConnector(def, presence, verifiedIds.has(def.id)),
  }));
  return { items, summary: summarizeConnections(items.map((item) => item.status)) };
}
