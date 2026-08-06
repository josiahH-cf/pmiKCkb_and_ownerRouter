// Route-facing immutable action contract for the LIVE append-only Sheet write-back.
//
// The route and this service both enforce the exact Action Registry key plus Production+Live
// descriptor. Preview is read-only and server-issued. Commit accepts only that exact unexpired
// preview, proves the provider has the required stable-row atomic primitive before any live Sheet
// read or durable claim, writes one empty cell, reads it back, and persists a bodyless receipt. An
// uncertain result is reconciled by read only. The one provider-side absent-key tombstone is a
// mutation and therefore repeats the runtime gate immediately before that call. Correction has its
// own exact preview and clears only the value proven by the original receipt.

import { randomUUID } from "node:crypto";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertLiveProviderActionAllowed,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getWritebackApproval } from "@/lib/firestore/lease-renewal-writeback-approvals";
import { getLeaseRenewalResolution } from "@/lib/firestore/lease-renewal-resolutions";
import { FirestoreSheetWritebackExecutionStore } from "@/lib/firestore/lease-renewal-writeback-executions";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import {
  GoogleSheetsApiWriter,
  type SheetsAnchoredMutationWriter,
} from "@/lib/google-sheets/write-client";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { invalidateLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { rebuildLiveRenewalRun } from "@/lib/lease-renewal/live-review";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import {
  RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
  buildSheetWritebackCorrectionPreview,
  buildSheetWritebackPreview,
  buildSheetWritebackReceipt,
  sheetWritebackProviderPayloadHash,
  sheetWritebackBindingMatches,
  type ClaimSheetWritebackResult,
  type SheetWritebackActionBinding,
  type SheetWritebackExecutionRecord,
  type SheetWritebackExecutionStore,
  type SheetWritebackPreviewRecord,
  type SheetWritebackReceipt,
} from "@/lib/lease-renewal/sheet-writeback-contract";
import {
  correctWritebackAtExactCell,
  inspectAnchoredWritebackTarget,
  resolveWritebackTarget,
  type ResolvedWritebackTarget,
  type RowWritebackPlan,
} from "@/lib/lease-renewal/sheet-writeback-execution";
import {
  hashSheetCellValue,
  isSheetWritebackEnabled,
} from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";

export { RENEWAL_SHEET_WRITEBACK_ACTION_KEY };

const APPEND_ONLY_COLUMN_PREFIX = "KB Proposed";
export const SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS = 15 * 60 * 1_000;

export type SheetWritebackContractErrorCode =
  | "attempt_ambiguous"
  | "attempt_consumed"
  | "attempt_in_progress"
  | "confirmation_required"
  | "correction_unavailable"
  | "preview_expired"
  | "preview_mismatch"
  | "preview_not_found"
  | "preview_stale";

export class SheetWritebackContractError extends EditableLayerError {
  constructor(
    message: string,
    public readonly code: SheetWritebackContractErrorCode,
  ) {
    super(message, 409);
    this.name = "SheetWritebackContractError";
  }
}

export interface WritebackPreviewReference {
  executionId: string;
  hash: string;
  expiresAt: string;
}

export type ResolvedWritebackTargetView = Pick<
  ResolvedWritebackTarget,
  "a1" | "proposedColumnHeader" | "proposedValue" | "rowValues"
>;

export type WritebackExecuteOutcome =
  | { status: "disabled" }
  | { status: "not_configured" }
  | { status: "read_error" }
  | { status: "flag_not_found" }
  | { status: "not_approved"; reason: string }
  | {
      status: "resolved";
      target: ResolvedWritebackTargetView;
      preview: WritebackPreviewReference;
    }
  | {
      status: "correction_resolved";
      target: { a1: string; currentValue: string; originalReceiptId: string };
      preview: WritebackPreviewReference;
    }
  | {
      status: "written" | "corrected";
      a1: string;
      receipt: SheetWritebackReceipt;
      duplicate: boolean;
      readbackWarning?: string;
    }
  | {
      status: "needs_reconciliation";
      executionId: string;
      operation: "write" | "correction";
      reason: string;
    }
  | {
      status: "in_progress";
      executionId: string;
      operation: "write" | "correction";
      reason: string;
    }
  | { status: "no_execution" }
  | {
      status: "absent";
      executionId: string;
      operation: "write" | "correction";
      approvalVersion: string;
      reason: string;
      /** Direct successful-write identity used to start a new correction lineage child. */
      originalExecutionId?: string;
    }
  | { status: "blocked"; reason: string };

export interface WritebackExecuteInput {
  runId: string;
  sourceTriggerKey: string;
  operation?: "write" | "reconcile" | "correction" | "status";
  /** false previews; true commits. A true value is never sufficient without both exact IDs. */
  confirm: boolean;
  executionId?: string;
  previewHash?: string;
}

export interface WritebackRecoveryDeps {
  /** Synchronous provider-capability probe; it must not read provider or customer data. */
  supportsStableRowAtomicMutation: () => boolean;
  createWriter: () => SheetsAnchoredMutationWriter;
  store: SheetWritebackExecutionStore;
  now: () => Date;
}

export interface WritebackExecuteDeps extends WritebackRecoveryDeps {
  rebuildRun: (readTimestamp: string) => Promise<RenewalRunResult | null>;
  loadApproval: (
    actor: AuthenticatedUser,
    sourceTriggerKey: string,
  ) => Promise<LeaseRenewalWritebackApprovalRecord | null>;
  loadResolution: (
    actor: AuthenticatedUser,
    sourceTriggerKey: string,
  ) => Promise<LeaseRenewalResolutionRecord | null>;
  spreadsheetId: string;
  nonce: () => string;
}

export interface WritebackExecutionContext {
  descriptor: EnvironmentDescriptor;
  /** Test seam only. Production callers omit this and read the committed seed. */
  registry?: CreateActionRegistryInput[];
}

export async function assertSheetWritebackExecutionAllowed(
  context: WritebackExecutionContext,
  mode: "mutating" | "recovery" = "mutating",
): Promise<void> {
  assertLiveProviderActionAllowed(context.descriptor);
  if (mode === "mutating") {
    await assertProductionRuntimeActionExecutable(
      RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
      context.registry,
    );
  }
}

/** Build control-plane dependencies only. The live Sheets writer stays lazy until every guard wins. */
export function buildLiveWritebackDeps():
  | WritebackExecuteDeps
  | { status: "not_configured" } {
  const config = buildLiveRenewalConfig();
  if (!config.ok) return { status: "not_configured" };
  return {
    ...buildLiveWritebackRecoveryDeps(),
    rebuildRun: rebuildLiveRenewalRun,
    loadApproval: getWritebackApproval,
    loadResolution: getLeaseRenewalResolution,
    spreadsheetId: config.spreadsheetId,
    nonce: randomUUID,
  };
}

export function buildLiveWritebackRecoveryDeps(): WritebackRecoveryDeps {
  return {
    supportsStableRowAtomicMutation: () =>
      typeof (GoogleSheetsApiWriter.prototype as SheetsAnchoredMutationWriter)
        .mutateAnchoredCellIfMatch === "function" &&
      typeof (GoogleSheetsApiWriter.prototype as SheetsAnchoredMutationWriter)
        .getAnchoredMutationStatus === "function" &&
      typeof (GoogleSheetsApiWriter.prototype as SheetsAnchoredMutationWriter)
        .tombstoneAnchoredMutationIfAbsent === "function",
    createWriter: () => new GoogleSheetsApiWriter(),
    store: new FirestoreSheetWritebackExecutionStore(),
    now: () => new Date(),
  };
}

export async function prepareOrCommitWriteback(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  readTimestamp: string,
  deps: WritebackExecuteDeps | WritebackRecoveryDeps,
  executionContext: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  const operation = input.operation ?? "write";
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Admin access is required for Sheet actions.", 403);
  }
  await assertSheetWritebackExecutionAllowed(
    executionContext,
    operation === "reconcile" || operation === "status" ? "recovery" : "mutating",
  );
  assertSheetWritebackRequestIdentifiers(input);
  if (operation === "status") {
    return loadWritebackStatus(actor, input, deps, executionContext);
  }
  if (operation === "reconcile") {
    return reconcileWriteback(actor, input, deps, executionContext);
  }
  if (!isSheetWritebackEnabled()) {
    return { status: "disabled" };
  }

  const executeDeps = requireExecuteDeps(deps);
  if (operation === "correction") {
    return input.confirm
      ? commitCorrection(actor, input, executeDeps, executionContext)
      : previewCorrection(actor, input, executeDeps, executionContext);
  }
  return input.confirm
    ? commitWriteback(actor, input, readTimestamp, executeDeps, executionContext)
    : previewWriteback(actor, input, readTimestamp, executeDeps, executionContext);
}

