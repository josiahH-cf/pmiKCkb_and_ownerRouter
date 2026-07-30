import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress-schema";
import { RENEWAL_COMP_SCREENSHOT_ACTION_KEY } from "@/lib/lease-renewal/comp-screenshot-action";
import {
  COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
  COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
  compScreenshotDispatchGeneration,
  compScreenshotExecutionFromPreview,
  compScreenshotRecordIdentity,
  compScreenshotRollbackReceiptMatchesLineage,
  compScreenshotRollbackDispatchGeneration,
  compScreenshotRollbackBindingHash,
  isCompScreenshotDispatchLeaseActive,
  isCompScreenshotRollbackDispatchLeaseActive,
  sameCompScreenshotReceipt,
  sameCompScreenshotRollbackReceipt,
  type BeginCompScreenshotUploadResult,
  type BindCompScreenshotFolderEvidenceResult,
  type ClaimCompScreenshotResult,
  type ClaimCompScreenshotRollbackResult,
  type CompScreenshotExecutionRecord,
  type CompScreenshotExecutionStore,
  type CompScreenshotFolderEvidence,
  type CompScreenshotPreviewRecord,
  type CompScreenshotReceipt,
  type CompScreenshotRollbackPreviewRecord,
  type CompScreenshotRollbackReceipt,
  type CompScreenshotRollbackRecord,
  type MarkCompScreenshotRollbackStateInput,
  type ReserveCompScreenshotFileIdResult,
} from "@/lib/lease-renewal/comp-screenshot-contract";

export const COMP_SCREENSHOT_EXECUTION_COLLECTIONS = {
  previews: "lease_renewal_comp_screenshot_previews",
  executions: "lease_renewal_comp_screenshot_executions",
  heads: "lease_renewal_comp_screenshot_execution_heads",
  rollbackPreviews: "lease_renewal_comp_screenshot_rollback_previews",
  audit: "lease_renewal_comp_screenshot_execution_audit",
} as const;

/**
 * Admin-SDK-only immutable-preview and one-attempt store for renewal comp screenshots.
 *
 * The existing Firestore catch-all rule denies every collection here to browser clients. Audit
 * records intentionally contain only action/execution/provider IDs, hashes, states, counts, and
 * timestamps. Image bytes, source filenames, lease IDs, folder IDs, and provider bodies never enter
 * the audit stream.
 */
