// Google Drive effect boundary for renewal-comp screenshots (AC-S53-13).
//
// This provider deliberately does not implement preview, durable claims, receipts, or reconciliation
// policy. It supplies the narrow Drive primitives those layers need: read the exact approved parent,
// reserve one provider ID, create a binary image at that exact ID, read that exact ID, and move that exact
// ID to trash. In particular, it never searches by filename and exposes no permanent-delete operation.

import { randomUUID } from "node:crypto";

import { DRIVE_FOLDER_MIME, mintDriveDwdToken } from "@/lib/google-drive/drive-dwd";

export const MAX_RENEWAL_COMP_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export const RENEWAL_COMP_SCREENSHOT_FOLDER_MIME = DRIVE_FOLDER_MIME;

export const RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS =
  "id,name,mimeType,size,md5Checksum,sha256Checksum,parents,trashed,explicitlyTrashed," +
  "appProperties,createdTime,modifiedTime,version,headRevisionId,webViewLink,isAppAuthorized," +
  "ownedByMe,driveId," +
  "capabilities(canTrash,canUntrash,canMoveItemOutOfDrive)";

export const RENEWAL_COMP_SCREENSHOT_FOLDER_FIELDS =
  "id,mimeType,trashed,version,isAppAuthorized,ownedByMe,driveId," +
  "capabilities(canAddChildren)";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_FILES_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DEFAULT_TIMEOUT_MS = 30_000;
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DECIMAL_INTEGER_PATTERN = /^\d+$/;
const MD5_PATTERN = /^[a-f0-9]{32}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_APP_PROPERTIES = 100;
const MAX_APP_PROPERTY_BYTES = 124;
const MAX_FILENAME_BYTES = 255;

const ALLOWED_MIME_TYPES = new Set<RenewalCompScreenshotMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export type RenewalCompScreenshotMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic";

export interface RenewalCompScreenshotDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  md5Checksum?: string;
  sha256Checksum?: string;
  parents: string[];
  trashed: boolean;
  explicitlyTrashed: boolean;
  appProperties: Record<string, string>;
  createdTime: string;
  modifiedTime: string;
  version: string;
  headRevisionId?: string;
  webViewLink?: string;
  isAppAuthorized: boolean;
  /**
   * Drive omits ownedByMe for Shared Drive items. My Drive boundary checks require it to be true;
   * Shared Drive boundary checks instead bind the exact driveId.
   */
  ownedByMe?: boolean;
  driveId?: string;
  capabilities: {
    canTrash: boolean;
    canUntrash: boolean;
    canMoveItemOutOfDrive: boolean;
  };
}

/**
 * The exact Drive v3 resource used by the service to approve a screenshot parent. The provider
 * preserves boundary-relevant values instead of deciding My Drive versus Shared Drive policy: an
 * absent driveId identifies My Drive, while a present driveId identifies the containing Shared Drive.
 */
export interface RenewalCompScreenshotDriveFolder {
  id: string;
  mimeType: string;
  trashed: boolean;
  version: string;
  isAppAuthorized: boolean;
  /** Not populated for Shared Drive items. */
  ownedByMe?: boolean;
  driveId?: string;
  capabilities: {
    canAddChildren: boolean;
  };
}

/**
 * A deterministic rejection means this request did not apply the requested Drive mutation. It does not
 * prove that an effect from an earlier request is absent; callers reconcile the reserved ID for that.
 */
export interface RenewalCompScreenshotDriveRejection {
  outcome: "rejected";
  certainty: "not_applied";
  reason: "authentication" | "http";
  httpStatus?: number;
}

/**
 * An ambiguous result can follow a dispatched request, timeout, 5xx, or malformed success response. The
 * caller must read the exact reserved ID and must never mint a replacement ID based on this outcome.
 */
export interface RenewalCompScreenshotDriveAmbiguity {
  outcome: "ambiguous";
  certainty: "unknown";
  reason: "transport" | "http" | "invalid_response";
  httpStatus?: number;
}

export interface RenewalCompScreenshotDriveConflict {
  outcome: "conflict";
  certainty: "unknown";
  httpStatus: 409;
}

