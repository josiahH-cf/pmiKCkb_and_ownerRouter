import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  TEST_SET_EVIDENCE_KINDS,
  type TestSetEvidenceKind,
} from "@/lib/firestore/test-set-evidence";
import { S63RunError } from "@/lib/lease-renewal/test-set-run-output";
import {
  S63_CASE_REFS,
  type S63CaseRef,
} from "@/lib/lease-renewal/test-set-runtime-config";

export const S63_OBSERVATION_PATH_ENV = "S63_TEST_SET_OBSERVATION_PATH";
export const S63_OBSERVATION_SCHEMA_VERSION = "s63-observation-v1" as const;
export const S63_OBSERVATION_KINDS = TEST_SET_EVIDENCE_KINDS.filter(
  (kind) => kind !== "human_send" && kind !== "verdict",
) as readonly Exclude<TestSetEvidenceKind, "human_send" | "verdict">[];

export interface S63ObservationEntry {
  observationRef: string;
  caseRef: S63CaseRef;
  kind: (typeof S63_OBSERVATION_KINDS)[number];
  note: string;
  payload: Record<string, unknown>;
}

export interface S63ObservationBatch {
  schemaVersion: typeof S63_OBSERVATION_SCHEMA_VERSION;
  batchRef: string;
  entries: readonly S63ObservationEntry[];
}

interface LoadS63ObservationOptions {
  rootDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
  readText?: (path: string) => string;
  realPath?: (path: string) => string;
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

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= maxLength ? trimmed : null;
}

function payloadWithinBoundary(payload: Record<string, unknown>): boolean {
  if (Object.hasOwn(payload, "baselineHash")) return false;
  try {
    return JSON.stringify(payload).length <= 50_000;
  } catch {
    return false;
  }
}

function keysWithin(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(payload).every((key) => allowed.includes(key));
}

function booleanOrNull(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "boolean";
}

