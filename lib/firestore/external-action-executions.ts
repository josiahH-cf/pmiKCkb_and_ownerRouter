import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
  ExternalExecutionStore,
} from "@/lib/external-execution/types";
import { getAdminFirestore } from "@/lib/firestore/admin";

export const EXTERNAL_EXECUTION_COLLECTIONS = {
  records: "external_action_executions",
  audit: "external_action_execution_audit",
} as const;

export class FirestoreExternalExecutionStore implements ExternalExecutionStore {
  readonly persistence = "firestore" as const;
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async get(id: string) {
    const snapshot = await this.db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(id)
      .get();
    return snapshot.exists ? (snapshot.data() as ExternalExecutionRecord) : null;
  }

  async create(record: ExternalExecutionRecord) {
    const ref = this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(record.id);
    await this.db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists)
        throw new Error("Execution already exists.");
      transaction.create(ref, record);
      transaction.create(
        this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        audit(record, "prepared"),
      );
    });
  }

  async claim(id: string, previewHash: string) {
    const ref = this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return "blocked" as const;
      const record = snapshot.data() as ExternalExecutionRecord;
      if (record.previewHash !== previewHash || record.state === "blocked") {
        return "blocked" as const;
      }
      if (record.state === "succeeded") return "duplicate" as const;
      if (record.state !== "ready" || record.attemptCount !== 0)
        return "blocked" as const;
      const next: ExternalExecutionRecord = {
        ...record,
        state: "running",
        attemptCount: 1,
        updatedAt: new Date().toISOString(),
      };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        audit(next, "attempt_claimed"),
      );
      return "claimed" as const;
    });
  }

  async finish(id: string, receipt: ExternalActionReceipt) {
    const ref = this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Execution missing.");
      const record = snapshot.data() as ExternalExecutionRecord;
      if (receipt.actionKey !== record.actionKey) {
        throw new Error("Execution receipt action does not match the claimed action.");
      }
      if (
        isReceiptTerminalState(record.state) &&
        record.receipt &&
        sameReceipt(record.receipt, receipt)
      ) {
        return;
      }
      if (isReceiptTerminalState(record.state)) {
        throw new Error("Execution already has a conflicting terminal receipt.");
      }
      const allowedState = receipt.reconciled ? "ambiguous" : "running";
      if (record.state !== allowedState || record.attemptCount !== 1) {
        throw new Error(
          `Execution receipt cannot transition from ${record.state}/${record.attemptCount}.`,
        );
      }
      const next: ExternalExecutionRecord = {
        ...record,
        state: receipt.outcome === "not_applicable" ? "not_applicable" : "succeeded",
        receipt,
        updatedAt: new Date().toISOString(),
      };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        audit(next, receipt.reconciled ? "reconciled" : next.state),
      );
    });
  }

  async fail(id: string, ambiguous: boolean) {
    const ref = this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Execution missing.");
      const record = snapshot.data() as ExternalExecutionRecord;
      if (record.state !== "running" || record.attemptCount !== 1) {
        throw new Error(
          `Execution failure cannot transition from ${record.state}/${record.attemptCount}.`,
        );
      }
      const next: ExternalExecutionRecord = {
        ...record,
        state: ambiguous ? "ambiguous" : "failed",
        updatedAt: new Date().toISOString(),
      };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        audit(next, next.state),
      );
    });
  }
}

function isReceiptTerminalState(state: ExternalExecutionRecord["state"]) {
  return state === "succeeded" || state === "not_applicable";
}

function sameReceipt(left: ExternalActionReceipt, right: ExternalActionReceipt) {
  return (
    left.actionKey === right.actionKey &&
    left.dataMode === right.dataMode &&
    left.liveEvidenceEligible === right.liveEvidenceEligible &&
    left.providerRef === right.providerRef &&
    left.resultHash === right.resultHash &&
    left.reconciled === right.reconciled &&
    left.outcome === right.outcome &&
    left.createdAt === right.createdAt
  );
}

function audit(record: ExternalExecutionRecord, action: string) {
  return {
    execution_id: record.id,
    data_mode: record.dataMode,
    live_evidence_eligible: record.receipt?.liveEvidenceEligible ?? false,
    workflow_id: record.workflowId,
    action_id: record.actionId,
    action_key: record.actionKey,
    context_hash: record.contextHash,
    preview_hash: record.previewHash,
    state: record.state,
    attempt_count: record.attemptCount,
    action,
    created_at: new Date().toISOString(),
    ...(record.receipt
      ? {
          provider_ref_hash: hashReference(record.receipt.providerRef),
          result_hash: record.receipt.resultHash,
        }
      : {}),
  };
}

function hashReference(value: string) {
  // Import-free small deterministic hash: provider references never appear in audit plaintext.
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
