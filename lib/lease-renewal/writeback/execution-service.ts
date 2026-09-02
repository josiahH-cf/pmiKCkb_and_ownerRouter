// S97 renewal-writeback execution service.
//
// One effect at a time: environment and gate checks, fresh provider before-read, revalidated
// confirmation, an application-level claim, at most one provider call, required exact readback, a
// bodyless hash-bound receipt, and duplicate-confirmation replay of the durable outcome. RentVine
// exposes no proven idempotency or compare-and-set, so timeout/5xx/invalid-response/claim
// uncertainty becomes `ambiguous` and never retries; matching readback alone never claims
// causality. Reversal is a separately previewed and confirmed operation bound to the forward
// receipt. Provider receipt persistence precedes any app projection; a projection failure after
// provider success reconciles the projection and never issues another provider write.

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
  ExternalExecutionStore,
} from "@/lib/external-execution/types";
import type {
  RentVineLeaseUpdatePayload,
  RentVineRecurringChargeCreatePayload,
  RentVineRecurringChargeUpdatePayload,
} from "@/lib/integrations/rentvine/write-client";
import {
  RENEWAL_WRITEBACK_CONFIRMATION_TTL_MS,
  RenewalWritebackContractError,
  assertRenewalWritebackConfirmation,
  projectRecurringCharge,
  renewalWritebackExecutionId,
  renewalWritebackReversalExecutionId,
  type LeaseDateState,
  type RecurringChargeProjection,
  type RenewalWritebackConfirmation,
  type RenewalWritebackProposal,
  type ValidatedRenewalWritebackEffect,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export type RenewalWritebackServiceErrorCode =
  | "environment_refused"
  | "action_closed"
  | "effect_missing"
  | "execution_missing"
  | "execution_state"
  | "execution_in_progress"
  | "claim_refused"
  | "provider_read_failed"
  | "provider_shape"
  | "provider_state_drift"
  | "provider_readback_mismatch"
  | "provider_refused"
  | "provider_ambiguous"
  | "reconcile_not_proven"
  | "reconcile_drift"
  | "reversal_unsupported"
  | "reversal_forward_unproven"
  | "reversal_target_drift"
  | "confirmation_invalid";

/** Value-free refusal safe for routes and UI copy. */
export class RenewalWritebackServiceError extends Error {
  constructor(public readonly code: RenewalWritebackServiceErrorCode) {
    super(`S97 renewal-writeback operation refused (${code}).`);
    this.name = "RenewalWritebackServiceError";
  }
}

export interface RenewalWritebackGate {
  isExecutable(): Promise<boolean>;
  run<T>(effect: () => Promise<T> | T): Promise<T>;
}

export interface RenewalWritebackProviderReads {
  getLease(leaseId: string): Promise<Record<string, unknown>>;
  getRecurringCharge(leaseId: string, chargeId: string): Promise<Record<string, unknown>>;
  listRecurringCharges(leaseId: string): Promise<Record<string, unknown>[]>;
}

export interface RenewalWritebackWriter {
  updateLease(leaseId: string, payload: RentVineLeaseUpdatePayload): Promise<unknown>;
  updateExistingRecurringCharge(
    leaseId: string,
    chargeId: string,
    payload: RentVineRecurringChargeUpdatePayload,
  ): Promise<unknown>;
  createRecurringCharge(
    leaseId: string,
    payload: RentVineRecurringChargeCreatePayload,
  ): Promise<unknown>;
  deleteRecurringChargeForCreateReversal(
    leaseId: string,
    chargeId: string,
  ): Promise<unknown>;
}

export interface RenewalWritebackDependencies {
  descriptor: EnvironmentDescriptor;
  store: ExternalExecutionStore;
  reads: RenewalWritebackProviderReads;
  createWriter: () => RenewalWritebackWriter;
  /** Per exact Action Registry key; a missing gate fails closed. */
  gateFor(actionKey: string): RenewalWritebackGate;
  now?: () => number;
}

const RECONCILE_MIN_AGE_MS = 2 * 60 * 1_000;
const NOT_FOUND_STATUSES = new Set([404]);

export function leaseDateStateOf(raw: Record<string, unknown>): LeaseDateState {
  const lease =
    raw["lease"] && typeof raw["lease"] === "object" && !Array.isArray(raw["lease"])
      ? (raw["lease"] as Record<string, unknown>)
      : raw;
  const read = (key: string): string | null => {
    const value = lease[key];
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string") {
      throw new RenewalWritebackServiceError("provider_shape");
    }
    return value.slice(0, 10);
  };
  const startDate = read("startDate");
  if (startDate === null) throw new RenewalWritebackServiceError("provider_shape");
  return {
    startDate,
    endDate: read("endDate"),
    increaseEligibilityDate: read("increaseEligibilityDate"),
  };
}