export class FirestoreCompScreenshotExecutionStore implements CompScreenshotExecutionStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async createPreview(record: CompScreenshotPreviewRecord): Promise<void> {
    const ref = this.previewRef(record.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data() as CompScreenshotPreviewRecord;
        if (canonicalJson(existing) !== canonicalJson(record)) {
          throw new Error("Comp screenshot preview hash collision.");
        }
        return;
      }
      transaction.create(ref, record);
      transaction.create(this.auditRef(), previewAudit(record));
    });
  }

  async getPreview(id: string): Promise<CompScreenshotPreviewRecord | null> {
    const snapshot = await this.previewRef(id).get();
    return snapshot.exists ? (snapshot.data() as CompScreenshotPreviewRecord) : null;
  }

  async getExecution(id: string): Promise<CompScreenshotExecutionRecord | null> {
    const snapshot = await this.executionRef(id).get();
    return snapshot.exists ? (snapshot.data() as CompScreenshotExecutionRecord) : null;
  }

  async getLatestExecution(
    compRecordHash: string,
  ): Promise<CompScreenshotExecutionRecord | null> {
    return this.db.runTransaction(async (transaction) => {
      const headSnapshot = await transaction.get(this.headRef(compRecordHash));
      if (!headSnapshot.exists) return null;
      const executionId = headSnapshot.data()?.executionId;
      if (typeof executionId !== "string") return null;
      const executionSnapshot = await transaction.get(this.executionRef(executionId));
      if (!executionSnapshot.exists) return null;
      const record = executionSnapshot.data() as CompScreenshotExecutionRecord;
      return record.compRecordHash === compRecordHash ? record : null;
    });
  }

  async claim(input: {
    previewHash: string;
    executionId: string;
    actorUid: string;
    nowMs: number;
  }): Promise<ClaimCompScreenshotResult> {
    const previewRef = this.previewRef(input.previewHash);
    const executionRef = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const previewSnapshot = await transaction.get(previewRef);
      if (!previewSnapshot.exists) return { status: "mismatch" as const };
      const preview = previewSnapshot.data() as CompScreenshotPreviewRecord;
      if (
        preview.executionId !== input.executionId ||
        preview.binding.actorUid !== input.actorUid
      ) {
        return { status: "mismatch" as const };
      }

      const executionSnapshot = await transaction.get(executionRef);
      if (executionSnapshot.exists) {
        return existingClaimResult(
          executionSnapshot.data() as CompScreenshotExecutionRecord,
          preview,
        );
      }
      if (preview.expiresAtMs <= input.nowMs) {
        return { status: "expired" as const };
      }

      const headRef = this.headRef(preview.binding.compRecordHash);
      const headSnapshot = await transaction.get(headRef);
      const currentHead = headSnapshot.exists
        ? headSnapshot.data()?.executionId
        : undefined;
      if (currentHead !== preview.binding.predecessorExecutionId) {
        return { status: "mismatch" as const };
      }

      const record = compScreenshotExecutionFromPreview(preview, input.nowMs);
      transaction.create(executionRef, record);
      transaction.set(headRef, {
        executionId: record.id,
        compRecordHash: record.compRecordHash,
        updatedAt: record.createdAt,
      });
      transaction.create(this.auditRef(), executionAudit(record, "attempt_claimed"));
      return { status: "claimed" as const, record };
    });
  }

  async bindFolderEvidence(
    executionId: string,
    evidence: CompScreenshotFolderEvidence,
    nowMs: number,
  ): Promise<BindCompScreenshotFolderEvidenceResult> {
    if (!validFolderEvidence(evidence)) return { status: "mismatch" };
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { status: "mismatch" as const };
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (record.state === "delivered" && record.receipt) {
        return {
          status: "duplicate" as const,
          record,
          receipt: record.receipt,
        };
      }
      if (record.folderMetadataHash || record.folderVersion) {
        if (
          record.folderMetadataHash === evidence.folderMetadataHash &&
          record.folderVersion === evidence.folderVersion
        ) {
          return { status: "existing" as const, record };
        }
        return { status: "mismatch" as const, record };
      }
      if (record.state !== "claimed") {
        return { status: "consumed" as const, record };
      }
      const next: CompScreenshotExecutionRecord = {
        ...record,
        folderMetadataHash: evidence.folderMetadataHash,
        folderVersion: evidence.folderVersion,
        updatedAt: iso(nowMs),
      };
      transaction.set(ref, next);
      transaction.create(this.auditRef(), executionAudit(next, "folder_bound"));
      return { status: "bound" as const, record: next };
    });
  }

  async reserveFileId(
    executionId: string,
    candidateFileId: string,
    nowMs: number,
  ): Promise<ReserveCompScreenshotFileIdResult> {
    if (!isDriveFileId(candidateFileId)) return { status: "mismatch" };
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { status: "mismatch" as const };
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (record.state === "delivered" && record.receipt) {
        return {
          status: "duplicate" as const,
          record,
          receipt: record.receipt,
        };
      }
      if (
        (record.state === "id_reserved" ||
          record.state === "upload_started" ||
          record.state === "ambiguous") &&
        record.reservedFileId
      ) {
        return {
          status: "existing" as const,
          record,
          fileId: record.reservedFileId,
        };
      }
      if (
        record.state !== "claimed" ||
        !record.folderMetadataHash ||
        !record.folderVersion
      ) {
        return { status: "consumed" as const, record };
      }

      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "id_reserved",
        reservedFileId: candidateFileId,
        updatedAt: iso(nowMs),
      };
      transaction.set(ref, next);
      transaction.create(this.auditRef(), executionAudit(next, "drive_id_reserved"));
      return {
        status: "reserved" as const,
        record: next,
        fileId: candidateFileId,
      };
    });
  }

  async beginUpload(
    executionId: string,
    nowMs: number,
  ): Promise<BeginCompScreenshotUploadResult> {
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { status: "mismatch" as const };
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (record.state === "delivered" && record.receipt) {
        return {
          status: "duplicate" as const,
          record,
          receipt: record.receipt,
        };
      }
      if (
        record.state === "upload_started" &&
        record.reservedFileId &&
        isCompScreenshotDispatchLeaseActive(record, nowMs)
      ) {
        return {
          status: "in_progress" as const,
          record,
          fileId: record.reservedFileId,
          dispatchGeneration: record.dispatchGeneration!,
          dispatchLeaseExpiresAtMs: record.dispatchLeaseExpiresAtMs!,
        };
      }
      const recovering =
        record.state === "ambiguous" ||
        (record.state === "upload_started" &&
          !isCompScreenshotDispatchLeaseActive(record, nowMs));
      if (
        (record.state !== "id_reserved" && !recovering) ||
        !record.reservedFileId ||
        !record.folderMetadataHash ||
        !record.folderVersion
      ) {
        return { status: "consumed" as const, record };
      }
      const dispatchGeneration = compScreenshotDispatchGeneration(record) + 1;
      if (!Number.isSafeInteger(dispatchGeneration)) {
        return { status: "consumed" as const, record };
      }
      const dispatchLeaseExpiresAtMs = nowMs + COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS;

      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "upload_started",
        dispatchGeneration,
        dispatchLeaseExpiresAtMs,
        updatedAt: iso(nowMs),
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(),
        executionAudit(next, recovering ? "upload_retried" : "upload_started"),
      );
      return {
        status: recovering ? ("retry" as const) : ("started" as const),
        record: next,
        fileId: next.reservedFileId!,
        dispatchGeneration,
        dispatchLeaseExpiresAtMs,
      };
    });
  }

  async finish(
    executionId: string,
    receipt: CompScreenshotReceipt,
  ): Promise<CompScreenshotReceipt> {
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new Error("Comp screenshot execution is missing.");
      }
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (record.state === "delivered" && record.receipt) {
        if (sameCompScreenshotReceipt(record.receipt, receipt)) {
          return record.receipt;
        }
        throw new Error("Comp screenshot execution has a conflicting receipt.");
      }
      if (
        !["upload_started", "ambiguous"].includes(record.state) ||
        receipt.receiptId !== record.id ||
        receipt.previewHash !== record.previewHash ||
        receipt.fileId !== record.reservedFileId
      ) {
        throw new Error(`Comp screenshot receipt cannot finish ${record.state}.`);
      }

      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "delivered",
        receipt,
        updatedAt: receipt.createdAt,
      };
      transaction.set(ref, next);
      transaction.create(this.auditRef(), executionAudit(next, "delivered"));
      return receipt;
    });
  }

  async markAmbiguous(input: {
    executionId: string;
    dispatchGeneration: number;
    nowMs: number;
    requireLeaseExpiry?: boolean;
  }): Promise<boolean> {
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (
        !isDispatchGeneration(input.dispatchGeneration) ||
        compScreenshotDispatchGeneration(record) !== input.dispatchGeneration ||
        (record.state !== "upload_started" && record.state !== "ambiguous")
      ) {
        return false;
      }
      if (record.state === "ambiguous") return true;
      if (
        input.requireLeaseExpiry &&
        isCompScreenshotDispatchLeaseActive(record, input.nowMs)
      ) {
        return false;
      }
      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "ambiguous",
        updatedAt: iso(input.nowMs),
      };
      transaction.set(ref, next);
      transaction.create(this.auditRef(), executionAudit(next, "ambiguous"));
      return true;
    });
  }

  async markAbsentIfNotStarted(executionId: string, nowMs: number): Promise<boolean> {
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (record.state === "absent") return true;
      if (record.state !== "claimed" && record.state !== "id_reserved") return false;
      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "absent",
        updatedAt: iso(nowMs),
      };
      transaction.set(ref, next);
      transaction.create(this.auditRef(), executionAudit(next, "absent"));
      return true;
    });
  }

  async markDeterministicNoEffect(input: {
    executionId: string;
    dispatchGeneration: number;
    nowMs: number;
  }): Promise<boolean> {
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (
        input.dispatchGeneration !== 1 ||
        compScreenshotDispatchGeneration(record) !== input.dispatchGeneration ||
        !["upload_started", "ambiguous"].includes(record.state)
      ) {
        return false;
      }
      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "absent",
        updatedAt: iso(input.nowMs),
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(),
        executionAudit(next, "deterministic_no_effect"),
      );
      return true;
    });
  }

  async createRollbackPreview(
    record: CompScreenshotRollbackPreviewRecord,
  ): Promise<void> {
    const ref = this.rollbackPreviewRef(record.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data() as CompScreenshotRollbackPreviewRecord;
        if (canonicalJson(existing) !== canonicalJson(record)) {
          throw new Error("Comp screenshot rollback preview hash collision.");
        }
        return;
      }
      transaction.create(ref, record);
      transaction.create(this.auditRef(), rollbackPreviewAudit(record));
    });
  }

  async getRollbackPreview(
    id: string,
  ): Promise<CompScreenshotRollbackPreviewRecord | null> {
    const snapshot = await this.rollbackPreviewRef(id).get();
    return snapshot.exists
      ? (snapshot.data() as CompScreenshotRollbackPreviewRecord)
      : null;
  }

  async claimRollback(input: {
    previewHash: string;
    rollbackId: string;
    executionId: string;
    leaseId: string;
    actorUid: string;
    nowMs: number;
    observedExplicitTrash?: boolean;
  }): Promise<ClaimCompScreenshotRollbackResult> {
    const previewRef = this.rollbackPreviewRef(input.previewHash);
    const executionRef = this.executionRef(input.executionId);
    const canonicalLeaseId = input.leaseId.trim();
    let recordIdentity: ReturnType<typeof compScreenshotRecordIdentity> | null = null;
    try {
      recordIdentity = compScreenshotRecordIdentity(canonicalLeaseId);
    } catch {
      return { status: "mismatch" };
    }
    if (!recordIdentity) return { status: "mismatch" };
    const progressRef = this.db
      .collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress)
      .doc(progressDocId(canonicalLeaseId));
    return this.db.runTransaction(async (transaction) => {
      const [previewSnapshot, executionSnapshot, progressSnapshot] = await Promise.all([
        transaction.get(previewRef),
        transaction.get(executionRef),
        transaction.get(progressRef),
      ]);
      const record = executionSnapshot.exists
        ? (executionSnapshot.data() as CompScreenshotExecutionRecord)
        : null;
      if (!previewSnapshot.exists || !record) {
        return {
          status: "mismatch" as const,
          ...(record ? { record } : {}),
        };
      }
      const preview = previewSnapshot.data() as CompScreenshotRollbackPreviewRecord;
      if (
        record.renewalRecordHash !== recordIdentity.renewalRecordHash ||
        record.compRecordHash !== recordIdentity.compRecordHash ||
        preview.rollbackId !== input.rollbackId ||
        preview.binding.executionId !== input.executionId ||
        (preview.recoveryActorUid ?? preview.binding.actorUid) !== input.actorUid ||
        (preview.recoveryActorUid !== undefined && !input.observedExplicitTrash) ||
        preview.bindingHash !== compScreenshotRollbackBindingHash(preview.binding) ||
        !record.receipt ||
        preview.binding.originalResultHash !== record.receipt.resultHash ||
        preview.binding.fileId !== record.reservedFileId
      ) {
        return { status: "mismatch" as const, record };
      }
      if (preview.expiresAtMs <= input.nowMs) {
        return { status: "expired" as const, record };
      }
      if (record.rollback) {
        const lineageChanged =
          record.rollback.id !== input.rollbackId ||
          record.rollback.bindingHash !== preview.bindingHash;
        if (lineageChanged) {
          if (
            record.rollback.state !== "failed" ||
            input.observedExplicitTrash ||
            record.state !== "delivered"
          ) {
            return { status: "mismatch" as const, record };
          }
          const priorRollback = record.rollback;
          const now = iso(input.nowMs);
          const rollback: CompScreenshotRollbackRecord = {
            id: input.rollbackId,
            bindingHash: preview.bindingHash,
            previewHash: preview.id,
            actorUid: input.actorUid,
            state: "running",
            attemptCount: 1,
            dispatchGeneration: 1,
            dispatchLeaseExpiresAtMs:
              input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
            createdAt: now,
            updatedAt: now,
          };
          const next: CompScreenshotExecutionRecord = {
            ...record,
            rollback,
            updatedAt: now,
          };
          transaction.set(executionRef, next);
          clearMatchingProgressScreenshot(
            transaction,
            progressRef,
            progressSnapshot,
            next,
            canonicalLeaseId,
            input.actorUid,
          );
          transaction.create(
            this.auditRef(),
            rollbackLineageRestartAudit(next, priorRollback, rollback),
          );
          return {
            status: "claimed" as const,
            record: next,
            rollback,
            dispatchGeneration: 1,
            dispatchLeaseExpiresAtMs: rollback.dispatchLeaseExpiresAtMs!,
          };
        }
        if (record.rollback.state === "succeeded" && record.rollback.receipt) {
          if (
            record.rollback.previewHash !== preview.id ||
            record.rollback.receipt.previewHash !== preview.id
          ) {
            return { status: "mismatch" as const, record };
          }
          return {
            status: "duplicate" as const,
            record,
            receipt: record.rollback.receipt,
          };
        }
        const currentGeneration = compScreenshotRollbackDispatchGeneration(
          record.rollback,
        );
        if (
          input.observedExplicitTrash &&
          (record.rollback.state === "running" || record.rollback.state === "ambiguous")
        ) {
          const dispatchGeneration = currentGeneration + 1;
          if (!isDispatchGeneration(dispatchGeneration)) {
            return { status: "consumed" as const, record };
          }
          const dispatchLeaseExpiresAtMs =
            input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS;
          const rollback: CompScreenshotRollbackRecord = {
            ...record.rollback,
            previewHash: preview.id,
            dispatchGeneration,
            dispatchLeaseExpiresAtMs,
            updatedAt: iso(input.nowMs),
          };
          const next: CompScreenshotExecutionRecord = {
            ...record,
            rollback,
            updatedAt: rollback.updatedAt,
          };
          transaction.set(executionRef, next);
          clearMatchingProgressScreenshot(
            transaction,
            progressRef,
            progressSnapshot,
            next,
            canonicalLeaseId,
            input.actorUid,
          );
          transaction.create(this.auditRef(), {
            ...rollbackAudit(next, rollback, "rollback_effect_recovered"),
            ...(preview.recoveryActorUid
              ? {
                  original_actor_uid: rollback.actorUid,
                  recovery_actor_uid: preview.recoveryActorUid,
                }
              : {}),
          });
          return {
            status: "retry" as const,
            record: next,
            rollback,
            dispatchGeneration,
            dispatchLeaseExpiresAtMs,
          };
        }
        if (record.rollback.state === "running") {
          if (isCompScreenshotRollbackDispatchLeaseActive(record.rollback, input.nowMs)) {
            return { status: "in_progress" as const, record };
          }
        }
        if (
          record.rollback.state === "running" ||
          record.rollback.state === "ambiguous" ||
          record.rollback.state === "failed"
        ) {
          const dispatchGeneration = currentGeneration + 1;
          if (!Number.isSafeInteger(dispatchGeneration) || dispatchGeneration < 1) {
            return { status: "consumed" as const, record };
          }
          const dispatchLeaseExpiresAtMs =
            input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS;
          const rollback: CompScreenshotRollbackRecord = {
            ...record.rollback,
            previewHash: preview.id,
            state: "running",
            dispatchGeneration,
            dispatchLeaseExpiresAtMs,
            updatedAt: iso(input.nowMs),
          };
          const next: CompScreenshotExecutionRecord = {
            ...record,
            rollback,
            updatedAt: rollback.updatedAt,
          };
          transaction.set(executionRef, next);
          clearMatchingProgressScreenshot(
            transaction,
            progressRef,
            progressSnapshot,
            next,
            canonicalLeaseId,
            input.actorUid,
          );
          transaction.create(
            this.auditRef(),
            rollbackAudit(next, rollback, "rollback_retried"),
          );
          return {
            status: "retry" as const,
            record: next,
            rollback,
            dispatchGeneration,
            dispatchLeaseExpiresAtMs,
          };
        }
        return { status: "consumed" as const, record };
      }
      if (input.observedExplicitTrash) {
        return { status: "mismatch" as const, record };
      }
      if (record.state !== "delivered") {
        return { status: "consumed" as const, record };
      }

      const now = iso(input.nowMs);
      const rollback: CompScreenshotRollbackRecord = {
        id: input.rollbackId,
        bindingHash: preview.bindingHash,
        previewHash: preview.id,
        actorUid: input.actorUid,
        state: "running",
        attemptCount: 1,
        dispatchGeneration: 1,
        dispatchLeaseExpiresAtMs:
          input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
        createdAt: now,
        updatedAt: now,
      };
      const next: CompScreenshotExecutionRecord = { ...record, rollback };
      transaction.set(executionRef, next);
      clearMatchingProgressScreenshot(
        transaction,
        progressRef,
        progressSnapshot,
        next,
        canonicalLeaseId,
        input.actorUid,
      );
      transaction.create(
        this.auditRef(),
        rollbackAudit(next, rollback, "rollback_claimed"),
      );
      return {
        status: "claimed" as const,
        record: next,
        rollback,
        dispatchGeneration: 1,
        dispatchLeaseExpiresAtMs: rollback.dispatchLeaseExpiresAtMs!,
      };
    });
  }

  async finishRollback(
    executionId: string,
    dispatchGeneration: number,
    receipt: CompScreenshotRollbackReceipt,
  ): Promise<CompScreenshotRollbackReceipt> {
    const ref = this.executionRef(executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new Error("Comp screenshot rollback execution is missing.");
      }
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (!record.rollback) {
        throw new Error("Comp screenshot rollback execution is missing.");
      }
      if (record.rollback.state === "succeeded" && record.rollback.receipt) {
        if (sameCompScreenshotRollbackReceipt(record.rollback.receipt, receipt)) {
          return record.rollback.receipt;
        }
        const currentGeneration = compScreenshotRollbackDispatchGeneration(
          record.rollback,
        );
        const staleGeneration =
          isDispatchGeneration(dispatchGeneration) &&
          dispatchGeneration < currentGeneration;
        const stalePreviewAtCurrentGeneration =
          dispatchGeneration === currentGeneration &&
          receipt.previewHash !== record.rollback.receipt.previewHash;
        if (staleGeneration || stalePreviewAtCurrentGeneration) {
          const previewSnapshot = await transaction.get(
            this.rollbackPreviewRef(receipt.previewHash),
          );
          if (
            previewSnapshot.exists &&
            compScreenshotRollbackReceiptMatchesLineage(
              record,
              receipt,
              previewSnapshot.data() as CompScreenshotRollbackPreviewRecord,
            )
          ) {
            return record.rollback.receipt;
          }
        }
        throw new Error("Comp screenshot rollback has a conflicting receipt.");
      }
      if (
        !["running", "ambiguous"].includes(record.rollback.state) ||
        compScreenshotRollbackDispatchGeneration(record.rollback) !==
          dispatchGeneration ||
        receipt.rollbackId !== record.rollback.id ||
        receipt.executionId !== record.id ||
        receipt.previewHash !== record.rollback.previewHash ||
        receipt.fileId !== record.reservedFileId
      ) {
        throw new Error(
          `Comp screenshot rollback receipt cannot finish ${record.rollback.state}.`,
        );
      }

      const rollback: CompScreenshotRollbackRecord = {
        ...record.rollback,
        state: "succeeded",
        receipt,
        updatedAt: receipt.createdAt,
      };
      const next: CompScreenshotExecutionRecord = {
        ...record,
        state: "rolled_back",
        rollback,
        updatedAt: receipt.createdAt,
      };
      transaction.set(ref, next);
      transaction.create(this.auditRef(), rollbackAudit(next, rollback, "rolled_back"));
      return receipt;
    });
  }

  async markRollbackAmbiguous(
    input: MarkCompScreenshotRollbackStateInput,
  ): Promise<boolean> {
    return this.markRollbackState(input, "ambiguous");
  }

  async markRollbackFailed(
    input: MarkCompScreenshotRollbackStateInput,
  ): Promise<boolean> {
    return this.markRollbackState(input, "failed");
  }

  private async markRollbackState(
    input: MarkCompScreenshotRollbackStateInput,
    state: "ambiguous" | "failed",
  ): Promise<boolean> {
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as CompScreenshotExecutionRecord;
      if (
        !record.rollback ||
        record.rollback.id !== input.rollbackId ||
        record.rollback.previewHash !== input.previewHash ||
        compScreenshotRollbackDispatchGeneration(record.rollback) !==
          input.dispatchGeneration ||
        record.rollback.state === "succeeded" ||
        (record.rollback.state === "failed" && state === "ambiguous")
      ) {
        return false;
      }
      if (record.rollback.state === state) {
        return true;
      }
      const rollback: CompScreenshotRollbackRecord = {
        ...record.rollback,
        state,
        updatedAt: iso(input.nowMs),
      };
      const next: CompScreenshotExecutionRecord = {
        ...record,
        rollback,
        updatedAt: rollback.updatedAt,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(),
        rollbackAudit(next, rollback, `rollback_${state}`),
      );
      return true;
    });
  }

  private previewRef(id: string) {
    return this.db.collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.previews).doc(id);
  }

  private executionRef(id: string) {
    return this.db.collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.executions).doc(id);
  }

  private headRef(compRecordHash: string) {
    return this.db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.heads)
      .doc(hashExecutionPreview({ compRecordHash }));
  }

  private rollbackPreviewRef(id: string) {
    return this.db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.rollbackPreviews)
      .doc(id);
  }

  private auditRef() {
    return this.db.collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit).doc(uuidv7());
  }
}

