import type { SheetsBatchGetResponse } from "@/lib/google-sheets/sheet-to-grids";

import {
  fingerprintRevisionRuntimeConfiguration,
  requireRevisionConfigurationFingerprint,
} from "./runtime-observation";
import { assuranceAbortSignal } from "./deadline";

const GOOGLE_SHEET_ID = /^[A-Za-z0-9_-]{20,200}$/;
const MANAGED_SUBJECT = /^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const RESOURCE_NAME_PART = /^[a-z][a-z0-9-]{0,62}$/;

const RENEWAL_SHEET_ENV_NAMES = [
  "RENEWAL_SHEET_ID",
  "SHEETS_IMPERSONATE_SA",
  "SHEETS_DWD_SUBJECT",
] as const;

export interface ExactCloudRunRevisionTarget {
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly expectedRevision: string;
  readonly expectedConfigurationFingerprint: string;
}

export interface CloudRunRevisionReadClient {
  request<T>(input: {
    readonly method: "GET";
    readonly url: string;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly data: T }>;
}

export interface ExactCloudRunOriginTarget extends Pick<
  ExactCloudRunRevisionTarget,
  "project" | "region" | "service" | "expectedRevision"
> {
  readonly origin: string;
  readonly phase: "candidate" | "post_promotion" | "rollback";
}

export interface VerifiedCloudRunOriginBinding {
  readonly canonicalOrigin: string;
  readonly predecessorRevision: string | null;
}

export interface RevisionBoundRenewalSheetConfig {
  /** Process-memory-only. Never include this value in assurance evidence. */
  readonly spreadsheetId: string;
  /** Process-memory-only managed service identity. */
  readonly impersonateServiceAccount: string;
  /** Process-memory-only managed Workspace subject. */
  readonly dwdSubject: string;
}

/** Fetch and verify one exact immutable Cloud Run revision before reading any bound source. */
export async function readVerifiedCloudRunRevisionConfiguration(
  client: CloudRunRevisionReadClient,
  target: ExactCloudRunRevisionTarget,
  sharedSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const expectedName = exactCloudRunRevisionName(target);
  const expectedFingerprint = requireRevisionConfigurationFingerprint(
    target.expectedConfigurationFingerprint,
  );
  const response = await client.request<Record<string, unknown>>({
    method: "GET",
    url: `https://run.googleapis.com/v2/${expectedName}`,
    signal: assuranceAbortSignal(undefined, sharedSignal),
  });
  if (!isRecord(response.data) || response.data.name !== expectedName) {
    throw new Error("revision_identity_mismatch");
  }
  if (fingerprintRevisionRuntimeConfiguration(response.data) !== expectedFingerprint) {
    throw new Error("revision_configuration_mismatch");
  }
  return response.data;
}

/**
 * Bind browser evidence to the exact Cloud Run service. Candidate traffic-tag URLs must map to the
 * named zero-traffic revision; post-promotion and rollback checks must use the service's canonical
 * URI while that exact revision owns all traffic.
 */
export async function readVerifiedCloudRunOriginBinding(
  client: CloudRunRevisionReadClient,
  target: ExactCloudRunOriginTarget,
  sharedSignal?: AbortSignal,
): Promise<VerifiedCloudRunOriginBinding> {
  exactCloudRunRevisionName(target);
  const expectedServiceName = `projects/${target.project}/locations/${target.region}/services/${target.service}`;
  const response = await client.request<Record<string, unknown>>({
    method: "GET",
    url: `https://run.googleapis.com/v2/${expectedServiceName}`,
    signal: assuranceAbortSignal(undefined, sharedSignal),
  });
  if (!isRecord(response.data) || response.data.name !== expectedServiceName) {
    throw new Error("service_identity_mismatch");
  }
  const canonicalOrigin = exactCloudRunOrigin(response.data.uri);
  const requestedOrigin = exactCloudRunOrigin(target.origin);
  const statuses = response.data.trafficStatuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error("service_traffic_invalid");
  }
  const parsed = statuses.map((entry) => {
    if (!isRecord(entry)) throw new Error("service_traffic_invalid");
    const revision = entry.revision;
    const percent = Number(entry.percent ?? 0);
    if (
      typeof revision !== "string" ||
      !RESOURCE_NAME_PART.test(revision) ||
      !Number.isFinite(percent) ||
      percent < 0 ||
      percent > 100
    ) {
      throw new Error("service_traffic_invalid");
    }
    return {
      revision,
      percent,
      tag: typeof entry.tag === "string" ? entry.tag : null,
      uri: typeof entry.uri === "string" ? exactCloudRunOrigin(entry.uri) : null,
    };
  });
  const serving = [
    ...new Set(
      parsed.filter((entry) => entry.percent === 100).map((entry) => entry.revision),
    ),
  ];
  if (target.phase === "candidate") {
    const candidateTags = parsed.filter(
      (entry) =>
        entry.revision === target.expectedRevision &&
        entry.percent === 0 &&
        entry.tag !== null &&
        entry.uri === requestedOrigin,
    );
    const candidateHasTraffic = parsed.some(
      (entry) => entry.revision === target.expectedRevision && entry.percent > 0,
    );
    if (
      requestedOrigin === canonicalOrigin ||
      candidateTags.length !== 1 ||
      candidateHasTraffic
    ) {
      throw new Error("candidate_origin_mismatch");
    }
    if (serving.length !== 1 || serving[0] === target.expectedRevision) {
      throw new Error("candidate_traffic_invalid");
    }
    return Object.freeze({
      canonicalOrigin,
      predecessorRevision: serving[0],
    });
  }
  if (
    requestedOrigin !== canonicalOrigin ||
    serving.length !== 1 ||
    serving[0] !== target.expectedRevision
  ) {
    throw new Error("canonical_origin_mismatch");
  }
  return Object.freeze({ canonicalOrigin, predecessorRevision: null });
}