function unwrapEnvelope(raw: unknown, key: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RenewalWritebackServiceError("provider_shape");
  }
  const record = raw as Record<string, unknown>;
  const inner = record[key];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  throw new RenewalWritebackServiceError("provider_shape");
}

function chargeProjectionHash(projection: RecurringChargeProjection): string {
  return hashExecutionPreview({ version: "s97-charge-projection/v1", projection });
}

/**
 * The official write payloads carry MM/DD/YYYY charge dates while the provider stores and echoes
 * ISO YYYY-MM-DD (verified live 2026-09-02). Readback comparison normalizes both sides to ISO so
 * "normalized submitted field" matching follows the documented contract; non-date values compare
 * byte-exact.
 */
function normalizedChargeDate(value: string | null): string | null {
  if (value === null) return null;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return value.slice(0, 10);
}

function chargeFieldMatches(
  field: string,
  actual: string | null,
  expected: string | null,
): boolean {
  if (field === "startDate" || field === "endDate") {
    return normalizedChargeDate(actual) === normalizedChargeDate(expected);
  }
  return actual === expected;
}

function providerOutcomeIsAmbiguous(error: unknown): boolean {
  // Auth/permission/validation refusals are definite; anything else after a provider attempt is
  // treated as possibly-applied.
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500 && status !== 408) {
    return false;
  }
  return true;
}

function isProviderNotFound(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" && NOT_FOUND_STATUSES.has(status);
}

export interface RenewalWritebackReceiptDetails {
  receipt: ExternalActionReceipt;
  duplicate: boolean;
  /** Present for a successful charge create: the provider-issued id for later reversal binding. */
  createdChargeId?: string;
}

export interface RenewalWritebackReversalPreview {
  reversalExecutionId: string;
  forwardExecutionId: string;
  previewHash: string;
  expiresAtIso: string;
  kind: "restore_dates" | "restore_charge_fields" | "delete_created_charge";
}

export class RenewalWritebackService {
  constructor(private readonly dependencies: RenewalWritebackDependencies) {}

