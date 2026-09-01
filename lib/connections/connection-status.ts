// Connection status — pure classification of a connector's state from a PRESENCE map (never values)
// and an optional set of verified connectors. No I/O. Phase-2a passes no verified ids (status reflects
// configuration only); Phase-2b will pass the result of a live read-only verification probe.

import { CONNECTORS, type ConnectorDef } from "@/lib/connections/connector-catalog";
import {
  connectorRecordVersion,
  isSafeLegacyConnectorRecord,
  isSafeVersionedConnectedRecord,
  isSafeVersionedPendingRecord,
  isSafeVersionedRevokedRecord,
  type ConnectorConnectionRecord,
  type ConnectorConnectionStatus,
  type ConnectorDestroyOutcome,
} from "@/lib/connections/connector-connection";

export type ConnectionState = "connected" | "action" | "none" | "closed";

/** The connection facts the classifier and card care about (status only, never a secretRef). */
export interface ConnectorConnectionView {
  status: ConnectorConnectionStatus;
  disconnect?: ConnectorDisconnectView;
}

export interface ConnectorDisconnectView {
  state:
    | "connected"
    | "revocation_pending"
    | "legacy_pending"
    | "revoked"
    | "manual_blocker";
  record_version: string | null;
  operation_id?: string;
  requested_at?: string;
  completed_at?: string;
  destroy_outcome?: ConnectorDestroyOutcome;
  recovery_available: boolean;
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
  closed: number;
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

  if (def.availability === "governance_closed") {
    return {
      ...base,
      state: "closed",
      label: "Closed by governance",
      detail:
        def.availabilityDetail ??
        "This capability is intentionally closed and has no connection setup step.",
    };
  }
  // Lifecycle state outranks the short-lived read-only verification cache. A stale passed probe
  // must never make a pending or completed credential revocation look connected.
  if (connection?.status === "revocation_pending") {
    return {
      ...base,
      state: "action",
      label: "Disconnecting",
      detail: "Finishing the disconnect.",
    };
  }
  if (connection?.status === "revoked") {
    return {
      ...base,
      state: "none",
      label: "Disconnected",
      detail: "Credential removal was verified. Reconnect to restore access.",
    };
  }
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
    closed: statuses.filter((s) => s.state === "closed").length,
    total: statuses.length,
  };
}

/**
 * Operator guidance derived only from the source-backed connection classification and current role.
 * It never claims that connection health grants an action key, clears a suspension, or authorizes an
 * effect.
 */
export function connectionNextStep(status: ConnectorStatus, canManage: boolean): string {
  switch (status.state) {
    case "connected":
      return "No connection setup is needed. Action authority is checked separately when work runs.";
    case "action":
      return canManage
        ? "Finish or verify this connection here. Action authority remains a separate check."
        : "Ask an Admin to finish or verify this connection.";
    case "none":
      return canManage
        ? "Complete the server-side setup, then verify where a read-only check is available."
        : "Ask an Admin to connect this service.";
    case "closed":
      return "No setup step is available. This capability remains closed by governance.";
  }
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

/** Admin projection for S96. The non-Admin branch deliberately contains only ordinary status. */
export function projectConnectorConnection(
  record: ConnectorConnectionRecord,
  canManage: boolean,
): ConnectorConnectionView {
  const status: ConnectorConnectionStatus = record.status;
  if (!canManage) return { status };

  const recordVersion = connectorRecordVersion(record);
  if (record.status === "connected") {
    return {
      status,
      disconnect: {
        state: "connected",
        record_version: recordVersion,
        recovery_available:
          recordVersion !== null &&
          (isSafeVersionedConnectedRecord(record) ||
            isSafeLegacyConnectorRecord(record, "connected")),
      },
    };
  }
  if (record.status === "revocation_pending") {
    if (isSafeVersionedPendingRecord(record)) {
      return {
        status,
        disconnect: {
          state: "revocation_pending",
          record_version: recordVersion,
          operation_id: record.operationId,
          requested_at: record.requestedAt,
          recovery_available: true,
        },
      };
    }
    return {
      status,
      disconnect: {
        state: recordVersion?.startsWith("g:") ? "revocation_pending" : "legacy_pending",
        record_version: recordVersion,
        recovery_available:
          recordVersion !== null &&
          isSafeLegacyConnectorRecord(record, "revocation_pending"),
      },
    };
  }
  if (!isSafeVersionedRevokedRecord(record)) {
    return {
      status,
      disconnect: {
        state: "manual_blocker",
        record_version: recordVersion,
        recovery_available: false,
      },
    };
  }
  return {
    status,
    disconnect: {
      state: "revoked",
      record_version: recordVersion,
      operation_id: record.operationId,
      requested_at: record.requestedAt,
      completed_at: record.completedAt,
      destroy_outcome: record.destroyOutcome,
      recovery_available: false,
    },
  };
}
