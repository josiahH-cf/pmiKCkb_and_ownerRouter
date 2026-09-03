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
  buildRecurringChargeCreateBaseline,
  legacyRenewalWritebackExecutionId,
  projectRecurringCharge,
  recurringChargeMatchesCreate,
  recurringChargeProjectionHash,
  renewalWritebackExecutionId,
  renewalWritebackReversalExecutionId,
  type LeaseDateState,
  type RecurringChargeCreateEffectInput,
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
  /**
   * Firestore-only create/claim boundary that atomically verifies this exact proposal generation is
   * still active for the lease. An absent boundary fails closed before writer construction.
   */
  claimActiveEffect?: (input: {
    proposal: RenewalWritebackProposal;
    effect: ValidatedRenewalWritebackEffect;
    record: ExternalExecutionRecord;
  }) => Promise<"claimed" | "duplicate" | "blocked">;
  now?: () => number;
}

const RECONCILE_MIN_AGE_MS = 2 * 60 * 1_000;
// The live provider answers a deleted/absent recurring-charge detail GET with HTTP 400 (verified
// 2026-09-02 against the deleted proof charge); 404 stays accepted for conventional not-found.
// Absence is never concluded from this status alone: every delete check also requires the id to be
// missing from the collection listing.
const NOT_FOUND_STATUSES = new Set([400, 404]);

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
  return recurringChargeProjectionHash(projection);
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

/**
 * The HTTP 200 DELETE response is the deleted recurring-charge object directly, but the live body
 * omits recurringStatusID (verified 2026-09-02), so equality against the canonical pre-delete
 * projection is field-by-field with dates normalized; recurringStatusID compares only if present.
 */
