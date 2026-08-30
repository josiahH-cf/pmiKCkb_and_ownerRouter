import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import { can, type Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { ROLES, SPACE_SCOPES, type SpaceScope } from "@/lib/constants";

export const S63_RUNTIME_CONFIG_PATH_ENV = "S63_TEST_SET_RUNTIME_CONFIG_PATH";
export const S63_RUNTIME_SCHEMA_VERSION = "s63-runtime-v1" as const;
export const S63_CASE_REFS = ["case-1", "case-2", "case-3", "case-4"] as const;

export type S63CaseRef = (typeof S63_CASE_REFS)[number];

export type S63RuntimeConfigErrorCode =
  | "config_path_missing"
  | "tracked_config_path"
  | "config_read_failed"
  | "config_invalid_json"
  | "config_shape"
  | "schema_version"
  | "scope"
  | "managed_actor"
  | "actor_role"
  | "renewals_scope"
  | "case_count"
  | "case_refs"
  | "case_shape"
  | "duplicate_lease"
  | "duplicate_sheet_row"
  | "report_shape";

/** Value-free error: the code is safe to emit; supplied config values never enter the message. */
export class S63RuntimeConfigError extends Error {
  constructor(public readonly code: S63RuntimeConfigErrorCode) {
    super(`S63 runtime configuration refused (${code}).`);
    this.name = "S63RuntimeConfigError";
  }
}

export interface S63RuntimeCase {
  caseRef: S63CaseRef;
  leaseId: string;
  sheetRowNumber: number;
}

export interface S63RuntimeReportContext {
  windowDescription: string;
  dailyOwner: string;
  abortTrigger: string;
}

export interface S63RuntimeConfig {
  schemaVersion: typeof S63_RUNTIME_SCHEMA_VERSION;
  scope: "renewals";
  actor: AuthenticatedUser & { scopes: readonly SpaceScope[] };
  cases: readonly S63RuntimeCase[];
  report: S63RuntimeReportContext;
}

interface LoadS63RuntimeConfigOptions {
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

function requiredString(value: unknown, maxLength = 2_000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= maxLength ? trimmed : null;
}

function parseActor(value: unknown): S63RuntimeConfig["actor"] {
  const input = record(value);
  if (!input || !hasExactKeys(input, ["uid", "email", "hd", "role", "scopes"])) {
    throw new S63RuntimeConfigError("managed_actor");
  }

  const uid = requiredString(input.uid, 256);
  const email = requiredString(input.email, 320)?.toLowerCase() ?? null;
  const hd = requiredString(input.hd, 253)?.toLowerCase() ?? null;
  if (!uid || !email || hd !== "pmikcmetro.com" || !email.endsWith("@pmikcmetro.com")) {
    throw new S63RuntimeConfigError("managed_actor");
  }

  const role = ROLES.find((candidate) => candidate === input.role) as Role | undefined;
  if (!role || !can(role, "edit")) {
    throw new S63RuntimeConfigError("actor_role");
  }

  if (!Array.isArray(input.scopes)) {
    throw new S63RuntimeConfigError("renewals_scope");
  }
  const scopes = input.scopes.filter(
    (scope): scope is SpaceScope =>
      typeof scope === "string" && SPACE_SCOPES.includes(scope as SpaceScope),
  );
  if (
    scopes.length !== input.scopes.length ||
    new Set(scopes).size !== scopes.length ||
    !scopes.includes("renewals")
  ) {
    throw new S63RuntimeConfigError("renewals_scope");
  }

  return Object.freeze({ uid, email, hd, role, scopes: Object.freeze([...scopes]) });
}

function parseCases(value: unknown): readonly S63RuntimeCase[] {
  if (!Array.isArray(value) || value.length !== S63_CASE_REFS.length) {
    throw new S63RuntimeConfigError("case_count");
  }

  const parsed: S63RuntimeCase[] = [];
  for (const candidate of value) {
    const input = record(candidate);
    if (!input || !hasExactKeys(input, ["caseRef", "leaseId", "sheetRowNumber"])) {
      throw new S63RuntimeConfigError("case_shape");
    }
    const caseRef = S63_CASE_REFS.find((entry) => entry === input.caseRef);
    const leaseId = requiredString(input.leaseId, 256);
    const sheetRowNumber = input.sheetRowNumber;
    if (
      !caseRef ||
      !leaseId ||
      !/^[A-Za-z0-9._:-]+$/.test(leaseId) ||
      !Number.isInteger(sheetRowNumber) ||
      Number(sheetRowNumber) <= 0
    ) {
      throw new S63RuntimeConfigError("case_shape");
    }
    parsed.push({ caseRef, leaseId, sheetRowNumber: Number(sheetRowNumber) });
  }

  const refs = new Set(parsed.map((entry) => entry.caseRef));
  if (
    refs.size !== S63_CASE_REFS.length ||
    S63_CASE_REFS.some((caseRef) => !refs.has(caseRef))
  ) {
    throw new S63RuntimeConfigError("case_refs");
  }
  if (new Set(parsed.map((entry) => entry.leaseId)).size !== parsed.length) {
    throw new S63RuntimeConfigError("duplicate_lease");
  }
  if (new Set(parsed.map((entry) => entry.sheetRowNumber)).size !== parsed.length) {
    throw new S63RuntimeConfigError("duplicate_sheet_row");
  }

  return Object.freeze(
    [...parsed]
      .sort(
        (left, right) =>
          S63_CASE_REFS.indexOf(left.caseRef) - S63_CASE_REFS.indexOf(right.caseRef),
      )
      .map((entry) => Object.freeze(entry)),
  );
}

function parseReport(value: unknown): S63RuntimeReportContext {
  const input = record(value);
  if (
    !input ||
    !hasExactKeys(input, ["windowDescription", "dailyOwner", "abortTrigger"])
  ) {
    throw new S63RuntimeConfigError("report_shape");
  }
  const windowDescription = requiredString(input.windowDescription);
  const dailyOwner = requiredString(input.dailyOwner);
  const abortTrigger = requiredString(input.abortTrigger);
  if (!windowDescription || !dailyOwner || !abortTrigger) {
    throw new S63RuntimeConfigError("report_shape");
  }
  return Object.freeze({ windowDescription, dailyOwner, abortTrigger });
}

export function parseTestSetRuntimeConfig(value: unknown): S63RuntimeConfig {
  const input = record(value);
  if (
    !input ||
    !hasExactKeys(input, ["schemaVersion", "scope", "actor", "cases", "report"])
  ) {
    throw new S63RuntimeConfigError("config_shape");
  }
  if (input.schemaVersion !== S63_RUNTIME_SCHEMA_VERSION) {
    throw new S63RuntimeConfigError("schema_version");
  }
  if (input.scope !== "renewals") {
    throw new S63RuntimeConfigError("scope");
  }

  return Object.freeze({
    schemaVersion: S63_RUNTIME_SCHEMA_VERSION,
    scope: "renewals",
    actor: parseActor(input.actor),
    cases: parseCases(input.cases),
    report: parseReport(input.report),
  });
}

function isAllowedRuntimePath(rootDir: string, candidatePath: string): boolean {
  const fromRoot = relative(resolve(rootDir), candidatePath).replace(/\\/g, "/");
  if (fromRoot === "" || fromRoot === ".") return false;
  if (fromRoot === "temp" || fromRoot.startsWith("temp/")) return true;
  return fromRoot === ".." || fromRoot.startsWith("../");
}

export function loadTestSetRuntimeConfig(
  options: LoadS63RuntimeConfigOptions = {},
): S63RuntimeConfig {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const env = options.env ?? process.env;
  const configuredPath = requiredString(env[S63_RUNTIME_CONFIG_PATH_ENV], 4_096);
  if (!configuredPath) {
    throw new S63RuntimeConfigError("config_path_missing");
  }
  const absolutePath = resolve(rootDir, configuredPath);
  if (!isAllowedRuntimePath(rootDir, absolutePath)) {
    throw new S63RuntimeConfigError("tracked_config_path");
  }

  let canonicalPath: string;
  try {
    canonicalPath = resolve((options.realPath ?? realpathSync)(absolutePath));
  } catch {
    throw new S63RuntimeConfigError("config_read_failed");
  }
  if (!isAllowedRuntimePath(rootDir, canonicalPath)) {
    throw new S63RuntimeConfigError("tracked_config_path");
  }

  let raw: string;
  try {
    raw = (options.readText ?? ((path: string) => readFileSync(path, "utf8")))(
      canonicalPath,
    );
  } catch {
    throw new S63RuntimeConfigError("config_read_failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new S63RuntimeConfigError("config_invalid_json");
  }
  return parseTestSetRuntimeConfig(parsed);
}