async function previewWriteback(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  readTimestamp: string,
  deps: WritebackExecuteDeps,
  context: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  if (!deps.supportsStableRowAtomicMutation()) {
    return {
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. The action key must stay closed.",
    };
  }
  const current = await loadCurrentApprovedPlan(actor, input, readTimestamp, deps);
  if ("outcome" in current) return current.outcome;
  const predecessorExecutionId = await resolveWritePredecessor(input, current, deps);

  try {
    const writer = deps.createWriter();
    if (
      !writer.mutateAnchoredCellIfMatch ||
      !writer.getAnchoredMutationStatus ||
      !writer.tombstoneAnchoredMutationIfAbsent
    ) {
      return {
        status: "blocked",
        reason:
          "The Sheets provider has no stable-row atomic mutation capability. The action key must stay closed.",
      };
    }
    const resolved = await resolveWritebackTarget(writer, current.plan);
    if (resolved.status === "disabled") return { status: "disabled" };
    if (resolved.status === "blocked") {
      return { status: "blocked", reason: resolved.reason };
    }
    const nowMs = deps.now().getTime();
    const preview = buildSheetWritebackPreview({
      actorUid: actor.uid,
      runId: input.runId,
      sourceTriggerKey: input.sourceTriggerKey,
      propertyKey: current.plan.propertyKey,
      fieldKey: current.plan.fieldKey,
      approvalId: current.approval.id,
      approvalVersion: current.approval.updated_at,
      sourceOfValue: current.approval.source_of_value,
      descriptor: context.descriptor,
      target: {
        spreadsheetId: deps.spreadsheetId,
        tabName: current.plan.tabName,
        a1: resolved.target.a1,
        rowIndex: current.plan.rowIndex,
        proposedColumnHeader: current.plan.proposedColumnHeader,
        anchorHeaders: resolved.target.anchorHeaders,
        rowAnchorHash: resolved.target.rowAnchorHash,
        anchorColumnCount: resolved.target.anchorColumnCount,
      },
      proposedValue: current.plan.proposedValue,
      nowMs,
      nonce: deps.nonce(),
      predecessorExecutionId,
    });
    await deps.store.createPreview(preview);
    return {
      status: "resolved",
      target: publicResolvedTarget(resolved.target),
      preview: previewReference(preview),
    };
  } catch {
    return { status: "read_error" };
  }
}

