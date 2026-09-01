// Server-only connector lifecycle contracts. Credential values never enter these records; secretRef
// is an opaque vault handle and must never be projected to a browser, log, metric, or receipt.

import type { ConnectMethod } from "@/lib/connections/connector-catalog";

export type ConnectorConnectionStatus = "connected" | "revocation_pending" | "revoked";
export type ConnectorDestroyOutcome = "destroyed" | "already_absent";
export type ConnectorRevocationMode = "start" | "adopt_legacy" | "recover";

interface ConnectorRecordBase {
  connectorId: string;
  method: ConnectMethod;
  updatedAt: string;
}

interface ConnectedIdentity {
  connectedByUid: string;
  connectedAt: string;
}

interface VersionedIdentity {
  generationId: string;
  revision: number;
}

export interface ConnectorConnectedRecord
  extends ConnectorRecordBase, ConnectedIdentity, VersionedIdentity {
  status: "connected";
  secretRef: string;
}

export interface ConnectorRevocationPendingRecord
  extends ConnectorRecordBase, ConnectedIdentity, VersionedIdentity {
  status: "revocation_pending";
  secretRef: string;
  operationId: string;
  requestedByUid: string;
  requestedAt: string;
}

export interface ConnectorRevokedRecord extends ConnectorRecordBase, VersionedIdentity {
  status: "revoked";
  operationId: string;
  requestedByUid: string;
  requestedAt: string;
  completedAt: string;
  destroyOutcome: ConnectorDestroyOutcome;
}

/**
 * Pre-S96 records have no generation/revision. A safely shaped connected record can be materialized
 * by start; a safely shaped pending record can only be bound through adopt_legacy.
 */
export interface LegacyConnectorConnectionRecord
  extends ConnectorRecordBase, ConnectedIdentity {
  status: "connected" | "revocation_pending";
  secretRef: string;
  generationId?: never;
  revision?: never;
  operationId?: never;
  requestedByUid?: never;
  requestedAt?: never;
}

export type ConnectorConnectionRecord =
  | ConnectorConnectedRecord
  | ConnectorRevocationPendingRecord
  | ConnectorRevokedRecord
  | LegacyConnectorConnectionRecord;

export interface ConnectorRevocationReceipt {
  connectorId: string;
  method: ConnectMethod;
  operationId: string;
  generationId: string;
  revision: number;
  requestedByUid: string;
  requestedAt: string;
  completedAt: string;
  destroyOutcome: ConnectorDestroyOutcome;
}

export interface ConnectorRevocationRequest {
  connectorId: string;
  mode: ConnectorRevocationMode;
  operationId: string;
  observedVersion: string;
  requestedByUid: string;
  requestedAt: string;
}

export type ConnectorRevocationClaim =
  | { state: "pending"; record: ConnectorRevocationPendingRecord }
  | { state: "completed"; receipt: ConnectorRevocationReceipt };

export interface ConnectorRevocationReadback {
  record: ConnectorRevokedRecord;
  receipt: ConnectorRevocationReceipt;
}

export interface CreateConnectorConnectionInput {
  connectorId: string;
  method: ConnectMethod;
  secretRef: string;
  connectedByUid: string;
  connectedAt: string;
  generationId: string;
}

export interface ConnectorConnectionStore {
  getConnection(connectorId: string): Promise<ConnectorConnectionRecord | null>;
  listConnections(): Promise<ConnectorConnectionRecord[]>;
  createConnectedConnection(
    input: CreateConnectorConnectionInput,
  ): Promise<ConnectorConnectedRecord>;
  claimRevocation(input: ConnectorRevocationRequest): Promise<ConnectorRevocationClaim>;
  completeRevocation(input: {
    connectorId: string;
    operationId: string;
    generationId: string;
    expectedRevision: number;
    completedAt: string;
    destroyOutcome: ConnectorDestroyOutcome;
  }): Promise<ConnectorRevocationReceipt>;
  readRevocationResult(
    connectorId: string,
    operationId: string,
  ): Promise<ConnectorRevocationReadback | null>;
  getRevocationReceipt(
    connectorId: string,
    operationId: string,
  ): Promise<ConnectorRevocationReceipt | null>;
}

