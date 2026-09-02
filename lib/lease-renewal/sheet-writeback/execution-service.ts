// S98 one-attempt operating-Sheet execution (ARCH-S98-2/3/4). A durable claim precedes the single
// Sheets call; Sheets exposes no operation-status or idempotency ledger for these requests, so an
// uncertain response never retries and reconciliation reports observed state without claiming
// causality. Only `row_append` can construct its receipt-bound one-row deleteDimension reversal.

import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { assertLiveProviderActionAllowed } from "@/lib/environment/descriptor";
import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
  ExternalExecutionStore,
} from "@/lib/external-execution/types";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import {
  PROOF_NOTE_PREFIX,
  SheetWritebackContractError,
  assertSheetWritebackConfirmation,
  normalRowNote,
  parseRowNote,
  proofRowNote,
  sheetWritebackExecutionId,
  sheetWritebackReversalExecutionId,
  type SheetFieldUpdateEffectInput,
  type SheetRowAppendEffectInput,
  type SheetWritebackConfirmation,
  type SheetWritebackProposal,
  type ValidatedSheetWritebackEffect,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

export type SheetWritebackServiceErrorCode =
  | "environment_refused"
  | "action_closed"
  | "flag_disabled"
  | "effect_missing"
  | "execution_missing"
  | "execution_state"
  | "execution_in_progress"
  | "claim_refused"
  | "provider_read_failed"
  | "header_drift"
  | "row_anchor_drift"
  | "cas_not_applied"
  | "provider_readback_mismatch"
  | "provider_ambiguous"
  | "reconcile_not_proven"
  | "reconcile_drift"
  | "reversal_unsupported"
  | "reversal_forward_unproven"
  | "reversal_target_drift"
  | "confirmation_invalid";

/** Value-free refusal safe for routes and UI copy. */
export class SheetWritebackServiceError extends Error {
  constructor(public readonly code: SheetWritebackServiceErrorCode) {
    super(`S98 operating-sheet operation refused (${code}).`);
    this.name = "SheetWritebackServiceError";
  }
}

export interface SheetWritebackGate {
  isExecutable(): Promise<boolean>;
  run<T>(effect: () => Promise<T> | T): Promise<T>;
}

/** The narrow live writer surface the service uses (implemented by GoogleSheetsApiWriter). */
export interface SheetWritebackWriter {
  getValues(spreadsheetId: string, range: string): Promise<string[][]>;
  getSheetIdByTitle(spreadsheetId: string, tabTitle: string): Promise<number>;
  appendRowWithNote(input: {
    spreadsheetId: string;
    sheetId: number;
    values: readonly string[];
    noteColumnIndex: number;
    note: string;
  }): Promise<void>;
  deleteExactRow(input: {
    spreadsheetId: string;
    sheetId: number;
    rowNumber: number;
  }): Promise<void>;
  getColumnNotes(input: {
    spreadsheetId: string;
    tabTitle: string;
    columnIndex: number;
    startRowNumber: number;
    endRowNumber: number;
  }): Promise<{ rowNumber: number; value: string; note: string }[]>;
  replaceCellIfExactMatch(
    spreadsheetId: string,
    range: string,
    expected: string,
    replacement: string,
  ): Promise<boolean>;
}

export interface SheetWritebackDependencies {
  descriptor: EnvironmentDescriptor;
  store: ExternalExecutionStore;
  createWriter: () => SheetWritebackWriter;
  /** Per exact Action Registry key; a missing gate fails closed. */
  gateFor(actionKey: string): SheetWritebackGate;
  /** The reviewed operating-write runtime switch. */
  writeFlagEnabled(): boolean;
  now?: () => number;
}

const RECONCILE_MIN_AGE_MS = 2 * 60 * 1_000;
const NOTE_SCAN_START_ROW = 2;
const NOTE_SCAN_MAX_ROW = 3_000;

/**
 * S98 live-format tolerance (bounded proof finding, 2026-09-02): the operating Sheet renders
 * numeric cells through column formatting, so a written "1.00" reads back as "$1.00" while the
 * provider-side compare-and-set already applied. Two values match when they are identical
 * strings OR both parse as the same finite number after stripping only currency/grouping
 * rendering ("$", ",", surrounding whitespace). Text never number-matches, and blank never
 * matches nonblank, so this cannot mask a collaborator edit to a different value.
 */
export function sheetCellValueMatches(written: string, observed: string): boolean {
  if (written === observed) return true;
  const numeric = (value: string): number | null => {
    const stripped = value.trim().replace(/^\$/, "").replace(/,/g, "");
    if (!stripped) return null;
    return /^-?\d+(?:\.\d+)?$/.test(stripped) ? Number(stripped) : null;
  };
  const writtenNumber = numeric(written);
  const observedNumber = numeric(observed);
  return (
    writtenNumber !== null && observedNumber !== null && writtenNumber === observedNumber
  );
}

function columnLetter(index: number): string {
  let value = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}

function rowContentHash(input: { note: string; values: readonly string[] }): string {
  return hashExecutionPreview({
    version: "s98-row-content/v1",
    note: input.note,
    values: input.values,
  });
}

export interface SheetWritebackReceiptDetails {
  receipt: ExternalActionReceipt;
  duplicate: boolean;
  /** Present for a successful append: the located 1-based sheet row (a readback hint only). */
  appendedRowNumber?: number;
}

export interface SheetWritebackReversalPreview {
  reversalExecutionId: string;
  forwardExecutionId: string;
  previewHash: string;
  expiresAtIso: string;
  kind: "delete_appended_row" | "restore_field";
  /** For delete_appended_row: the current 1-based row (revalidated again at execute). */
  currentRowNumber?: number;
}

export class SheetWritebackService {
  constructor(private readonly dependencies: SheetWritebackDependencies) {}

  /** Execute one confirmed effect of one proposal, exactly once. */
  async executeEffect(input: {
    proposal: SheetWritebackProposal;
    effectHash: string;
    confirmation: SheetWritebackConfirmation;
  }): Promise<SheetWritebackReceiptDetails> {
    this.assertEnvironment();
    const { proposal } = input;
    const effect = this.effectByHash(proposal, input.effectHash);
    const nowMs = this.now();
    try {
      assertSheetWritebackConfirmation({
        proposal,
        effect,
        confirmation: input.confirmation,
        nowMs,
      });
    } catch (error) {
      if (error instanceof SheetWritebackContractError) {
        throw new SheetWritebackServiceError("confirmation_invalid");
      }
      throw error;
    }
    await this.assertGates(effect.actionKey);

    const executionId = sheetWritebackExecutionId(proposal, effect);
    const existing = await this.dependencies.store.get(executionId);
    if (existing?.state === "succeeded" && existing.receipt) {
      return { receipt: existing.receipt, duplicate: true };
    }
    if (existing && (existing.state !== "ready" || existing.attemptCount !== 0)) {
      throw new SheetWritebackServiceError("execution_state");
    }

    // Fresh pre-write revalidation happens before any claim so stale state refuses cleanly. One
    // writer construction serves both the probe reads and the gated effect below; the gate and
    // flag were already asserted above, so refusals never reach this construction.
    const writer = this.dependencies.createWriter();
    await this.assertHeaderFresh(proposal, writer);
    if (effect.effect.kind === "field_update") {
      await this.assertFieldAnchorFresh(proposal, effect.effect, writer);
    }

    if (!existing) {
      const record: ExternalExecutionRecord = {
        id: executionId,
        dataMode: "live",
        workflowId: `s98:${proposal.tabTitle}`,
        actionId: executionId,
        actionKey: effect.actionKey,
        contextHash: proposal.previewHash,
        previewHash: proposal.previewHash,
        idempotencyKey: executionId,
        state: "ready",
        attemptCount: 0,
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      };
      try {
        await this.dependencies.store.create(record);
      } catch {
        const concurrent = await this.dependencies.store.get(executionId);
        if (concurrent?.state === "succeeded" && concurrent.receipt) {
          return { receipt: concurrent.receipt, duplicate: true };
        }
        if (!concurrent) throw new SheetWritebackServiceError("execution_state");
      }
    }

    const claim = await this.dependencies.store.claim(executionId, proposal.previewHash);
    if (claim === "duplicate") {
      const settled = await this.dependencies.store.get(executionId);
      if (settled?.state === "succeeded" && settled.receipt) {
        return { receipt: settled.receipt, duplicate: true };
      }
      throw new SheetWritebackServiceError("execution_state");
    }
    if (claim !== "claimed") throw new SheetWritebackServiceError("claim_refused");

    let outcome: { providerRef: string; readbackHash: string; rowNumber?: number };
    try {
      const gate = this.dependencies.gateFor(effect.actionKey);
      outcome = await gate.run(() => this.performEffect(proposal, effect, writer));
    } catch (error) {
      if (
        error instanceof SheetWritebackServiceError &&
        (error.code === "cas_not_applied" ||
          error.code === "header_drift" ||
          error.code === "row_anchor_drift")
      ) {
        // Definite zero-effect refusals: the attempt is consumed without ambiguity.
        await this.transitionClaimFailure(executionId, false);
        throw error;
      }
      await this.transitionClaimFailure(executionId, true);
      console.error(
        JSON.stringify({
          marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
          action_key: effect.actionKey,
          execution_id: executionId,
          state: "ambiguous",
          data_mode: "live",
        }),
      );
      throw new SheetWritebackServiceError("provider_ambiguous");
    }

    const receipt: ExternalActionReceipt = {
      actionKey: effect.actionKey,
      dataMode: "live",
      liveEvidenceEligible: true,
      providerRef: outcome.providerRef,
      resultHash: outcome.readbackHash,
      reconciled: false,
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.dependencies.store.finish(executionId, receipt);
    return {
      receipt,
      duplicate: false,
      ...(outcome.rowNumber !== undefined
        ? { appendedRowNumber: outcome.rowNumber }
        : {}),
    };
  }

  /** Reconcile one ambiguous effect from fresh observed state; never a second provider call. */
  async reconcileEffect(input: {
    proposal: SheetWritebackProposal;
    effectHash: string;
  }): Promise<ExternalActionReceipt> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    const executionId = sheetWritebackExecutionId(input.proposal, effect);
    let record = await this.dependencies.store.get(executionId);
    if (!record) throw new SheetWritebackServiceError("execution_missing");
    if (record.state === "running" && record.attemptCount === 1) {
      const ageMs = this.now() - Date.parse(record.updatedAt);
      if (!Number.isFinite(ageMs) || ageMs < RECONCILE_MIN_AGE_MS) {
        throw new SheetWritebackServiceError("execution_in_progress");
      }
      await this.transitionClaimFailure(executionId, true);
      record = await this.dependencies.store.get(executionId);
      if (record?.state === "succeeded" && record.receipt) return record.receipt;
      if (!record) throw new SheetWritebackServiceError("execution_missing");
    }
    if (record.state !== "ambiguous" || record.attemptCount !== 1) {
      throw new SheetWritebackServiceError("execution_state");
    }
    const observation = await this.observeEffectOutcome(input.proposal, effect);
    if (observation.state === "after") {
      const receipt: ExternalActionReceipt = {
        actionKey: effect.actionKey,
        dataMode: "live",
        liveEvidenceEligible: true,
        providerRef: observation.providerRef,
        resultHash: observation.readbackHash,
        reconciled: true,
        createdAt: new Date(this.now()).toISOString(),
      };
      await this.dependencies.store.finish(executionId, receipt);
      return receipt;
    }
    if (observation.state === "before") {
      throw new SheetWritebackServiceError("reconcile_not_proven");
    }
    throw new SheetWritebackServiceError("reconcile_drift");
  }

  /** Prepare one reversal preview bound to a succeeded forward receipt. */
  async previewReversal(input: {
    proposal: SheetWritebackProposal;
    effectHash: string;
  }): Promise<SheetWritebackReversalPreview> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    const forwardExecutionId = sheetWritebackExecutionId(input.proposal, effect);
    const forward = await this.dependencies.store.get(forwardExecutionId);
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new SheetWritebackServiceError("reversal_forward_unproven");
    }
    const writer = this.dependencies.createWriter();
    let currentRowNumber: number | undefined;
    if (effect.reversal.kind === "delete_appended_row") {
      const located = await this.locateRowByOperationId(
        input.proposal,
        effect.reversal.operationId,
        writer,
      );
      if (!located) throw new SheetWritebackServiceError("reversal_target_drift");
      const rowHash = await this.hashRowContent(input.proposal, located, writer);
      if (rowHash !== forward.receipt.resultHash) {
        throw new SheetWritebackServiceError("reversal_target_drift");
      }
      currentRowNumber = located.rowNumber;
    } else {
      const fieldEffect = effect.effect as SheetFieldUpdateEffectInput;
      const cell = await this.readAnchoredCell(input.proposal, fieldEffect, writer);
      if (!sheetCellValueMatches(fieldEffect.afterValue, cell)) {
        throw new SheetWritebackServiceError("reversal_target_drift");
      }
    }
    const nowMs = this.now();
    const reversalExecutionId = sheetWritebackReversalExecutionId(
      forwardExecutionId,
      forward.receipt.resultHash,
    );
    return {
      reversalExecutionId,
      forwardExecutionId,
      previewHash: hashExecutionPreview({
        version: "s98-reversal-preview/v1",
        reversalExecutionId,
        forwardReceiptHash: forward.receipt.resultHash,
        reversal: effect.reversal,
      }),
      expiresAtIso: new Date(nowMs + 10 * 60 * 1_000).toISOString(),
      kind: effect.reversal.kind,
      ...(currentRowNumber !== undefined ? { currentRowNumber } : {}),
    };
  }

  /** Execute one separately confirmed reversal, exactly once. */
  async executeReversal(input: {
    proposal: SheetWritebackProposal;
    effectHash: string;
    reversal: SheetWritebackReversalPreview;
    confirmedAtIso: string;
  }): Promise<SheetWritebackReceiptDetails> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    await this.assertGates(effect.actionKey);
    const nowMs = this.now();
    const confirmedAtMs = Date.parse(input.confirmedAtIso);
    if (
      !Number.isFinite(confirmedAtMs) ||
      confirmedAtMs > nowMs ||
      nowMs > Date.parse(input.reversal.expiresAtIso)
    ) {
      throw new SheetWritebackServiceError("confirmation_invalid");
    }
    const forward = await this.dependencies.store.get(input.reversal.forwardExecutionId);
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new SheetWritebackServiceError("reversal_forward_unproven");
    }
    const expectedReversalId = sheetWritebackReversalExecutionId(
      input.reversal.forwardExecutionId,
      forward.receipt.resultHash,
    );
    if (expectedReversalId !== input.reversal.reversalExecutionId) {
      throw new SheetWritebackServiceError("confirmation_invalid");
    }
    const existing = await this.dependencies.store.get(expectedReversalId);
    if (existing?.state === "succeeded" && existing.receipt) {
      return { receipt: existing.receipt, duplicate: true };
    }
    if (existing && (existing.state !== "ready" || existing.attemptCount !== 0)) {
      throw new SheetWritebackServiceError("execution_state");
    }
    if (!existing) {
      const record: ExternalExecutionRecord = {
        id: expectedReversalId,
        dataMode: "live",
        workflowId: `s98:${input.proposal.tabTitle}`,
        actionId: expectedReversalId,
        actionKey: effect.actionKey,
        contextHash: forward.receipt.resultHash,
        previewHash: input.reversal.previewHash,
        idempotencyKey: expectedReversalId,
        state: "ready",
        attemptCount: 0,
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      };
      try {
        await this.dependencies.store.create(record);
      } catch {
        const concurrent = await this.dependencies.store.get(expectedReversalId);
        if (concurrent?.state === "succeeded" && concurrent.receipt) {
          return { receipt: concurrent.receipt, duplicate: true };
        }
        if (!concurrent) throw new SheetWritebackServiceError("execution_state");
      }
    }
    const claim = await this.dependencies.store.claim(
      expectedReversalId,
      input.reversal.previewHash,
    );
    if (claim === "duplicate") {
      const settled = await this.dependencies.store.get(expectedReversalId);
      if (settled?.state === "succeeded" && settled.receipt) {
        return { receipt: settled.receipt, duplicate: true };
      }
      throw new SheetWritebackServiceError("execution_state");
    }
    if (claim !== "claimed") throw new SheetWritebackServiceError("claim_refused");

    let outcome: { providerRef: string; readbackHash: string };
    try {
      const gate = this.dependencies.gateFor(effect.actionKey);
      outcome = await gate.run(() =>
        this.performReversal(
          input.proposal,
          effect,
          forward,
          this.dependencies.createWriter(),
        ),
      );
    } catch (error) {
      if (
        error instanceof SheetWritebackServiceError &&
        (error.code === "reversal_target_drift" || error.code === "cas_not_applied")
      ) {
        await this.transitionClaimFailure(expectedReversalId, false);
        throw error;
      }
      await this.transitionClaimFailure(expectedReversalId, true);
      console.error(
        JSON.stringify({
          marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
          action_key: effect.actionKey,
          execution_id: expectedReversalId,
          state: "ambiguous",
          data_mode: "live",
        }),
      );
      throw new SheetWritebackServiceError("provider_ambiguous");
    }

    const receipt: ExternalActionReceipt = {
      actionKey: effect.actionKey,
      dataMode: "live",
      liveEvidenceEligible: true,
      providerRef: outcome.providerRef,
      resultHash: outcome.readbackHash,
      reconciled: false,
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.dependencies.store.finish(expectedReversalId, receipt);
    return { receipt, duplicate: false };
  }

  /** Read-only reconciliation of an ambiguous reversal from observed state. */
  async reconcileReversal(input: {
    proposal: SheetWritebackProposal;
    effectHash: string;
  }): Promise<ExternalActionReceipt> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    const forwardId = sheetWritebackExecutionId(input.proposal, effect);
    const forward = await this.dependencies.store.get(forwardId);
    if (!forward?.receipt) {
      throw new SheetWritebackServiceError("reversal_forward_unproven");
    }
    const reversalId = sheetWritebackReversalExecutionId(
      forwardId,
      forward.receipt.resultHash,
    );
    let record = await this.dependencies.store.get(reversalId);
    if (!record) throw new SheetWritebackServiceError("execution_missing");
    if (record.state === "running" && record.attemptCount === 1) {
      const ageMs = this.now() - Date.parse(record.updatedAt);
      if (!Number.isFinite(ageMs) || ageMs < RECONCILE_MIN_AGE_MS) {
        throw new SheetWritebackServiceError("execution_in_progress");
      }
      await this.transitionClaimFailure(reversalId, true);
      record = await this.dependencies.store.get(reversalId);
      if (record?.state === "succeeded" && record.receipt) return record.receipt;
      if (!record) throw new SheetWritebackServiceError("execution_missing");
    }
    if (record.state !== "ambiguous" || record.attemptCount !== 1) {
      throw new SheetWritebackServiceError("execution_state");
    }
    const writer = this.dependencies.createWriter();
    if (effect.reversal.kind === "delete_appended_row") {
      const located = await this.locateRowByOperationId(
        input.proposal,
        effect.reversal.operationId,
        writer,
      );
      if (!located) {
        const receipt: ExternalActionReceipt = {
          actionKey: effect.actionKey,
          dataMode: "live",
          liveEvidenceEligible: true,
          providerRef: `s98-row-deleted:${effect.reversal.operationId}`,
          resultHash: hashExecutionPreview({
            version: "s98-delete-reconcile/v1",
            operationId: effect.reversal.operationId,
            absent: true,
          }),
          reconciled: true,
          createdAt: new Date(this.now()).toISOString(),
        };
        await this.dependencies.store.finish(reversalId, receipt);
        return receipt;
      }
      const rowHash = await this.hashRowContent(input.proposal, located, writer);
      if (rowHash === forward.receipt.resultHash) {
        throw new SheetWritebackServiceError("reconcile_not_proven");
      }
      throw new SheetWritebackServiceError("reconcile_drift");
    }
    const fieldEffect = effect.effect as SheetFieldUpdateEffectInput;
    const reversal = effect.reversal;
    const cell = await this.readAnchoredCell(input.proposal, fieldEffect, writer);
    if (
      reversal.kind === "restore_field" &&
      sheetCellValueMatches(reversal.restoreValue, cell)
    ) {
      const receipt: ExternalActionReceipt = {
        actionKey: effect.actionKey,
        dataMode: "live",
        liveEvidenceEligible: true,
        providerRef: `s98-cell:${fieldEffect.field}`,
        resultHash: hashExecutionPreview({
          version: "s98-cell-readback/v1",
          field: fieldEffect.field,
          value: cell,
        }),
        reconciled: true,
        createdAt: new Date(this.now()).toISOString(),
      };
      await this.dependencies.store.finish(reversalId, receipt);
      return receipt;
    }
    if (sheetCellValueMatches(fieldEffect.afterValue, cell)) {
      throw new SheetWritebackServiceError("reconcile_not_proven");
    }
    throw new SheetWritebackServiceError("reconcile_drift");
  }

  // ---------- internals ----------

  private now(): number {
    return this.dependencies.now ? this.dependencies.now() : Date.now();
  }

  private assertEnvironment(): void {
    try {
      assertLiveProviderActionAllowed(this.dependencies.descriptor);
    } catch {
      throw new SheetWritebackServiceError("environment_refused");
    }
  }

  private async assertGates(actionKey: string): Promise<void> {
    if (!this.dependencies.writeFlagEnabled()) {
      throw new SheetWritebackServiceError("flag_disabled");
    }
    const gate = this.dependencies.gateFor(actionKey);
    let executable = false;
    try {
      executable = (await gate.isExecutable()) === true;
    } catch {
      executable = false;
    }
    if (!executable) throw new SheetWritebackServiceError("action_closed");
  }

  private effectByHash(
    proposal: SheetWritebackProposal,
    effectHash: string,
  ): ValidatedSheetWritebackEffect {
    const effect = proposal.effects.find((entry) => entry.effectHash === effectHash);
    if (!effect) throw new SheetWritebackServiceError("effect_missing");
    return effect;
  }

  private async transitionClaimFailure(
    executionId: string,
    ambiguous: boolean,
  ): Promise<void> {
    try {
      await this.dependencies.store.fail(executionId, ambiguous);
    } catch {
      // The durable record keeps its running state; reconciliation remains available.
    }
  }

  private async assertHeaderFresh(
    proposal: SheetWritebackProposal,
    writer: SheetWritebackWriter,
  ): Promise<void> {
    const header = await this.readHeader(proposal, writer);
    if (header.hash !== proposal.headerHash) {
      throw new SheetWritebackServiceError("header_drift");
    }
  }

  private async readHeader(
    proposal: SheetWritebackProposal,
    writer: SheetWritebackWriter,
  ): Promise<{
    hash: string;
    width: number;
    columns: Map<string, number>;
  }> {
    let rows: string[][];
    try {
      rows = await writer.getValues(
        proposal.spreadsheetId,
        `'${proposal.tabTitle}'!A1:AZ1`,
      );
    } catch {
      throw new SheetWritebackServiceError("provider_read_failed");
    }
    const header = rows[0] ?? [];
    const resolution = resolveHeaders([header], RENEWAL_TAB_SCHEMAS.Renewals);
    const columns = new Map<string, number>();
    for (const column of resolution.columns) {
      if (column.field !== null && column.status === "resolved") {
        columns.set(column.field, column.index);
      }
    }
    return {
      hash: hashSheetHeader(header, columns),
      width: header.length,
      columns,
    };
  }

  private async assertFieldAnchorFresh(
    proposal: SheetWritebackProposal,
    effect: SheetFieldUpdateEffectInput,
    writer: SheetWritebackWriter,
  ): Promise<void> {
    if (effect.rowKey !== null) {
      const located = await this.locateRowByOperationId(proposal, effect.rowKey, writer);
      if (!located || located.rowNumber !== effect.rowNumber) {
        throw new SheetWritebackServiceError("row_anchor_drift");
      }
      return;
    }
    const tenantCell = await this.readCell(
      proposal,
      proposal.tenantColumnIndex,
      effect.rowNumber,
      writer,
    );
    if (tenantCell !== effect.anchorTenantName) {
      throw new SheetWritebackServiceError("row_anchor_drift");
    }
  }

  private async readCell(
    proposal: SheetWritebackProposal,
    columnIndex: number,
    rowNumber: number,
    writer: SheetWritebackWriter,
  ): Promise<string> {
    let rows: string[][];
    const letter = columnLetter(columnIndex);
    try {
      rows = await writer.getValues(
        proposal.spreadsheetId,
        `'${proposal.tabTitle}'!${letter}${rowNumber}:${letter}${rowNumber}`,
      );
    } catch {
      throw new SheetWritebackServiceError("provider_read_failed");
    }
    return rows[0]?.[0] ?? "";
  }

  private async readAnchoredCell(
    proposal: SheetWritebackProposal,
    effect: SheetFieldUpdateEffectInput,
    writer: SheetWritebackWriter,
  ): Promise<string> {
    const header = await this.readHeader(proposal, writer);
    const columnIndex = header.columns.get(effect.field);
    if (columnIndex === undefined) {
      throw new SheetWritebackServiceError("header_drift");
    }
    return this.readCell(proposal, columnIndex, effect.rowNumber, writer);
  }

  private async locateRowByOperationId(
    proposal: SheetWritebackProposal,
    operationId: string,
    writer: SheetWritebackWriter,
  ): Promise<{ rowNumber: number; value: string; note: string } | null> {
    let entries: { rowNumber: number; value: string; note: string }[];
    try {
      entries = await writer.getColumnNotes({
        spreadsheetId: proposal.spreadsheetId,
        tabTitle: proposal.tabTitle,
        columnIndex: proposal.tenantColumnIndex,
        startRowNumber: NOTE_SCAN_START_ROW,
        endRowNumber: NOTE_SCAN_MAX_ROW,
      });
    } catch {
      throw new SheetWritebackServiceError("provider_read_failed");
    }
    const matches = entries.filter((entry) => {
      const parsed = parseRowNote(entry.note);
      return parsed?.operationId === operationId;
    });
    if (matches.length > 1) throw new SheetWritebackServiceError("reconcile_drift");
    return matches[0] ?? null;
  }

  private async hashRowContent(
    proposal: SheetWritebackProposal,
    located: { rowNumber: number; note: string },
    writer: SheetWritebackWriter,
  ): Promise<string> {
    let rows: string[][];
    const lastLetter = columnLetter(proposal.headerWidth - 1);
    try {
      rows = await writer.getValues(
        proposal.spreadsheetId,
        `'${proposal.tabTitle}'!A${located.rowNumber}:${lastLetter}${located.rowNumber}`,
      );
    } catch {
      throw new SheetWritebackServiceError("provider_read_failed");
    }
    const values = rows[0] ?? [];
    const padded = Array.from(
      { length: proposal.headerWidth },
      (_, index) => values[index] ?? "",
    );
    return rowContentHash({ note: located.note, values: padded });
  }

  private buildRowValues(
    proposal: SheetWritebackProposal,
    effect: SheetRowAppendEffectInput,
    columns: Map<string, number>,
  ): string[] {
    const values = Array.from({ length: proposal.headerWidth }, () => "");
    values[proposal.tenantColumnIndex] = effect.tenantName;
    for (const [field, entry] of Object.entries(effect.fields)) {
      const columnIndex = columns.get(field);
      if (columnIndex === undefined) {
        throw new SheetWritebackServiceError("header_drift");
      }
      values[columnIndex] = entry.value;
    }
    return values;
  }

  private noteFor(effect: SheetRowAppendEffectInput): string {
    const identity = {
      operationId: effect.operationId,
      leaseId: effect.leaseId,
      propertyId: effect.propertyId,
    };
    return effect.mode === "proof" ? proofRowNote(identity) : normalRowNote(identity);
  }

  private async performEffect(
    proposal: SheetWritebackProposal,
    validated: ValidatedSheetWritebackEffect,
    writer: SheetWritebackWriter,
  ): Promise<{ providerRef: string; readbackHash: string; rowNumber?: number }> {
    const header = await this.readHeader(proposal, writer);
    if (header.hash !== proposal.headerHash) {
      throw new SheetWritebackServiceError("header_drift");
    }
    if (validated.effect.kind === "row_append") {
      const effect = validated.effect;
      const values = this.buildRowValues(proposal, effect, header.columns);
      const note = this.noteFor(effect);
      const sheetId = await writer.getSheetIdByTitle(
        proposal.spreadsheetId,
        proposal.tabTitle,
      );
      await writer.appendRowWithNote({
        spreadsheetId: proposal.spreadsheetId,
        sheetId,
        values,
        noteColumnIndex: proposal.tenantColumnIndex,
        note,
      });
      const located = await this.locateRowByOperationId(
        proposal,
        effect.operationId,
        writer,
      );
      if (!located || located.note !== note) {
        throw new SheetWritebackServiceError("provider_readback_mismatch");
      }
      const rowHash = await this.hashRowContent(proposal, located, writer);
      const expectedHash = rowContentHash({ note, values });
      if (rowHash !== expectedHash) {
        throw new SheetWritebackServiceError("provider_readback_mismatch");
      }
      return {
        providerRef: `s98-row:${effect.operationId}`,
        readbackHash: rowHash,
        rowNumber: located.rowNumber,
      };
    }

    const effect = validated.effect;
    const columnIndex = header.columns.get(effect.field);
    if (columnIndex === undefined) {
      throw new SheetWritebackServiceError("header_drift");
    }
    const letter = columnLetter(columnIndex);
    const range = `'${proposal.tabTitle}'!${letter}${effect.rowNumber}`;
    const applied = await writer.replaceCellIfExactMatch(
      proposal.spreadsheetId,
      range,
      effect.expectedValue,
      effect.afterValue,
    );
    if (!applied) throw new SheetWritebackServiceError("cas_not_applied");
    const readback = await this.readCell(proposal, columnIndex, effect.rowNumber, writer);
    if (!sheetCellValueMatches(effect.afterValue, readback)) {
      throw new SheetWritebackServiceError("provider_readback_mismatch");
    }
    return {
      providerRef: `s98-cell:${effect.field}`,
      readbackHash: hashExecutionPreview({
        version: "s98-cell-readback/v1",
        field: effect.field,
        value: readback,
      }),
    };
  }

  private async performReversal(
    proposal: SheetWritebackProposal,
    validated: ValidatedSheetWritebackEffect,
    forward: ExternalExecutionRecord,
    writer: SheetWritebackWriter,
  ): Promise<{ providerRef: string; readbackHash: string }> {
    const reversal = validated.reversal;
    if (reversal.kind === "delete_appended_row") {
      const located = await this.locateRowByOperationId(
        proposal,
        reversal.operationId,
        writer,
      );
      if (!located) throw new SheetWritebackServiceError("reversal_target_drift");
      const rowHash = await this.hashRowContent(proposal, located, writer);
      if (rowHash !== forward.receipt!.resultHash) {
        throw new SheetWritebackServiceError("reversal_target_drift");
      }
      const sheetId = await writer.getSheetIdByTitle(
        proposal.spreadsheetId,
        proposal.tabTitle,
      );
      await writer.deleteExactRow({
        spreadsheetId: proposal.spreadsheetId,
        sheetId,
        rowNumber: located.rowNumber,
      });
      const still = await this.locateRowByOperationId(
        proposal,
        reversal.operationId,
        writer,
      );
      if (still) throw new SheetWritebackServiceError("provider_readback_mismatch");
      return {
        providerRef: `s98-row-deleted:${reversal.operationId}`,
        readbackHash: hashExecutionPreview({
          version: "s98-delete-readback/v1",
          operationId: reversal.operationId,
          deletedHash: forward.receipt!.resultHash,
        }),
      };
    }

    const fieldEffect = validated.effect as SheetFieldUpdateEffectInput;
    const cell = await this.readAnchoredCell(proposal, fieldEffect, writer);
    if (!sheetCellValueMatches(fieldEffect.afterValue, cell)) {
      throw new SheetWritebackServiceError("reversal_target_drift");
    }
    const header = await this.readHeader(proposal, writer);
    const columnIndex = header.columns.get(fieldEffect.field);
    if (columnIndex === undefined) {
      throw new SheetWritebackServiceError("header_drift");
    }
    const letter = columnLetter(columnIndex);
    const range = `'${proposal.tabTitle}'!${letter}${fieldEffect.rowNumber}`;
    const applied = await writer.replaceCellIfExactMatch(
      proposal.spreadsheetId,
      range,
      fieldEffect.afterValue,
      reversal.restoreValue,
    );
    if (!applied) throw new SheetWritebackServiceError("cas_not_applied");
    const readback = await this.readCell(
      proposal,
      columnIndex,
      fieldEffect.rowNumber,
      writer,
    );
    if (!sheetCellValueMatches(reversal.restoreValue, readback)) {
      throw new SheetWritebackServiceError("provider_readback_mismatch");
    }
    return {
      providerRef: `s98-cell:${fieldEffect.field}`,
      readbackHash: hashExecutionPreview({
        version: "s98-cell-readback/v1",
        field: fieldEffect.field,
        value: readback,
      }),
    };
  }

  private async observeEffectOutcome(
    proposal: SheetWritebackProposal,
    validated: ValidatedSheetWritebackEffect,
  ): Promise<
    | { state: "after"; providerRef: string; readbackHash: string }
    | { state: "before" }
    | { state: "drift" }
  > {
    const writer = this.dependencies.createWriter();
    if (validated.effect.kind === "row_append") {
      const effect = validated.effect;
      const located = await this.locateRowByOperationId(
        proposal,
        effect.operationId,
        writer,
      );
      if (!located) return { state: "before" };
      const header = await this.readHeader(proposal, writer);
      if (header.hash !== proposal.headerHash) return { state: "drift" };
      const note = this.noteFor(effect);
      if (located.note !== note) return { state: "drift" };
      const rowHash = await this.hashRowContent(proposal, located, writer);
      const expectedHash = rowContentHash({
        note,
        values: this.buildRowValues(proposal, effect, header.columns),
      });
      if (rowHash !== expectedHash) return { state: "drift" };
      return {
        state: "after",
        providerRef: `s98-row:${effect.operationId}`,
        readbackHash: rowHash,
      };
    }
    const effect = validated.effect;
    const cell = await this.readAnchoredCell(proposal, effect, writer);
    if (sheetCellValueMatches(effect.afterValue, cell)) {
      return {
        state: "after",
        providerRef: `s98-cell:${effect.field}`,
        readbackHash: hashExecutionPreview({
          version: "s98-cell-readback/v1",
          field: effect.field,
          value: cell,
        }),
      };
    }
    if (sheetCellValueMatches(effect.expectedValue, cell)) return { state: "before" };
    return { state: "drift" };
  }
}

/** Deterministic header identity: raw phrases plus the resolved semantic positions. */
export function hashSheetHeader(
  header: readonly string[],
  columns: ReadonlyMap<string, number>,
): string {
  return hashExecutionPreview({
    version: "s98-header/v1",
    header,
    columns: canonicalJson(
      Object.fromEntries([...columns.entries()].sort(([a], [b]) => a.localeCompare(b))),
    ),
  });
}

/** Rows whose tenant-cell note carries the exact proof prefix are excluded downstream. */
export function isProofRowNote(note: string): boolean {
  return note.startsWith(PROOF_NOTE_PREFIX);
}
