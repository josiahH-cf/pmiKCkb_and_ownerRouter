import { FieldValue, type Firestore } from "firebase-admin/firestore";

import type {
  SpaceProvisioningLedger,
  SpaceProvisioningReceipt,
} from "@/lib/admin/space-provisioning-pilot";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const SPACE_PROVISIONING_ATTEMPTS_COLLECTION = "space_provisioning_attempts";
export const SPACE_PROVISIONING_RECEIPTS_COLLECTION = "space_provisioning_receipts";

/** Durable, server-only idempotency ledger. Receipt bodies contain identifiers only, never source data. */
export class FirestoreSpaceProvisioningLedger implements SpaceProvisioningLedger {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async claim(input: {
    attemptKey: string;
    operation: "provision" | "retire";
    previewHash: string;
  }): ReturnType<SpaceProvisioningLedger["claim"]> {
    const ref = this.db
      .collection(SPACE_PROVISIONING_ATTEMPTS_COLLECTION)
      .doc(input.attemptKey);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        transaction.create(ref, {
          attempt_key: input.attemptKey,
          operation: input.operation,
          preview_hash: input.previewHash,
          state: "claimed",
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        return { status: "claimed" as const };
      }
      const record = snapshot.data() ?? {};
      if (
        record.operation !== input.operation ||
        record.preview_hash !== input.previewHash
      ) {
        throw new EditableLayerError(
          "Space provisioning attempt key belongs to another exact preview.",
          409,
        );
      }
      if (record.state === "completed" && typeof record.receipt_id === "string") {
        const receiptSnapshot = await transaction.get(
          this.db
            .collection(SPACE_PROVISIONING_RECEIPTS_COLLECTION)
            .doc(record.receipt_id),
        );
        if (!receiptSnapshot.exists) {
          return { status: "needs_attention" as const };
        }
        return {
          status: "completed" as const,
          receipt: toReceipt(receiptSnapshot.data() ?? {}),
        };
      }
      return {
        status:
          record.state === "claimed"
            ? ("in_progress" as const)
            : ("needs_attention" as const),
      };
    });
  }

  async complete(receipt: SpaceProvisioningReceipt): Promise<void> {
    const attemptRef = this.db
      .collection(SPACE_PROVISIONING_ATTEMPTS_COLLECTION)
      .doc(receipt.attemptKey);
    const receiptRef = this.db
      .collection(SPACE_PROVISIONING_RECEIPTS_COLLECTION)
      .doc(receipt.id);
    await this.db.runTransaction(async (transaction) => {
      const [attempt, existingReceipt] = await Promise.all([
        transaction.get(attemptRef),
        transaction.get(receiptRef),
      ]);
      const record = attempt.data() ?? {};
      if (
        !attempt.exists ||
        record.operation !== receipt.operation ||
        record.preview_hash !== receipt.previewHash
      ) {
        throw new EditableLayerError(
          "The Space receipt does not match its claimed exact preview.",
          409,
        );
      }
      if (!existingReceipt.exists) transaction.create(receiptRef, toRecord(receipt));
      transaction.update(attemptRef, {
        state: "completed",
        receipt_id: receipt.id,
        updated_at: FieldValue.serverTimestamp(),
      });
    });
    const readback = await receiptRef.get();
    if (!readback.exists || toReceipt(readback.data() ?? {}).id !== receipt.id) {
      throw new Error("Space provisioning receipt readback failed.");
    }
  }

  async needsAttention(input: {
    attemptKey: string;
    operation: "provision" | "retire";
    previewHash: string;
  }): Promise<void> {
    const ref = this.db
      .collection(SPACE_PROVISIONING_ATTEMPTS_COLLECTION)
      .doc(input.attemptKey);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = snapshot.data() ?? {};
      if (
        !snapshot.exists ||
        record.operation !== input.operation ||
        record.preview_hash !== input.previewHash
      ) {
        throw new Error("Cannot reconcile an unknown Space provider attempt.");
      }
      transaction.update(ref, {
        state: "needs_attention",
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  }
}

function toRecord(receipt: SpaceProvisioningReceipt): Record<string, unknown> {
  return {
    id: receipt.id,
    operation: receipt.operation,
    attempt_key: receipt.attemptKey,
    preview_hash: receipt.previewHash,
    space_id: receipt.spaceId,
    data_store_id: receipt.dataStoreId,
    source_prefix: receipt.sourcePrefix,
    provider_operation_ref: receipt.providerOperationRef,
    protected_data_store_ids: receipt.protectedDataStoreIds,
    actor_uid: receipt.actorUid,
    created_at: receipt.createdAt,
  };
}

function toReceipt(record: Record<string, unknown>): SpaceProvisioningReceipt {
  return {
    id: String(record.id ?? ""),
    operation: record.operation === "retire" ? "retire" : "provision",
    attemptKey: String(record.attempt_key ?? ""),
    previewHash: String(record.preview_hash ?? ""),
    spaceId: String(record.space_id ?? ""),
    dataStoreId: String(record.data_store_id ?? ""),
    sourcePrefix: String(record.source_prefix ?? ""),
    providerOperationRef: String(record.provider_operation_ref ?? ""),
    protectedDataStoreIds: Array.isArray(record.protected_data_store_ids)
      ? record.protected_data_store_ids.map(String)
      : [],
    actorUid: String(record.actor_uid ?? ""),
    createdAt: String(record.created_at ?? ""),
    duplicate: false,
  };
}
