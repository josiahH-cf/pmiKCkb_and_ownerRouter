import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { LEASE_RENEWAL_COLLECTIONS } from "@/lib/firestore/lease-renewal-resolutions";
import { LEASE_RENEWAL_WRITEBACK_COLLECTIONS } from "@/lib/firestore/lease-renewal-writeback-approvals";
import { resolutionDocId } from "@/lib/firestore/lease-renewal-resolutions";
import {
  executionRecordFromPreview,
  sameProviderEffectReceipt,
  type ClaimSheetWritebackResult,
  type SheetWritebackClaimAuthorization,
  type SheetWritebackExecutionRecord,
  type SheetWritebackExecutionState,
  type SheetWritebackExecutionStore,
  type SheetWritebackPreviewRecord,
  type SheetWritebackReceipt,
} from "@/lib/lease-renewal/sheet-writeback-contract";
import { hashSheetCellValue } from "@/lib/lease-renewal/sheet-writeback-policy";

export const SHEET_WRITEBACK_EXECUTION_COLLECTIONS = {
  previews: "lease_renewal_writeback_previews",
  executions: "lease_renewal_writeback_executions",
  heads: "lease_renewal_writeback_execution_heads",
  audit: "lease_renewal_writeback_execution_audit",
} as const;

/**
 * Admin-SDK-only confirmation, one-attempt, and receipt store. Unknown collections are denied by
 * the existing Firestore catch-all rule, so this introduces no client rule or protected-path edit.
 */
