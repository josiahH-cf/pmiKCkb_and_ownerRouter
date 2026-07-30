import { randomUUID } from "node:crypto";

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import { hashSheetCellValue } from "@/lib/lease-renewal/sheet-writeback-policy";

export const RENEWAL_SHEET_WRITEBACK_ACTION_KEY =
  "google_sheets.renewal_checklist.writeback";
export const SHEET_WRITEBACK_PREVIEW_TTL_MS = 10 * 60 * 1_000;

export type SheetWritebackOperation = "write" | "correction";
export type SheetWritebackExecutionState =
  | "running"
  | "succeeded"
  | "ambiguous"
  | "failed";

/** Provider metadata only. It deliberately contains no row body or cell value. */
export interface SheetWritebackTargetReference {
  spreadsheetId: string;
  tabName: string;
  a1: string;
  rowIndex: number;
  proposedColumnHeader: string;
  /** Exact non-target header names used to recompute rowAnchorHash; contains no row body. */
  anchorHeaders: string[];
  /** Bodyless identity of the non-target cells in the row at preview time. */
  rowAnchorHash: string;
  /** Header width when this exact coordinate was previewed. */
  anchorColumnCount: number;
}

export interface SheetWritebackActionBinding {
  operation: SheetWritebackOperation;
  actorUid: string;
  runId: string;
  sourceTriggerKey: string;
  propertyKey: string;
  fieldKey: string;
  approvalId: string;
  approvalVersion: string;
  sourceOfValue: string;
  descriptor: EnvironmentDescriptor;
  target: SheetWritebackTargetReference;
  proposedValueHash: string;
  predecessorExecutionId?: string;
  originalExecutionId?: string;
}

/**
 * Server-only, bodyless confirmation record. `proposedValueHash` binds the exact value without
 * persisting it; `target` contains only provider reference metadata needed for reconciliation.
 */
export interface SheetWritebackPreviewRecord {
  id: string;
  executionId: string;
  bindingHash: string;
  binding: SheetWritebackActionBinding;
  issuedAtMs: number;
  expiresAtMs: number;
}

export interface SheetWritebackReceipt {
  receiptId: string;
  actionKey: typeof RENEWAL_SHEET_WRITEBACK_ACTION_KEY;
  operation: SheetWritebackOperation;
  idempotencyKey: string;
  previewHash: string;
  attemptedA1: string;
  verifiedA1: string;
  /** Opaque, bodyless provider identity of the exact effect; used to guard correction. */
  providerEffectId: string;
  providerAppliedAt: string;
  providerResultHash: string;
  /** Exact approval version that authorized this lineage; never inferred from provider time. */
  approvalVersion: string;
  targetHash: string;
  resultHash: string;
  outcome: "written" | "corrected";
  reconciled: boolean;
  createdAt: string;
}

export interface SheetWritebackExecutionRecord {
  id: string;
  actionKey: typeof RENEWAL_SHEET_WRITEBACK_ACTION_KEY;
  operation: SheetWritebackOperation;
  bindingHash: string;
  actorUid: string;
  runId: string;
  sourceTriggerKey: string;
  propertyKey: string;
  fieldKey: string;
  approvalId: string;
  approvalVersion: string;
  sourceOfValue: string;
  descriptor: EnvironmentDescriptor;
  target: SheetWritebackTargetReference;
  proposedValueHash: string;
  predecessorExecutionId?: string;
  originalExecutionId?: string;
  previewHash: string;
  state: SheetWritebackExecutionState;
  attemptCount: 1;
  createdAt: string;
  updatedAt: string;
  receipt?: SheetWritebackReceipt;
}

export interface SheetWritebackProviderEffect {
  a1: string;
  effectId: string;
  appliedAt: string;
  resultHash: string;
}