/**
 * Resolve the exact operating-Sheet coordinates from the verified revision, never from ambient or
 * local dotenv values. Targeted variables must be unique plaintext values across all containers.
 */
export function extractRevisionBoundRenewalSheetConfig(
  revision: unknown,
  project: string,
): RevisionBoundRenewalSheetConfig {
  if (!PROJECT_ID.test(project) || !isRecord(revision)) {
    throw new Error("revision_sheet_configuration_invalid");
  }
  const values = extractUniquePlaintextEnvironment(revision, RENEWAL_SHEET_ENV_NAMES);
  const spreadsheetId = values.RENEWAL_SHEET_ID;
  const impersonateServiceAccount = values.SHEETS_IMPERSONATE_SA.toLowerCase();
  const dwdSubject = values.SHEETS_DWD_SUBJECT.toLowerCase();

  if (!GOOGLE_SHEET_ID.test(spreadsheetId)) {
    throw new Error("revision_sheet_configuration_invalid");
  }
  const expectedServiceAccountSuffix = `@${project}.iam.gserviceaccount.com`;
  if (
    !/^[a-z][a-z0-9-]{0,62}$/.test(
      impersonateServiceAccount.slice(0, -expectedServiceAccountSuffix.length),
    ) ||
    !impersonateServiceAccount.endsWith(expectedServiceAccountSuffix)
  ) {
    throw new Error("revision_sheet_identity_invalid");
  }
  if (!MANAGED_SUBJECT.test(dwdSubject)) {
    throw new Error("revision_sheet_identity_invalid");
  }

  return Object.freeze({ spreadsheetId, impersonateServiceAccount, dwdSubject });
}

/** Fetch, fingerprint, and reduce one revision to only its process-memory Sheet coordinates. */
export async function readVerifiedRevisionBoundRenewalSheetConfig(
  client: CloudRunRevisionReadClient,
  target: ExactCloudRunRevisionTarget,
  sharedSignal?: AbortSignal,
): Promise<RevisionBoundRenewalSheetConfig> {
  const revision = await readVerifiedCloudRunRevisionConfiguration(
    client,
    target,
    sharedSignal,
  );
  return extractRevisionBoundRenewalSheetConfig(revision, target.project);
}

/** Require Google values:batchGet to echo the exact revision-bound spreadsheet identity. */
export function assertRenewalSheetResponseIdentity(
  response: SheetsBatchGetResponse,
  expectedSpreadsheetId: string,
): void {
  if (
    !GOOGLE_SHEET_ID.test(expectedSpreadsheetId) ||
    response.spreadsheetId !== expectedSpreadsheetId
  ) {
    throw new Error("renewal_sheet_identity_mismatch");
  }
}

export function exactCloudRunRevisionName(
  target: Pick<
    ExactCloudRunRevisionTarget,
    "project" | "region" | "service" | "expectedRevision"
  >,
): string {
  if (
    !PROJECT_ID.test(target.project) ||
    !/^[a-z]+-[a-z]+[0-9]$/.test(target.region) ||
    !RESOURCE_NAME_PART.test(target.service) ||
    !RESOURCE_NAME_PART.test(target.expectedRevision) ||
    !target.expectedRevision.startsWith(`${target.service}-`)
  ) {
    throw new Error("revision_target_invalid");
  }
  return `projects/${target.project}/locations/${target.region}/services/${target.service}/revisions/${target.expectedRevision}`;
}

function extractUniquePlaintextEnvironment<Names extends readonly string[]>(
  revision: Record<string, unknown>,
  names: Names,
): Record<Names[number], string> {
  if (!Array.isArray(revision.containers) || revision.containers.length === 0) {
    throw new Error("revision_sheet_configuration_invalid");
  }
  const sought = new Set<string>(names);
  const matches = new Map<string, string[]>();
  for (const rawContainer of revision.containers) {
    if (!isRecord(rawContainer)) {
      throw new Error("revision_sheet_configuration_invalid");
    }
    const environment = rawContainer.env ?? [];
    if (!Array.isArray(environment)) {
      throw new Error("revision_sheet_configuration_invalid");
    }
    for (const rawEntry of environment) {
      if (!isRecord(rawEntry)) {
        throw new Error("revision_sheet_configuration_invalid");
      }
      if (typeof rawEntry.name !== "string" || !sought.has(rawEntry.name)) continue;
      if (
        typeof rawEntry.value !== "string" ||
        rawEntry.value.trim() === "" ||
        rawEntry.valueSource !== undefined
      ) {
        throw new Error("revision_sheet_configuration_invalid");
      }
      const current = matches.get(rawEntry.name) ?? [];
      current.push(rawEntry.value.trim());
      matches.set(rawEntry.name, current);
    }
  }

  const output: Record<string, string> = {};
  for (const name of names) {
    const values = matches.get(name);
    if (!values || values.length !== 1) {
      throw new Error("revision_sheet_configuration_invalid");
    }
    output[name] = values[0];
  }
  return output as Record<Names[number], string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactCloudRunOrigin(value: unknown): string {
  if (typeof value !== "string") throw new Error("service_origin_invalid");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("service_origin_invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/(?:^|\.)a\.run\.app$/.test(url.hostname)
  ) {
    throw new Error("service_origin_invalid");
  }
  return url.origin;
}
