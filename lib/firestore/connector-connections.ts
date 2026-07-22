import { type Firestore } from "firebase-admin/firestore";

import type {
  ConnectorConnectionRecord,
  ConnectorConnectionStore,
} from "@/lib/connections/connector-connection";
import { getAdminFirestore } from "@/lib/firestore/admin";

// Server-only store for connector connection records. One document per connector (doc id =
// connectorId). Records hold only an OPAQUE secretRef, never a secret value; the collection is
// locked to server access in firestore.rules (allow read, write: if false).
export const CONNECTOR_CONNECTIONS_COLLECTION = "connector_connections";

export class FirestoreConnectorConnectionStore implements ConnectorConnectionStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async getConnection(connectorId: string): Promise<ConnectorConnectionRecord | null> {
    const snapshot = await this.db
      .collection(CONNECTOR_CONNECTIONS_COLLECTION)
      .doc(connectorId)
      .get();
    return snapshot.exists ? (snapshot.data() as ConnectorConnectionRecord) : null;
  }

  async listConnections(): Promise<ConnectorConnectionRecord[]> {
    const snapshot = await this.db.collection(CONNECTOR_CONNECTIONS_COLLECTION).get();
    return snapshot.docs.map((doc) => doc.data() as ConnectorConnectionRecord);
  }

  async saveConnection(record: ConnectorConnectionRecord): Promise<void> {
    await this.db
      .collection(CONNECTOR_CONNECTIONS_COLLECTION)
      .doc(record.connectorId)
      .set(record);
  }

  async deleteConnection(connectorId: string): Promise<void> {
    await this.db.collection(CONNECTOR_CONNECTIONS_COLLECTION).doc(connectorId).delete();
  }
}

export function getConnectorConnectionStore(): ConnectorConnectionStore {
  return new FirestoreConnectorConnectionStore();
}