async function commitWriteback(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  readTimestamp: string,
  deps: WritebackExecuteDeps,
  context: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  const preview = await requirePreview(actor, input, deps, context, "write");
  const existing = await deps.store.getExecution(preview.executionId);
  if (existing) return existingAttemptOutcome(existing, preview);

  if (!deps.supportsStableRowAtomicMutation()) {
    return {
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. The action key must stay closed.",
    };
  }
  const current = await loadCurrentApprovedPlan(actor, input, readTimestamp, deps);
  if ("outcome" in current) {
    throw new SheetWritebackContractError(
      "The approval or source snapshot changed. Prepare a new write preview.",
      "preview_stale",
    );
  }
  const binding = writeBinding(actor, input, current, preview, context);
  if (!sheetWritebackBindingMatches(preview, binding)) {
    throw new SheetWritebackContractError(
      "The actor, approval, value, target, or environment changed. Prepare again.",
      "preview_stale",
    );
  }

  const writer = deps.createWriter();
  if (
    !writer.mutateAnchoredCellIfMatch ||
    !writer.getAnchoredMutationStatus ||
    !writer.tombstoneAnchoredMutationIfAbsent
  ) {
    return {
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. The action key must stay closed.",
    };
  }

  const claim = await deps.store.claim({
    previewHash: preview.id,
    executionId: preview.executionId,
    actorUid: actor.uid,
    nowMs: deps.now().getTime(),
    authorization: {
      sourceTriggerKey: input.sourceTriggerKey,
      runId: input.runId,
      propertyKey: current.plan.propertyKey,
      fieldKey: current.plan.fieldKey,
      approvalId: current.approval.id,
      approvalVersion: current.approval.updated_at,
      sourceOfValue: current.approval.source_of_value,
      proposedValueHash: hashSheetCellValue(current.plan.proposedValue),
    },
  });
  const duplicate = duplicateOutcome(claim);
  if (duplicate) return duplicate;
  const record = requireClaimed(claim);

  let updateAttempted = false;
  try {
    const resolved = await resolveWritebackTarget(writer, current.plan);
    if (resolved.status === "disabled") {
      await deps.store.markOutcome(record.id, "failed", deps.now().getTime());
      return { status: "disabled" };
    }
    if (
      resolved.status === "blocked" ||
      !sameResolvedTargetIdentity(record, resolved.target)
    ) {
      await deps.store.markOutcome(record.id, "failed", deps.now().getTime());
      throw new SheetWritebackContractError(
        resolved.status === "blocked"
          ? `The Sheet target changed: ${resolved.reason}.`
          : "The resolved Sheet row, column, or cell changed after preview.",
        "preview_stale",
      );
    }
    updateAttempted = true;
    const mutation = await writer.mutateAnchoredCellIfMatch({
      idempotencyKey: record.id,
      payloadHash: sheetWritebackProviderPayloadHash(record),
      target: record.target,
      expectedValue: "",
      replacementValue: current.plan.proposedValue,
    });
    if (mutation.status === "mismatch") {
      updateAttempted = false;
      await deps.store.markOutcome(record.id, "failed", deps.now().getTime());
      throw new SheetWritebackContractError(
        `The stable Sheet target changed before the atomic append (${mutation.reason}). No value was overwritten.`,
        "preview_stale",
      );
    }
    const candidateReceipt = buildSheetWritebackReceipt(record, mutation, false);
    const receipt = await deps.store.finish(record.id, candidateReceipt);
    // S58: our own successful write invalidates the shared live lease read rather than waiting out
    // the TTL. A future RentVine write path joins this same invalidation point.
    invalidateLiveLeaseCache();
    let readbackWarning: string | undefined;
    try {
      const readback = await inspectAnchoredWritebackTarget(
        writer,
        deps.spreadsheetId,
        record.target,
      );
      if (readback.status === "blocked") {
        readbackWarning = `The provider applied the effect, but current Sheet structure differs (${readback.reason}).`;
      } else if (readback.a1 !== receipt.verifiedA1) {
        readbackWarning =
          "The provider applied the effect, but the logical row has since moved to a different Sheet coordinate.";
      } else if (readback.currentValue !== current.plan.proposedValue) {
        readbackWarning =
          "The provider applied the effect, but the current Sheet value has since drifted.";
      }
    } catch {
      readbackWarning =
        "The provider applied the effect; current Sheet corroboration is temporarily unavailable.";
    }
    return {
      status: "written",
      a1: receipt.verifiedA1,
      receipt,
      duplicate: false,
      ...(readbackWarning ? { readbackWarning } : {}),
    };
  } catch (error) {
    if (error instanceof SheetWritebackContractError) throw error;
    await safeMarkOutcome(
      deps.store,
      record.id,
      updateAttempted ? "ambiguous" : "failed",
      deps.now().getTime(),
    );
    return updateAttempted
      ? needsReconciliation(
          record,
          "The one Sheet attempt has no definitive result. Reconcile before any correction.",
        )
      : {
          status: "blocked",
          reason:
            "The one attempt was consumed before a write could be verified. Prepare again only after a fresh approval.",
        };
  }
}