  /** Execute one confirmed effect of one proposal, exactly once. */
  async executeEffect(input: {
    proposal: RenewalWritebackProposal;
    effectHash: string;
    confirmation: RenewalWritebackConfirmation;
  }): Promise<RenewalWritebackReceiptDetails> {
    this.assertEnvironment();
    const { proposal } = input;
    const effect = this.effectByHash(proposal, input.effectHash);
    const nowMs = this.now();
    try {
      assertRenewalWritebackConfirmation({
        proposal,
        effect,
        confirmation: input.confirmation,
        nowMs,
      });
    } catch (error) {
      if (error instanceof RenewalWritebackContractError) {
        throw new RenewalWritebackServiceError("confirmation_invalid");
      }
      throw error;
    }

    const gate = this.dependencies.gateFor(effect.actionKey);
    if (!(await this.executableFailClosed(gate))) {
      throw new RenewalWritebackServiceError("action_closed");
    }

    const executionId = renewalWritebackExecutionId(proposal, effect);
    const existing = await this.dependencies.store.get(executionId);
    if (existing?.state === "succeeded" && existing.receipt) {
      return {
        receipt: existing.receipt,
        duplicate: true,
        ...this.createdChargeIdOf(existing.receipt),
      };
    }
    if (existing && (existing.state !== "ready" || existing.attemptCount !== 0)) {
      throw new RenewalWritebackServiceError("execution_state");
    }

    // Fresh before-read outside the gate proves current state still matches the proposal.
    await this.assertEffectBeforeState(proposal, effect);

    const record = existing ?? this.buildExecutionRecord(proposal, effect, executionId);
    if (!existing) {
      try {
        await this.dependencies.store.create(record);
      } catch {
        const concurrent = await this.dependencies.store.get(executionId);
        if (concurrent?.state === "succeeded" && concurrent.receipt) {
          return {
            receipt: concurrent.receipt,
            duplicate: true,
            ...this.createdChargeIdOf(concurrent.receipt),
          };
        }
        if (!concurrent) throw new RenewalWritebackServiceError("execution_state");
      }
    }

    const claim = await this.dependencies.store.claim(executionId, record.previewHash);
    if (claim === "duplicate") {
      const duplicate = await this.dependencies.store.get(executionId);
      if (duplicate?.receipt) {
        return {
          receipt: duplicate.receipt,
          duplicate: true,
          ...this.createdChargeIdOf(duplicate.receipt),
        };
      }
    }
    if (claim !== "claimed") throw new RenewalWritebackServiceError("claim_refused");

    let providerAttempted = false;
    let outcome: {
      providerRef: string;
      readbackHash: string;
      createdChargeId?: string;
    };
    try {
      outcome = await gate.run(async () => {
        // Revalidate inside the gate immediately before writer construction.
        await this.assertEffectBeforeState(proposal, effect);
        const insideNowMs = this.now();
        assertRenewalWritebackConfirmation({
          proposal,
          effect,
          confirmation: input.confirmation,
          nowMs: insideNowMs,
        });
        const writer = this.dependencies.createWriter();
        providerAttempted = true;
        return this.performEffect(proposal, effect, writer);
      });
    } catch (error) {
      const ambiguous = providerAttempted && providerOutcomeIsAmbiguous(error);
      await this.transitionClaimFailure(executionId, ambiguous);
      if (error instanceof RenewalWritebackServiceError && !providerAttempted) {
        throw error;
      }
      if (!providerAttempted) throw new RenewalWritebackServiceError("action_closed");
      if (!ambiguous) throw new RenewalWritebackServiceError("provider_refused");
      throw new RenewalWritebackServiceError("provider_ambiguous");
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
    try {
      await this.dependencies.store.finish(executionId, receipt);
    } catch {
      const observed = await this.dependencies.store.get(executionId);
      if (
        observed?.state === "succeeded" &&
        observed.receipt &&
        canonicalJson(observed.receipt) === canonicalJson(receipt)
      ) {
        return { receipt: observed.receipt, duplicate: true, ...outcome };
      }
      await this.transitionClaimFailure(executionId, true);
      throw new RenewalWritebackServiceError("provider_ambiguous");
    }
    return {
      receipt,
      duplicate: false,
      ...(outcome.createdChargeId ? { createdChargeId: outcome.createdChargeId } : {}),
    };
  }

  /** Reconcile one ambiguous effect by observation only; never retries or claims causality. */
  async reconcileEffect(input: {
    proposal: RenewalWritebackProposal;
    effectHash: string;
  }): Promise<ExternalActionReceipt> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    const executionId = renewalWritebackExecutionId(input.proposal, effect);
    let record = await this.dependencies.store.get(executionId);
    if (!record) throw new RenewalWritebackServiceError("execution_missing");
    if (record.state === "running" && record.attemptCount === 1) {
      const ageMs = this.now() - Date.parse(record.updatedAt);
      if (!Number.isFinite(ageMs) || ageMs < RECONCILE_MIN_AGE_MS) {
        throw new RenewalWritebackServiceError("execution_in_progress");
      }
      await this.transitionClaimFailure(executionId, true);
      record = await this.dependencies.store.get(executionId);
      if (record?.state === "succeeded" && record.receipt) return record.receipt;
      if (!record) throw new RenewalWritebackServiceError("execution_missing");
    }
    if (record.state !== "ambiguous" || record.attemptCount !== 1) {
      throw new RenewalWritebackServiceError("execution_state");
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
      throw new RenewalWritebackServiceError("reconcile_not_proven");
    }
    throw new RenewalWritebackServiceError("reconcile_drift");
  }

