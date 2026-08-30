import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { canonicalJson } from "@/lib/execution/preview-hash";
import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
  ExternalExecutionStore,
} from "@/lib/external-execution/types";
import {
  verifyRentVineProofActor,
  type RentVineProofActorReader,
} from "@/lib/lease-renewal/rentvine-proof-actor";
import {
  assertRentVineProofAuthorityFresh,
  assertRentVineProofConfirmation,
  assertRentVineProofRecordMatchesBinding,
  buildRentVineProofBinding,
  buildRentVineProofExecutionRecord,
  buildRentVineProofReceipt,
  buildRentVineProofReviewPacket,
  RENTVINE_PROOF_PREVIEW_TTL_MS,
  rentVineProofExecutionId,
  rentVineProofReceiptHash,
  type RentVineProofBinding,
  type RentVineProofConfirmation,
  type RentVineProofPhase,
} from "@/lib/lease-renewal/rentvine-proof-contract";
import {
  buildRentVineProofCloseoutRecord,
  sameRentVineProofCloseoutEvidence,
  type RentVineProofCloseoutStore,
} from "@/lib/lease-renewal/rentvine-proof-closeout";
import {
  assertRentVineProofLeaseAfter,
  assertRentVineProofLeaseBefore,
  readRentVineProofLeaseSnapshot,
  rentVineProofWriteOutcome,
  RentVineProofProviderError,
  updateRentVineProofLeaseEndDate,
  type RentVineProofReader,
  type RentVineProofWriter,
} from "@/lib/lease-renewal/rentvine-proof-provider";
import type { RentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

export type RentVineProofServiceErrorCode =
  | "environment_refused"
  | "provider_read_failed"
  | "provider_shape"
  | "provider_identity_mismatch"
  | "provider_state_drift"
  | "provider_readback_mismatch"
  | "preview_conflict"
  | "preview_expired"
  | "execution_missing"
  | "execution_state"
  | "execution_in_progress"
  | "action_closed"
  | "claim_refused"
  | "provider_refused"
  | "provider_ambiguous"
  | "reconcile_not_proven"
  | "reconcile_drift"
  | "rollback_forward_unproven"
  | "closeout_receipt_missing"
  | "closeout_gate_not_closed"
  | "closeout_conflict";

/** Value-free service refusal safe for CLI output and attention evidence. */
export class RentVineProofServiceError extends Error {
  constructor(public readonly code: RentVineProofServiceErrorCode) {
    super(`S30 proof operation refused (${code}).`);
    this.name = "RentVineProofServiceError";
  }
}

export interface RentVineProofGate {
  isExecutable(): Promise<boolean>;
  run<T>(effect: () => Promise<T> | T): Promise<T>;
  isCommittedSeedClosed(): boolean;
}

export const RENTVINE_PROOF_RECONCILE_MIN_AGE_MS = 2 * 60 * 1_000;

export interface RentVineProofServiceDependencies {
  descriptor: EnvironmentDescriptor;
  actorReader: RentVineProofActorReader;
  store: ExternalExecutionStore;
  closeouts: RentVineProofCloseoutStore;
  reader: RentVineProofReader;
  createWriter: () => RentVineProofWriter;
  gate: RentVineProofGate;
  now?: () => number;
}

export class RentVineProofService {
  constructor(private readonly dependencies: RentVineProofServiceDependencies) {}

  async preview(runtime: RentVineProofRuntimeConfig, phase: RentVineProofPhase) {
    this.assertEnvironment();
    await this.verifyActor(runtime);
    const nowMs = this.now();
    assertRentVineProofAuthorityFresh(runtime, nowMs);
    const binding = await this.binding(runtime, phase);
    const snapshot = await this.read(binding);
    assertRentVineProofLeaseBefore(snapshot, binding);

    const candidate = buildRentVineProofExecutionRecord(binding, nowMs);
    const { record, reused } = await this.createOrReuse(candidate, binding);
    if (
      record.state === "ready" &&
      nowMs - Date.parse(record.createdAt) > RENTVINE_PROOF_PREVIEW_TTL_MS
    ) {
      throw new RentVineProofServiceError("preview_expired");
    }
    return {
      record,
      binding,
      reviewPacket: buildRentVineProofReviewPacket(binding, record),
      reused,
      gateExecutable: await this.executableFailClosed(),
    };
  }

  async execute(
    runtime: RentVineProofRuntimeConfig,
    confirmation: RentVineProofConfirmation,
  ): Promise<{ receipt: ExternalActionReceipt; duplicate: boolean }> {
    this.assertEnvironment();
    await this.verifyActor(runtime);
    const nowMs = this.now();
    assertRentVineProofAuthorityFresh(runtime, nowMs);
    const binding = await this.binding(runtime, confirmation.phase);
    const record = await this.dependencies.store.get(
      rentVineProofExecutionId(runtime.proofRef, confirmation.phase),
    );
    if (!record) throw new RentVineProofServiceError("execution_missing");
    assertRentVineProofRecordMatchesBinding(record, binding);
    assertRentVineProofConfirmation({
      confirmation,
      runtime,
      binding,
      record,
      nowMs,
    });

    if (record.state === "succeeded" && record.receipt) {
      return { receipt: record.receipt, duplicate: true };
    }
    if (record.state !== "ready" || record.attemptCount !== 0) {
      throw new RentVineProofServiceError("execution_state");
    }
    if (!(await this.executableFailClosed())) {
      throw new RentVineProofServiceError("action_closed");
    }
    const before = await this.read(binding);
    assertRentVineProofLeaseBefore(before, binding);
    const preclaimNowMs = this.now();
    assertRentVineProofAuthorityFresh(runtime, preclaimNowMs);
    assertRentVineProofConfirmation({
      confirmation,
      runtime,
      binding,
      record,
      nowMs: preclaimNowMs,
    });

    const claim = await this.dependencies.store.claim(record.id, record.previewHash);
    if (claim === "duplicate") {
      const duplicate = await this.dependencies.store.get(record.id);
      if (duplicate?.receipt) return { receipt: duplicate.receipt, duplicate: true };
    }
    if (claim !== "claimed") {
      throw new RentVineProofServiceError("claim_refused");
    }

    let gatePassed = false;
    let providerAttempted = false;
    let result: unknown;
    let readback: Awaited<ReturnType<typeof readRentVineProofLeaseSnapshot>>;
    try {
      const effect = await this.dependencies.gate.run(async () => {
        gatePassed = true;
        const freshBefore = await this.read(binding);
        assertRentVineProofLeaseBefore(freshBefore, binding);
        const prewriteNowMs = this.now();
        assertRentVineProofAuthorityFresh(runtime, prewriteNowMs);
        assertRentVineProofConfirmation({
          confirmation,
          runtime,
          binding,
          record,
          nowMs: prewriteNowMs,
        });
        const writer = this.dependencies.createWriter();
        providerAttempted = true;
        const providerResult = await updateRentVineProofLeaseEndDate(
          writer,
          binding,
          freshBefore,
        );
        const observed = await this.read(binding);
        assertRentVineProofLeaseAfter(observed, binding);
        return { providerResult, observed };
      });
      result = effect.providerResult;
      readback = effect.observed;
    } catch (error) {
      const ambiguous = providerAttempted
        ? rentVineProofWriteOutcome(error) === "ambiguous"
        : false;
      await this.transitionClaimFailure(record.id, ambiguous);
      if (!gatePassed) throw new RentVineProofServiceError("action_closed");
      if (!providerAttempted || !ambiguous) {
        throw new RentVineProofServiceError("provider_refused");
      }
      throw new RentVineProofServiceError("provider_ambiguous");
    }

    const receipt = buildRentVineProofReceipt({
      binding,
      result,
      readback,
      createdAt: new Date(this.now()).toISOString(),
      reconciled: false,
    });
    try {
      await this.dependencies.store.finish(record.id, receipt);
    } catch {
      const observed = await this.dependencies.store.get(record.id);
      if (
        observed?.state === "succeeded" &&
        observed.receipt &&
        canonicalJson(observed.receipt) === canonicalJson(receipt)
      ) {
        return { receipt: observed.receipt, duplicate: true };
      }
      await this.transitionClaimFailure(record.id, true);
      throw new RentVineProofServiceError("provider_ambiguous");
    }
    return { receipt, duplicate: false };
  }

  async reconcile(
    runtime: RentVineProofRuntimeConfig,
    phase: RentVineProofPhase,
  ): Promise<ExternalActionReceipt> {
    this.assertEnvironment();
    await this.verifyActor(runtime);
    const binding = await this.binding(runtime, phase);
    let record = await this.dependencies.store.get(
      rentVineProofExecutionId(runtime.proofRef, phase),
    );
    if (!record) throw new RentVineProofServiceError("execution_missing");
    assertRentVineProofRecordMatchesBinding(record, binding);
    if (record.state === "running" && record.attemptCount === 1) {
      const runningAgeMs = this.now() - Date.parse(record.updatedAt);
      if (
        !Number.isFinite(runningAgeMs) ||
        runningAgeMs < RENTVINE_PROOF_RECONCILE_MIN_AGE_MS
      ) {
        throw new RentVineProofServiceError("execution_in_progress");
      }
      await this.transitionClaimFailure(record.id, true);
      record = await this.dependencies.store.get(record.id);
      if (record?.state === "succeeded" && record.receipt) return record.receipt;
      if (!record) throw new RentVineProofServiceError("execution_missing");
    }
    if (record.state !== "ambiguous" || record.attemptCount !== 1) {
      throw new RentVineProofServiceError("execution_state");
    }
    const observed = await this.read(binding);
    if (
      observed.leaseId === binding.target.leaseId &&
      observed.startDate === binding.target.startDate &&
      observed.endDate === binding.target.after
    ) {
      const receipt = buildRentVineProofReceipt({
        binding,
        result: { reconciliation: "exact_readback" },
        readback: observed,
        createdAt: new Date(this.now()).toISOString(),
        reconciled: true,
      });
      await this.dependencies.store.finish(record.id, receipt);
      return receipt;
    }
    if (
      observed.leaseId === binding.target.leaseId &&
      observed.startDate === binding.target.startDate &&
      observed.endDate === binding.target.before
    ) {
      throw new RentVineProofServiceError("reconcile_not_proven");
    }
    throw new RentVineProofServiceError("reconcile_drift");
  }

  async closeout(runtime: RentVineProofRuntimeConfig) {
    this.assertEnvironment();
    await this.verifyActor(runtime);
    const forwardBinding = buildRentVineProofBinding(runtime, "forward");
    const forward = await this.dependencies.store.get(
      rentVineProofExecutionId(runtime.proofRef, "forward"),
    );
    if (!forward || !forward.receipt || forward.state !== "succeeded") {
      throw new RentVineProofServiceError("closeout_receipt_missing");
    }
    assertRentVineProofRecordMatchesBinding(forward, forwardBinding);
    const rollbackBinding = buildRentVineProofBinding(runtime, "rollback", {
      forwardExecutionId: forward.id,
      forwardReceiptHash: rentVineProofReceiptHash(forward.receipt),
    });
    const rollback = await this.dependencies.store.get(
      rentVineProofExecutionId(runtime.proofRef, "rollback"),
    );
    if (!rollback || !rollback.receipt || rollback.state !== "succeeded") {
      throw new RentVineProofServiceError("closeout_receipt_missing");
    }
    assertRentVineProofRecordMatchesBinding(rollback, rollbackBinding);
    if (
      !this.dependencies.gate.isCommittedSeedClosed() ||
      (await this.executableFailClosed())
    ) {
      throw new RentVineProofServiceError("closeout_gate_not_closed");
    }
    const candidate = buildRentVineProofCloseoutRecord({
      proofRef: runtime.proofRef,
      forward,
      rollback,
      nowMs: this.now(),
    });
    const existing = await this.dependencies.closeouts.get(candidate.id);
    if (existing) {
      if (sameRentVineProofCloseoutEvidence(existing, candidate)) {
        return { record: existing, reused: true };
      }
      throw new RentVineProofServiceError("closeout_conflict");
    }
    const result = await this.dependencies.closeouts.create(candidate);
    return { record: candidate, reused: result === "reused" };
  }

  async status(runtime: RentVineProofRuntimeConfig) {
    this.assertEnvironment();
    const [forward, rollback, executable] = await Promise.all([
      this.dependencies.store.get(rentVineProofExecutionId(runtime.proofRef, "forward")),
      this.dependencies.store.get(rentVineProofExecutionId(runtime.proofRef, "rollback")),
      this.executableFailClosed(),
    ]);
    return {
      forwardState: forward?.state ?? "missing",
      rollbackState: rollback?.state ?? "missing",
      gateExecutable: executable,
      committedSeedClosed: this.dependencies.gate.isCommittedSeedClosed(),
    };
  }

  private now(): number {
    return (this.dependencies.now ?? Date.now)();
  }

  private verifyActor(runtime: RentVineProofRuntimeConfig): Promise<void> {
    return verifyRentVineProofActor(this.dependencies.actorReader, runtime);
  }

  private assertEnvironment(): void {
    const descriptor = this.dependencies.descriptor;
    if (
      descriptor.environmentKind !== "production" ||
      descriptor.dataContext !== "live" ||
      descriptor.source !== "explicit"
    ) {
      throw new RentVineProofServiceError("environment_refused");
    }
  }

  private async binding(
    runtime: RentVineProofRuntimeConfig,
    phase: RentVineProofPhase,
  ): Promise<RentVineProofBinding> {
    if (phase === "forward") return buildRentVineProofBinding(runtime, phase);
    const forwardBinding = buildRentVineProofBinding(runtime, "forward");
    const forward = await this.dependencies.store.get(
      rentVineProofExecutionId(runtime.proofRef, "forward"),
    );
    if (!forward || forward.state !== "succeeded" || !forward.receipt) {
      throw new RentVineProofServiceError("rollback_forward_unproven");
    }
    assertRentVineProofRecordMatchesBinding(forward, forwardBinding);
    return buildRentVineProofBinding(runtime, phase, {
      forwardExecutionId: forward.id,
      forwardReceiptHash: rentVineProofReceiptHash(forward.receipt),
    });
  }

  private async read(binding: RentVineProofBinding) {
    try {
      return await readRentVineProofLeaseSnapshot(this.dependencies.reader, binding);
    } catch (error) {
      if (error instanceof RentVineProofProviderError) {
        throw new RentVineProofServiceError(error.code);
      }
      throw new RentVineProofServiceError("provider_read_failed");
    }
  }

  private async createOrReuse(
    candidate: ExternalExecutionRecord,
    binding: RentVineProofBinding,
  ): Promise<{ record: ExternalExecutionRecord; reused: boolean }> {
    const existing = await this.dependencies.store.get(candidate.id);
    if (existing) {
      try {
        assertRentVineProofRecordMatchesBinding(existing, binding);
      } catch {
        throw new RentVineProofServiceError("preview_conflict");
      }
      return { record: existing, reused: true };
    }
    try {
      await this.dependencies.store.create(candidate);
      return { record: candidate, reused: false };
    } catch {
      const concurrent = await this.dependencies.store.get(candidate.id);
      if (concurrent) {
        try {
          assertRentVineProofRecordMatchesBinding(concurrent, binding);
          return { record: concurrent, reused: true };
        } catch {
          // Fall through to the value-free conflict.
        }
      }
      throw new RentVineProofServiceError("preview_conflict");
    }
  }

  private async transitionClaimFailure(id: string, ambiguous: boolean): Promise<void> {
    const current = await this.dependencies.store.get(id);
    if (!current || current.state === "failed" || current.state === "ambiguous") return;
    if (current.state === "succeeded") return;
    if (current.state !== "running" || current.attemptCount !== 1) {
      throw new RentVineProofServiceError("execution_state");
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
      throw new RentVineProofServiceError("execution_state");
    }
  }

  private async executableFailClosed(): Promise<boolean> {
    try {
      return (await this.dependencies.gate.isExecutable()) === true;
    } catch {
      return false;
    }
  }
}