async function previewCorrection(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  deps: WritebackExecuteDeps,
  context: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  if (!deps.supportsStableRowAtomicMutation()) {
    return {
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. Correction is unavailable.",
    };
  }
  const original = await requireExecution(actor, input, deps, context);
  if (
    original.operation !== "write" ||
    original.state !== "succeeded" ||
    !original.receipt
  ) {
    throw new SheetWritebackContractError(
      "A successful write receipt is required before correction.",
      "correction_unavailable",
    );
  }
  const predecessorExecutionId = await resolveCorrectionPredecessor(original, deps);
  try {
    const writer = deps.createWriter();
    if (
      !writer.mutateAnchoredCellIfMatch ||
      !writer.getAnchoredMutationStatus ||
      !writer.tombstoneAnchoredMutationIfAbsent
    ) {
      return {
        status: "blocked",
        reason:
          "The Sheets provider has no stable-row atomic mutation capability. Correction is unavailable.",
      };
    }
    const anchored = await inspectAnchoredWritebackTarget(
      writer,
      original.target.spreadsheetId,
      original.target,
    );
    if (anchored.status === "blocked") {
      throw new SheetWritebackContractError(
        `The receipted Sheet target moved or changed (${anchored.reason}) and cannot be cleared.`,
        "correction_unavailable",
      );
    }
    const current = anchored.currentValue;
    if (current === "" || hashSheetCellValue(current) !== original.proposedValueHash) {
      throw new SheetWritebackContractError(
        "The receipted Sheet cell changed and cannot be cleared.",
        "correction_unavailable",
      );
    }
    const preview = buildSheetWritebackCorrectionPreview({
      actorUid: actor.uid,
      descriptor: context.descriptor,
      original,
      target: {
        ...original.target,
        a1: anchored.a1,
        rowIndex: anchored.rowIndex,
        anchorColumnCount: anchored.anchorColumnCount,
      },
      nowMs: deps.now().getTime(),
      nonce: deps.nonce(),
      predecessorExecutionId,
    });
    await deps.store.createPreview(preview);
    return {
      status: "correction_resolved",
      target: {
        a1: anchored.a1,
        currentValue: current,
        originalReceiptId: original.receipt.receiptId,
      },
      preview: previewReference(preview),
    };
  } catch (error) {
    if (error instanceof SheetWritebackContractError) throw error;
    return { status: "read_error" };
  }
}

async function commitCorrection(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  deps: WritebackExecuteDeps,
  context: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  const preview = await requirePreview(actor, input, deps, context, "correction");
  const existing = await deps.store.getExecution(preview.executionId);
  if (existing) return existingAttemptOutcome(existing, preview);

  const originalId = preview.binding.originalExecutionId;
  const original = originalId ? await deps.store.getExecution(originalId) : null;
  if (
    !original ||
    original.operation !== "write" ||
    original.state !== "succeeded" ||
    !original.receipt ||
    !sameCorrectionLineageTarget(original, preview.binding.target) ||
    original.proposedValueHash !== preview.binding.proposedValueHash
  ) {
    throw new SheetWritebackContractError(
      "The original write receipt no longer matches this correction.",
      "preview_stale",
    );
  }
  const expected = buildSheetWritebackCorrectionPreview({
    actorUid: actor.uid,
    descriptor: context.descriptor,
    original,
    target: preview.binding.target,
    nowMs: preview.issuedAtMs,
    nonce: "comparison-only",
    predecessorExecutionId: preview.binding.predecessorExecutionId,
  }).binding;
  if (!sheetWritebackBindingMatches(preview, expected)) {
    throw new SheetWritebackContractError(
      "The correction actor, target, receipt, or environment changed.",
      "preview_stale",
    );
  }

  if (!deps.supportsStableRowAtomicMutation()) {
    return {
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. Correction is unavailable.",
    };
  }
  const writer = deps.createWriter();
  if (
    !writer.mutateAnchoredCellIfMatch ||
    !writer.getAnchoredMutationStatus ||
    !writer.tombstoneAnchoredMutationIfAbsent
  ) {
    return {
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. Correction is unavailable.",
    };
  }

  const claim = await deps.store.claim({
    previewHash: preview.id,
    executionId: preview.executionId,
    actorUid: actor.uid,
    nowMs: deps.now().getTime(),
  });
  const duplicate = duplicateOutcome(claim);
  if (duplicate) return duplicate;
  const record = requireClaimed(claim);

  try {
    const outcome = await correctWritebackAtExactCell(writer, {
      idempotencyKey: record.id,
      payloadHash: sheetWritebackProviderPayloadHash(
        record,
        original.receipt.providerEffectId,
      ),
      expectedEffectId: original.receipt.providerEffectId,
      spreadsheetId: record.target.spreadsheetId,
      a1: record.target.a1,
      tabName: record.target.tabName,
      rowIndex: record.target.rowIndex,
      proposedColumnHeader: record.target.proposedColumnHeader,
      anchorHeaders: record.target.anchorHeaders,
      rowAnchorHash: record.target.rowAnchorHash,
      anchorColumnCount: record.target.anchorColumnCount,
      expectedValueHash: record.proposedValueHash,
    });
    if (outcome.status === "disabled") {
      await deps.store.markOutcome(record.id, "failed", deps.now().getTime());
      return { status: "disabled" };
    }
    if (outcome.status === "blocked") {
      if (
        outcome.reason === "read-after-clear mismatch" ||
        outcome.reason.startsWith(
          "correction target identity changed after atomic clear:",
        )
      ) {
        await deps.store.markOutcome(record.id, "ambiguous", deps.now().getTime());
        return needsReconciliation(record, outcome.reason);
      }
      await deps.store.markOutcome(record.id, "failed", deps.now().getTime());
      throw new SheetWritebackContractError(
        `Correction refused: ${outcome.reason}.`,
        "correction_unavailable",
      );
    }
    const candidateReceipt = buildSheetWritebackReceipt(
      record,
      outcome.providerEffect,
      false,
    );
    const receipt = await deps.store.finish(record.id, candidateReceipt);
    // S58: a successful correction is also our own write; same invalidation point.
    invalidateLiveLeaseCache();
    return {
      status: "corrected",
      a1: receipt.verifiedA1,
      receipt,
      duplicate: false,
      ...(outcome.readbackWarning ? { readbackWarning: outcome.readbackWarning } : {}),
    };
  } catch (error) {
    if (error instanceof SheetWritebackContractError) throw error;
    await safeMarkOutcome(deps.store, record.id, "ambiguous", deps.now().getTime());
    return needsReconciliation(
      record,
      "The one correction attempt has no definitive result. Reconcile it; do not clear again.",
    );
  }
}