  /**
   * Prepare one reversal preview bound to a succeeded forward receipt. Reversal requires its own
   * fresh state proof and confirmation; drift refuses rather than compensating automatically.
   */
  async previewReversal(input: {
    proposal: RenewalWritebackProposal;
    effectHash: string;
  }): Promise<RenewalWritebackReversalPreview> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    if (effect.reversal.kind === "none") {
      throw new RenewalWritebackServiceError("reversal_unsupported");
    }
    const forwardExecutionId = renewalWritebackExecutionId(input.proposal, effect);
    const forward = await this.dependencies.store.get(forwardExecutionId);
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    await this.assertReversalTargetFresh(input.proposal, effect, forward);
    const reversalExecutionId = renewalWritebackReversalExecutionId(
      forwardExecutionId,
      forward.receipt.resultHash,
    );
    const nowMs = this.now();
    return {
      reversalExecutionId,
      forwardExecutionId,
      previewHash: hashExecutionPreview({
        version: "s97-reversal-preview/v1",
        reversalExecutionId,
        forwardReceiptHash: forward.receipt.resultHash,
        reversal: effect.reversal,
      }),
      expiresAtIso: new Date(nowMs + RENEWAL_WRITEBACK_CONFIRMATION_TTL_MS).toISOString(),
      kind: effect.reversal.kind,
    };
  }

  /** Execute one separately confirmed reversal, exactly once. */
  async executeReversal(input: {
    proposal: RenewalWritebackProposal;
    effectHash: string;
    reversal: RenewalWritebackReversalPreview;
    confirmedAtIso: string;
  }): Promise<RenewalWritebackReceiptDetails> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    if (effect.reversal.kind === "none") {
      throw new RenewalWritebackServiceError("reversal_unsupported");
    }
    const gate = this.dependencies.gateFor(effect.actionKey);
    if (!(await this.executableFailClosed(gate))) {
      throw new RenewalWritebackServiceError("action_closed");
    }
    const nowMs = this.now();
    const confirmedAtMs = Date.parse(input.confirmedAtIso);
    if (
      !Number.isFinite(confirmedAtMs) ||
      confirmedAtMs > nowMs ||
      nowMs > Date.parse(input.reversal.expiresAtIso)
    ) {
      throw new RenewalWritebackServiceError("confirmation_invalid");
    }
    const forward = await this.dependencies.store.get(input.reversal.forwardExecutionId);
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    const expectedReversalId = renewalWritebackReversalExecutionId(
      input.reversal.forwardExecutionId,
      forward.receipt.resultHash,
    );
    if (expectedReversalId !== input.reversal.reversalExecutionId) {
      throw new RenewalWritebackServiceError("confirmation_invalid");
    }

    const existing = await this.dependencies.store.get(expectedReversalId);
    if (existing?.state === "succeeded" && existing.receipt) {
      return { receipt: existing.receipt, duplicate: true };
    }
    if (existing && (existing.state !== "ready" || existing.attemptCount !== 0)) {
      throw new RenewalWritebackServiceError("execution_state");
    }

    await this.assertReversalTargetFresh(input.proposal, effect, forward);

    const record: ExternalExecutionRecord = {
      id: expectedReversalId,
      dataMode: "live",
      workflowId: `s97:${input.proposal.leaseId}`,
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
    if (!existing) {
      try {
        await this.dependencies.store.create(record);
      } catch {
        const concurrent = await this.dependencies.store.get(expectedReversalId);
        if (concurrent?.state === "succeeded" && concurrent.receipt) {
          return { receipt: concurrent.receipt, duplicate: true };
        }
        if (!concurrent) throw new RenewalWritebackServiceError("execution_state");
      }
    }
    const claim = await this.dependencies.store.claim(
      expectedReversalId,
      input.reversal.previewHash,
    );
    if (claim === "duplicate") {
      const duplicate = await this.dependencies.store.get(expectedReversalId);
      if (duplicate?.receipt) return { receipt: duplicate.receipt, duplicate: true };
    }
    if (claim !== "claimed") throw new RenewalWritebackServiceError("claim_refused");

    let providerAttempted = false;
    let outcome: { providerRef: string; readbackHash: string };
    try {
      outcome = await gate.run(async () => {
        await this.assertReversalTargetFresh(input.proposal, effect, forward);
        const writer = this.dependencies.createWriter();
        providerAttempted = true;
        return this.performReversal(input.proposal, effect, writer);
      });
    } catch (error) {
      const ambiguous = providerAttempted && providerOutcomeIsAmbiguous(error);
      await this.transitionClaimFailure(expectedReversalId, ambiguous);
      if (error instanceof RenewalWritebackServiceError && !providerAttempted) {
        throw error;
      }
      if (!providerAttempted) throw new RenewalWritebackServiceError("action_closed");
      if (!ambiguous) throw new RenewalWritebackServiceError("provider_refused");
      throw new RenewalWritebackServiceError("provider_ambiguous");
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
    try {
      await this.dependencies.store.finish(expectedReversalId, receipt);
    } catch {
      const observed = await this.dependencies.store.get(expectedReversalId);
      if (
        observed?.state === "succeeded" &&
        observed.receipt &&
        canonicalJson(observed.receipt) === canonicalJson(receipt)
      ) {
        return { receipt: observed.receipt, duplicate: true };
      }
      await this.transitionClaimFailure(expectedReversalId, true);
      throw new RenewalWritebackServiceError("provider_ambiguous");
    }
    return { receipt, duplicate: false };
  }

  private effectByHash(
    proposal: RenewalWritebackProposal,
    effectHash: string,
  ): ValidatedRenewalWritebackEffect {
    const effect = proposal.effects.find((entry) => entry.effectHash === effectHash);
    if (!effect) throw new RenewalWritebackServiceError("effect_missing");
    return effect;
  }

  private buildExecutionRecord(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    executionId: string,
  ): ExternalExecutionRecord {
    const nowIso = new Date(this.now()).toISOString();
    return {
      id: executionId,
      dataMode: "live",
      workflowId: `s97:${proposal.leaseId}`,
      actionId: executionId,
      actionKey: effect.actionKey,
      contextHash: proposal.previewHash,
      previewHash: effect.effectHash,
      idempotencyKey: executionId,
      state: "ready",
      attemptCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  private createdChargeIdOf(receipt: ExternalActionReceipt): {
    createdChargeId?: string;
  } {
    const match = /^s97-charge:(\d+)$/.exec(receipt.providerRef);
    return match ? { createdChargeId: match[1] } : {};
  }

  /** Fresh provider state must still match the proposal's before state for this effect. */
  private async assertEffectBeforeState(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
  ): Promise<void> {
    const { effect: input } = effect;
    if (input.kind === "renewal_dates_update") {
      const fresh = await this.readLeaseDates(proposal.leaseId);
      if (canonicalJson(fresh) !== canonicalJson(input.before)) {
        throw new RenewalWritebackServiceError("provider_state_drift");
      }
      return;
    }
    if (input.kind === "recurring_charge_update") {
      const fresh = await this.readChargeProjection(proposal.leaseId, input.chargeId);
      if (canonicalJson(fresh) !== canonicalJson(input.before)) {
        throw new RenewalWritebackServiceError("provider_state_drift");
      }
      return;
    }
    // A create has no provider before-record; the lease itself must still exist.
    await this.readLeaseDates(proposal.leaseId);
  }

  private async performEffect(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    writer: RenewalWritebackWriter,
  ): Promise<{ providerRef: string; readbackHash: string; createdChargeId?: string }> {
    const input = effect.effect;
    if (input.kind === "renewal_dates_update") {
      const payload: RentVineLeaseUpdatePayload = {
        startDate: input.before.startDate,
        ...("endDate" in input.after ? { endDate: input.after.endDate } : {}),
        ...("increaseEligibilityDate" in input.after
          ? { increaseEligibilityDate: input.after.increaseEligibilityDate }
          : {}),
      };
      const response = await writer.updateLease(proposal.leaseId, payload);
      unwrapEnvelope(response, "lease");
      const readback = await this.readLeaseDates(proposal.leaseId);
      const expected: LeaseDateState = {
        startDate: input.before.startDate,
        endDate:
          "endDate" in input.after ? (input.after.endDate ?? null) : input.before.endDate,
        increaseEligibilityDate:
          "increaseEligibilityDate" in input.after
            ? (input.after.increaseEligibilityDate ?? null)
            : input.before.increaseEligibilityDate,
      };
      if (canonicalJson(readback) !== canonicalJson(expected)) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
      return {
        providerRef: `s97-lease:${proposal.leaseId}`,
        readbackHash: hashExecutionPreview({
          version: "s97-dates-readback/v1",
          leaseId: proposal.leaseId,
          readback,
        }),
      };
    }

    if (input.kind === "recurring_charge_update") {
      const response = await writer.updateExistingRecurringCharge(
        proposal.leaseId,
        input.chargeId,
        input.changes as RentVineRecurringChargeUpdatePayload,
      );
      unwrapEnvelope(response, "recurringCharge");
      const readback = await this.readChargeProjection(proposal.leaseId, input.chargeId);
      this.assertChargeFieldsApplied(readback, input.before, input.changes);
      return {
        providerRef: `s97-charge:${input.chargeId}`,
        readbackHash: chargeProjectionHash(readback),
      };
    }

    const response = await writer.createRecurringCharge(proposal.leaseId, input.create);
    const created = projectRecurringCharge(unwrapEnvelope(response, "recurringCharge"));
    if (created.leaseID !== proposal.leaseId) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
    this.assertCreateFieldsApplied(created, input.create);
    const detail = await this.readChargeProjection(
      proposal.leaseId,
      created.leaseRecurringChargeID,
    );
    this.assertCreateFieldsApplied(detail, input.create);
    if (detail.leaseRecurringChargeID !== created.leaseRecurringChargeID) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
    return {
      providerRef: `s97-charge:${created.leaseRecurringChargeID}`,
      readbackHash: chargeProjectionHash(detail),
      createdChargeId: created.leaseRecurringChargeID,
    };
  }

  private async performReversal(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    writer: RenewalWritebackWriter,
  ): Promise<{ providerRef: string; readbackHash: string }> {
    const reversal = effect.reversal;
    if (reversal.kind === "restore_dates") {
      const response = await writer.updateLease(proposal.leaseId, {
        startDate: reversal.restore.startDate,
        endDate: reversal.restore.endDate,
        increaseEligibilityDate: reversal.restore.increaseEligibilityDate,
      });
      unwrapEnvelope(response, "lease");
      const readback = await this.readLeaseDates(proposal.leaseId);
      if (canonicalJson(readback) !== canonicalJson(reversal.restore)) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
      return {
        providerRef: `s97-lease:${proposal.leaseId}`,
        readbackHash: hashExecutionPreview({
          version: "s97-dates-readback/v1",
          leaseId: proposal.leaseId,
          readback,
        }),
      };
    }
    if (reversal.kind === "restore_charge_fields") {
      const response = await writer.updateExistingRecurringCharge(
        proposal.leaseId,
        reversal.chargeId,
        reversal.restore as RentVineRecurringChargeUpdatePayload,
      );
      unwrapEnvelope(response, "recurringCharge");
      const readback = await this.readChargeProjection(
        proposal.leaseId,
        reversal.chargeId,
      );
      const original =
        effect.effect.kind === "recurring_charge_update" ? effect.effect.before : null;
      if (!original) throw new RenewalWritebackServiceError("reversal_unsupported");
      this.assertChargeFieldsApplied(
        readback,
        readback,
        reversal.restore as Record<string, string>,
      );
      // Every restored field must equal the original pre-forward value.
      for (const [field, value] of Object.entries(reversal.restore)) {
        if (original[field as keyof RecurringChargeProjection] !== value) {
          throw new RenewalWritebackServiceError("provider_readback_mismatch");
        }
      }
      return {
        providerRef: `s97-charge:${reversal.chargeId}`,
        readbackHash: chargeProjectionHash(readback),
      };
    }

    // delete_created_charge: the target id comes from the forward receipt's provider ref.
    const forwardId = renewalWritebackExecutionId(proposal, effect);
    const forward = await this.dependencies.store.get(forwardId);
    const chargeId = forward?.receipt
      ? this.createdChargeIdOf(forward.receipt).createdChargeId
      : undefined;
    if (!chargeId) throw new RenewalWritebackServiceError("reversal_forward_unproven");
    const preDelete = await this.readChargeProjection(proposal.leaseId, chargeId);
    const response = await writer.deleteRecurringChargeForCreateReversal(
      proposal.leaseId,
      chargeId,
    );
    // The HTTP 200 response is the deleted recurring-charge object directly.
    const deleted = projectRecurringCharge(response);
    if (canonicalJson(deleted) !== canonicalJson(preDelete)) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
    let detailAbsent = false;
    try {
      await this.dependencies.reads.getRecurringCharge(proposal.leaseId, chargeId);
    } catch (error) {
      if (isProviderNotFound(error)) detailAbsent = true;
      else throw new RenewalWritebackServiceError("provider_ambiguous");
    }
    if (!detailAbsent) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
    const list = await this.dependencies.reads.listRecurringCharges(proposal.leaseId);
    const stillListed = list.some((entry) => {
      const id = (entry as Record<string, unknown>)["leaseRecurringChargeID"];
      return typeof id === "string" && id === chargeId;
    });
    if (stillListed) throw new RenewalWritebackServiceError("provider_readback_mismatch");
    return {
      providerRef: `s97-charge-deleted:${chargeId}`,
      readbackHash: hashExecutionPreview({
        version: "s97-delete-readback/v1",
        chargeId,
        deletedHash: chargeProjectionHash(deleted),
      }),
    };
  }

  private async assertReversalTargetFresh(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    forward: ExternalExecutionRecord,
  ): Promise<void> {
    const reversal = effect.reversal;
    if (reversal.kind === "restore_dates") {
      // The lease must still carry exactly the forward outcome.
      const fresh = await this.readLeaseDates(proposal.leaseId);
      const input = effect.effect;
      if (input.kind !== "renewal_dates_update") {
        throw new RenewalWritebackServiceError("reversal_unsupported");
      }
      const expected: LeaseDateState = {
        startDate: input.before.startDate,
        endDate:
          "endDate" in input.after ? (input.after.endDate ?? null) : input.before.endDate,
        increaseEligibilityDate:
          "increaseEligibilityDate" in input.after
            ? (input.after.increaseEligibilityDate ?? null)
            : input.before.increaseEligibilityDate,
      };
      if (canonicalJson(fresh) !== canonicalJson(expected)) {
        throw new RenewalWritebackServiceError("reversal_target_drift");
      }
      return;
    }
    if (reversal.kind === "restore_charge_fields") {
      const input = effect.effect;
      if (input.kind !== "recurring_charge_update") {
        throw new RenewalWritebackServiceError("reversal_unsupported");
      }
      const fresh = await this.readChargeProjection(proposal.leaseId, reversal.chargeId);
      this.assertChargeFieldsApplied(fresh, input.before, input.changes);
      return;
    }
    // delete_created_charge: the created charge must still canonically match its receipt hash.
    const chargeId = forward.receipt
      ? this.createdChargeIdOf(forward.receipt).createdChargeId
      : undefined;
    if (!chargeId || !forward.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    const fresh = await this.readChargeProjection(proposal.leaseId, chargeId);
    if (chargeProjectionHash(fresh) !== forward.receipt.resultHash) {
      throw new RenewalWritebackServiceError("reversal_target_drift");
    }
  }

  /** Observed-state classification for reconciliation; matching data alone never proves causality. */
  private async observeEffectOutcome(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
  ): Promise<
    | { state: "after"; providerRef: string; readbackHash: string }
    | { state: "before" }
    | { state: "drift" }
  > {
    const input = effect.effect;
    if (input.kind === "renewal_dates_update") {
      const fresh = await this.readLeaseDates(proposal.leaseId);
      const after: LeaseDateState = {
        startDate: input.before.startDate,
        endDate:
          "endDate" in input.after ? (input.after.endDate ?? null) : input.before.endDate,
        increaseEligibilityDate:
          "increaseEligibilityDate" in input.after
            ? (input.after.increaseEligibilityDate ?? null)
            : input.before.increaseEligibilityDate,
      };
      if (canonicalJson(fresh) === canonicalJson(after)) {
        return {
          state: "after",
          providerRef: `s97-lease:${proposal.leaseId}`,
          readbackHash: hashExecutionPreview({
            version: "s97-dates-readback/v1",
            leaseId: proposal.leaseId,
            readback: fresh,
          }),
        };
      }
      if (canonicalJson(fresh) === canonicalJson(input.before))
        return { state: "before" };
      return { state: "drift" };
    }
    if (input.kind === "recurring_charge_update") {
      const fresh = await this.readChargeProjection(proposal.leaseId, input.chargeId);
      try {
        this.assertChargeFieldsApplied(fresh, input.before, input.changes);
        return {
          state: "after",
          providerRef: `s97-charge:${input.chargeId}`,
          readbackHash: chargeProjectionHash(fresh),
        };
      } catch {
        if (canonicalJson(fresh) === canonicalJson(input.before)) {
          return { state: "before" };
        }
        return { state: "drift" };
      }
    }
    // Create: the list is discovery only (live list rows omit recurringStatusID); each candidate
    // id is confirmed through the canonical detail read before it can count as the applied effect.
    const list = await this.dependencies.reads.listRecurringCharges(proposal.leaseId);
    const candidateIds = list
      .map((entry) => (entry as Record<string, unknown>)["leaseRecurringChargeID"])
      .filter((id): id is string => typeof id === "string");
    const matches: RecurringChargeProjection[] = [];
    for (const id of candidateIds) {
      try {
        const projection = await this.readChargeProjection(proposal.leaseId, id);
        this.assertCreateFieldsApplied(projection, input.create);
        matches.push(projection);
      } catch {
        // Not this effect's charge (or unreadable right now); reconcile never fabricates a match.
      }
    }
    if (matches.length === 1) {
      return {
        state: "after",
        providerRef: `s97-charge:${matches[0].leaseRecurringChargeID}`,
        readbackHash: chargeProjectionHash(matches[0]),
      };
    }
    if (matches.length === 0) return { state: "before" };
    return { state: "drift" };
  }

  private assertChargeFieldsApplied(
    readback: RecurringChargeProjection,
    before: RecurringChargeProjection,
    changes: Readonly<Partial<Record<string, string | null>>>,
  ): void {
    const editable = [
      "accountID",
      "amount",
      "description",
      "dayDue",
      "frequency",
      "startDate",
      "endDate",
    ] as const;
    for (const field of editable) {
      const changed = changes[field];
      const expected = changed !== undefined ? changed : before[field];
      if (!chargeFieldMatches(field, readback[field], expected)) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
    }
    if (
      readback.leaseID !== before.leaseID ||
      readback.leaseRecurringChargeID !== before.leaseRecurringChargeID
    ) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
  }

  private assertCreateFieldsApplied(
    projection: RecurringChargeProjection,
    create: RecurringChargeCreateInput,
  ): void {
    const fields = [
      "accountID",
      "amount",
      "description",
      "dayDue",
      "frequency",
      "startDate",
    ] as const;
    for (const field of fields) {
      if (!chargeFieldMatches(field, projection[field], create[field])) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
    }
    const expectedEnd = create.endDate ?? null;
    if (!chargeFieldMatches("endDate", projection.endDate, expectedEnd)) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
  }

  private async readLeaseDates(leaseId: string): Promise<LeaseDateState> {
    try {
      const raw = await this.dependencies.reads.getLease(leaseId);
      return leaseDateStateOf(raw);
    } catch (error) {
      if (error instanceof RenewalWritebackServiceError) throw error;
      throw new RenewalWritebackServiceError("provider_read_failed");
    }
  }

  private async readChargeProjection(
    leaseId: string,
    chargeId: string,
  ): Promise<RecurringChargeProjection> {
    try {
      const raw = await this.dependencies.reads.getRecurringCharge(leaseId, chargeId);
      return projectRecurringCharge(raw);
    } catch (error) {
      if (error instanceof RenewalWritebackContractError) {
        throw new RenewalWritebackServiceError("provider_shape");
      }
      if (error instanceof RenewalWritebackServiceError) throw error;
      throw new RenewalWritebackServiceError("provider_read_failed");
    }
  }

  private async transitionClaimFailure(id: string, ambiguous: boolean): Promise<void> {
    const current = await this.dependencies.store.get(id);
    if (!current || current.state === "failed" || current.state === "ambiguous") return;
    if (current.state === "succeeded") return;
    if (current.state !== "running" || current.attemptCount !== 1) {
      throw new RenewalWritebackServiceError("execution_state");
    }
    try {
      await this.dependencies.store.fail(id, ambiguous);
    } catch {
      const after = await this.dependencies.store.get(id);
      if (
        after?.state === "ambiguous" ||
        after?.state === "failed" ||
        after?.state === "succeeded"
      ) {
        return;
      }
      throw new RenewalWritebackServiceError("execution_state");
    }
  }

  private async executableFailClosed(gate: RenewalWritebackGate): Promise<boolean> {
    try {
      return (await gate.isExecutable()) === true;
    } catch {
      return false;
    }
  }

  private assertEnvironment(): void {
    const descriptor = this.dependencies.descriptor;
    if (
      descriptor.environmentKind !== "production" ||
      descriptor.dataContext !== "live" ||
      descriptor.source !== "explicit"
    ) {
      throw new RenewalWritebackServiceError("environment_refused");
    }
  }

  private now(): number {
    return (this.dependencies.now ?? Date.now)();
  }
}

type RecurringChargeCreateInput = {
  readonly accountID: string;
  readonly amount: string;
  readonly description: string;
  readonly dayDue: string;
  readonly frequency: string;
  readonly startDate: string;
  readonly endDate?: string;
};