function finiteNumberOrNull(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function nonnegativeIntegerOrNull(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

function stringArrayOrNull(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
  );
}

function structuredPayloadValid(
  kind: S63ObservationEntry["kind"],
  payload: Record<string, unknown>,
): boolean {
  if (kind === "process_observation") {
    const allowed = [
      "processVersion",
      "observedStepIds",
      "observedSubstepIds",
      "branchOrBlockerExplained",
      "transitionEvidenceExplained",
    ] as const;
    return (
      keysWithin(payload, allowed) &&
      (payload.processVersion === undefined ||
        payload.processVersion === null ||
        typeof payload.processVersion === "string") &&
      stringArrayOrNull(payload.observedStepIds) &&
      stringArrayOrNull(payload.observedSubstepIds) &&
      booleanOrNull(payload.branchOrBlockerExplained) &&
      booleanOrNull(payload.transitionEvidenceExplained)
    );
  }
  if (kind === "number_evidence_observation") {
    const booleans = [
      "sourceFactsMatchOrRaised",
      "contractualBaseRentVerified",
      "recurringChargesSeparated",
      "providerOrderPreserved",
      "hiddenSelectionApplied",
      "providerEvidenceAttributed",
      "humanDecisionRecordedSeparately",
      "providerSetOfferedRent",
    ] as const;
    const allowed = [...booleans, "rentCastRadiusMiles", "rentCastRequestedCount"];
    return (
      keysWithin(payload, allowed) &&
      booleans.every((key) => booleanOrNull(payload[key])) &&
      finiteNumberOrNull(payload.rentCastRadiusMiles) &&
      nonnegativeIntegerOrNull(payload.rentCastRequestedCount)
    );
  }
  if (kind === "safety_observation") {
    const counts = [
      "appDraftCreateCount",
      "appClientSendCount",
      "rentvineWriteReceiptCount",
      "sheetWriteReceiptCount",
      "dotloopWriteReceiptCount",
    ] as const;
    const allowed = ["previewWithoutConfirmationObserved", ...counts];
    return (
      keysWithin(payload, allowed) &&
      booleanOrNull(payload.previewWithoutConfirmationObserved) &&
      counts.every((key) => nonnegativeIntegerOrNull(payload[key]))
    );
  }
  return true;
}

export function parseTestSetObservationBatch(value: unknown): S63ObservationBatch {
  const input = record(value);
  if (
    !input ||
    !hasExactKeys(input, ["schemaVersion", "batchRef", "entries"]) ||
    input.schemaVersion !== S63_OBSERVATION_SCHEMA_VERSION ||
    !Array.isArray(input.entries) ||
    input.entries.length < 1 ||
    input.entries.length > 500
  ) {
    throw new S63RunError("observation_shape");
  }
  const batchRef = requiredString(input.batchRef, 128);
  if (!batchRef || !/^[A-Za-z0-9._:-]+$/.test(batchRef)) {
    throw new S63RunError("observation_shape");
  }

  const entries: S63ObservationEntry[] = [];
  for (const candidate of input.entries) {
    const entry = record(candidate);
    if (
      !entry ||
      !hasExactKeys(entry, ["observationRef", "caseRef", "kind", "note", "payload"])
    ) {
      throw new S63RunError("observation_shape");
    }
    const observationRef = requiredString(entry.observationRef, 128);
    const caseRef = S63_CASE_REFS.find((value) => value === entry.caseRef);
    const kind = S63_OBSERVATION_KINDS.find((value) => value === entry.kind);
    const note = requiredString(entry.note, 4_000);
    const payload = record(entry.payload);
    if (
      !observationRef ||
      !/^[A-Za-z0-9._:-]+$/.test(observationRef) ||
      !caseRef ||
      !kind ||
      !note ||
      !payload ||
      !payloadWithinBoundary(payload) ||
      !structuredPayloadValid(kind, payload)
    ) {
      throw new S63RunError("observation_shape");
    }
    entries.push(
      Object.freeze({
        observationRef,
        caseRef,
        kind,
        note,
        payload: Object.freeze(payload),
      }),
    );
  }
  if (new Set(entries.map((entry) => entry.observationRef)).size !== entries.length) {
    throw new S63RunError("observation_shape");
  }

  return Object.freeze({
    schemaVersion: S63_OBSERVATION_SCHEMA_VERSION,
    batchRef,
    entries: Object.freeze(entries),
  });
}

function allowedPath(rootDir: string, candidatePath: string): boolean {
  const fromRoot = relative(resolve(rootDir), candidatePath).replace(/\\/g, "/");
  if (fromRoot === "" || fromRoot === ".") return false;
  if (fromRoot === "temp" || fromRoot.startsWith("temp/")) return true;
  return fromRoot === ".." || fromRoot.startsWith("../");
}

export function loadTestSetObservationBatch(
  options: LoadS63ObservationOptions = {},
): S63ObservationBatch {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const configuredPath = requiredString(
    (options.env ?? process.env)[S63_OBSERVATION_PATH_ENV],
    4_096,
  );
  if (!configuredPath) throw new S63RunError("observation_path_missing");
  const absolutePath = resolve(rootDir, configuredPath);
  if (!allowedPath(rootDir, absolutePath)) {
    throw new S63RunError("observation_tracked_path");
  }

  let canonicalPath: string;
  try {
    canonicalPath = resolve((options.realPath ?? realpathSync)(absolutePath));
  } catch {
    throw new S63RunError("observation_read_failed");
  }
  if (!allowedPath(rootDir, canonicalPath)) {
    throw new S63RunError("observation_tracked_path");
  }

  let raw: string;
  try {
    raw = (options.readText ?? ((path: string) => readFileSync(path, "utf8")))(
      canonicalPath,
    );
  } catch {
    throw new S63RunError("observation_read_failed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new S63RunError("observation_invalid_json");
  }
  return parseTestSetObservationBatch(parsed);
}