export type RenewalCompScreenshotReserveOutcome =
  | { outcome: "reserved"; fileId: string }
  | RenewalCompScreenshotDriveRejection
  | RenewalCompScreenshotDriveAmbiguity;

/**
 * "accepted" means Drive returned a valid 2xx file resource for the exact reserved ID. Delivery still
 * requires the caller's exact GET/readback checks before it creates a durable receipt.
 */
export type RenewalCompScreenshotMutationOutcome =
  | {
      outcome: "accepted";
      httpStatus: number;
      file: RenewalCompScreenshotDriveFile;
    }
  | RenewalCompScreenshotDriveConflict
  | RenewalCompScreenshotDriveRejection
  | RenewalCompScreenshotDriveAmbiguity;

/**
 * Only an exact 404 is represented as absent. A rejected or ambiguous read leaves provider state unknown.
 */
export type RenewalCompScreenshotReadOutcome =
  | {
      outcome: "found";
      httpStatus: number;
      file: RenewalCompScreenshotDriveFile;
    }
  | { outcome: "absent"; httpStatus: 404 }
  | RenewalCompScreenshotDriveRejection
  | RenewalCompScreenshotDriveAmbiguity;

export type RenewalCompScreenshotFolderReadOutcome =
  | {
      outcome: "found";
      httpStatus: number;
      folder: RenewalCompScreenshotDriveFolder;
    }
  | { outcome: "absent"; httpStatus: 404 }
  | RenewalCompScreenshotDriveRejection
  | RenewalCompScreenshotDriveAmbiguity;

export interface CreateReservedRenewalCompScreenshotInput {
  /** A file ID returned by reserveFileId and durably won before this method is called. */
  fileId: string;
  /** Scalar by design: the provider can submit exactly one parent and no caller-supplied parent array. */
  parentFolderId: string;
  /** Server-generated, non-PII Drive filename. */
  name: string;
  /** Server-detected image MIME type. */
  mimeType: RenewalCompScreenshotMimeType;
  /** Private binding hashes/identifiers supplied by the server action layer. */
  appProperties: Readonly<Record<string, string>>;
  /** Exact decoded image bytes. The provider never accepts base64 text. */
  bytes: Uint8Array;
}

export interface RenewalCompScreenshotDriveProvider {
  reserveFileId(): Promise<RenewalCompScreenshotReserveOutcome>;
  getFolder(folderId: string): Promise<RenewalCompScreenshotFolderReadOutcome>;
  createReservedFile(
    input: CreateReservedRenewalCompScreenshotInput,
  ): Promise<RenewalCompScreenshotMutationOutcome>;
  getFile(fileId: string): Promise<RenewalCompScreenshotReadOutcome>;
  trashFile(fileId: string): Promise<RenewalCompScreenshotMutationOutcome>;
}

export type RenewalCompScreenshotDriveFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export class RenewalCompScreenshotDriveInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenewalCompScreenshotDriveInputError";
  }
}

type AuthenticatedRequestOutcome =
  | { outcome: "response"; response: Response }
  | RenewalCompScreenshotDriveRejection
  | RenewalCompScreenshotDriveAmbiguity;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isOptionalChecksum(
  value: unknown,
  pattern: RegExp,
): value is string | undefined {
  return value === undefined || (typeof value === "string" && pattern.test(value));
}

