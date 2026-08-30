import { RentVineProofActorError } from "@/lib/lease-renewal/rentvine-proof-actor";
import { RentVineProofConfirmationInputError } from "@/lib/lease-renewal/rentvine-proof-confirmation";
import { RentVineProofContractError } from "@/lib/lease-renewal/rentvine-proof-contract";
import { RentVineProofProviderError } from "@/lib/lease-renewal/rentvine-proof-provider";
import { RentVineProofReviewError } from "@/lib/lease-renewal/rentvine-proof-review";
import { RentVineProofRuntimeConfigError } from "@/lib/lease-renewal/rentvine-proof-runtime-config";
import { RentVineProofServiceError } from "@/lib/lease-renewal/rentvine-proof-service";

export type RentVineProofRunOperation =
  | "preview"
  | "execute"
  | "reconcile"
  | "rollback-preview"
  | "rollback"
  | "rollback-reconcile"
  | "closeout"
  | "status";

const OPERATIONS = new Set<RentVineProofRunOperation>([
  "preview",
  "execute",
  "reconcile",
  "rollback-preview",
  "rollback",
  "rollback-reconcile",
  "closeout",
  "status",
]);

export function parseRentVineProofRunOperation(
  value: unknown,
): RentVineProofRunOperation | null {
  return typeof value === "string" && OPERATIONS.has(value as RentVineProofRunOperation)
    ? (value as RentVineProofRunOperation)
    : null;
}

function safeOpaque(value: string, pattern: RegExp): string {
  if (!pattern.test(value)) throw new Error("Unsafe S30 output identity.");
  return value;
}

export function formatRentVineProofPreviewSummary(input: {
  phase: "forward" | "rollback";
  executionId: string;
  previewHash: string;
  reused: boolean;
  gateExecutable: boolean;
}): string {
  return [
    "S30 preview complete",
    `phase=${input.phase}`,
    `execution=${safeOpaque(input.executionId, /^s30-(?:forward|rollback)-[a-f0-9]{48}$/)}`,
    `preview=${safeOpaque(input.previewHash, /^[a-f0-9]{64}$/)}`,
    `reused=${input.reused}`,
    `gate=${input.gateExecutable ? "open" : "closed"}`,
  ].join("; ");
}

export function formatRentVineProofExecutionSummary(input: {
  phase: "forward" | "rollback";
  executionId: string;
  resultHash: string;
  duplicate: boolean;
  reconciled: boolean;
}): string {
  return [
    "S30 execution complete",
    `phase=${input.phase}`,
    `execution=${safeOpaque(input.executionId, /^s30-(?:forward|rollback)-[a-f0-9]{48}$/)}`,
    `result=${safeOpaque(input.resultHash, /^[a-f0-9]{64}$/)}`,
    `duplicate=${input.duplicate}`,
    `reconciled=${input.reconciled}`,
  ].join("; ");
}

export function formatRentVineProofCloseoutSummary(input: {
  closeoutId: string;
  reused: boolean;
}): string {
  return `S30 closeout complete; closeout=${safeOpaque(input.closeoutId, /^s30-closeout-[a-f0-9]{48}$/)}; reused=${input.reused}; gate=closed`;
}

export function formatRentVineProofStatusSummary(input: {
  forwardState: string;
  rollbackState: string;
  gateExecutable: boolean;
  committedSeedClosed: boolean;
}): string {
  const safeState = (state: string) =>
    /^(?:missing|ready|blocked|running|succeeded|not_applicable|failed|ambiguous)$/.test(
      state,
    )
      ? state
      : "unknown";
  return [
    "S30 status",
    `forward=${safeState(input.forwardState)}`,
    `rollback=${safeState(input.rollbackState)}`,
    `gate=${input.gateExecutable ? "open" : "closed"}`,
    `seed=${input.committedSeedClosed ? "closed" : "open"}`,
  ].join("; ");
}

export function safeRentVineProofFailureCode(error: unknown): string {
  if (
    error instanceof RentVineProofActorError ||
    error instanceof RentVineProofConfirmationInputError ||
    error instanceof RentVineProofContractError ||
    error instanceof RentVineProofProviderError ||
    error instanceof RentVineProofReviewError ||
    error instanceof RentVineProofRuntimeConfigError ||
    error instanceof RentVineProofServiceError
  ) {
    return error.code;
  }
  return "unexpected_failure";
}

export function formatRentVineProofRefusal(input: {
  operation: RentVineProofRunOperation | "unknown";
  code: string;
}): string {
  const operation = input.operation === "unknown" ? "unknown" : input.operation;
  const code = /^[a-z][a-z0-9_]{2,80}$/.test(input.code)
    ? input.code
    : "unexpected_failure";
  return `S30 ${operation} refused; code=${code}`;
}
