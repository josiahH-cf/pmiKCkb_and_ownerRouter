// Connector connection record — the app-managed fact that an Admin connected a connector, plus an
// OPAQUE reference to where its secret lives. Pure types and interfaces; no I/O. `secretRef` is NEVER
// the secret value: it is a handle a secure vault understands, safe to persist and to pass around.
// A record only ever exists once a real secure vault has actually stored the secret (see
// lib/connections/connector-secret-vault.ts); until then no record is written and nothing reads
// "connected".

import type { ConnectMethod } from "@/lib/connections/connector-catalog";

export type ConnectorConnectionStatus = "connected" | "revocation_pending" | "revoked";

export interface ConnectorConnectionRecord {
  /** Catalog connector id; also the Firestore document id (one connection per connector). */
  connectorId: string;
  /** How this connector authenticated (mirrors the catalog method at connect time). */
  method: ConnectMethod;
  status: ConnectorConnectionStatus;
  /** OPAQUE handle to the stored secret. Never the secret value itself. */
  secretRef: string;
  /** uid of the Admin who connected it. */
  connectedByUid: string;
  connectedAt: string;
  updatedAt: string;
}

export interface ConnectorConnectionStore {
  getConnection(connectorId: string): Promise<ConnectorConnectionRecord | null>;
  listConnections(): Promise<ConnectorConnectionRecord[]>;
  saveConnection(record: ConnectorConnectionRecord): Promise<void>;
  deleteConnection(connectorId: string): Promise<void>;
}