function parseStringRecord(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseDriveFile(
  value: unknown,
  expectedFileId: string,
): RenewalCompScreenshotDriveFile | null {
  if (!isRecord(value) || value.id !== expectedFileId) return null;
  if (!isNonEmptyString(value.name) || !isNonEmptyString(value.mimeType)) return null;
  if (
    typeof value.size !== "string" ||
    !DECIMAL_INTEGER_PATTERN.test(value.size) ||
    typeof value.version !== "string" ||
    !DECIMAL_INTEGER_PATTERN.test(value.version)
  ) {
    return null;
  }
  if (
    !Array.isArray(value.parents) ||
    value.parents.some(
      (parent) => !isNonEmptyString(parent) || !DRIVE_ID_PATTERN.test(parent),
    )
  ) {
    return null;
  }
  if (
    typeof value.trashed !== "boolean" ||
    typeof value.explicitlyTrashed !== "boolean"
  ) {
    return null;
  }
  const appProperties = parseStringRecord(value.appProperties);
  if (!appProperties) return null;
  if (
    !isNonEmptyString(value.createdTime) ||
    !isNonEmptyString(value.modifiedTime) ||
    !isOptionalString(value.headRevisionId) ||
    !isOptionalString(value.webViewLink) ||
    !isOptionalChecksum(value.md5Checksum, MD5_PATTERN) ||
    !isOptionalChecksum(value.sha256Checksum, SHA256_PATTERN) ||
    typeof value.isAppAuthorized !== "boolean" ||
    !isOptionalBoolean(value.ownedByMe) ||
    !isOptionalString(value.driveId)
  ) {
    return null;
  }
  if (value.driveId !== undefined && !DRIVE_ID_PATTERN.test(value.driveId)) {
    return null;
  }
  if (
    !isRecord(value.capabilities) ||
    typeof value.capabilities.canTrash !== "boolean" ||
    typeof value.capabilities.canUntrash !== "boolean" ||
    typeof value.capabilities.canMoveItemOutOfDrive !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    mimeType: value.mimeType,
    size: value.size,
    ...(value.md5Checksum ? { md5Checksum: value.md5Checksum } : {}),
    ...(value.sha256Checksum ? { sha256Checksum: value.sha256Checksum } : {}),
    parents: [...value.parents],
    trashed: value.trashed,
    explicitlyTrashed: value.explicitlyTrashed,
    appProperties,
    createdTime: value.createdTime,
    modifiedTime: value.modifiedTime,
    version: value.version,
    ...(value.headRevisionId ? { headRevisionId: value.headRevisionId } : {}),
    ...(value.webViewLink ? { webViewLink: value.webViewLink } : {}),
    isAppAuthorized: value.isAppAuthorized,
    ...(value.ownedByMe !== undefined ? { ownedByMe: value.ownedByMe } : {}),
    ...(value.driveId ? { driveId: value.driveId } : {}),
    capabilities: {
      canTrash: value.capabilities.canTrash,
      canUntrash: value.capabilities.canUntrash,
      canMoveItemOutOfDrive: value.capabilities.canMoveItemOutOfDrive,
    },
  };
}

function parseDriveFolder(
  value: unknown,
  expectedFolderId: string,
): RenewalCompScreenshotDriveFolder | null {
  if (!isRecord(value) || value.id !== expectedFolderId) return null;
  if (
    !isNonEmptyString(value.mimeType) ||
    typeof value.trashed !== "boolean" ||
    typeof value.version !== "string" ||
    !DECIMAL_INTEGER_PATTERN.test(value.version) ||
    typeof value.isAppAuthorized !== "boolean" ||
    !isOptionalBoolean(value.ownedByMe) ||
    !isOptionalString(value.driveId)
  ) {
    return null;
  }
  if (value.driveId !== undefined && !DRIVE_ID_PATTERN.test(value.driveId)) {
    return null;
  }
  if (
    !isRecord(value.capabilities) ||
    typeof value.capabilities.canAddChildren !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    mimeType: value.mimeType,
    trashed: value.trashed,
    version: value.version,
    isAppAuthorized: value.isAppAuthorized,
    ...(value.ownedByMe !== undefined ? { ownedByMe: value.ownedByMe } : {}),
    ...(value.driveId ? { driveId: value.driveId } : {}),
    capabilities: {
      canAddChildren: value.capabilities.canAddChildren,
    },
  };
}

function assertDriveId(
  value: string,
  field: "fileId" | "folderId" | "parentFolderId",
): void {
  if (!DRIVE_ID_PATTERN.test(value)) {
    throw new RenewalCompScreenshotDriveInputError(
      `${field} must be a Drive resource ID.`,
    );
  }
}

function validateCreateInput(input: CreateReservedRenewalCompScreenshotInput): void {
  assertDriveId(input.fileId, "fileId");
  assertDriveId(input.parentFolderId, "parentFolderId");
  if (
    input.name.trim() === "" ||
    input.name.includes("\0") ||
    input.name.includes("\r") ||
    input.name.includes("\n") ||
    Buffer.byteLength(input.name, "utf8") > MAX_FILENAME_BYTES
  ) {
    throw new RenewalCompScreenshotDriveInputError(
      "name must be a safe server-generated filename.",
    );
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new RenewalCompScreenshotDriveInputError(
      "mimeType must be a supported screenshot type.",
    );
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new RenewalCompScreenshotDriveInputError(
      "bytes must contain a decoded screenshot.",
    );
  }
  if (input.bytes.byteLength > MAX_RENEWAL_COMP_SCREENSHOT_BYTES) {
    throw new RenewalCompScreenshotDriveInputError(
      "bytes exceed the 5 MiB multipart upload limit.",
    );
  }
  const appProperties = Object.entries(input.appProperties);
  if (appProperties.length > MAX_APP_PROPERTIES) {
    throw new RenewalCompScreenshotDriveInputError(
      "appProperties exceed the Drive limit.",
    );
  }
  for (const [key, value] of appProperties) {
    if (
      key.length === 0 ||
      typeof value !== "string" ||
      Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8") >
        MAX_APP_PROPERTY_BYTES
    ) {
      throw new RenewalCompScreenshotDriveInputError(
        "appProperties must contain bounded string keys and values.",
      );
    }
  }
}

function buildUrl(base: string, query: Readonly<Record<string, string>>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

function deterministicHttpRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 409;
}

function rejectedHttp(status: number): RenewalCompScreenshotDriveRejection {
  return {
    outcome: "rejected",
    certainty: "not_applied",
    reason: "http",
    httpStatus: status,
  };
}

function ambiguousHttp(status: number): RenewalCompScreenshotDriveAmbiguity {
  return {
    outcome: "ambiguous",
    certainty: "unknown",
    reason: "http",
    httpStatus: status,
  };
}

async function responseJson(response: Response): Promise<unknown | null> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export class GoogleDriveRenewalCompScreenshotProvider implements RenewalCompScreenshotDriveProvider {
  private readonly getAccessToken: () => Promise<string>;
  private readonly fetchImpl: RenewalCompScreenshotDriveFetch;
  private readonly timeoutMs: number;

  constructor(
    options: {
      getAccessToken?: () => Promise<string>;
      fetchImpl?: RenewalCompScreenshotDriveFetch;
      timeoutMs?: number;
      serviceAccount?: string;
      subject?: string;
    } = {},
  ) {
    this.getAccessToken =
      options.getAccessToken ??
      (() =>
        mintDriveDwdToken({
          serviceAccount: options.serviceAccount,
          subject: options.subject,
        }));
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RenewalCompScreenshotDriveInputError("timeoutMs must be positive.");
    }
  }

  async reserveFileId(): Promise<RenewalCompScreenshotReserveOutcome> {
    const request = await this.authenticatedRequest(
      buildUrl(`${DRIVE_FILES_URL}/generateIds`, {
        count: "1",
        space: "drive",
        type: "files",
      }),
      { method: "GET" },
    );
    if (request.outcome !== "response") return request;
    const { response } = request;
    if (response.status < 200 || response.status >= 300) {
      return deterministicHttpRejection(response.status)
        ? rejectedHttp(response.status)
        : ambiguousHttp(response.status);
    }
    const payload = await responseJson(response);
    if (
      !isRecord(payload) ||
      payload.space !== "drive" ||
      !Array.isArray(payload.ids) ||
      payload.ids.length !== 1 ||
      typeof payload.ids[0] !== "string" ||
      !DRIVE_ID_PATTERN.test(payload.ids[0])
    ) {
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "invalid_response",
        httpStatus: response.status,
      };
    }
    return { outcome: "reserved", fileId: payload.ids[0] };
  }

  async getFolder(folderId: string): Promise<RenewalCompScreenshotFolderReadOutcome> {
    assertDriveId(folderId, "folderId");
    const request = await this.authenticatedRequest(
      buildUrl(`${DRIVE_FILES_URL}/${encodeURIComponent(folderId)}`, {
        supportsAllDrives: "true",
        fields: RENEWAL_COMP_SCREENSHOT_FOLDER_FIELDS,
      }),
      { method: "GET" },
    );
    if (request.outcome !== "response") return request;
    const { response } = request;
    if (response.status === 404) return { outcome: "absent", httpStatus: 404 };
    if (response.status < 200 || response.status >= 300) {
      return deterministicHttpRejection(response.status)
        ? rejectedHttp(response.status)
        : ambiguousHttp(response.status);
    }
    const folder = parseDriveFolder(await responseJson(response), folderId);
    if (!folder) {
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "invalid_response",
        httpStatus: response.status,
      };
    }
    return { outcome: "found", httpStatus: response.status, folder };
  }

  async createReservedFile(
    input: CreateReservedRenewalCompScreenshotInput,
  ): Promise<RenewalCompScreenshotMutationOutcome> {
    validateCreateInput(input);

    // Build and copy the complete multipart body before awaiting authentication so caller mutation of the
    // Uint8Array cannot alter a dispatched attempt.
    const boundary = `renewal-comp-${randomUUID()}`;
    const metadata = {
      id: input.fileId,
      name: input.name,
      mimeType: input.mimeType,
      parents: [input.parentFolderId],
      appProperties: { ...input.appProperties },
    };
    const head =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${input.mimeType}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const body = Buffer.concat([
      Buffer.from(head, "utf8"),
      Buffer.from(input.bytes),
      Buffer.from(tail, "utf8"),
    ]);

    const request = await this.authenticatedRequest(
      buildUrl(DRIVE_UPLOAD_FILES_URL, {
        uploadType: "multipart",
        supportsAllDrives: "true",
        fields: RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
      }),
      {
        method: "POST",
        headers: {
          "content-type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (request.outcome !== "response") return request;
    return this.mutationOutcome(request.response, input.fileId);
  }

  async getFile(fileId: string): Promise<RenewalCompScreenshotReadOutcome> {
    assertDriveId(fileId, "fileId");
    const request = await this.authenticatedRequest(
      buildUrl(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
        supportsAllDrives: "true",
        fields: RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
      }),
      { method: "GET" },
    );
    if (request.outcome !== "response") return request;
    const { response } = request;
    if (response.status === 404) return { outcome: "absent", httpStatus: 404 };
    if (response.status < 200 || response.status >= 300) {
      return deterministicHttpRejection(response.status)
        ? rejectedHttp(response.status)
        : ambiguousHttp(response.status);
    }
    const file = parseDriveFile(await responseJson(response), fileId);
    if (!file) {
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "invalid_response",
        httpStatus: response.status,
      };
    }
    return { outcome: "found", httpStatus: response.status, file };
  }

  async trashFile(fileId: string): Promise<RenewalCompScreenshotMutationOutcome> {
    assertDriveId(fileId, "fileId");
    const request = await this.authenticatedRequest(
      buildUrl(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
        supportsAllDrives: "true",
        fields: RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
      }),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      },
    );
    if (request.outcome !== "response") return request;
    const outcome = await this.mutationOutcome(request.response, fileId);
    if (outcome.outcome === "accepted" && !outcome.file.trashed) {
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "invalid_response",
        httpStatus: outcome.httpStatus,
      };
    }
    return outcome;
  }

  private async mutationOutcome(
    response: Response,
    expectedFileId: string,
  ): Promise<RenewalCompScreenshotMutationOutcome> {
    if (response.status === 409) {
      return { outcome: "conflict", certainty: "unknown", httpStatus: 409 };
    }
    if (response.status < 200 || response.status >= 300) {
      return deterministicHttpRejection(response.status)
        ? rejectedHttp(response.status)
        : ambiguousHttp(response.status);
    }
    const file = parseDriveFile(await responseJson(response), expectedFileId);
    if (!file) {
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "invalid_response",
        httpStatus: response.status,
      };
    }
    return { outcome: "accepted", httpStatus: response.status, file };
  }

  private async authenticatedRequest(
    url: string,
    init: Omit<RequestInit, "signal">,
  ): Promise<AuthenticatedRequestOutcome> {
    let token: string;
    try {
      token = (await this.getAccessToken()).trim();
    } catch {
      return {
        outcome: "rejected",
        certainty: "not_applied",
        reason: "authentication",
      };
    }
    if (!token) {
      return {
        outcome: "rejected",
        certainty: "not_applied",
        reason: "authentication",
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      const response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      return { outcome: "response", response };
    } catch {
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "transport",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
