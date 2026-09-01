import { randomUUID } from "node:crypto";
import { type Firestore } from "firebase-admin/firestore";

import {
  CANONICAL_UUID,
  connectorRecordVersion,
  isExactIsoTimestamp,
  isSafeLegacyConnectorRecord,
  isSafeVersionedConnectedRecord,
  isSafeVersionedPendingRecord,
  isSafeVersionedRevokedRecord,
  type ConnectorConnectedRecord,
  type ConnectorConnectionRecord,
  type ConnectorConnectionStore,
  type ConnectorRevocationPendingRecord,
  type ConnectorRevocationReceipt,
  type ConnectorRevokedRecord,
  type CreateConnectorConnectionInput,
} from "@/lib/connections/connector-connection";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

// Both collections are server-only. Receipt documents contain identifiers and outcomes only; they
// never contain a credential, opaque secret reference, or customer/provider payload.
export const CONNECTOR_CONNECTIONS_COLLECTION = "connector_connections";
export const CONNECTOR_REVOCATION_RECEIPTS_COLLECTION = "connector_revocation_receipts";

export class FirestoreConnectorConnectionStore implements ConnectorConnectionStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async getConnection(connectorId: string): Promise<ConnectorConnectionRecord | null> {
    const snapshot = await this.connectionRef(connectorId).get();
    return snapshot.exists ? (snapshot.data() as ConnectorConnectionRecord) : null;
  }

  async listConnections(): Promise<ConnectorConnectionRecord[]> {
    const snapshot = await this.db.collection(CONNECTOR_CONNECTIONS_COLLECTION).get();
    return snapshot.docs.map((doc) => doc.data() as ConnectorConnectionRecord);
  }

  async createConnectedConnection(
    input: CreateConnectorConnectionInput,
  ): Promise<ConnectorConnectedRecord> {
    if (
      !CANONICAL_UUID.test(input.generationId) ||
      !isExactIsoTimestamp(input.connectedAt) ||
      !input.secretRef ||
      !input.connectedByUid
    ) {
      throw new EditableLayerError("Connector setup inputs are invalid.", 400);
    }
    const ref = this.connectionRef(input.connectorId);
    return this.db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(ref);
      const current = currentSnapshot.exists
        ? (currentSnapshot.data() as ConnectorConnectionRecord)
        : null;

      if (current && current.status !== "revoked") {
        throw new EditableLayerError(
          current.status === "revocation_pending"
            ? "Finish connector disconnect recovery before reconnecting."
            : "This connector is already connected.",
          409,
        );
      }
      if (current?.status === "revoked") {
        if (!isSafeVersionedRevokedRecord(current)) {
          throw new EditableLayerError(
            "Connector revocation state needs Admin investigation before reconnecting.",
            409,
          );
        }
        const priorReceipt = await transaction.get(
          this.receiptRef(input.connectorId, current.operationId),
        );
        if (!priorReceipt.exists) {
          throw new EditableLayerError(
            "Connector revocation receipt must be verified before reconnecting.",
            409,
          );
        }
        const receipt = readReceipt(priorReceipt.data() ?? {});
        if (
          receipt.connectorId !== current.connectorId ||
          receipt.operationId !== current.operationId ||
          receipt.generationId !== current.generationId ||
          receipt.revision !== current.revision ||
          receipt.completedAt !== current.completedAt ||
          receipt.destroyOutcome !== current.destroyOutcome
        ) {
          throw new EditableLayerError(
            "Connector revocation receipt does not match the revoked generation.",
            409,
          );
        }
      }

      const record: ConnectorConnectedRecord = {
        connectorId: input.connectorId,
        method: input.method,
        status: "connected",
        secretRef: input.secretRef,
        connectedByUid: input.connectedByUid,
        connectedAt: input.connectedAt,
        generationId: input.generationId,
        revision: 1,
        updatedAt: input.connectedAt,
      };
      if (currentSnapshot.exists) transaction.set(ref, record);
      else transaction.create(ref, record);
      return record;
    });
  }

  async claimRevocation(
    input: Parameters<ConnectorConnectionStore["claimRevocation"]>[0],
  ): ReturnType<ConnectorConnectionStore["claimRevocation"]> {
    const connectionRef = this.connectionRef(input.connectorId);
    const receiptRef = this.receiptRef(input.connectorId, input.operationId);
    return this.db.runTransaction(async (transaction) => {
      const [snapshot, receiptSnapshot] = await Promise.all([
        transaction.get(connectionRef),
        transaction.get(receiptRef),
      ]);
      if (receiptSnapshot.exists) {
        const receipt = readReceipt(receiptSnapshot.data() ?? {});
        assertReceiptTarget(receipt, input.connectorId, input.operationId);
        return {
          state: "completed" as const,
          receipt,
        };
      }
      if (!snapshot.exists) {
        throw new EditableLayerError("This connector is not connected.", 409);
      }
      const current = snapshot.data() as ConnectorConnectionRecord;
      assertRecordTargetsConnector(current, input.connectorId);

      if (input.mode === "start") {
        if (current.status !== "connected") {
          throw new EditableLayerError(
            "Connector state changed. Refresh before disconnecting.",
            409,
          );
        }
        assertObservedVersion(current, input.observedVersion);
        let pending: ConnectorRevocationPendingRecord;
        if (isSafeVersionedConnectedRecord(current)) {
          pending = {
            ...current,
            status: "revocation_pending",
            operationId: input.operationId,
            requestedByUid: input.requestedByUid,
            requestedAt: input.requestedAt,
            revision: current.revision + 1,
            updatedAt: input.requestedAt,
          };
        } else {
          if (!isSafeLegacyConnectorRecord(current, "connected")) {
            throw new EditableLayerError(
              "Legacy connector state needs Admin investigation before disconnecting.",
              409,
            );
          }
          pending = {
            ...current,
            status: "revocation_pending",
            generationId: randomUUID(),
            revision: 1,
            operationId: input.operationId,
            requestedByUid: input.requestedByUid,
            requestedAt: input.requestedAt,
            updatedAt: input.requestedAt,
          };
        }
        transaction.set(connectionRef, pending);
        return { state: "pending" as const, record: pending };
      }

      if (input.mode === "adopt_legacy") {
        if (!isSafeLegacyConnectorRecord(current, "revocation_pending")) {
          throw new EditableLayerError(
            "Only an exact recoverable legacy disconnect can be adopted.",
            409,
          );
        }
        assertObservedVersion(current, input.observedVersion);
        const pending: ConnectorRevocationPendingRecord = {
          ...current,
          status: "revocation_pending",
          generationId: randomUUID(),
          revision: 1,
          operationId: input.operationId,
          requestedByUid: input.requestedByUid,
          requestedAt: input.requestedAt,
          updatedAt: input.requestedAt,
        };
        transaction.set(connectionRef, pending);
        return { state: "pending" as const, record: pending };
      }

      if (
        current.status !== "revocation_pending" ||
        !isSafeVersionedPendingRecord(current) ||
        current.operationId !== input.operationId
      ) {
        throw new EditableLayerError(
          "That recovery request does not own the pending disconnect.",
          409,
        );
      }
      assertObservedVersion(current, input.observedVersion);
      return { state: "pending" as const, record: current };
    });
  }

  async completeRevocation(
    input: Parameters<ConnectorConnectionStore["completeRevocation"]>[0],
  ): ReturnType<ConnectorConnectionStore["completeRevocation"]> {
    const connectionRef = this.connectionRef(input.connectorId);
    const receiptRef = this.receiptRef(input.connectorId, input.operationId);
    return this.db.runTransaction(async (transaction) => {
      const [snapshot, receiptSnapshot] = await Promise.all([
        transaction.get(connectionRef),
        transaction.get(receiptRef),
      ]);
      if (receiptSnapshot.exists) {
        const receipt = readReceipt(receiptSnapshot.data() ?? {});
        assertReceiptTarget(receipt, input.connectorId, input.operationId);
        return receipt;
      }
      if (!snapshot.exists) {
        throw new EditableLayerError("Pending connector disconnect was not found.", 409);
      }
      const pending = snapshot.data() as ConnectorConnectionRecord;
      if (
        pending.status !== "revocation_pending" ||
        !isSafeVersionedPendingRecord(pending) ||
        pending.operationId !== input.operationId ||
        pending.generationId !== input.generationId ||
        pending.revision !== input.expectedRevision
      ) {
        throw new EditableLayerError(
          "Connector state changed before disconnect completion.",
          409,
        );
      }
      const revision = pending.revision + 1;
      const revoked: ConnectorRevokedRecord = {
        connectorId: pending.connectorId,
        method: pending.method,
        status: "revoked",
        operationId: pending.operationId,
        requestedByUid: pending.requestedByUid,
        requestedAt: pending.requestedAt,
        completedAt: input.completedAt,
        destroyOutcome: input.destroyOutcome,
        generationId: pending.generationId,
        revision,
        updatedAt: input.completedAt,
      };
      const receipt: ConnectorRevocationReceipt = {
        connectorId: pending.connectorId,
        method: pending.method,
        operationId: pending.operationId,
        generationId: pending.generationId,
        revision,
        requestedByUid: pending.requestedByUid,
        requestedAt: pending.requestedAt,
        completedAt: input.completedAt,
        destroyOutcome: input.destroyOutcome,
      };
      transaction.set(connectionRef, revoked);
      transaction.create(receiptRef, receiptRecord(receipt));
      return receipt;
    });
  }

  async readRevocationResult(
    connectorId: string,
    operationId: string,
  ): ReturnType<ConnectorConnectionStore["readRevocationResult"]> {
    const [connection, receipt] = await Promise.all([
      this.getConnection(connectorId),
      this.getRevocationReceipt(connectorId, operationId),
    ]);
    if (
      !connection ||
      connection.status !== "revoked" ||
      !isSafeVersionedRevokedRecord(connection) ||
      connection.operationId !== operationId ||
      !receipt ||
      connection.generationId !== receipt.generationId ||
      connection.revision !== receipt.revision ||
      connection.completedAt !== receipt.completedAt ||
      connection.destroyOutcome !== receipt.destroyOutcome
    ) {
      return null;
    }
    return { record: connection, receipt };
  }

  async getRevocationReceipt(
    connectorId: string,
    operationId: string,
  ): ReturnType<ConnectorConnectionStore["getRevocationReceipt"]> {
    const snapshot = await this.receiptRef(connectorId, operationId).get();
    return snapshot.exists ? readReceipt(snapshot.data() ?? {}) : null;
  }

  private connectionRef(connectorId: string) {
    return this.db.collection(CONNECTOR_CONNECTIONS_COLLECTION).doc(connectorId);
  }

  private receiptRef(connectorId: string, operationId: string) {
    return this.db
      .collection(CONNECTOR_REVOCATION_RECEIPTS_COLLECTION)
      .doc(`${connectorId}--${operationId}`);
  }
}

