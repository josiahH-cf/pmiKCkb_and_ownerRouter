import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { SPACE_SCOPES, type SpaceScope } from "@/lib/constants";

export const S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH_ENV =
  "S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH";
export const S30_RENTVINE_PROOF_RUNTIME_SCHEMA_VERSION = "s30-runtime-v1" as const;
export const RENTVINE_PROOF_ACCOUNT = "pmikcmetro" as const;
export const RENTVINE_PROOF_REF_PATTERN =
  /^s30-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const RENTVINE_PROOF_IDENTITY_FIELDS = ["leaseID", "leaseId", "id"] as const;

export type RentVineProofIdentityField = (typeof RENTVINE_PROOF_IDENTITY_FIELDS)[number];

export type RentVineProofRuntimeConfigErrorCode =
  | "config_path_missing"
  | "tracked_config_path"
  | "config_read_failed"
  | "config_invalid_json"
  | "config_shape"
  | "schema_version"
  | "scope"
  | "proof_ref"
  | "account"
  | "managed_actor"
  | "actor_role"
  | "renewals_scope"
  | "authority_shape"
  | "authority_reference"
  | "authority_expiry"
  | "target_shape"
  | "target_identity"
  | "target_field"
  | "target_date"
  | "proposal_unchanged"
  | "rollback_mismatch";

/** Value-free refusal: secure runtime values never enter the error message. */
export class RentVineProofRuntimeConfigError extends Error {
  constructor(public readonly code: RentVineProofRuntimeConfigErrorCode) {
    super(`S30 runtime configuration refused (${code}).`);
    this.name = "RentVineProofRuntimeConfigError";
  }
}

export interface RentVineProofAuthority {
  clientDesignationRef: string;
  protectedGateDirectionRef: string;
  endpointEvidenceRef: string;
  mappingEvidenceRef: string;
  backupEvidenceRef: string;
  authorizationExpiresAt: string;
}

export interface RentVineProofTarget {
  leaseId: string;
  identityField: RentVineProofIdentityField;
  field: "endDate";
  expectedStartDate: string;
  expectedEndDate: string | null;
  proposedEndDate: string;
  rollbackEndDate: string | null;
}

export interface RentVineProofRuntimeConfig {
  schemaVersion: typeof S30_RENTVINE_PROOF_RUNTIME_SCHEMA_VERSION;
  scope: "renewals";
  proofRef: string;
  account: typeof RENTVINE_PROOF_ACCOUNT;
  actor: AuthenticatedUser & {
    role: "Admin";
    scopes: readonly SpaceScope[];
  };
  authority: RentVineProofAuthority;
  target: RentVineProofTarget;
}

export function isRentVineProofRef(value: unknown): value is string {
  return typeof value === "string" && RENTVINE_PROOF_REF_PATTERN.test(value);
}

interface LoadRentVineProofRuntimeConfigOptions {
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

function requiredString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= maxLength ? trimmed : null;
}

function exactIsoTimestamp(value: unknown): string | null {
  const text = requiredString(value, 64);
  if (!text) return null;
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) return null;
  return text;
}

function exactIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? value
    : null;
}

function parseActor(value: unknown): RentVineProofRuntimeConfig["actor"] {
  const input = record(value);
  if (!input || !hasExactKeys(input, ["uid", "email", "hd", "role", "scopes"])) {
    throw new RentVineProofRuntimeConfigError("managed_actor");
  }
  const uid = requiredString(input.uid, 256);
  const email = requiredString(input.email, 320)?.toLowerCase() ?? null;
  const hd = requiredString(input.hd, 253)?.toLowerCase() ?? null;
  if (!uid || !email || hd !== "pmikcmetro.com" || !email.endsWith("@pmikcmetro.com")) {
    throw new RentVineProofRuntimeConfigError("managed_actor");
  }
  if (input.role !== "Admin") {
    throw new RentVineProofRuntimeConfigError("actor_role");
  }
  if (!Array.isArray(input.scopes)) {
    throw new RentVineProofRuntimeConfigError("renewals_scope");
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
    throw new RentVineProofRuntimeConfigError("renewals_scope");
  }
  return Object.freeze({
    uid,
    email,
    hd,
    role: "Admin",
    scopes: Object.freeze([...scopes]),
  });
}

const AUTHORITY_KEYS = [
  "clientDesignationRef",
  "protectedGateDirectionRef",
  "endpointEvidenceRef",
  "mappingEvidenceRef",
  "backupEvidenceRef",
] as const;

const UNVERIFIED_REFERENCE_RE =
  /(?:^|[-_: ])(?:tbd|todo|placeholder|example|sample|synthetic|test|unverified|needs[-_ ]?verification)(?:$|[-_: ])/i;

function parseAuthority(value: unknown): RentVineProofAuthority {
  const input = record(value);
  if (!input || !hasExactKeys(input, [...AUTHORITY_KEYS, "authorizationExpiresAt"])) {
    throw new RentVineProofRuntimeConfigError("authority_shape");
  }
  const references = Object.fromEntries(
    AUTHORITY_KEYS.map((key) => [key, requiredString(input[key])]),
  ) as Record<(typeof AUTHORITY_KEYS)[number], string | null>;
  if (
    AUTHORITY_KEYS.some(
      (key) =>
        !references[key] ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,499}$/.test(references[key]!) ||
        UNVERIFIED_REFERENCE_RE.test(references[key]!),
    )
  ) {
    throw new RentVineProofRuntimeConfigError("authority_reference");
  }
  const authorizationExpiresAt = exactIsoTimestamp(input.authorizationExpiresAt);
  if (!authorizationExpiresAt) {
    throw new RentVineProofRuntimeConfigError("authority_expiry");
  }
  return Object.freeze({
    clientDesignationRef: references.clientDesignationRef!,
    protectedGateDirectionRef: references.protectedGateDirectionRef!,
    endpointEvidenceRef: references.endpointEvidenceRef!,
    mappingEvidenceRef: references.mappingEvidenceRef!,
    backupEvidenceRef: references.backupEvidenceRef!,
    authorizationExpiresAt,
  });
}

