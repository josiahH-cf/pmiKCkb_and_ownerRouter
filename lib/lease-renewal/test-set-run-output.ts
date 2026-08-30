import { randomUUID } from "node:crypto";

import { S63RuntimeConfigError } from "@/lib/lease-renewal/test-set-runtime-config";

export type S63RunOperation = "capture" | "report" | "evidence";
export type S63RunFailureCode =
  | "required_environment_missing"
  | "rentvine_export_incomplete"
  | "sheet_grid_missing"
  | "sheet_headers_unresolved"
  | "source_binding_unresolved"
  | "source_identity_mismatch"
  | "baseline_binding_conflict"
  | "baseline_source_conflict"
  | "baseline_missing"
  | "baseline_hash_invalid"
  | "observation_path_missing"
  | "observation_tracked_path"
  | "observation_read_failed"
  | "observation_invalid_json"
  | "observation_shape"
  | "observation_conflict"
  | "report_path_refused"
  | "app_plane_write_failed"
  | "unexpected_failure";

export class S63RunError extends Error {
  constructor(public readonly code: S63RunFailureCode) {
    super(`S63 operation refused (${code}).`);
    this.name = "S63RunError";
  }
}

const RUN_REFERENCE_PATTERN =
  /^s63-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function safeCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new S63RunError("unexpected_failure");
  }
  return value;
}

function safeRunReference(value: string): string {
  if (!RUN_REFERENCE_PATTERN.test(value)) {
    throw new S63RunError("unexpected_failure");
  }
  return value;
}

export function createTestSetRunReference(
  uuidFactory: () => string = randomUUID,
): string {
  return safeRunReference(`s63-${uuidFactory().toLowerCase()}`);
}

export function formatTestSetCaptureSummary(input: {
  runReference: string;
  configuredCount: number;
  capturedCount: number;
  reusedCount: number;
}): string {
  return [
    "S63 capture complete",
    `run=${safeRunReference(input.runReference)}`,
    `configured=${safeCount(input.configuredCount)}`,
    `captured=${safeCount(input.capturedCount)}`,
    `reused=${safeCount(input.reusedCount)}`,
  ].join("; ");
}

export function formatTestSetReportSummary(input: {
  runReference: string;
  caseCount: number;
  baselineCount: number;
  evidenceCount: number;
}): string {
  return [
    "S63 report complete",
    `run=${safeRunReference(input.runReference)}`,
    `cases=${safeCount(input.caseCount)}`,
    `baselines=${safeCount(input.baselineCount)}`,
    `evidence=${safeCount(input.evidenceCount)}`,
  ].join("; ");
}

export function formatTestSetEvidenceSummary(input: {
  runReference: string;
  caseSlotCount: number;
  appendedCount: number;
  reusedCount: number;
}): string {
  return [
    "S63 evidence append complete",
    `run=${safeRunReference(input.runReference)}`,
    `caseSlots=${safeCount(input.caseSlotCount)}`,
    `appended=${safeCount(input.appendedCount)}`,
    `reused=${safeCount(input.reusedCount)}`,
  ].join("; ");
}

export function safeTestSetFailureCode(
  error: unknown,
): S63RuntimeConfigError["code"] | S63RunFailureCode {
  if (error instanceof S63RuntimeConfigError || error instanceof S63RunError) {
    return error.code;
  }
  return "unexpected_failure";
}

export function formatTestSetRefusal(input: {
  operation: S63RunOperation;
  code: ReturnType<typeof safeTestSetFailureCode>;
}): string {
  return `S63 ${input.operation} refused; code=${input.code}`;
}
