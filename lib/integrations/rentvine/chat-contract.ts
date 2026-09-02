// S100 minimal official-contract snapshot and codecs for the one consumed chat operation.
// Source: the official OpenAPI published at https://docs.rentvine.com/ (extracted from the
// pre-rendered Redoc state, 2026-09-02), operation `GET /chat/messages` (List Chat Messages).
// The documented behavior makes this a consequential stateful read: retrieving messages marks
// them read for the manager role, and no rollback exists. The adapter consumes only the fixed
// Work Order object type with one explicit page; POST /chat/messages, message detail reads,
// other object types, and attachment/link-preview fetches are not expressible here.

import { createHash } from "node:crypto";

/**
 * SHA-256 of the canonical JSON (sorted keys, no whitespace) of the consumed operation object
 * `{"GET /chat/messages": <operation>}` extracted verbatim from the official OpenAPI on
 * 2026-09-02, including the dotted-key row schema and the eight pagination headers.
 */
export const CHAT_CONTRACT_SNAPSHOT_SHA256 =
  "ebc41f1af8a5b963094a77d84dd3e84dfc09c9dce3d676ef8827170b3dc7e730";

/** Fixed to the documented Work Order chat object type; no other type is expressible. */
export const CHAT_OBJECT_TYPE_WORK_ORDER = 1;
/** V1 fixes every confirmed call to exactly one provider page of twenty. */
export const CHAT_PAGE_SIZE = 20;
/** Provider envelope cap in bytes; an oversize envelope refuses local import. */
export const CHAT_MAX_ENVELOPE_BYTES = 2_000_000;
/** Stored/displayed body cap in Unicode code units; longer text truncates visibly. */
export const CHAT_MAX_BODY_UNITS = 20_000;
/** Attachment metadata caps. */
export const CHAT_MAX_ATTACHMENTS = 20;
export const CHAT_MAX_ATTACHMENT_STRING_UNITS = 500;

/** Documented sender roles. Role 1 is always nonresident; role 2 is the only resident candidate. */
export const CHAT_ROLE_MANAGER = 1;
export const CHAT_ROLE_TENANT = 2;

export class ChatContractError extends Error {
  constructor(
    readonly code: "invalid_envelope" | "invalid_headers" | "invalid_row",
    message: string,
  ) {
    super(message);
    this.name = "ChatContractError";
  }
}

function refuse(code: ChatContractError["code"], message: string): never {
  throw new ChatContractError(code, message);
}

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Exact integer pagination-header contract; contradictions make the outcome ambiguous. */
export interface ChatPagination {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /** Null means no older-page control is offered. */
  nextPage: number | null;
}

export function decodeChatPaginationHeaders(
  headers: Record<string, string>,
  confirmedPage: number,
): ChatPagination {
  const int = (name: string): number => {
    const raw = headers[name];
    if (raw === undefined || !/^\d+$/.test(raw.trim())) {
      refuse("invalid_headers", `Pagination header ${name} must be an integer.`);
    }
    return Number(raw.trim());
  };
  const currentPage = int("pagination-current-page");
  const pageSize = int("pagination-page-size");
  const totalItems = int("pagination-total-items");
  const totalPages = int("pagination-total-pages");
  if (currentPage !== confirmedPage) {
    refuse(
      "invalid_headers",
      `pagination-current-page ${currentPage} does not match the confirmed page ${confirmedPage}.`,
    );
  }
  if (pageSize < 1 || pageSize > CHAT_PAGE_SIZE) {
    refuse("invalid_headers", "pagination-page-size must be 1 through 20.");
  }
  if (totalPages < currentPage) {
    refuse(
      "invalid_headers",
      "pagination-total-pages must be at least the current page.",
    );
  }
  const rawNext = headers["pagination-next-page"];
  let nextPage: number | null = null;
  if (rawNext !== undefined && rawNext.trim() !== "" && rawNext.trim() !== "null") {
    if (!/^\d+$/.test(rawNext.trim())) {
      refuse("invalid_headers", "pagination-next-page must be an integer or blank.");
    }
    nextPage = Number(rawNext.trim());
    if (nextPage !== currentPage + 1 || nextPage > totalPages) {
      refuse(
        "invalid_headers",
        "pagination-next-page must equal current page plus one and not exceed total pages.",
      );
    }
  }
  return { currentPage, pageSize, totalItems, totalPages, nextPage };
}