export interface SheetWritebackClaimAuthorization {
  sourceTriggerKey: string;
  runId: string;
  propertyKey: string;
  fieldKey: string;
  approvalId: string;
  approvalVersion: string;
  sourceOfValue: string;
  proposedValueHash: string;
}

export type ClaimSheetWritebackResult =
  | { status: "claimed"; record: SheetWritebackExecutionRecord }
  | {
      status: "duplicate";
      record: SheetWritebackExecutionRecord;
      receipt: SheetWritebackReceipt;
    }
  | {
      status: "ambiguous" | "consumed" | "expired" | "in_progress" | "mismatch";
      record?: SheetWritebackExecutionRecord;
    };

export interface SheetWritebackExecutionStore {
  createPreview(record: SheetWritebackPreviewRecord): Promise<void>;
  getPreview(id: string): Promise<SheetWritebackPreviewRecord | null>;
  getExecution(id: string): Promise<SheetWritebackExecutionRecord | null>;
  getLatestExecution(input: {
    runId: string;
    sourceTriggerKey: string;
  }): Promise<SheetWritebackExecutionRecord | null>;
  claim(input: {
    previewHash: string;
    executionId: string;
    actorUid: string;
    nowMs: number;
    authorization?: SheetWritebackClaimAuthorization;
  }): Promise<ClaimSheetWritebackResult>;
  finish(
    executionId: string,
    receipt: SheetWritebackReceipt,
  ): Promise<SheetWritebackReceipt>;
  markOutcome(
    executionId: string,
    state: Extract<SheetWritebackExecutionState, "ambiguous" | "failed">,
    nowMs: number,
  ): Promise<void>;
}

export interface BuildWritebackPreviewInput {
  actorUid: string;
  runId: string;
  sourceTriggerKey: string;
  propertyKey: string;
  fieldKey: string;
  approvalId: string;
  approvalVersion: string;
  sourceOfValue: string;
  descriptor: EnvironmentDescriptor;
  target: SheetWritebackTargetReference;
  proposedValue: string;
  predecessorExecutionId?: string;
  nowMs: number;
  nonce?: string;
}

export function buildSheetWritebackPreview(
  input: BuildWritebackPreviewInput,
): SheetWritebackPreviewRecord {
  return buildPreviewRecord(
    {
      operation: "write",
      actorUid: input.actorUid,
      runId: input.runId,
      sourceTriggerKey: input.sourceTriggerKey,
      propertyKey: input.propertyKey,
      fieldKey: input.fieldKey,
      approvalId: input.approvalId,
      approvalVersion: input.approvalVersion,
      sourceOfValue: input.sourceOfValue,
      descriptor: input.descriptor,
      target: input.target,
      proposedValueHash: hashSheetCellValue(input.proposedValue),
      ...(input.predecessorExecutionId !== undefined
        ? { predecessorExecutionId: input.predecessorExecutionId }
        : {}),
    },
    input.nowMs,
    input.nonce,
  );
}

export function buildSheetWritebackCorrectionPreview(input: {
  actorUid: string;
  descriptor: EnvironmentDescriptor;
  original: SheetWritebackExecutionRecord;
  /** Current unique coordinate for the original bodyless row identity, when it has moved. */
  target?: SheetWritebackTargetReference;
  predecessorExecutionId?: string;
  nowMs: number;
  nonce?: string;
}): SheetWritebackPreviewRecord {
  if (
    input.original.operation !== "write" ||
    input.original.state !== "succeeded" ||
    !input.original.receipt
  ) {
    throw new Error("A successful write receipt is required for correction.");
  }
  const target = input.target ?? input.original.target;
  if (
    target.spreadsheetId !== input.original.target.spreadsheetId ||
    target.tabName !== input.original.target.tabName ||
    target.proposedColumnHeader !== input.original.target.proposedColumnHeader ||
    canonicalJson(target.anchorHeaders) !==
      canonicalJson(input.original.target.anchorHeaders) ||
    target.rowAnchorHash !== input.original.target.rowAnchorHash
  ) {
    throw new Error("A correction target must preserve the original row identity.");
  }
  return buildPreviewRecord(
    {
      operation: "correction",
      actorUid: input.actorUid,
      runId: input.original.runId,
      sourceTriggerKey: input.original.sourceTriggerKey,
      propertyKey: input.original.propertyKey,
      fieldKey: input.original.fieldKey,
      approvalId: input.original.approvalId,
      approvalVersion: input.original.approvalVersion,
      sourceOfValue: input.original.sourceOfValue,
      descriptor: input.descriptor,
      target,
      proposedValueHash: input.original.proposedValueHash,
      ...(input.predecessorExecutionId !== undefined
        ? { predecessorExecutionId: input.predecessorExecutionId }
        : {}),
      originalExecutionId: input.original.id,
    },
    input.nowMs,
    input.nonce,
  );
}