async function loadWritebackStatus(
  _actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  deps: WritebackRecoveryDeps,
  context: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  const record = input.executionId
    ? await deps.store.getExecution(input.executionId)
    : await deps.store.getLatestExecution({
        runId: input.runId,
        sourceTriggerKey: input.sourceTriggerKey,
      });
  if (!record) return { status: "no_execution" };
  if (
    record.runId !== input.runId ||
    record.sourceTriggerKey !== input.sourceTriggerKey ||
    !sameDescriptor(record.descriptor, context.descriptor)
  ) {
    throw new SheetWritebackContractError(
      "The durable Sheet action does not match this run or environment.",
      "preview_mismatch",
    );
  }
  if (record.state === "succeeded" && record.receipt) {
    return receiptOutcome(record, record.receipt, true);
  }
  if (record.state === "ambiguous") {
    return needsReconciliation(
      record,
      "The one provider attempt is unresolved. Reconcile it; do not retry.",
    );
  }
  if (record.state === "running") {
    const updatedAtMs = Date.parse(record.updatedAt);
    if (
      Number.isFinite(updatedAtMs) &&
      updatedAtMs + SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS <= deps.now().getTime()
    ) {
      return needsReconciliation(
        record,
        "The provider worker did not finish inside the settle window. Reconcile by read only; do not retry.",
      );
    }
    return {
      status: "in_progress",
      executionId: record.id,
      operation: record.operation,
      reason:
        "The provider attempt is still inside its no-race settle window. Check status again later.",
    };
  }
  return {
    status: "absent",
    executionId: record.id,
    operation: record.operation,
    approvalVersion: record.approvalVersion,
    reason: "The consumed attempt has no successful receipt.",
    ...(record.operation === "correction" && record.originalExecutionId
      ? { originalExecutionId: record.originalExecutionId }
      : {}),
  };
}

async function reconcileWriteback(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  deps: WritebackRecoveryDeps,
  context: WritebackExecutionContext,
): Promise<WritebackExecuteOutcome> {
  const record = await requireExecution(actor, input, deps, context);
  if (record.state === "succeeded" && record.receipt) {
    return receiptOutcome(record, record.receipt, true);
  }
  const nowMs = deps.now().getTime();
  const runningUpdatedAtMs = Date.parse(record.updatedAt);
  if (
    record.state === "running" &&
    (!Number.isFinite(runningUpdatedAtMs) ||
      runningUpdatedAtMs + SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS > nowMs)
  ) {
    throw new SheetWritebackContractError(
      "The Sheet action is still in progress. Reconciliation cannot race its provider attempt.",
      "attempt_in_progress",
    );
  }
  if (record.state === "failed") {
    return absentOutcome(record, "The consumed attempt has no successful receipt.");
  }
  if (!deps.supportsStableRowAtomicMutation()) {
    await safeMarkOutcome(deps.store, record.id, "ambiguous", nowMs);
    return needsReconciliation(
      record,
      "The provider has no exact idempotency-status capability. Cell state alone cannot resolve this attempt.",
    );
  }

  try {
    const writer = deps.createWriter();
    if (
      !writer.mutateAnchoredCellIfMatch ||
      !writer.getAnchoredMutationStatus ||
      !writer.tombstoneAnchoredMutationIfAbsent
    ) {
      await safeMarkOutcome(deps.store, record.id, "ambiguous", nowMs);
      return needsReconciliation(
        record,
        "The provider has no exact idempotency-status capability. Cell state alone cannot resolve this attempt.",
      );
    }
    const original =
      record.operation === "correction" && record.originalExecutionId
        ? await deps.store.getExecution(record.originalExecutionId)
        : null;
    const expectedEffectId =
      record.operation === "correction" ? original?.receipt?.providerEffectId : undefined;
    if (record.operation === "correction" && !expectedEffectId) {
      await safeMarkOutcome(deps.store, record.id, "ambiguous", nowMs);
      return needsReconciliation(
        record,
        "The original provider effect identity is unavailable. The correction cannot be classified.",
      );
    }
    const providerIdentity = {
      idempotencyKey: record.id,
      payloadHash: sheetWritebackProviderPayloadHash(record, expectedEffectId),
      target: record.target,
    };
    let providerStatus = await writer.getAnchoredMutationStatus(providerIdentity);
    if (providerStatus.status === "unknown") {
      // Reading an already-consumed provider key remains available during containment. Creating an
      // absent-key tombstone is a provider control-plane mutation, so it must not inherit that
      // recovery exception.
      await assertSheetWritebackExecutionAllowed(context, "mutating");
      providerStatus = await writer.tombstoneAnchoredMutationIfAbsent(providerIdentity);
    }
    if (providerStatus.status === "pending" || providerStatus.status === "unknown") {
      await safeMarkOutcome(deps.store, record.id, "ambiguous", nowMs);
      const latest = await deps.store.getExecution(record.id);
      if (latest?.state === "succeeded" && latest.receipt) {
        return receiptOutcome(latest, latest.receipt, true);
      }
      return needsReconciliation(
        record,
        `The provider idempotency key is ${providerStatus.status} (${providerStatus.reason}). No retry or successor is allowed.`,
      );
    }
    if (providerStatus.status === "not_applied") {
      await deps.store.markOutcome(record.id, "failed", nowMs);
      const latest = await deps.store.getExecution(record.id);
      if (latest?.state === "succeeded" && latest.receipt) {
        return receiptOutcome(latest, latest.receipt, true);
      }
      return absentOutcome(
        latest ?? record,
        `The provider terminally reports no effect (${providerStatus.reason}).`,
      );
    }

    const candidateReceipt = buildSheetWritebackReceipt(record, providerStatus, true);
    const receipt = await deps.store.finish(record.id, candidateReceipt);
    let readbackWarning: string | undefined;
    const anchored = await inspectAnchoredWritebackTarget(
      writer,
      record.target.spreadsheetId,
      record.target,
    );
    if (anchored.status === "blocked") {
      readbackWarning = `The provider applied the effect, but current Sheet structure differs (${anchored.reason}).`;
    } else if (anchored.a1 !== receipt.verifiedA1) {
      readbackWarning =
        "The provider applied the effect, but the logical row has since moved to a different Sheet coordinate.";
    } else {
      const currentlyMatchesEffect =
        record.operation === "write"
          ? hashSheetCellValue(anchored.currentValue) === record.proposedValueHash
          : anchored.currentValue === "";
      if (!currentlyMatchesEffect) {
        readbackWarning =
          "The provider applied the effect, but the current Sheet value has since drifted.";
      }
    }
    return {
      ...receiptOutcome(record, receipt, false),
      ...(readbackWarning ? { readbackWarning } : {}),
    };
  } catch (error) {
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      throw error;
    }
    const latest = await deps.store.getExecution(record.id);
    if (latest?.state === "succeeded" && latest.receipt) {
      return receiptOutcome(latest, latest.receipt, true);
    }
    await safeMarkOutcome(deps.store, record.id, "ambiguous", deps.now().getTime());
    return needsReconciliation(
      record,
      "The provider status or corroborating Sheet read did not complete. No retry was attempted.",
    );
  }
}