function existingClaimResult(
  record: CompScreenshotExecutionRecord,
  preview: CompScreenshotPreviewRecord,
): ClaimCompScreenshotResult {
  if (
    record.bindingHash !== preview.bindingHash ||
    record.actorUid !== preview.binding.actorUid
  ) {
    return { status: "mismatch", record };
  }
  if (record.state === "delivered" && record.receipt) {
    return { status: "duplicate", record, receipt: record.receipt };
  }
  if (record.state === "ambiguous") {
    return { status: "ambiguous", record };
  }
  if (
    record.state === "claimed" ||
    record.state === "id_reserved" ||
    record.state === "upload_started"
  ) {
    return { status: "in_progress", record };
  }
  return { status: "consumed", record };
}

function previewAudit(record: CompScreenshotPreviewRecord) {
  return {
    schema_version: 1,
    action: "preview_created",
    action_key: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    execution_id: record.executionId,
    preview_hash: record.id,
    binding_hash: record.bindingHash,
    renewal_record_hash: record.binding.renewalRecordHash,
    comp_record_hash: record.binding.compRecordHash,
    created_at: iso(record.issuedAtMs),
  };
}

function executionAudit(record: CompScreenshotExecutionRecord, action: string) {
  return {
    schema_version: 1,
    action,
    action_key: record.actionKey,
    execution_id: record.id,
    preview_hash: record.previewHash,
    binding_hash: record.bindingHash,
    renewal_record_hash: record.renewalRecordHash,
    comp_record_hash: record.compRecordHash,
    provider_identity_hash: record.providerIdentityHash,
    state: record.state,
    attempt_count: record.attemptCount,
    created_at: record.updatedAt,
    ...(record.dispatchGeneration
      ? { dispatch_generation: record.dispatchGeneration }
      : {}),
    ...(record.dispatchLeaseExpiresAtMs
      ? { dispatch_lease_expires_at_ms: record.dispatchLeaseExpiresAtMs }
      : {}),
    ...(record.predecessorExecutionId
      ? { predecessor_execution_id: record.predecessorExecutionId }
      : {}),
    ...(record.reservedFileId ? { provider_file_id: record.reservedFileId } : {}),
    ...(record.folderMetadataHash
      ? { folder_metadata_hash: record.folderMetadataHash }
      : {}),
    ...(record.folderVersion ? { folder_version: record.folderVersion } : {}),
    ...(record.receipt
      ? {
          receipt_id: record.receipt.receiptId,
          provider_metadata_hash: record.receipt.providerMetadataHash,
          result_hash: record.receipt.resultHash,
          reconciled: record.receipt.reconciled,
        }
      : {}),
  };
}

