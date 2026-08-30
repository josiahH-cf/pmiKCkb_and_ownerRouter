import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import { rentVineProofReceiptHash } from "@/lib/lease-renewal/rentvine-proof-contract";
import type {
  RentVineProofCloseoutRecord,
  RentVineProofCloseoutStore,
} from "@/lib/lease-renewal/rentvine-proof-closeout";
import { sameRentVineProofCloseoutEvidence } from "@/lib/lease-renewal/rentvine-proof-closeout";

export const RENTVINE_PROOF_CLOSEOUT_COLLECTIONS = {
  records: "rentvine_proof_closeouts",
  audit: "rentvine_proof_closeout_audit",
} as const;

/** Admin-only, bodyless proof-closeout ledger. Firestore's catch-all denies client access. */
export class FirestoreRentVineProofCloseoutStore implements RentVineProofCloseoutStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async get(id: string): Promise<RentVineProofCloseoutRecord | null> {
    const snapshot = await this.db
      .collection(RENTVINE_PROOF_CLOSEOUT_COLLECTIONS.records)
      .doc(id)
      .get();
    return snapshot.exists ? (snapshot.data() as RentVineProofCloseoutRecord) : null;
  }

  async create(record: RentVineProofCloseoutRecord): Promise<"created" | "reused"> {
    const ref = this.db
      .collection(RENTVINE_PROOF_CLOSEOUT_COLLECTIONS.records)
      .doc(record.id);
    return this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) {
        if (
          !sameRentVineProofCloseoutEvidence(
            existing.data() as RentVineProofCloseoutRecord,
            record,
          )
        ) {
          throw new Error("S30 closeout identity has conflicting evidence.");
        }
        return "reused" as const;
      }
      const [forwardSnapshot, rollbackSnapshot] = await Promise.all([
        transaction.get(
          this.db
            .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
            .doc(record.forwardExecutionId),
        ),
        transaction.get(
          this.db
            .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
            .doc(record.rollbackExecutionId),
        ),
      ]);
      if (!forwardSnapshot.exists || !rollbackSnapshot.exists) {
        throw new Error("S30 closeout execution evidence is missing.");
      }
      const forward = forwardSnapshot.data() as ExternalExecutionRecord;
      const rollback = rollbackSnapshot.data() as ExternalExecutionRecord;
      if (!closeoutExecutionsMatch(record, forward, rollback)) {
        throw new Error("S30 closeout execution evidence does not match.");
      }
      transaction.create(ref, record);
      transaction.create(
        this.db.collection(RENTVINE_PROOF_CLOSEOUT_COLLECTIONS.audit).doc(uuidv7()),
        {
          action: "proof_closed",
          action_key: record.actionKey,
          closeout_id: record.id,
          proof_ref_hash: record.proofRefHash,
          forward_execution_id: record.forwardExecutionId,
          forward_receipt_hash: record.forwardReceiptHash,
          rollback_execution_id: record.rollbackExecutionId,
          rollback_receipt_hash: record.rollbackReceiptHash,
          committed_seed_allowed: false,
          runtime_executable: false,
          created_at: record.createdAt,
        },
      );
      return "created" as const;
    });
  }
}

function closeoutExecutionsMatch(
  closeout: RentVineProofCloseoutRecord,
  forward: ExternalExecutionRecord,
  rollback: ExternalExecutionRecord,
): boolean {
  return (
    forward.workflowId === rollback.workflowId &&
    hashExecutionPreview({ proofRef: forward.workflowId }) === closeout.proofRefHash &&
    forward.id === closeout.forwardExecutionId &&
    rollback.id === closeout.rollbackExecutionId &&
    forward.actionId === "rentvine-proof:forward" &&
    rollback.actionId === "rentvine-proof:rollback" &&
    forward.actionKey === closeout.actionKey &&
    rollback.actionKey === closeout.actionKey &&
    forward.state === "succeeded" &&
    rollback.state === "succeeded" &&
    forward.attemptCount === 1 &&
    rollback.attemptCount === 1 &&
    Boolean(forward.receipt) &&
    Boolean(rollback.receipt) &&
    rentVineProofReceiptHash(forward.receipt!) === closeout.forwardReceiptHash &&
    rentVineProofReceiptHash(rollback.receipt!) === closeout.rollbackReceiptHash &&
    closeout.committedSeedAllowed === false &&
    closeout.runtimeExecutable === false
  );
}