async function loadCurrentApprovedPlan(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  readTimestamp: string,
  deps: WritebackExecuteDeps,
): Promise<
  | {
      plan: RowWritebackPlan;
      approval: LeaseRenewalWritebackApprovalRecord;
    }
  | { outcome: WritebackExecuteOutcome }
> {
  const run = await deps.rebuildRun(readTimestamp);
  if (!run) return { outcome: { status: "read_error" } };
  const matchingFlags = run.flags.filter(
    (candidate) =>
      candidate.queueMapping?.queueItem.source_trigger_key === input.sourceTriggerKey,
  );
  if (matchingFlags.length === 0) {
    return { outcome: { status: "flag_not_found" } };
  }
  const propertyKey = matchingFlags[0]?.propertyKey;
  if (matchingFlags.length !== 1 || !propertyKey) {
    return {
      outcome: {
        status: "blocked",
        reason:
          "The source trigger does not resolve to exactly one canonical property row. No Sheet preview was created.",
      },
    };
  }
  const flag = matchingFlags[0];

  const [approval, resolution] = await Promise.all([
    deps.loadApproval(actor, input.sourceTriggerKey),
    deps.loadResolution(actor, input.sourceTriggerKey),
  ]);
  const proposal = resolution?.proposed_writeback;
  const approvalCurrent =
    approval?.state === "Approved" &&
    approval.run_id === input.runId &&
    approval.id?.trim().length > 0 &&
    approval.updated_at?.trim().length > 0 &&
    resolution?.run_id === input.runId &&
    resolution.status === "Resolved" &&
    proposal?.status === "Queued" &&
    approval.property_key === propertyKey &&
    resolution.property_key === propertyKey &&
    approval.proposed_value === proposal.value &&
    approval.source_of_value === proposal.source_of_value &&
    approval.field_key === flag.fieldKey &&
    approval.field_label === flag.fieldLabel;
  if (!approvalCurrent || !approval) {
    return {
      outcome: {
        status: "not_approved",
        reason:
          "The approval or queued proposal changed. Approve the current proposal before writing.",
      },
    };
  }
  const proposedValue = approval.proposed_value;
  if (proposedValue.trim() === "") {
    return {
      outcome: {
        status: "not_approved",
        reason: "The approved proposal has no value to write.",
      },
    };
  }
  return {
    approval,
    plan: {
      spreadsheetId: deps.spreadsheetId,
      tabName: flag.recordRef.tab,
      propertyKey,
      fieldKey: flag.fieldKey,
      proposedColumnHeader: `${APPEND_ONLY_COLUMN_PREFIX} — ${flag.fieldLabel}`,
      rowIndex: flag.recordRef.sourceRowIndex,
      proposedValue,
    },
  };
}

async function resolveWritePredecessor(
  input: WritebackExecuteInput,
  current: {
    plan: RowWritebackPlan;
    approval: LeaseRenewalWritebackApprovalRecord;
  },
  deps: WritebackExecuteDeps,
): Promise<string | undefined> {
  const latest = await deps.store.getLatestExecution({
    runId: input.runId,
    sourceTriggerKey: input.sourceTriggerKey,
  });
  if (!latest) return undefined;
  if (latest.state === "running") {
    throw new SheetWritebackContractError(
      "A prior Sheet attempt is still in progress. Resolve it before preparing another action.",
      "attempt_in_progress",
    );
  }
  if (latest.state === "ambiguous") {
    throw new SheetWritebackContractError(
      "A prior Sheet attempt is ambiguous. Reconcile it before preparing another action.",
      "attempt_ambiguous",
    );
  }
  if (latest.approvalVersion === current.approval.updated_at) {
    throw new SheetWritebackContractError(
      latest.state === "succeeded"
        ? "This approval version already has a terminal Sheet effect. Use its receipt or revoke and re-approve."
        : "This approval version already consumed its one Sheet attempt. Revoke and re-approve before preparing another write.",
      "attempt_consumed",
    );
  }
  return latest.id;
}