function assertDeletedBodyMatches(
  response: unknown,
  preDelete: RecurringChargeProjection,
): void {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new RenewalWritebackServiceError("provider_shape");
  }
  const record = response as Record<string, unknown>;
  for (const [field, expected] of Object.entries(preDelete)) {
    const value = record[field];
    if (field === "recurringStatusID") {
      if (value !== undefined && value !== expected) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
      continue;
    }
    const actual = value === null || value === undefined ? null : String(value);
    if (!chargeFieldMatches(field, actual, expected as string | null)) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
  }
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
  /** Actual durable identity, including a context-checked legacy fallback when applicable. */
  executionId: string;
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

    const resolved = await this.resolveEffectExecution(proposal, effect);
    const executionId = resolved.executionId;
    const existing = resolved.record;
    if (existing && (existing.state !== "ready" || existing.attemptCount !== 0)) {
      // A succeeded generation still goes through the active-generation transaction below. This
      // prevents a stale route load from returning or acting on a generation replaced meanwhile.
      if (existing.state !== "succeeded" || !existing.receipt) {
        throw new RenewalWritebackServiceError("execution_state");
      }
    }

    // A completed duplicate is verified against fresh provider state only after the transaction has
    // proven its proposal generation remains active. Unstarted effects first prove their before
    // state without consuming the one allowed attempt.
    if (existing?.state !== "succeeded") {
      await this.assertEffectBeforeState(proposal, effect);
    }

    const record = existing ?? this.buildExecutionRecord(proposal, effect, executionId);
    const claim = await this.dependencies.claimActiveEffect?.({
      proposal,
      effect,
      record,
    });
    if (claim === undefined) throw new RenewalWritebackServiceError("claim_refused");
    if (claim === "duplicate") {
      const duplicate = await this.dependencies.store.get(executionId);
      if (duplicate?.receipt) {
        this.assertExecutionRecordBinding(duplicate, proposal, effect, executionId);
        return this.verifiedDuplicateEffect(proposal, effect, duplicate, executionId);
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
        this.assertExecutionRecordBinding(observed, proposal, effect, executionId);
        return this.verifiedDuplicateEffect(proposal, effect, observed, executionId);
      }
      await this.transitionClaimFailure(executionId, true);
      throw new RenewalWritebackServiceError("provider_ambiguous");
    }
    return {
      receipt,
      duplicate: false,
      executionId,
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
    const resolved = await this.resolveEffectExecution(input.proposal, effect);
    const executionId = resolved.executionId;
    let record = resolved.record;
    if (!record) throw new RenewalWritebackServiceError("execution_missing");
    if (record.state === "succeeded" && record.receipt) {
      await this.assertSucceededReceiptFresh(input.proposal, effect, record);
      return record.receipt;
    }
    if (record.state === "running" && record.attemptCount === 1) {
      const ageMs = this.now() - Date.parse(record.updatedAt);
      if (!Number.isFinite(ageMs) || ageMs < RECONCILE_MIN_AGE_MS) {
        throw new RenewalWritebackServiceError("execution_in_progress");
      }
      await this.transitionClaimFailure(executionId, true);
      record = await this.dependencies.store.get(executionId);
      if (record?.state === "succeeded" && record.receipt) {
        this.assertExecutionRecordBinding(record, input.proposal, effect, executionId);
        await this.assertSucceededReceiptFresh(input.proposal, effect, record);
        return record.receipt;
      }
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
   * Read-only reconciliation for an ambiguous reversal attempt: fresh provider state may prove the
   * reversal applied, still pending, or drifted. It never retries and never mutates the provider.
   */
  async reconcileReversal(input: {
    proposal: RenewalWritebackProposal;
    effectHash: string;
  }): Promise<ExternalActionReceipt> {
    this.assertEnvironment();
    const effect = this.effectByHash(input.proposal, input.effectHash);
    if (effect.reversal.kind === "none") {
      throw new RenewalWritebackServiceError("reversal_unsupported");
    }
    const resolvedForward = await this.resolveEffectExecution(input.proposal, effect);
    const forwardId = resolvedForward.executionId;
    const forward = resolvedForward.record;
    if (!forward?.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    const reversalId = renewalWritebackReversalExecutionId(
      forwardId,
      forward.receipt.resultHash,
    );
    let record = await this.dependencies.store.get(reversalId);
    if (!record) throw new RenewalWritebackServiceError("execution_missing");
    if (record.state === "running" && record.attemptCount === 1) {
      const ageMs = this.now() - Date.parse(record.updatedAt);
      if (!Number.isFinite(ageMs) || ageMs < RECONCILE_MIN_AGE_MS) {
        throw new RenewalWritebackServiceError("execution_in_progress");
      }
      await this.transitionClaimFailure(reversalId, true);
      record = await this.dependencies.store.get(reversalId);
      if (record?.state === "succeeded" && record.receipt) {
        await this.assertSucceededReversalReceiptFresh(input.proposal, effect, forward);
        return record.receipt;
      }
      if (!record) throw new RenewalWritebackServiceError("execution_missing");
    }
    if (record.state !== "ambiguous" || record.attemptCount !== 1) {
      throw new RenewalWritebackServiceError("execution_state");
    }
    const observation = await this.observeReversalOutcome(
      input.proposal,
      effect,
      forward,
    );
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
      await this.dependencies.store.finish(reversalId, receipt);
      return receipt;
    }
    if (observation.state === "before") {
      throw new RenewalWritebackServiceError("reconcile_not_proven");
    }
    throw new RenewalWritebackServiceError("reconcile_drift");
  }

  /** Observation only: classify fresh provider state against the reversal target. */
  private async observeReversalOutcome(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    forward: ExternalExecutionRecord,
  ): Promise<
    | { state: "after"; providerRef: string; readbackHash: string }
    | { state: "before" }
    | { state: "drift" }
  > {
    const reversal = effect.reversal;
    if (
      reversal.kind === "restore_dates" &&
      effect.effect.kind === "renewal_dates_update"
    ) {
      const fresh = await this.readLeaseDates(proposal.leaseId);
      if (canonicalJson(fresh) === canonicalJson(reversal.restore)) {
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
      const input = effect.effect;
      const forwardAfter: LeaseDateState = {
        startDate: input.before.startDate,
        endDate:
          "endDate" in input.after ? (input.after.endDate ?? null) : input.before.endDate,
        increaseEligibilityDate:
          "increaseEligibilityDate" in input.after
            ? (input.after.increaseEligibilityDate ?? null)
            : input.before.increaseEligibilityDate,
      };
      if (canonicalJson(fresh) === canonicalJson(forwardAfter))
        return { state: "before" };
      return { state: "drift" };
    }
    if (reversal.kind === "restore_charge_fields") {
      const input = effect.effect;
      if (input.kind !== "recurring_charge_update") {
        throw new RenewalWritebackServiceError("reversal_unsupported");
      }
      const fresh = await this.readChargeProjection(proposal.leaseId, reversal.chargeId);
      // A charge-field reversal is applied only when the provider's complete canonical projection
      // equals the original pre-forward projection. The restore payload is intentionally smaller
      // than that projection, so comparing only its fields would bless collateral provider drift.
      if (canonicalJson(fresh) === canonicalJson(input.before)) {
        return {
          state: "after",
          providerRef: `s97-charge:${reversal.chargeId}`,
          readbackHash: chargeProjectionHash(fresh),
        };
      }
      // Conversely, the reversal remains unapplied only when the whole forward after-projection
      // is still present. A changed-field subset is not sufficient proof of either outcome.
      try {
        this.assertChargeFieldsApplied(fresh, input.before, input.changes);
        return { state: "before" };
      } catch {
        return { state: "drift" };
      }
    }
    // delete_created_charge: absence is the applied state.
    const created = this.createdChargeIdOf(forward.receipt!);
    const chargeId = created.createdChargeId;
    if (!chargeId) throw new RenewalWritebackServiceError("reversal_forward_unproven");
    let detailAbsent = false;
    let fresh: RecurringChargeProjection | null = null;
    try {
      // Raw read: readChargeProjection wraps provider errors and would hide the 404 signal.
      const raw = await this.dependencies.reads.getRecurringCharge(
        proposal.leaseId,
        chargeId,
      );
      fresh = projectRecurringCharge(raw);
    } catch (error) {
      if (isProviderNotFound(error)) detailAbsent = true;
      else throw new RenewalWritebackServiceError("provider_read_failed");
    }
    if (detailAbsent) {
      const list = await this.dependencies.reads.listRecurringCharges(proposal.leaseId);
      const stillListed = list.some(
        (entry) =>
          (entry as Record<string, unknown>)["leaseRecurringChargeID"] === chargeId,
      );
      if (stillListed) return { state: "drift" };
      return {
        state: "after",
        providerRef: `s97-charge-deleted:${chargeId}`,
        readbackHash: hashExecutionPreview({
          version: "s97-delete-reconcile/v1",
          chargeId,
          detailAbsent: true,
        }),
      };
    }
    if (fresh && chargeProjectionHash(fresh) === forward.receipt!.resultHash) {
      return { state: "before" };
    }
    return { state: "drift" };
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
    const resolvedForward = await this.resolveEffectExecution(input.proposal, effect);
    const forwardExecutionId = resolvedForward.executionId;
    const forward = resolvedForward.record;
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    await this.assertReversalTargetFresh(input.proposal, effect, forward);
    const reversalExecutionId = renewalWritebackReversalExecutionId(
      forwardExecutionId,
      forward.receipt.resultHash,
    );
    const nowMs = this.now();
    const expiresAtIso = new Date(
      nowMs + RENEWAL_WRITEBACK_CONFIRMATION_TTL_MS,
    ).toISOString();
    return {
      reversalExecutionId,
      forwardExecutionId,
      previewHash: this.reversalPreviewHash(
        reversalExecutionId,
        forward.receipt.resultHash,
        effect,
        expiresAtIso,
      ),
      expiresAtIso,
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
      !Number.isFinite(Date.parse(input.reversal.expiresAtIso)) ||
      nowMs > Date.parse(input.reversal.expiresAtIso) ||
      Date.parse(input.reversal.expiresAtIso) >
        confirmedAtMs + RENEWAL_WRITEBACK_CONFIRMATION_TTL_MS
    ) {
      throw new RenewalWritebackServiceError("confirmation_invalid");
    }
    const resolvedForward = await this.resolveEffectExecution(input.proposal, effect);
    const forward = resolvedForward.record;
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    if (input.reversal.forwardExecutionId !== resolvedForward.executionId) {
      throw new RenewalWritebackServiceError("confirmation_invalid");
    }
    const expectedReversalId = renewalWritebackReversalExecutionId(
      resolvedForward.executionId,
      forward.receipt.resultHash,
    );
    if (
      expectedReversalId !== input.reversal.reversalExecutionId ||
      input.reversal.kind !== effect.reversal.kind ||
      input.reversal.previewHash !==
        this.reversalPreviewHash(
          expectedReversalId,
          forward.receipt.resultHash,
          effect,
          input.reversal.expiresAtIso,
        )
    ) {
      throw new RenewalWritebackServiceError("confirmation_invalid");
    }

    const existing = await this.dependencies.store.get(expectedReversalId);
    if (existing) {
      this.assertReversalExecutionRecordBinding(
        existing,
        expectedReversalId,
        input.reversal.previewHash,
        effect,
        forward,
      );
    }
    if (existing?.state === "succeeded" && existing.receipt) {
      await this.assertSucceededReversalReceiptFresh(input.proposal, effect, forward);
      return {
        receipt: existing.receipt,
        duplicate: true,
        executionId: expectedReversalId,
      };
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
        if (concurrent) {
          this.assertReversalExecutionRecordBinding(
            concurrent,
            expectedReversalId,
            input.reversal.previewHash,
            effect,
            forward,
          );
        }
        if (concurrent?.state === "succeeded" && concurrent.receipt) {
          await this.assertSucceededReversalReceiptFresh(input.proposal, effect, forward);
          return {
            receipt: concurrent.receipt,
            duplicate: true,
            executionId: expectedReversalId,
          };
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
      if (duplicate?.receipt) {
        this.assertReversalExecutionRecordBinding(
          duplicate,
          expectedReversalId,
          input.reversal.previewHash,
          effect,
          forward,
        );
        await this.assertSucceededReversalReceiptFresh(input.proposal, effect, forward);
        return {
          receipt: duplicate.receipt,
          duplicate: true,
          executionId: expectedReversalId,
        };
      }
    }
    if (claim !== "claimed") throw new RenewalWritebackServiceError("claim_refused");

    let providerAttempted = false;
    let outcome: { providerRef: string; readbackHash: string };
    try {
      outcome = await gate.run(async () => {
        await this.assertReversalTargetFresh(input.proposal, effect, forward);
        const writer = this.dependencies.createWriter();
        providerAttempted = true;
        return this.performReversal(input.proposal, effect, forward, writer);
      });
    } catch (error) {
      const ambiguous = providerAttempted && providerOutcomeIsAmbiguous(error);
      await this.transitionClaimFailure(expectedReversalId, ambiguous);
      if (error instanceof RenewalWritebackServiceError && !providerAttempted) {
        throw error;
      }
      if (
        error instanceof RenewalWritebackServiceError &&
        error.code === "provider_readback_mismatch"
      ) {
        // The durable attempt is still ambiguous because the provider write ran, but preserve the
        // precise mismatch signal so the operator knows the full original projection was not
        // restored and must use reconciliation rather than treating it as a transport failure.
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
        this.assertReversalExecutionRecordBinding(
          observed,
          expectedReversalId,
          input.reversal.previewHash,
          effect,
          forward,
        );
        await this.assertSucceededReversalReceiptFresh(input.proposal, effect, forward);
        return {
          receipt: observed.receipt,
          duplicate: true,
          executionId: expectedReversalId,
        };
      }
      await this.transitionClaimFailure(expectedReversalId, true);
      throw new RenewalWritebackServiceError("provider_ambiguous");
    }
    return { receipt, duplicate: false, executionId: expectedReversalId };
  }

  private effectByHash(
    proposal: RenewalWritebackProposal,
    effectHash: string,
  ): ValidatedRenewalWritebackEffect {
    const effect = proposal.effects.find((entry) => entry.effectHash === effectHash);
    if (!effect) throw new RenewalWritebackServiceError("effect_missing");
    return effect;
  }

  /** Resolve the generation-bound record, falling back to a legacy id only for the exact context. */
  private async resolveEffectExecution(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
  ): Promise<{ executionId: string; record: ExternalExecutionRecord | null }> {
    const executionId = renewalWritebackExecutionId(proposal, effect);
    const current = await this.dependencies.store.get(executionId);
    if (current) {
      this.assertExecutionRecordBinding(current, proposal, effect, executionId);
      return { executionId, record: current };
    }

    const legacyId = legacyRenewalWritebackExecutionId(proposal, effect);
    if (legacyId !== executionId) {
      const legacy = await this.dependencies.store.get(legacyId);
      if (legacy?.contextHash === proposal.previewHash) {
        this.assertExecutionRecordBinding(legacy, proposal, effect, legacyId);
        return { executionId: legacyId, record: legacy };
      }
    }
    return { executionId, record: null };
  }

  /** Value-free status lookup used by the route without weakening legacy context binding. */
  async readEffectExecution(
    proposal: RenewalWritebackProposal,
    effectHash: string,
  ): Promise<{ executionId: string; record: ExternalExecutionRecord | null }> {
    this.assertEnvironment();
    return this.resolveEffectExecution(proposal, this.effectByHash(proposal, effectHash));
  }

  private assertExecutionRecordBinding(
    record: ExternalExecutionRecord,
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    executionId: string,
  ): void {
    if (
      record.id !== executionId ||
      record.dataMode !== "live" ||
      record.workflowId !== `s97:${proposal.leaseId}` ||
      record.actionId !== executionId ||
      record.actionKey !== effect.actionKey ||
      record.contextHash !== proposal.previewHash ||
      record.previewHash !== effect.effectHash ||
      record.idempotencyKey !== executionId
    ) {
      throw new RenewalWritebackServiceError("execution_state");
    }
  }

  private async verifiedDuplicateEffect(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    record: ExternalExecutionRecord,
    executionId: string,
  ): Promise<RenewalWritebackReceiptDetails> {
    await this.assertSucceededReceiptFresh(proposal, effect, record);
    return {
      receipt: record.receipt!,
      duplicate: true,
      executionId,
      ...this.createdChargeIdOf(record.receipt!),
    };
  }

  /** A historic receipt is replayable only while its exact provider after-state is still current. */
  private async assertSucceededReceiptFresh(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    record: ExternalExecutionRecord,
  ): Promise<void> {
    const receipt = record.receipt;
    if (
      record.state !== "succeeded" ||
      !receipt ||
      receipt.actionKey !== effect.actionKey
    ) {
      throw new RenewalWritebackServiceError("execution_state");
    }
    const input = effect.effect;
    if (input.kind === "renewal_dates_update") {
      const fresh = await this.readLeaseDates(proposal.leaseId);
      const expected = this.datesAfterState(input);
      const expectedHash = hashExecutionPreview({
        version: "s97-dates-readback/v1",
        leaseId: proposal.leaseId,
        readback: fresh,
      });
      if (
        canonicalJson(fresh) !== canonicalJson(expected) ||
        receipt.providerRef !== `s97-lease:${proposal.leaseId}` ||
        receipt.resultHash !== expectedHash
      ) {
        throw new RenewalWritebackServiceError("provider_state_drift");
      }
      return;
    }
    if (input.kind === "recurring_charge_update") {
      const fresh = await this.readChargeProjection(proposal.leaseId, input.chargeId);
      try {
        this.assertChargeFieldsApplied(fresh, input.before, input.changes);
      } catch {
        throw new RenewalWritebackServiceError("provider_state_drift");
      }
      if (
        fresh.leaseID !== proposal.leaseId ||
        receipt.providerRef !== `s97-charge:${input.chargeId}` ||
        receipt.resultHash !== chargeProjectionHash(fresh)
      ) {
        throw new RenewalWritebackServiceError("provider_state_drift");
      }
      return;
    }

    const chargeId = this.createdChargeIdOf(receipt).createdChargeId;
    if (!chargeId || (receipt.reconciled && !input.baseline)) {
      throw new RenewalWritebackServiceError("provider_state_drift");
    }
    if (input.baseline?.candidates.some((candidate) => candidate.chargeId === chargeId)) {
      throw new RenewalWritebackServiceError("provider_state_drift");
    }
    const fresh = await this.readChargeProjection(proposal.leaseId, chargeId);
    if (
      fresh.leaseID !== proposal.leaseId ||
      !recurringChargeMatchesCreate(fresh, input.create) ||
      receipt.resultHash !== chargeProjectionHash(fresh)
    ) {
      throw new RenewalWritebackServiceError("provider_state_drift");
    }
  }

  private datesAfterState(
    input: Extract<
      ValidatedRenewalWritebackEffect["effect"],
      { kind: "renewal_dates_update" }
    >,
  ): LeaseDateState {
    return {
      startDate: input.before.startDate,
      endDate:
        "endDate" in input.after ? (input.after.endDate ?? null) : input.before.endDate,
      increaseEligibilityDate:
        "increaseEligibilityDate" in input.after
          ? (input.after.increaseEligibilityDate ?? null)
          : input.before.increaseEligibilityDate,
    };
  }

  private reversalPreviewHash(
    reversalExecutionId: string,
    forwardReceiptHash: string,
    effect: ValidatedRenewalWritebackEffect,
    expiresAtIso: string,
  ): string {
    return hashExecutionPreview({
      version: "s97-reversal-preview/v2",
      reversalExecutionId,
      forwardReceiptHash,
      reversal: effect.reversal,
      expiresAtIso,
    });
  }

  private assertReversalExecutionRecordBinding(
    record: ExternalExecutionRecord,
    executionId: string,
    previewHash: string,
    effect: ValidatedRenewalWritebackEffect,
    forward: ExternalExecutionRecord,
  ): void {
    if (
      record.id !== executionId ||
      record.actionId !== executionId ||
      record.actionKey !== effect.actionKey ||
      record.contextHash !== forward.receipt?.resultHash ||
      record.previewHash !== previewHash ||
      record.idempotencyKey !== executionId
    ) {
      throw new RenewalWritebackServiceError("execution_state");
    }
  }

  private async assertSucceededReversalReceiptFresh(
    proposal: RenewalWritebackProposal,
    effect: ValidatedRenewalWritebackEffect,
    forward: ExternalExecutionRecord,
  ): Promise<void> {
    const observation = await this.observeReversalOutcome(proposal, effect, forward);
    if (observation.state !== "after") {
      throw new RenewalWritebackServiceError("reversal_target_drift");
    }
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
    // A create has no target record, so the exact set of already-matching charges is its before
    // state. Any matching candidate added, removed, or changed after proposal assembly refuses.
    await this.readLeaseDates(proposal.leaseId);
    if (!input.baseline) {
      throw new RenewalWritebackServiceError("provider_state_drift");
    }
    const current = await this.readCreateCandidates(proposal.leaseId, input);
    if (canonicalJson(current.baseline) !== canonicalJson(input.baseline)) {
      throw new RenewalWritebackServiceError("provider_state_drift");
    }
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
    if (
      created.leaseID !== proposal.leaseId ||
      !input.baseline ||
      input.baseline.candidates.some(
        (candidate) => candidate.chargeId === created.leaseRecurringChargeID,
      )
    ) {
      throw new RenewalWritebackServiceError("provider_readback_mismatch");
    }
    this.assertCreateFieldsApplied(created, input.create);
    const detail = await this.readChargeProjection(
      proposal.leaseId,
      created.leaseRecurringChargeID,
    );
    this.assertCreateFieldsApplied(detail, input.create);
    if (
      detail.leaseRecurringChargeID !== created.leaseRecurringChargeID ||
      detail.leaseID !== proposal.leaseId
    ) {
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
    forward: ExternalExecutionRecord,
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
      // Reversal success means the complete canonical provider projection equals the exact
      // pre-forward projection. Checking only changed fields would silently accept collateral
      // mutation to identity, status, dates, or any untouched value.
      if (canonicalJson(readback) !== canonicalJson(original)) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
      return {
        providerRef: `s97-charge:${reversal.chargeId}`,
        readbackHash: chargeProjectionHash(readback),
      };
    }

    // delete_created_charge: the target id comes from the forward receipt's provider ref.
    const chargeId = forward?.receipt
      ? this.createdChargeIdOf(forward.receipt).createdChargeId
      : undefined;
    if (!chargeId) throw new RenewalWritebackServiceError("reversal_forward_unproven");
    const preDelete = await this.readChargeProjection(proposal.leaseId, chargeId);
    const response = await writer.deleteRecurringChargeForCreateReversal(
      proposal.leaseId,
      chargeId,
    );
    assertDeletedBodyMatches(response, preDelete);
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
        deletedHash: chargeProjectionHash(preDelete),
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
      try {
        this.assertChargeFieldsApplied(fresh, input.before, input.changes);
      } catch {
        throw new RenewalWritebackServiceError("reversal_target_drift");
      }
      return;
    }
    // delete_created_charge: the created charge must still canonically match its receipt hash.
    const chargeId = forward.receipt
      ? this.createdChargeIdOf(forward.receipt).createdChargeId
      : undefined;
    if (!chargeId || !forward.receipt) {
      throw new RenewalWritebackServiceError("reversal_forward_unproven");
    }
    if (
      effect.effect.kind !== "recurring_charge_create" ||
      (forward.receipt.reconciled && !effect.effect.baseline) ||
      effect.effect.baseline?.candidates.some(
        (candidate) => candidate.chargeId === chargeId,
      )
    ) {
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
    // Create: RentVine exposes no provider-owned idempotency token or attempt receipt that can bind
    // a newly observed matching charge to this lost response. Even one newly matching id is only a
    // correlation and must never mint a succeeded receipt or receipt-bound delete authority.
    if (!input.baseline) return { state: "drift" };
    const current = await this.readCreateCandidates(proposal.leaseId, input);
    const currentById = new Map(
      current.baseline.candidates.map((candidate) => [candidate.chargeId, candidate]),
    );
    const baselineStable = input.baseline.candidates.every(
      (candidate) =>
        currentById.get(candidate.chargeId)?.projectionHash === candidate.projectionHash,
    );
    if (!baselineStable) return { state: "drift" };
    const baselineIds = new Set(
      input.baseline.candidates.map((candidate) => candidate.chargeId),
    );
    const newlyMatching = current.projections.filter(
      (projection) => !baselineIds.has(projection.leaseRecurringChargeID),
    );
    if (
      newlyMatching.length === 0 &&
      current.baseline.candidates.length === input.baseline.candidates.length
    ) {
      return { state: "before" };
    }
    return { state: "drift" };
  }

  private async readCreateCandidates(
    leaseId: string,
    input: RecurringChargeCreateEffectInput,
  ): Promise<{
    baseline: NonNullable<RecurringChargeCreateEffectInput["baseline"]>;
    projections: RecurringChargeProjection[];
  }> {
    let list: Record<string, unknown>[];
    try {
      list = await this.dependencies.reads.listRecurringCharges(leaseId);
    } catch {
      throw new RenewalWritebackServiceError("provider_read_failed");
    }
    const ids = list.map((entry) => entry["leaseRecurringChargeID"]);
    if (
      ids.some((id) => typeof id !== "string" || !/^[1-9]\d*$/.test(id)) ||
      new Set(ids).size !== ids.length
    ) {
      throw new RenewalWritebackServiceError("provider_shape");
    }
    const matching: RecurringChargeProjection[] = [];
    for (const id of ids as string[]) {
      const projection = await this.readChargeProjection(leaseId, id);
      if (projection.leaseRecurringChargeID !== id || projection.leaseID !== leaseId) {
        throw new RenewalWritebackServiceError("provider_shape");
      }
      if (recurringChargeMatchesCreate(projection, input.create)) {
        matching.push(projection);
      }
    }
    try {
      return {
        baseline: buildRecurringChargeCreateBaseline({
          leaseId,
          create: input.create,
          projections: matching,
        }),
        projections: matching,
      };
    } catch {
      throw new RenewalWritebackServiceError("provider_shape");
    }
  }

  private assertChargeFieldsApplied(
    readback: RecurringChargeProjection,
    before: RecurringChargeProjection,
    changes: Readonly<Partial<Record<string, string | null>>>,
  ): void {
    const expected: Record<string, unknown> = { ...before };
    for (const [field, value] of Object.entries(changes)) {
      if (!(field in expected) || value === undefined) {
        throw new RenewalWritebackServiceError("provider_readback_mismatch");
      }
      expected[field] =
        field === "startDate" || field === "endDate"
          ? normalizedChargeDate(value)
          : value;
    }
    // The provider must echo the complete canonical after projection. An editable-subset check
    // would accept collateral changes to status, import provenance, future charge dates, or other
    // supposedly untouched fields and then bless the wrong receipt hash.
    if (canonicalJson(readback) !== canonicalJson(expected)) {
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
