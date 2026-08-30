import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
} from "@/lib/external-execution/types";
import {
  isRentVineProofRef,
  type RentVineProofRuntimeConfig,
} from "@/lib/lease-renewal/rentvine-proof-runtime-config";

export const RENTVINE_PROOF_ACTION_KEY = "rentvine.lease.renewal_writeback" as const;
export const RENTVINE_PROOF_CONFIRMATION_SCHEMA_VERSION = "s30-confirmation-v1" as const;
export const RENTVINE_PROOF_BINDING_SCHEMA_VERSION = "s30-proof-v1" as const;
export const RENTVINE_PROOF_PREVIEW_TTL_MS = 10 * 60 * 1_000;
export const RENTVINE_PROOF_CONFIRMATION_FUTURE_SKEW_MS = 60 * 1_000;
export const RENTVINE_PROOF_PHASES = ["forward", "rollback"] as const;

export type RentVineProofPhase = (typeof RENTVINE_PROOF_PHASES)[number];

export type RentVineProofContractErrorCode =
  | "binding_lineage"
  | "confirmation_shape"
  | "confirmation_schema"
  | "confirmation_identity"
  | "confirmation_mismatch"
  | "confirmation_stale"
  | "authority_expired"
  | "record_mismatch";

/** Value-free contract error safe for the operational runner. */
export class RentVineProofContractError extends Error {
  constructor(public readonly code: RentVineProofContractErrorCode) {
    super(`S30 proof contract refused (${code}).`);
    this.name = "RentVineProofContractError";
  }
}

export interface RentVineProofLineage {
  forwardExecutionId: string;
  forwardReceiptHash: string;
}

export interface RentVineProofBinding {
  schemaVersion: typeof RENTVINE_PROOF_BINDING_SCHEMA_VERSION;
  actionKey: typeof RENTVINE_PROOF_ACTION_KEY;
  phase: RentVineProofPhase;
  proofRef: string;
  descriptor: EnvironmentDescriptor & {
    environmentKind: "production";
    dataContext: "live";
    source: "explicit";
  };
  account: "pmikcmetro";
  actor: {
    uid: string;
    email: string;
    role: "Admin";
    scopes: readonly string[];
  };
  authority: RentVineProofRuntimeConfig["authority"];
  target: {
    leaseId: string;
    identityField: RentVineProofRuntimeConfig["target"]["identityField"];
    field: "endDate";
    startDate: string;
    before: string | null;
    after: string | null;
    rollback: string | null;
  };
  lineage?: RentVineProofLineage;
}

export interface RentVineProofConfirmation {
  schemaVersion: typeof RENTVINE_PROOF_CONFIRMATION_SCHEMA_VERSION;
  proofRef: string;
  phase: RentVineProofPhase;
  executionId: string;
  previewHash: string;
  actor: { uid: string; email: string };
  confirmedAt: string;
}

export interface RentVineProofReviewPacket {
  schemaVersion: "s30-review-v1";
  actionKey: typeof RENTVINE_PROOF_ACTION_KEY;
  executionId: string;
  previewHash: string;
  idempotencyKey: string;
  proofRef: string;
  phase: RentVineProofPhase;
  descriptor: RentVineProofBinding["descriptor"];
  account: "pmikcmetro";
  actor: { uid: string; email: string; role: "Admin" };
  authority: RentVineProofRuntimeConfig["authority"];
  target: RentVineProofBinding["target"];
  lineage?: RentVineProofLineage;
  issuedAt: string;
  expiresAt: string;
  instruction: "Confirm this exact packet with an s30-confirmation-v1 object; a boolean is invalid.";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
  );
}

function requiredString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= maxLength ? trimmed : null;
}

function exactIsoTimestamp(value: unknown): string | null {
  const text = requiredString(value, 64);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) && new Date(time).toISOString() === text ? text : null;
}