export interface ChatAttachmentMeta {
  fileAttachmentId: number;
  fileId: number;
  title: string;
  fileName: string;
  fileType: string;
  previewFileName: string | null;
}

export type ChatRowDisposition =
  | {
      kind: "message";
      messageId: number;
      role: "manager" | "tenant";
      /** Positive user id for manager rows; null for tenant rows. */
      userId: number | null;
      /** Positive contact id for tenant rows; null for manager rows. */
      contactId: number | null;
      createdAtIso: string;
      /** Bounded display body (possibly truncated). */
      body: string;
      truncated: boolean;
      /** Hash over the full pre-truncation canonical payload for dedup comparison. */
      payloadHash: string;
      attachments: ChatAttachmentMeta[];
    }
  | {
      kind: "review";
      reason: "unknown_role" | "role_id_shape_mismatch" | "invalid_attachment_metadata";
      messageId: number;
      payloadHash: string;
      createdAtIso: string | null;
    }
  | {
      kind: "rejected";
      reason: "missing_message_id" | "wrong_object";
    };

function decodeInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function boundedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > CHAT_MAX_ATTACHMENT_STRING_UNITS) return null;
  return value;
}

function decodeAttachments(
  value: unknown,
): { ok: true; attachments: ChatAttachmentMeta[] } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, attachments: [] };
  if (!Array.isArray(value) || value.length > CHAT_MAX_ATTACHMENTS) return { ok: false };
  const attachments: ChatAttachmentMeta[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false };
    }
    const raw = entry as Record<string, unknown>;
    const allowed = new Set([
      "fileAttachmentID",
      "fileID",
      "title",
      "fileName",
      "fileType",
      "previewFileName",
    ]);
    for (const key of Object.keys(raw)) {
      if (!allowed.has(key)) return { ok: false };
    }
    const title = boundedString(raw["title"]);
    const fileName = boundedString(raw["fileName"]);
    const fileType = boundedString(raw["fileType"]);
    const previewFileName =
      raw["previewFileName"] === null || raw["previewFileName"] === undefined
        ? null
        : boundedString(raw["previewFileName"]);
    if (
      !positiveInt(raw["fileAttachmentID"]) ||
      !positiveInt(raw["fileID"]) ||
      title === null ||
      fileName === null ||
      fileType === null ||
      (raw["previewFileName"] !== null &&
        raw["previewFileName"] !== undefined &&
        previewFileName === null)
    ) {
      return { ok: false };
    }
    attachments.push({
      fileAttachmentId: raw["fileAttachmentID"] as number,
      fileId: raw["fileID"] as number,
      title,
      fileName,
      fileType,
      previewFileName,
    });
  }
  attachments.sort((a, b) =>
    a.fileAttachmentId === b.fileAttachmentId
      ? a.fileId - b.fileId
      : a.fileAttachmentId - b.fileAttachmentId,
  );
  return { ok: true, attachments };
}

/**
 * Canonical payload hash: account reference; required message ids/type/object/role; canonical
 * nullable user/contact ids; UTC creation instant; the full pre-truncation message text; and the
 * sorted attachment allowlist. Mutable read/share flags, names, emails, and link-preview
 * metadata are excluded.
 */