async function resolveCorrectionPredecessor(
  original: SheetWritebackExecutionRecord,
  deps: WritebackExecuteDeps,
): Promise<string> {
  const latest = await deps.store.getLatestExecution({
    runId: original.runId,
    sourceTriggerKey: original.sourceTriggerKey,
  });
  if (!latest) {
    throw new SheetWritebackContractError(
      "The correction lineage head is missing.",
      "correction_unavailable",
    );
  }
  if (latest.id === original.id) return original.id;
  if (latest.operation !== "correction" || latest.originalExecutionId !== original.id) {
    throw new SheetWritebackContractError(
      "A different Sheet action superseded this write receipt.",
      "correction_unavailable",
    );
  }
  if (latest.state === "running") {
    throw new SheetWritebackContractError(
      "A correction attempt is still in progress.",
      "attempt_in_progress",
    );
  }
  if (latest.state === "ambiguous") {
    throw new SheetWritebackContractError(
      "A correction attempt is ambiguous. Reconcile it before preparing another correction.",
      "attempt_ambiguous",
    );
  }
  if (latest.state === "succeeded") {
    throw new SheetWritebackContractError(
      "The exact correction already has a receipt.",
      "correction_unavailable",
    );
  }
  return latest.id;
}

async function requirePreview(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  deps: WritebackExecuteDeps,
  context: WritebackExecutionContext,
  operation: "write" | "correction",
): Promise<SheetWritebackPreviewRecord> {
  const preview = await deps.store.getPreview(input.previewHash!);
  if (!preview) {
    throw new SheetWritebackContractError(
      "The Sheet preview was not found. Prepare it again.",
      "preview_not_found",
    );
  }
  if (
    preview.id !== input.previewHash ||
    preview.executionId !== input.executionId ||
    preview.binding.operation !== operation ||
    preview.binding.actorUid !== actor.uid ||
    preview.binding.runId !== input.runId ||
    preview.binding.sourceTriggerKey !== input.sourceTriggerKey ||
    !sameDescriptor(preview.binding.descriptor, context.descriptor)
  ) {
    throw new SheetWritebackContractError(
      "The Sheet preview does not match this actor, action, target, or environment.",
      "preview_mismatch",
    );
  }
  if (preview.expiresAtMs <= deps.now().getTime()) {
    throw new SheetWritebackContractError(
      "The Sheet preview expired. Prepare it again.",
      "preview_expired",
    );
  }
  return preview;
}

async function requireExecution(
  _actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  deps: WritebackRecoveryDeps,
  context: WritebackExecutionContext,
): Promise<SheetWritebackExecutionRecord> {
  const record = await deps.store.getExecution(input.executionId!);
  if (
    !record ||
    record.id !== input.executionId ||
    record.runId !== input.runId ||
    record.sourceTriggerKey !== input.sourceTriggerKey ||
    !sameDescriptor(record.descriptor, context.descriptor)
  ) {
    throw new SheetWritebackContractError(
      "The Sheet execution was not found for this run and environment.",
      "preview_mismatch",
    );
  }
  return record;
}

function requireExecuteDeps(
  deps: WritebackExecuteDeps | WritebackRecoveryDeps,
): WritebackExecuteDeps {
  if (
    "rebuildRun" in deps &&
    "loadApproval" in deps &&
    "loadResolution" in deps &&
    "spreadsheetId" in deps &&
    "nonce" in deps
  ) {
    return deps;
  }
  throw new EditableLayerError(
    "The live Sheet mutation dependencies are not configured.",
    409,
  );
}

function writeBinding(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  current: {
    plan: RowWritebackPlan;
    approval: LeaseRenewalWritebackApprovalRecord;
  },
  preview: SheetWritebackPreviewRecord,
  context: WritebackExecutionContext,
): SheetWritebackActionBinding {
  return {
    operation: "write",
    actorUid: actor.uid,
    runId: input.runId,
    sourceTriggerKey: input.sourceTriggerKey,
    propertyKey: current.plan.propertyKey,
    fieldKey: current.plan.fieldKey,
    approvalId: current.approval.id,
    approvalVersion: current.approval.updated_at,
    sourceOfValue: current.approval.source_of_value,
    descriptor: context.descriptor,
    target: {
      spreadsheetId: current.plan.spreadsheetId,
      tabName: current.plan.tabName,
      a1: preview.binding.target.a1,
      rowIndex: current.plan.rowIndex,
      proposedColumnHeader: current.plan.proposedColumnHeader,
      anchorHeaders: preview.binding.target.anchorHeaders,
      rowAnchorHash: preview.binding.target.rowAnchorHash,
      anchorColumnCount: preview.binding.target.anchorColumnCount,
    },
    proposedValueHash: hashSheetCellValue(current.plan.proposedValue),
    ...(preview.binding.predecessorExecutionId
      ? { predecessorExecutionId: preview.binding.predecessorExecutionId }
      : {}),
  };
}

function sameResolvedTargetIdentity(
  record: SheetWritebackExecutionRecord,
  target: ResolvedWritebackTarget,
): boolean {
  return (
    target.a1 === record.target.a1 &&
    JSON.stringify(target.anchorHeaders) ===
      JSON.stringify(record.target.anchorHeaders) &&
    target.rowAnchorHash === record.target.rowAnchorHash &&
    target.anchorColumnCount === record.target.anchorColumnCount
  );
}

function sameCorrectionLineageTarget(
  original: SheetWritebackExecutionRecord,
  target: SheetWritebackExecutionRecord["target"],
): boolean {
  return (
    target.spreadsheetId === original.target.spreadsheetId &&
    target.tabName === original.target.tabName &&
    target.proposedColumnHeader === original.target.proposedColumnHeader &&
    JSON.stringify(target.anchorHeaders) ===
      JSON.stringify(original.target.anchorHeaders) &&
    target.rowAnchorHash === original.target.rowAnchorHash
  );
}