export function sheetWritebackBindingHash(binding: SheetWritebackActionBinding): string {
  return hashExecutionPreview({
    actionKey: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
    binding,
  });
}

export function sheetWritebackBindingMatches(
  record: SheetWritebackPreviewRecord,
  binding: SheetWritebackActionBinding,
): boolean {
  return (
    record.bindingHash === sheetWritebackBindingHash(binding) &&
    canonicalJson(record.binding) === canonicalJson(binding)
  );
}

export function executionRecordFromPreview(
  preview: SheetWritebackPreviewRecord,
  nowMs: number,
): SheetWritebackExecutionRecord {
  const createdAt = new Date(nowMs).toISOString();
  return {
    id: preview.executionId,
    actionKey: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
    operation: preview.binding.operation,
    bindingHash: preview.bindingHash,
    actorUid: preview.binding.actorUid,
    runId: preview.binding.runId,
    sourceTriggerKey: preview.binding.sourceTriggerKey,
    propertyKey: preview.binding.propertyKey,
    fieldKey: preview.binding.fieldKey,
    approvalId: preview.binding.approvalId,
    approvalVersion: preview.binding.approvalVersion,
    sourceOfValue: preview.binding.sourceOfValue,
    descriptor: preview.binding.descriptor,
    target: preview.binding.target,
    proposedValueHash: preview.binding.proposedValueHash,
    ...(preview.binding.predecessorExecutionId !== undefined
      ? { predecessorExecutionId: preview.binding.predecessorExecutionId }
      : {}),
    ...(preview.binding.originalExecutionId
      ? { originalExecutionId: preview.binding.originalExecutionId }
      : {}),
    previewHash: preview.id,
    state: "running",
    attemptCount: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildSheetWritebackReceipt(
  record: SheetWritebackExecutionRecord,
  providerEffect: SheetWritebackProviderEffect,
  reconciled = false,
): SheetWritebackReceipt {
  assertProviderEffect(providerEffect);
  if (providerEffect.a1 !== record.target.a1) {
    throw new Error(
      a1TabReference(providerEffect.a1) !== a1TabReference(record.target.a1)
        ? "The provider effect belongs to a different Sheet tab."
        : "The provider effect did not use the exact human-confirmed Sheet cell.",
    );
  }
  const outcome = record.operation === "write" ? "written" : "corrected";
  const targetHash = hashExecutionPreview({
    spreadsheetId: record.target.spreadsheetId,
    attemptedA1: record.target.a1,
    verifiedA1: providerEffect.a1,
  });
  return {
    receiptId: record.id,
    actionKey: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
    operation: record.operation,
    idempotencyKey: record.id,
    previewHash: record.previewHash,
    attemptedA1: record.target.a1,
    verifiedA1: providerEffect.a1,
    providerEffectId: providerEffect.effectId,
    providerAppliedAt: providerEffect.appliedAt,
    providerResultHash: providerEffect.resultHash,
    approvalVersion: record.approvalVersion,
    targetHash,
    resultHash: hashExecutionPreview({
      outcome,
      proposedValueHash: record.proposedValueHash,
      targetHash,
      providerEffectId: providerEffect.effectId,
      providerAppliedAt: providerEffect.appliedAt,
      providerResultHash: providerEffect.resultHash,
      approvalVersion: record.approvalVersion,
    }),
    outcome,
    reconciled,
    createdAt: providerEffect.appliedAt,
  };
}

export function sheetWritebackProviderPayloadHash(
  record: SheetWritebackExecutionRecord,
  expectedEffectId?: string,
): string {
  return hashExecutionPreview({
    schemaVersion: 1,
    actionKey: record.actionKey,
    executionId: record.id,
    bindingHash: record.bindingHash,
    expectedEffectId: expectedEffectId ?? null,
  });
}

function assertProviderEffect(effect: SheetWritebackProviderEffect): void {
  if (
    !/^[A-Za-z0-9._:-]{1,200}$/.test(effect.effectId) ||
    !/^[a-f0-9]{64}$/.test(effect.resultHash) ||
    !Number.isFinite(Date.parse(effect.appliedAt)) ||
    new Date(effect.appliedAt).toISOString() !== effect.appliedAt ||
    effect.a1.trim() !== effect.a1 ||
    !/![A-Z]+[1-9]\d*$/.test(effect.a1)
  ) {
    throw new Error("The provider effect evidence is invalid.");
  }
}

function a1TabReference(a1: string): string | null {
  const separatorIndex = a1.lastIndexOf("!");
  if (separatorIndex <= 0 || !/^[A-Z]+[1-9]\d*$/.test(a1.slice(separatorIndex + 1))) {
    return null;
  }
  return a1.slice(0, separatorIndex);
}

function buildPreviewRecord(
  binding: SheetWritebackActionBinding,
  nowMs: number,
  nonce: string = randomUUID(),
): SheetWritebackPreviewRecord {
  const bindingHash = sheetWritebackBindingHash(binding);
  const idempotencyHash = hashExecutionPreview(actionIdentity(binding));
  const executionId = `${binding.operation === "write" ? "sheet_write" : "sheet_correction"}_${idempotencyHash.slice(0, 48)}`;
  const expiresAtMs = nowMs + SHEET_WRITEBACK_PREVIEW_TTL_MS;
  const id = hashExecutionPreview({
    binding,
    issuedAtMs: nowMs,
    expiresAtMs,
    nonce,
  });
  return {
    id,
    executionId,
    bindingHash,
    binding,
    issuedAtMs: nowMs,
    expiresAtMs,
  };
}

function actionIdentity(binding: SheetWritebackActionBinding) {
  const actorIndependent = Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== "actorUid"),
  );
  return {
    actionKey: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
    ...actorIndependent,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemorySheetWritebackExecutionStore implements SheetWritebackExecutionStore {
  readonly previews = new Map<string, SheetWritebackPreviewRecord>();
  readonly executions = new Map<string, SheetWritebackExecutionRecord>();
  readonly heads = new Map<string, string>();

  constructor(
    private readonly writeAuthorizationStillValid: (
      authorization: SheetWritebackClaimAuthorization,
    ) => boolean = () => true,
  ) {}

  async createPreview(record: SheetWritebackPreviewRecord): Promise<void> {
    const existing = this.previews.get(record.id);
    if (existing && canonicalJson(existing) !== canonicalJson(record)) {
      throw new Error("Sheet write-back preview hash collision.");
    }
    this.previews.set(record.id, clone(record));
  }

  async getPreview(id: string): Promise<SheetWritebackPreviewRecord | null> {
    const record = this.previews.get(id);
    return record ? clone(record) : null;
  }

  async getExecution(id: string): Promise<SheetWritebackExecutionRecord | null> {
    const record = this.executions.get(id);
    return record ? clone(record) : null;
  }

  async getLatestExecution(input: {
    runId: string;
    sourceTriggerKey: string;
  }): Promise<SheetWritebackExecutionRecord | null> {
    const executionId = this.heads.get(executionHeadKey(input));
    return executionId ? this.getExecution(executionId) : null;
  }

  async claim(input: {
    previewHash: string;
    executionId: string;
    actorUid: string;
    nowMs: number;
    authorization?: SheetWritebackClaimAuthorization;
  }): Promise<ClaimSheetWritebackResult> {
    const preview = this.previews.get(input.previewHash);
    if (
      !preview ||
      preview.executionId !== input.executionId ||
      preview.binding.actorUid !== input.actorUid
    ) {
      return { status: "mismatch" };
    }
    if (preview.expiresAtMs <= input.nowMs) return { status: "expired" };
    if (
      preview.binding.operation === "write" &&
      (!input.authorization ||
        !claimAuthorizationMatchesPreview(input.authorization, preview) ||
        !this.writeAuthorizationStillValid(input.authorization))
    ) {
      return { status: "mismatch" };
    }

    const existing = this.executions.get(input.executionId);
    if (existing) {
      if (existing.bindingHash !== preview.bindingHash) {
        return { status: "mismatch", record: clone(existing) };
      }
      if (existing.state === "succeeded" && existing.receipt) {
        return {
          status: "duplicate",
          record: clone(existing),
          receipt: clone(existing.receipt),
        };
      }
      if (existing.state === "running") {
        return { status: "in_progress", record: clone(existing) };
      }
      if (existing.state === "ambiguous") {
        return { status: "ambiguous", record: clone(existing) };
      }
      return { status: "consumed", record: clone(existing) };
    }

    const record = executionRecordFromPreview(preview, input.nowMs);
    const headKey = executionHeadKey(record);
    const currentHead = this.heads.get(headKey);
    if (currentHead !== preview.binding.predecessorExecutionId) {
      return { status: "mismatch" };
    }
    this.executions.set(record.id, clone(record));
    this.heads.set(headKey, record.id);
    return { status: "claimed", record: clone(record) };
  }

  async finish(
    executionId: string,
    receipt: SheetWritebackReceipt,
  ): Promise<SheetWritebackReceipt> {
    const record = this.executions.get(executionId);
    if (!record) throw new Error("Sheet write-back execution is missing.");
    if (record.state === "succeeded" && record.receipt) {
      if (sameProviderEffectReceipt(record.receipt, receipt)) {
        return clone(record.receipt);
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
    this.executions.set(executionId, {
      ...record,
      state: "succeeded",
      receipt: clone(receipt),
      updatedAt: receipt.createdAt,
    });
    return clone(receipt);
  }

  async markOutcome(
    executionId: string,
    state: "ambiguous" | "failed",
    nowMs: number,
  ): Promise<void> {
    const record = this.executions.get(executionId);
    if (!record || record.state === "succeeded") return;
    if (record.state === state) return;
    if (record.state === "failed" && state === "ambiguous") return;
    this.executions.set(executionId, {
      ...record,
      state,
      updatedAt: new Date(nowMs).toISOString(),
    });
  }
}

function executionHeadKey(input: { runId: string; sourceTriggerKey: string }): string {
  return canonicalJson({
    runId: input.runId,
    sourceTriggerKey: input.sourceTriggerKey,
  });
}

export function sameProviderEffectReceipt(
  left: SheetWritebackReceipt,
  right: SheetWritebackReceipt,
): boolean {
  return (
    canonicalJson(providerEffectReceipt(left)) ===
    canonicalJson(providerEffectReceipt(right))
  );
}

function providerEffectReceipt(receipt: SheetWritebackReceipt): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "reconciled"),
  );
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
    authorization.sourceOfValue === preview.binding.sourceOfValue &&
    authorization.proposedValueHash === preview.binding.proposedValueHash
  );
}