export function connectorRecordVersion(record: ConnectorConnectionRecord): string | null {
  if (isVersionedConnectorRecord(record)) {
    return `g:${record.generationId}:${record.revision}`;
  }
  return isExactIsoTimestamp(record.updatedAt) ? `legacy:${record.updatedAt}` : null;
}

export function isVersionedConnectorRecord(
  record: ConnectorConnectionRecord,
): record is
  | ConnectorConnectedRecord
  | ConnectorRevocationPendingRecord
  | ConnectorRevokedRecord {
  return (
    typeof record.generationId === "string" &&
    CANONICAL_UUID.test(record.generationId) &&
    Number.isSafeInteger(record.revision) &&
    record.revision > 0
  );
}

export function isSafeVersionedConnectedRecord(
  record: ConnectorConnectionRecord,
): record is ConnectorConnectedRecord {
  return (
    record.status === "connected" &&
    isVersionedConnectorRecord(record) &&
    hasSafeConnectedIdentity(record) &&
    typeof record.secretRef === "string" &&
    record.secretRef.length > 0 &&
    isExactIsoTimestamp(record.updatedAt)
  );
}

export function isSafeVersionedPendingRecord(
  record: ConnectorConnectionRecord,
): record is ConnectorRevocationPendingRecord {
  return (
    record.status === "revocation_pending" &&
    isVersionedConnectorRecord(record) &&
    hasSafeConnectedIdentity(record) &&
    typeof record.secretRef === "string" &&
    record.secretRef.length > 0 &&
    CANONICAL_UUID.test(record.operationId) &&
    typeof record.requestedByUid === "string" &&
    record.requestedByUid.length > 0 &&
    isExactIsoTimestamp(record.requestedAt) &&
    isExactIsoTimestamp(record.updatedAt)
  );
}

export function isSafeVersionedRevokedRecord(
  record: ConnectorConnectionRecord,
): record is ConnectorRevokedRecord {
  return (
    record.status === "revoked" &&
    isVersionedConnectorRecord(record) &&
    CANONICAL_UUID.test(record.operationId) &&
    typeof record.requestedByUid === "string" &&
    record.requestedByUid.length > 0 &&
    isExactIsoTimestamp(record.requestedAt) &&
    isExactIsoTimestamp(record.completedAt) &&
    isExactIsoTimestamp(record.updatedAt) &&
    (record.destroyOutcome === "destroyed" ||
      record.destroyOutcome === "already_absent") &&
    !("secretRef" in record)
  );
}

export function isSafeLegacyConnectorRecord(
  record: ConnectorConnectionRecord,
  status: "connected" | "revocation_pending",
): record is LegacyConnectorConnectionRecord {
  return (
    record.status === status &&
    !isVersionedConnectorRecord(record) &&
    typeof record.secretRef === "string" &&
    record.secretRef.length > 0 &&
    typeof record.connectedByUid === "string" &&
    record.connectedByUid.length > 0 &&
    isExactIsoTimestamp(record.connectedAt) &&
    isExactIsoTimestamp(record.updatedAt) &&
    !("operationId" in record) &&
    !("requestedByUid" in record) &&
    !("requestedAt" in record)
  );
}

export function isExactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function hasSafeConnectedIdentity(
  record: ConnectorConnectionRecord,
): record is ConnectorConnectionRecord & ConnectedIdentity {
  if (!("connectedByUid" in record) || !("connectedAt" in record)) return false;
  return (
    typeof record.connectedByUid === "string" &&
    record.connectedByUid.length > 0 &&
    isExactIsoTimestamp(record.connectedAt)
  );
}

export const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