export function chatPayloadHash(input: {
  accountRef: string;
  messageId: number;
  chatObjectTypeId: number;
  objectId: number;
  roleTypeId: number;
  userId: number | null;
  contactId: number | null;
  createdAtIso: string;
  fullBody: string;
  attachments: ChatAttachmentMeta[];
}): string {
  const canonical = JSON.stringify({
    account: input.accountRef,
    attachments: input.attachments.map((entry) => ({
      fileAttachmentId: entry.fileAttachmentId,
      fileId: entry.fileId,
      fileName: entry.fileName,
      fileType: entry.fileType,
      previewFileName: entry.previewFileName,
      title: entry.title,
    })),
    body: input.fullBody,
    chatObjectTypeId: input.chatObjectTypeId,
    contactId: input.contactId,
    createdAt: input.createdAtIso,
    messageId: input.messageId,
    objectId: input.objectId,
    roleTypeId: input.roleTypeId,
    userId: input.userId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Decode one official dotted-key row into its disposition. Rows for the wrong object/type and
 * rows without a valid message id reject bodylessly; unknown roles and role/id-shape mismatches
 * become restricted review records; link-preview metadata is discarded unread.
 */
export function decodeChatRow(
  row: unknown,
  expected: { accountRef: string; workOrderId: number },
): ChatRowDisposition {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return { kind: "rejected", reason: "missing_message_id" };
  }
  const raw = row as Record<string, unknown>;
  const messageId = raw["message.messageID"];
  if (!positiveInt(messageId)) {
    return { kind: "rejected", reason: "missing_message_id" };
  }
  if (
    raw["message.chatObjectTypeID"] !== CHAT_OBJECT_TYPE_WORK_ORDER ||
    raw["message.objectID"] !== expected.workOrderId
  ) {
    return { kind: "rejected", reason: "wrong_object" };
  }
  const createdAtIso = decodeInstant(raw["message.dateTimeCreated"]);
  const body = raw["message.message"];
  const roleTypeId = raw["message.roleTypeID"];
  const attachmentsResult = decodeAttachments(raw["message.fileAttachments"]);
  const baseHashInput = {
    accountRef: expected.accountRef,
    messageId,
    chatObjectTypeId: CHAT_OBJECT_TYPE_WORK_ORDER,
    objectId: expected.workOrderId,
    roleTypeId: typeof roleTypeId === "number" ? roleTypeId : -1,
    userId: positiveInt(raw["message.userID"]) ? (raw["message.userID"] as number) : null,
    contactId: positiveInt(raw["message.contactID"])
      ? (raw["message.contactID"] as number)
      : null,
    createdAtIso: createdAtIso ?? "",
    fullBody: typeof body === "string" ? body : "",
    attachments: attachmentsResult.ok ? attachmentsResult.attachments : [],
  };

  if (
    typeof roleTypeId !== "number" ||
    typeof body !== "string" ||
    createdAtIso === null
  ) {
    return {
      kind: "review",
      reason: "unknown_role",
      messageId,
      payloadHash: chatPayloadHash(baseHashInput),
      createdAtIso,
    };
  }
  if (!attachmentsResult.ok) {
    return {
      kind: "review",
      reason: "invalid_attachment_metadata",
      messageId,
      payloadHash: chatPayloadHash(baseHashInput),
      createdAtIso,
    };
  }

  const userId = raw["message.userID"];
  const userUserId = raw["user.userID"];
  const contactId = raw["message.contactID"];
  const contactContactId = raw["contact.contactID"];
  const isNull = (value: unknown) => value === null || value === undefined;

  if (roleTypeId === CHAT_ROLE_MANAGER) {
    if (
      !positiveInt(userId) ||
      userId !== userUserId ||
      !isNull(contactId) ||
      !isNull(contactContactId)
    ) {
      return {
        kind: "review",
        reason: "role_id_shape_mismatch",
        messageId,
        payloadHash: chatPayloadHash(baseHashInput),
        createdAtIso,
      };
    }
  } else if (roleTypeId === CHAT_ROLE_TENANT) {
    if (
      !positiveInt(contactId) ||
      contactId !== contactContactId ||
      !isNull(userId) ||
      !isNull(userUserId)
    ) {
      return {
        kind: "review",
        reason: "role_id_shape_mismatch",
        messageId,
        payloadHash: chatPayloadHash(baseHashInput),
        createdAtIso,
      };
    }
  } else {
    return {
      kind: "review",
      reason: "unknown_role",
      messageId,
      payloadHash: chatPayloadHash(baseHashInput),
      createdAtIso,
    };
  }

  const truncated = body.length > CHAT_MAX_BODY_UNITS;
  return {
    kind: "message",
    messageId,
    role: roleTypeId === CHAT_ROLE_MANAGER ? "manager" : "tenant",
    userId: roleTypeId === CHAT_ROLE_MANAGER ? (userId as number) : null,
    contactId: roleTypeId === CHAT_ROLE_TENANT ? (contactId as number) : null,
    createdAtIso,
    body: truncated ? body.slice(0, CHAT_MAX_BODY_UNITS) : body,
    truncated,
    payloadHash: chatPayloadHash(baseHashInput),
    attachments: attachmentsResult.attachments,
  };
}

/** The envelope must be a bare array of at most twenty rows within the byte cap. */
export function decodeChatEnvelope(bodyText: string): { rows: unknown[] } {
  if (Buffer.byteLength(bodyText, "utf8") > CHAT_MAX_ENVELOPE_BYTES) {
    refuse("invalid_envelope", "The chat response envelope exceeds 2,000,000 bytes.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    refuse("invalid_envelope", "The chat response is not valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    refuse("invalid_envelope", "The chat response must be a bare array.");
  }
  if (parsed.length > CHAT_PAGE_SIZE) {
    refuse("invalid_envelope", "The chat response exceeds twenty rows.");
  }
  return { rows: parsed };
}

/**
 * Resident mapping over the documented lease `tenants` include: exactly one tenant entry whose
 * `leaseTenant.contactID` and nested `contact.contactID` both canonically equal the chat contact
 * id yields the binding; zero or many matches yield null (Needs mapping). The source version
 * hashes the full tenants relation so a concurrent change is detectable at commit time. Property,
 * unit, name similarity, and requestedBy fields are never consulted.
 */
export interface ResidentSourceMatch {
  leaseTenantId: string;
  contactId: number;
  /** The one nonblank current nested contact email; null blocks drafting, never mapping. */
  email: string | null;
  sourceVersion: string;
}

export function resolveResidentFromLeaseTenants(
  leaseResponse: Record<string, unknown>,
  chatContactId: number,
): ResidentSourceMatch | null {
  const tenants = leaseResponse["tenants"];
  if (!Array.isArray(tenants)) return null;
  const sourceVersion = createHash("sha256")
    .update(JSON.stringify(tenants))
    .digest("hex");
  const wanted = String(chatContactId);
  const matches: ResidentSourceMatch[] = [];
  for (const entry of tenants) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const leaseTenant = raw["leaseTenant"];
    const contact = raw["contact"];
    if (
      typeof leaseTenant !== "object" ||
      leaseTenant === null ||
      typeof contact !== "object" ||
      contact === null
    ) {
      continue;
    }
    const lt = leaseTenant as Record<string, unknown>;
    const c = contact as Record<string, unknown>;
    if (lt["contactID"] !== wanted || c["contactID"] !== wanted) continue;
    const leaseTenantId = lt["leaseTenantID"];
    if (typeof leaseTenantId !== "string" || !/^[1-9][0-9]*$/.test(leaseTenantId)) {
      continue;
    }
    const email =
      typeof c["email"] === "string" && c["email"].trim() ? c["email"].trim() : null;
    matches.push({ leaseTenantId, contactId: chatContactId, email, sourceVersion });
  }
  return matches.length === 1 ? matches[0] : null;
}