function assertRecordTargetsConnector(
  record: ConnectorConnectionRecord,
  connectorId: string,
) {
  if (record.connectorId !== connectorId) {
    throw new EditableLayerError(
      "Stored connector identity does not match the requested connector.",
      409,
    );
  }
}

function assertReceiptTarget(
  receipt: ConnectorRevocationReceipt,
  connectorId: string,
  operationId: string,
) {
  if (receipt.connectorId !== connectorId || receipt.operationId !== operationId) {
    throw new EditableLayerError(
      "Connector revocation receipt identity does not match its lookup key.",
      409,
    );
  }
}

function assertObservedVersion(
  record: ConnectorConnectionRecord,
  observedVersion: string,
) {
  const current = connectorRecordVersion(record);
  if (!current || current !== observedVersion) {
    throw new EditableLayerError(
      "Connector state changed. Refresh before continuing.",
      409,
    );
  }
}

function receiptRecord(receipt: ConnectorRevocationReceipt): Record<string, unknown> {
  return {
    connector_id: receipt.connectorId,
    method: receipt.method,
    operation_id: receipt.operationId,
    generation_id: receipt.generationId,
    revision: receipt.revision,
    requested_by_uid: receipt.requestedByUid,
    requested_at: receipt.requestedAt,
    completed_at: receipt.completedAt,
    destroy_outcome: receipt.destroyOutcome,
  };
}