export class FirestoreSheetWritebackExecutionStore implements SheetWritebackExecutionStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async createPreview(record: SheetWritebackPreviewRecord): Promise<void> {
    const ref = this.previewRef(record.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data() as SheetWritebackPreviewRecord;
        if (canonicalJson(existing) !== canonicalJson(record)) {
          throw new Error("Sheet write-back preview hash collision.");
        }
        return;
      }
      transaction.create(ref, record);
      transaction.create(
        this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        previewAudit(record),
      );
    });
  }

  async getPreview(id: string): Promise<SheetWritebackPreviewRecord | null> {
    const snapshot = await this.previewRef(id).get();
    return snapshot.exists ? (snapshot.data() as SheetWritebackPreviewRecord) : null;
  }

  async getExecution(id: string): Promise<SheetWritebackExecutionRecord | null> {
    const snapshot = await this.executionRef(id).get();
    return snapshot.exists ? (snapshot.data() as SheetWritebackExecutionRecord) : null;
  }

  async getLatestExecution(input: {
    runId: string;
    sourceTriggerKey: string;
  }): Promise<SheetWritebackExecutionRecord | null> {
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.headRef(input));
      if (!snapshot.exists) return null;
      const head = snapshot.data() as {
        executionId?: unknown;
      };
      if (typeof head.executionId !== "string") return null;
      const executionSnapshot = await transaction.get(
        this.executionRef(head.executionId),
      );
      if (!executionSnapshot.exists) return null;
      const record = executionSnapshot.data() as SheetWritebackExecutionRecord;
      return record.runId === input.runId &&
        record.sourceTriggerKey === input.sourceTriggerKey
        ? record
        : null;
    });
  }

  async claim(input: {
    previewHash: string;
    executionId: string;
    actorUid: string;
    nowMs: number;
    authorization?: SheetWritebackClaimAuthorization;
  }): Promise<ClaimSheetWritebackResult> {
    const previewRef = this.previewRef(input.previewHash);
    const executionRef = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const previewSnapshot = await transaction.get(previewRef);
      if (!previewSnapshot.exists) return { status: "mismatch" as const };
      const preview = previewSnapshot.data() as SheetWritebackPreviewRecord;
      if (
        preview.executionId !== input.executionId ||
        preview.binding.actorUid !== input.actorUid
      ) {
        return { status: "mismatch" as const };
      }
      if (preview.expiresAtMs <= input.nowMs) return { status: "expired" as const };

      const executionSnapshot = await transaction.get(executionRef);
      if (executionSnapshot.exists) {
        const existing = executionSnapshot.data() as SheetWritebackExecutionRecord;
        if (
          existing.bindingHash !== preview.bindingHash ||
          existing.actorUid !== input.actorUid
        ) {
          return { status: "mismatch" as const, record: existing };
        }
        if (existing.state === "succeeded" && existing.receipt) {
          return {
            status: "duplicate" as const,
            record: existing,
            receipt: existing.receipt,
          };
        }
        if (existing.state === "running") {
          return { status: "in_progress" as const, record: existing };
        }
        if (existing.state === "ambiguous") {
          return { status: "ambiguous" as const, record: existing };
        }
        return { status: "consumed" as const, record: existing };
      }

      if (preview.binding.operation === "write") {
        if (
          !input.authorization ||
          !claimAuthorizationMatchesPreview(input.authorization, preview)
        ) {
          return { status: "mismatch" as const };
        }
        const authorizationDocId = resolutionDocId(input.authorization.sourceTriggerKey);
        const approvalSnapshot = await transaction.get(
          this.db
            .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals)
            .doc(authorizationDocId),
        );
        const resolutionSnapshot = await transaction.get(
          this.db
            .collection(LEASE_RENEWAL_COLLECTIONS.resolutions)
            .doc(authorizationDocId),
        );
        if (
          !approvalSnapshot.exists ||
          !resolutionSnapshot.exists ||
          !liveAuthorizationMatches(
            input.authorization,
            approvalSnapshot.data()!,
            resolutionSnapshot.data()!,
          )
        ) {
          return { status: "mismatch" as const };
        }
      }

      const record = executionRecordFromPreview(preview, input.nowMs);
      const headRef = this.headRef(record);
      const headSnapshot = await transaction.get(headRef);
      const currentHead = headSnapshot.exists
        ? (headSnapshot.data() as { executionId?: unknown }).executionId
        : undefined;
      const predecessor = preview.binding.predecessorExecutionId;
      const headMatches =
        predecessor === undefined
          ? !headSnapshot.exists
          : headSnapshot.exists && currentHead === predecessor;
      if (!headMatches) {
        return { status: "mismatch" as const };
      }
      transaction.create(executionRef, record);
      transaction.set(headRef, {
        executionId: record.id,
        updatedAt: record.createdAt,
      });
      transaction.create(
        this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        executionAudit(record, "attempt_claimed"),
      );
      return { status: "claimed" as const, record };
    });
  }

  async finish(
    executionId: string,
    receipt: SheetWritebackReceipt,
  ): Promise<SheetWritebackReceipt> {
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Sheet write-back execution is missing.");
      const record = snapshot.data() as SheetWritebackExecutionRecord;
      if (record.state === "succeeded" && record.receipt) {
        if (sameProviderEffectReceipt(record.receipt, receipt)) {
          return record.receipt;
        }
        throw new Error("Sheet write-back execution has a conflicting receipt.");
      }
      if (
        (receipt.reconciled
          ? record.state !== "running" && record.state !== "ambiguous"
          : record.state !== "running") ||
        receipt.receiptId !== executionId ||
        receipt.previewHash !== record.previewHash ||
        receipt.operation !== record.operation
      ) {
        throw new Error(`Sheet write-back receipt cannot finish ${record.state}.`);
      }
      const next: SheetWritebackExecutionRecord = {
        ...record,
        state: "succeeded",
        receipt,
        updatedAt: receipt.createdAt,
      };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        executionAudit(next, receipt.reconciled ? "reconciled" : "succeeded"),
      );
      return receipt;
    });
  }

  async markOutcome(
    executionId: string,
    state: Extract<SheetWritebackExecutionState, "ambiguous" | "failed">,
    nowMs: number,
  ): Promise<void> {
    const ref = this.executionRef(executionId);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const record = snapshot.data() as SheetWritebackExecutionRecord;
      if (record.state === "succeeded") return;
      if (record.state === state) return;
      if (record.state === "failed" && state === "ambiguous") return;
      const next: SheetWritebackExecutionRecord = {
        ...record,
        state,
        updatedAt: new Date(nowMs).toISOString(),
      };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
        executionAudit(next, state),
      );
    });
  }

  private previewRef(id: string) {
    return this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.previews).doc(id);
  }

  private executionRef(id: string) {
    return this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.executions).doc(id);
  }

  private headRef(input: { runId: string; sourceTriggerKey: string }) {
    return this.db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.heads).doc(
      hashExecutionPreview({
        runId: input.runId,
        sourceTriggerKey: input.sourceTriggerKey,
      }),
    );
  }
}