function publicResolvedTarget(
  target: ResolvedWritebackTarget,
): ResolvedWritebackTargetView {
  return {
    a1: target.a1,
    proposedColumnHeader: target.proposedColumnHeader,
    proposedValue: target.proposedValue,
    rowValues: target.rowValues,
  };
}

export function assertSheetWritebackRequestIdentifiers(
  input: WritebackExecuteInput,
): void {
  const operation = input.operation ?? "write";
  if (
    (input.confirm &&
      (!validExecutionId(input.executionId) || !validHash(input.previewHash))) ||
    (operation === "reconcile" && !validExecutionId(input.executionId)) ||
    (operation === "status" &&
      input.executionId !== undefined &&
      !validExecutionId(input.executionId)) ||
    (operation === "correction" && !input.confirm && !validExecutionId(input.executionId))
  ) {
    throw new SheetWritebackContractError(
      "An exact server-issued execution id and preview hash are required.",
      "confirmation_required",
    );
  }
}

function requireClaimed(claim: ClaimSheetWritebackResult): SheetWritebackExecutionRecord {
  if (claim.status === "claimed") return claim.record;
  const code: SheetWritebackContractErrorCode =
    claim.status === "expired"
      ? "preview_expired"
      : claim.status === "ambiguous"
        ? "attempt_ambiguous"
        : claim.status === "in_progress"
          ? "attempt_in_progress"
          : claim.status === "consumed"
            ? "attempt_consumed"
            : "preview_mismatch";
  throw new SheetWritebackContractError(claimMessage(claim.status), code);
}

function duplicateOutcome(
  claim: ClaimSheetWritebackResult,
): WritebackExecuteOutcome | null {
  return claim.status === "duplicate"
    ? receiptOutcome(claim.record, claim.receipt, true)
    : null;
}

function existingAttemptOutcome(
  record: SheetWritebackExecutionRecord,
  preview: SheetWritebackPreviewRecord,
): WritebackExecuteOutcome {
  if (
    record.id !== preview.executionId ||
    record.previewHash !== preview.id ||
    record.bindingHash !== preview.bindingHash
  ) {
    throw new SheetWritebackContractError(claimMessage("mismatch"), "preview_mismatch");
  }
  if (record.state === "succeeded" && record.receipt) {
    return receiptOutcome(record, record.receipt, true);
  }
  if (record.state === "running") {
    throw new SheetWritebackContractError(
      claimMessage("in_progress"),
      "attempt_in_progress",
    );
  }
  if (record.state === "ambiguous") {
    throw new SheetWritebackContractError(claimMessage("ambiguous"), "attempt_ambiguous");
  }
  throw new SheetWritebackContractError(claimMessage("consumed"), "attempt_consumed");
}

function receiptOutcome(
  record: SheetWritebackExecutionRecord,
  receipt: SheetWritebackReceipt,
  duplicate: boolean,
): WritebackExecuteOutcome {
  return {
    status: record.operation === "write" ? "written" : "corrected",
    a1: receipt.verifiedA1,
    receipt,
    duplicate,
  };
}

function needsReconciliation(
  record: SheetWritebackExecutionRecord,
  reason: string,
): WritebackExecuteOutcome {
  return {
    status: "needs_reconciliation",
    executionId: record.id,
    operation: record.operation,
    reason,
  };
}

function absentOutcome(
  record: SheetWritebackExecutionRecord,
  reason: string,
): WritebackExecuteOutcome {
  return {
    status: "absent",
    executionId: record.id,
    operation: record.operation,
    approvalVersion: record.approvalVersion,
    reason,
    ...(record.operation === "correction" && record.originalExecutionId
      ? { originalExecutionId: record.originalExecutionId }
      : {}),
  };
}

function previewReference(
  preview: SheetWritebackPreviewRecord,
): WritebackPreviewReference {
  return {
    executionId: preview.executionId,
    hash: preview.id,
    expiresAt: new Date(preview.expiresAtMs).toISOString(),
  };
}

async function safeMarkOutcome(
  store: SheetWritebackExecutionStore,
  executionId: string,
  state: "ambiguous" | "failed",
  nowMs: number,
) {
  try {
    await store.markOutcome(executionId, state, nowMs);
  } catch {
    // If Firestore itself is unavailable, the durable claimed state still prevents retry and is
    // reconcilable. Never mask the provider uncertainty with a second effect attempt.
  }
}

function validHash(value: string | undefined) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validExecutionId(value: string | undefined) {
  return (
    typeof value === "string" &&
    /^(?:sheet_write|sheet_correction)_[a-f0-9]{48}$/i.test(value)
  );
}

function sameDescriptor(left: EnvironmentDescriptor, right: EnvironmentDescriptor) {
  return (
    left.environmentKind === right.environmentKind &&
    left.dataContext === right.dataContext &&
    left.source === right.source
  );
}

function claimMessage(status: Exclude<ClaimSheetWritebackResult["status"], "claimed">) {
  switch (status) {
    case "ambiguous":
      return "The prior Sheet attempt is ambiguous. Reconcile it; do not retry.";
    case "consumed":
      return "The one Sheet attempt was consumed and cannot be retried.";
    case "duplicate":
      return "The Sheet action already has a receipt.";
    case "expired":
      return "The Sheet preview expired. Prepare it again.";
    case "in_progress":
      return "The Sheet action is already in progress. Reconcile it if it remains unresolved.";
    case "mismatch":
      return "The Sheet preview no longer matches the durable action.";
  }
}