function rollbackPreviewAudit(record: CompScreenshotRollbackPreviewRecord) {
  return {
    schema_version: 1,
    action: "rollback_preview_created",
    action_key: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    execution_id: record.binding.executionId,
    rollback_id: record.rollbackId,
    preview_hash: record.id,
    binding_hash: record.bindingHash,
    original_receipt_id: record.binding.originalReceiptId,
    provider_file_id: record.binding.fileId,
    provider_identity_hash: record.binding.providerIdentityHash,
    provider_metadata_hash: record.binding.providerMetadataHash,
    ...(record.recoveryActorUid ? { recovery_actor_uid: record.recoveryActorUid } : {}),
    created_at: iso(record.issuedAtMs),
  };
}

function rollbackAudit(
  record: CompScreenshotExecutionRecord,
  rollback: CompScreenshotRollbackRecord,
  action: string,
) {
  return {
    schema_version: 1,
    action,
    action_key: record.actionKey,
    execution_id: record.id,
    rollback_id: rollback.id,
    preview_hash: rollback.previewHash,
    binding_hash: rollback.bindingHash,
    provider_file_id: record.reservedFileId,
    state: rollback.state,
    attempt_count: rollback.attemptCount,
    dispatch_generation: compScreenshotRollbackDispatchGeneration(rollback),
    dispatch_lease_expires_at_ms: rollback.dispatchLeaseExpiresAtMs ?? null,
    created_at: rollback.updatedAt,
    ...(rollback.receipt
      ? {
          receipt_id: rollback.receipt.receiptId,
          original_receipt_id: rollback.receipt.originalReceiptId,
          provider_metadata_hash_before: rollback.receipt.providerMetadataHashBefore,
          provider_metadata_hash_after: rollback.receipt.providerMetadataHashAfter,
          result_hash: rollback.receipt.resultHash,
          reconciled: rollback.receipt.reconciled,
        }
      : {}),
  };
}