function parseNullableIsoDate(value: unknown): string | null {
  if (value === null) return null;
  const parsed = exactIsoDate(value);
  if (!parsed) throw new RentVineProofRuntimeConfigError("target_date");
  return parsed;
}

function parseTarget(value: unknown): RentVineProofTarget {
  const input = record(value);
  if (
    !input ||
    !hasExactKeys(input, [
      "leaseId",
      "identityField",
      "field",
      "expectedStartDate",
      "expectedEndDate",
      "proposedEndDate",
      "rollbackEndDate",
    ])
  ) {
    throw new RentVineProofRuntimeConfigError("target_shape");
  }
  const leaseId = requiredString(input.leaseId, 64);
  if (!leaseId || !/^[1-9]\d*$/.test(leaseId)) {
    throw new RentVineProofRuntimeConfigError("target_identity");
  }
  const identityField = RENTVINE_PROOF_IDENTITY_FIELDS.find(
    (candidate) => candidate === input.identityField,
  );
  if (!identityField) {
    throw new RentVineProofRuntimeConfigError("target_identity");
  }
  if (input.field !== "endDate") {
    throw new RentVineProofRuntimeConfigError("target_field");
  }
  const expectedStartDate = exactIsoDate(input.expectedStartDate);
  const expectedEndDate = parseNullableIsoDate(input.expectedEndDate);
  const proposedEndDate = exactIsoDate(input.proposedEndDate);
  const rollbackEndDate = parseNullableIsoDate(input.rollbackEndDate);
  if (!expectedStartDate || !proposedEndDate) {
    throw new RentVineProofRuntimeConfigError("target_date");
  }
  if (proposedEndDate === expectedEndDate) {
    throw new RentVineProofRuntimeConfigError("proposal_unchanged");
  }
  if (rollbackEndDate !== expectedEndDate) {
    throw new RentVineProofRuntimeConfigError("rollback_mismatch");
  }
  return Object.freeze({
    leaseId,
    identityField,
    field: "endDate",
    expectedStartDate,
    expectedEndDate,
    proposedEndDate,
    rollbackEndDate,
  });
}

export function parseRentVineProofRuntimeConfig(
  value: unknown,
): RentVineProofRuntimeConfig {
  const input = record(value);
  if (
    !input ||
    !hasExactKeys(input, [
      "schemaVersion",
      "scope",
      "proofRef",
      "account",
      "actor",
      "authority",
      "target",
    ])
  ) {
    throw new RentVineProofRuntimeConfigError("config_shape");
  }
  if (input.schemaVersion !== S30_RENTVINE_PROOF_RUNTIME_SCHEMA_VERSION) {
    throw new RentVineProofRuntimeConfigError("schema_version");
  }
  if (input.scope !== "renewals") {
    throw new RentVineProofRuntimeConfigError("scope");
  }
  const proofRef = requiredString(input.proofRef, 41);
  if (!proofRef || !isRentVineProofRef(proofRef)) {
    throw new RentVineProofRuntimeConfigError("proof_ref");
  }
  if (input.account !== RENTVINE_PROOF_ACCOUNT) {
    throw new RentVineProofRuntimeConfigError("account");
  }
  return Object.freeze({
    schemaVersion: S30_RENTVINE_PROOF_RUNTIME_SCHEMA_VERSION,
    scope: "renewals",
    proofRef,
    account: RENTVINE_PROOF_ACCOUNT,
    actor: parseActor(input.actor),
    authority: parseAuthority(input.authority),
    target: parseTarget(input.target),
  });
}

export function isAllowedRentVineProofRuntimePath(
  rootDir: string,
  candidatePath: string,
): boolean {
  const fromRoot = relative(resolve(rootDir), resolve(candidatePath)).replace(/\\/g, "/");
  if (fromRoot === "" || fromRoot === ".") return false;
  if (fromRoot === "temp" || fromRoot.startsWith("temp/")) return true;
  return fromRoot === ".." || fromRoot.startsWith("../");
}

export function loadRentVineProofRuntimeConfig(
  options: LoadRentVineProofRuntimeConfigOptions = {},
): RentVineProofRuntimeConfig {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const env = options.env ?? process.env;
  const configuredPath = requiredString(
    env[S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH_ENV],
    4_096,
  );
  if (!configuredPath) {
    throw new RentVineProofRuntimeConfigError("config_path_missing");
  }
  const absolutePath = resolve(rootDir, configuredPath);
  if (!isAllowedRentVineProofRuntimePath(rootDir, absolutePath)) {
    throw new RentVineProofRuntimeConfigError("tracked_config_path");
  }
  let canonicalPath: string;
  try {
    canonicalPath = resolve((options.realPath ?? realpathSync)(absolutePath));
  } catch {
    throw new RentVineProofRuntimeConfigError("config_read_failed");
  }
  if (!isAllowedRentVineProofRuntimePath(rootDir, canonicalPath)) {
    throw new RentVineProofRuntimeConfigError("tracked_config_path");
  }
  let raw: string;
  try {
    raw = (options.readText ?? ((path: string) => readFileSync(path, "utf8")))(
      canonicalPath,
    );
  } catch {
    throw new RentVineProofRuntimeConfigError("config_read_failed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RentVineProofRuntimeConfigError("config_invalid_json");
  }
  return parseRentVineProofRuntimeConfig(parsed);
}