function hash64(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function rentVineProofExecutionId(
  proofRef: string,
  phase: RentVineProofPhase,
): string {
  const digest = hashExecutionPreview({
    schemaVersion: RENTVINE_PROOF_BINDING_SCHEMA_VERSION,
    proofRef,
    phase,
  });
  return `s30-${phase}-${digest.slice(0, 48)}`;
}

export function buildRentVineProofBinding(
  runtime: RentVineProofRuntimeConfig,
  phase: RentVineProofPhase,
  lineage?: RentVineProofLineage,
): RentVineProofBinding {
  if (phase === "rollback") {
    if (
      !lineage ||
      lineage.forwardExecutionId !==
        rentVineProofExecutionId(runtime.proofRef, "forward") ||
      !hash64(lineage.forwardReceiptHash)
    ) {
      throw new RentVineProofContractError("binding_lineage");
    }
  } else if (lineage) {
    throw new RentVineProofContractError("binding_lineage");
  }
  const before =
    phase === "forward" ? runtime.target.expectedEndDate : runtime.target.proposedEndDate;
  const after =
    phase === "forward" ? runtime.target.proposedEndDate : runtime.target.rollbackEndDate;
  return Object.freeze({
    schemaVersion: RENTVINE_PROOF_BINDING_SCHEMA_VERSION,
    actionKey: RENTVINE_PROOF_ACTION_KEY,
    phase,
    proofRef: runtime.proofRef,
    descriptor: Object.freeze({
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    }),
    account: runtime.account,
    actor: Object.freeze({
      uid: runtime.actor.uid,
      email: runtime.actor.email,
      role: "Admin",
      scopes: Object.freeze([...runtime.actor.scopes]),
    }),
    authority: Object.freeze({ ...runtime.authority }),
    target: Object.freeze({
      leaseId: runtime.target.leaseId,
      identityField: runtime.target.identityField,
      field: "endDate",
      startDate: runtime.target.expectedStartDate,
      before,
      after,
      rollback: runtime.target.rollbackEndDate,
    }),
    ...(lineage ? { lineage: Object.freeze({ ...lineage }) } : {}),
  });
}

function contextHash(binding: RentVineProofBinding): string {
  return hashExecutionPreview({
    schemaVersion: binding.schemaVersion,
    actionKey: binding.actionKey,
    phase: binding.phase,
    proofRef: binding.proofRef,
    descriptor: binding.descriptor,
    account: binding.account,
    actor: binding.actor,
    authority: binding.authority,
    targetHash: hashExecutionPreview(binding.target),
    ...(binding.lineage ? { lineage: binding.lineage } : {}),
  });
}

export function buildRentVineProofExecutionRecord(
  binding: RentVineProofBinding,
  nowMs: number,
): ExternalExecutionRecord {
  if (!Number.isFinite(nowMs)) {
    throw new RentVineProofContractError("record_mismatch");
  }
  const id = rentVineProofExecutionId(binding.proofRef, binding.phase);
  const previewHash = hashExecutionPreview({ ...binding });
  const createdAt = new Date(nowMs).toISOString();
  return Object.freeze({
    id,
    dataMode: "live",
    workflowId: binding.proofRef,
    actionId: `rentvine-proof:${binding.phase}`,
    actionKey: RENTVINE_PROOF_ACTION_KEY,
    contextHash: contextHash(binding),
    previewHash,
    idempotencyKey: `s30_${binding.phase}_${hashExecutionPreview({ id, previewHash }).slice(0, 48)}`,
    state: "ready",
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
  });
}

export function rentVineProofRecordMatchesBinding(
  recordValue: ExternalExecutionRecord,
  binding: RentVineProofBinding,
): boolean {
  const expected = buildRentVineProofExecutionRecord(
    binding,
    Date.parse(recordValue.createdAt),
  );
  return (
    recordValue.id === expected.id &&
    recordValue.dataMode === "live" &&
    recordValue.workflowId === expected.workflowId &&
    recordValue.actionId === expected.actionId &&
    recordValue.actionKey === expected.actionKey &&
    recordValue.contextHash === expected.contextHash &&
    recordValue.previewHash === expected.previewHash &&
    recordValue.idempotencyKey === expected.idempotencyKey &&
    recordValue.createdAt === expected.createdAt
  );
}

export function assertRentVineProofRecordMatchesBinding(
  recordValue: ExternalExecutionRecord,
  binding: RentVineProofBinding,
): void {
  if (!rentVineProofRecordMatchesBinding(recordValue, binding)) {
    throw new RentVineProofContractError("record_mismatch");
  }
}

export function parseRentVineProofConfirmation(
  value: unknown,
): RentVineProofConfirmation {
  const input = record(value);
  if (
    !input ||
    !hasExactKeys(input, [
      "schemaVersion",
      "proofRef",
      "phase",
      "executionId",
      "previewHash",
      "actor",
      "confirmedAt",
    ])
  ) {
    throw new RentVineProofContractError("confirmation_shape");
  }
  if (input.schemaVersion !== RENTVINE_PROOF_CONFIRMATION_SCHEMA_VERSION) {
    throw new RentVineProofContractError("confirmation_schema");
  }
  const proofRef = requiredString(input.proofRef, 100);
  const phase = RENTVINE_PROOF_PHASES.find((candidate) => candidate === input.phase);
  const executionId = requiredString(input.executionId, 100);
  const previewHash = requiredString(input.previewHash, 64);
  const actor = record(input.actor);
  const uid =
    actor && hasExactKeys(actor, ["uid", "email"])
      ? requiredString(actor.uid, 256)
      : null;
  const email =
    actor && hasExactKeys(actor, ["uid", "email"])
      ? (requiredString(actor.email, 320)?.toLowerCase() ?? null)
      : null;
  const confirmedAt = exactIsoTimestamp(input.confirmedAt);
  if (
    !proofRef ||
    !isRentVineProofRef(proofRef) ||
    !phase ||
    !executionId ||
    executionId !== rentVineProofExecutionId(proofRef, phase) ||
    !previewHash ||
    !hash64(previewHash) ||
    !uid ||
    !email ||
    !confirmedAt
  ) {
    throw new RentVineProofContractError("confirmation_identity");
  }
  return Object.freeze({
    schemaVersion: RENTVINE_PROOF_CONFIRMATION_SCHEMA_VERSION,
    proofRef,
    phase,
    executionId,
    previewHash,
    actor: Object.freeze({ uid, email }),
    confirmedAt,
  });
}

export function assertRentVineProofConfirmation(input: {
  confirmation: RentVineProofConfirmation;
  runtime: RentVineProofRuntimeConfig;
  binding: RentVineProofBinding;
  record: ExternalExecutionRecord;
  nowMs: number;
}): void {
  const { confirmation, runtime, binding, record, nowMs } = input;
  assertRentVineProofRecordMatchesBinding(record, binding);
  if (
    confirmation.proofRef !== runtime.proofRef ||
    confirmation.phase !== binding.phase ||
    confirmation.executionId !== record.id ||
    confirmation.previewHash !== record.previewHash ||
    confirmation.actor.uid !== runtime.actor.uid ||
    confirmation.actor.email !== runtime.actor.email
  ) {
    throw new RentVineProofContractError("confirmation_mismatch");
  }
  const confirmedAtMs = Date.parse(confirmation.confirmedAt);
  const createdAtMs = Date.parse(record.createdAt);
  const authorityExpiresAtMs = Date.parse(runtime.authority.authorizationExpiresAt);
  if (nowMs > authorityExpiresAtMs || confirmedAtMs > authorityExpiresAtMs) {
    throw new RentVineProofContractError("authority_expired");
  }
  if (
    !Number.isFinite(nowMs) ||
    confirmedAtMs < createdAtMs ||
    confirmedAtMs > nowMs + RENTVINE_PROOF_CONFIRMATION_FUTURE_SKEW_MS ||
    nowMs - confirmedAtMs > RENTVINE_PROOF_PREVIEW_TTL_MS ||
    nowMs - createdAtMs > RENTVINE_PROOF_PREVIEW_TTL_MS
  ) {
    throw new RentVineProofContractError("confirmation_stale");
  }
}

export function assertRentVineProofAuthorityFresh(
  runtime: RentVineProofRuntimeConfig,
  nowMs: number,
): void {
  if (
    !Number.isFinite(nowMs) ||
    nowMs >= Date.parse(runtime.authority.authorizationExpiresAt)
  ) {
    throw new RentVineProofContractError("authority_expired");
  }
}

export function buildRentVineProofReviewPacket(
  binding: RentVineProofBinding,
  recordValue: ExternalExecutionRecord,
): RentVineProofReviewPacket {
  assertRentVineProofRecordMatchesBinding(recordValue, binding);
  const issuedAtMs = Date.parse(recordValue.createdAt);
  return Object.freeze({
    schemaVersion: "s30-review-v1",
    actionKey: RENTVINE_PROOF_ACTION_KEY,
    executionId: recordValue.id,
    previewHash: recordValue.previewHash,
    idempotencyKey: recordValue.idempotencyKey,
    proofRef: binding.proofRef,
    phase: binding.phase,
    descriptor: binding.descriptor,
    account: binding.account,
    actor: Object.freeze({
      uid: binding.actor.uid,
      email: binding.actor.email,
      role: "Admin",
    }),
    authority: binding.authority,
    target: binding.target,
    ...(binding.lineage ? { lineage: binding.lineage } : {}),
    issuedAt: recordValue.createdAt,
    expiresAt: new Date(issuedAtMs + RENTVINE_PROOF_PREVIEW_TTL_MS).toISOString(),
    instruction:
      "Confirm this exact packet with an s30-confirmation-v1 object; a boolean is invalid.",
  });
}

export function rentVineProofProviderRefHash(binding: RentVineProofBinding): string {
  return `rentvine:lease:sha256:${hashExecutionPreview({
    account: binding.account,
    leaseId: binding.target.leaseId,
  })}`;
}

export function buildRentVineProofReceipt(input: {
  binding: RentVineProofBinding;
  result: unknown;
  readback: unknown;
  createdAt: string;
  reconciled: boolean;
}): ExternalActionReceipt {
  return Object.freeze({
    actionKey: RENTVINE_PROOF_ACTION_KEY,
    dataMode: "live",
    liveEvidenceEligible: true,
    providerRef: rentVineProofProviderRefHash(input.binding),
    resultHash: hashExecutionPreview({
      schemaVersion: "s30-result-v1",
      phase: input.binding.phase,
      result: input.result,
      readback: input.readback,
    }),
    reconciled: input.reconciled,
    outcome: "succeeded",
    createdAt: input.createdAt,
  });
}

export function rentVineProofReceiptHash(receipt: ExternalActionReceipt): string {
  return hashExecutionPreview(
    JSON.parse(canonicalJson(receipt)) as Record<string, unknown>,
  );
}