function rollbackLineageRestartAudit(
  record: CompScreenshotExecutionRecord,
  prior: CompScreenshotRollbackRecord,
  next: CompScreenshotRollbackRecord,
) {
  return {
    ...rollbackAudit(record, next, "rollback_lineage_restarted"),
    prior_rollback_id: prior.id,
    prior_binding_hash: prior.bindingHash,
    prior_state: prior.state,
    prior_dispatch_generation: compScreenshotRollbackDispatchGeneration(prior),
  };
}

function clearMatchingProgressScreenshot(
  transaction: Transaction,
  progressRef: DocumentReference,
  snapshot: DocumentSnapshot,
  record: CompScreenshotExecutionRecord,
  leaseId: string,
  actorUid: string,
) {
  const data = snapshot.exists ? snapshot.data() : undefined;
  const ownerDecision = isRecord(data?.owner_decision) ? data.owner_decision : null;
  const market = isRecord(ownerDecision?.market) ? ownerDecision.market : null;
  if (
    !record.receipt ||
    !market ||
    data?.lease_id !== leaseId ||
    market.comp_screenshot_ref !== record.receipt.ref ||
    market.comp_screenshot_execution_id !== record.id ||
    market.comp_screenshot_receipt_id !== record.receipt.receiptId ||
    market.comp_screenshot_result_hash !== record.receipt.resultHash
  ) {
    return;
  }
  transaction.update(progressRef, {
    "owner_decision.market.comp_screenshot_ref": FieldValue.delete(),
    "owner_decision.market.comp_screenshot_execution_id": FieldValue.delete(),
    "owner_decision.market.comp_screenshot_receipt_id": FieldValue.delete(),
    "owner_decision.market.comp_screenshot_result_hash": FieldValue.delete(),
    updated_by_uid: actorUid,
    updated_at: FieldValue.serverTimestamp(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDriveFileId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

function isDispatchGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function validFolderEvidence(evidence: CompScreenshotFolderEvidence): boolean {
  return (
    /^[a-f0-9]{64}$/.test(evidence.folderMetadataHash) &&
    /^\d+$/.test(evidence.folderVersion)
  );
}

function iso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}