function readReceipt(record: Record<string, unknown>): ConnectorRevocationReceipt {
  if (
    record.method !== "api_key" &&
    record.method !== "oauth" &&
    record.method !== "google"
  ) {
    throw new EditableLayerError(
      "Connector revocation receipt needs Admin investigation.",
      409,
    );
  }
  const receipt: ConnectorRevocationReceipt = {
    connectorId: String(record.connector_id ?? ""),
    method: record.method,
    operationId: String(record.operation_id ?? ""),
    generationId: String(record.generation_id ?? ""),
    revision: Number(record.revision ?? 0),
    requestedByUid: String(record.requested_by_uid ?? ""),
    requestedAt: String(record.requested_at ?? ""),
    completedAt: String(record.completed_at ?? ""),
    destroyOutcome:
      record.destroy_outcome === "already_absent" ? "already_absent" : "destroyed",
  };
  if (
    !receipt.connectorId ||
    !CANONICAL_UUID.test(receipt.operationId) ||
    !CANONICAL_UUID.test(receipt.generationId) ||
    !Number.isSafeInteger(receipt.revision) ||
    receipt.revision < 2 ||
    !receipt.requestedByUid ||
    !isExactIsoTimestamp(receipt.requestedAt) ||
    !isExactIsoTimestamp(receipt.completedAt) ||
    (record.destroy_outcome !== "destroyed" &&
      record.destroy_outcome !== "already_absent")
  ) {
    throw new EditableLayerError(
      "Connector revocation receipt needs Admin investigation.",
      409,
    );
  }
  return receipt;
}

export function getConnectorConnectionStore(): ConnectorConnectionStore {
  return new FirestoreConnectorConnectionStore();
}