function previewAudit(record: SheetWritebackPreviewRecord) {
  return {
    action: "preview_created",
    action_key: "google_sheets.renewal_checklist.writeback",
    execution_id: record.executionId,
    operation: record.binding.operation,
    binding_hash: record.bindingHash,
    preview_hash: record.id,
    target_hash: targetHash(record.binding.target),
    created_at: new Date(record.issuedAtMs).toISOString(),
  };
}

function executionAudit(record: SheetWritebackExecutionRecord, action: string) {
  return {
    action,
    action_key: record.actionKey,
    execution_id: record.id,
    operation: record.operation,
    binding_hash: record.bindingHash,
    preview_hash: record.previewHash,
    target_hash: targetHash(record.target),
    proposed_value_hash: record.proposedValueHash,
    ...(record.predecessorExecutionId !== undefined
      ? { predecessor_execution_id: record.predecessorExecutionId }
      : {}),
    state: record.state,
    attempt_count: record.attemptCount,
    created_at: new Date().toISOString(),
    ...(record.receipt
      ? {
          receipt_id: record.receipt.receiptId,
          result_hash: record.receipt.resultHash,
          reconciled: record.receipt.reconciled,
        }
      : {}),
  };
}

function targetHash(target: SheetWritebackPreviewRecord["binding"]["target"]) {
  return hashExecutionPreview({
    spreadsheetId: target.spreadsheetId,
    a1: target.a1,
  });
}

function claimAuthorizationMatchesPreview(
  authorization: SheetWritebackClaimAuthorization,
  preview: SheetWritebackPreviewRecord,
): boolean {
  return (
    authorization.sourceTriggerKey === preview.binding.sourceTriggerKey &&
    authorization.runId === preview.binding.runId &&
    authorization.propertyKey === preview.binding.propertyKey &&
    authorization.fieldKey === preview.binding.fieldKey &&
    authorization.approvalId === preview.binding.approvalId &&
    authorization.approvalVersion === preview.binding.approvalVersion &&
    authorization.candidateFingerprint === preview.binding.candidateFingerprint &&
    authorization.resolutionUpdatedAt === preview.binding.resolutionUpdatedAt &&
    authorization.sourceOfValue === preview.binding.sourceOfValue &&
    authorization.proposedValueHash === preview.binding.proposedValueHash
  );
}

function liveAuthorizationMatches(
  expected: SheetWritebackClaimAuthorization,
  approval: Record<string, unknown>,
  resolution: Record<string, unknown>,
): boolean {
  const proposal =
    resolution.proposed_writeback && typeof resolution.proposed_writeback === "object"
      ? (resolution.proposed_writeback as Record<string, unknown>)
      : null;
  return (
    approval.id === expected.approvalId &&
    approval.state === "Approved" &&
    approval.source_trigger_key === expected.sourceTriggerKey &&
    approval.run_id === expected.runId &&
    approval.property_key === expected.propertyKey &&
    approval.field_key === expected.fieldKey &&
    timestampIso(approval.updated_at) === expected.approvalVersion &&
    approval.candidate_fingerprint === expected.candidateFingerprint &&
    approval.resolution_updated_at === expected.resolutionUpdatedAt &&
    approval.source_of_value === expected.sourceOfValue &&
    typeof approval.proposed_value === "string" &&
    approval.proposed_value.trim().length > 0 &&
    hashSheetCellValue(approval.proposed_value) === expected.proposedValueHash &&
    resolution.source_trigger_key === expected.sourceTriggerKey &&
    resolution.run_id === expected.runId &&
    resolution.property_key === expected.propertyKey &&
    resolution.field_key === expected.fieldKey &&
    resolution.status === "Resolved" &&
    resolution.candidate_fingerprint === expected.candidateFingerprint &&
    timestampIso(resolution.updated_at) === expected.resolutionUpdatedAt &&
    proposal?.status === "Queued" &&
    proposal?.field_key === expected.fieldKey &&
    proposal?.source_of_value === expected.sourceOfValue &&
    typeof proposal?.value === "string" &&
    proposal.value.trim().length > 0 &&
    hashSheetCellValue(proposal.value) === expected.proposedValueHash
  );
}

function timestampIso(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}
