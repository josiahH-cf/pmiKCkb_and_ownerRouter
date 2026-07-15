import { createHash } from "node:crypto";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canAccessSpaceId } from "@/lib/space-scope-resources";
import {
  assertAuthorityFieldsAreInert,
  assertRegisteredProcessActions,
  PublicationAuthorityError,
  safePublicationFailureMessage,
} from "@/lib/publication/authority-firewall";
import {
  MAX_PUBLICATION_CONTENT_BYTES,
  type PublicationEnvelope,
  type PublicationFailureCode,
  type PublicationMetadata,
  type PublicationPolicyRecord,
  type PublicationScanner,
  type PublicationSensitivity,
  type PublicationValidationResult,
} from "@/lib/publication/types";

export class PublicationValidationError extends Error {
  constructor(
    public readonly code: PublicationFailureCode,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(safePublicationFailureMessage(code));
    this.name = "PublicationValidationError";
  }
}

export async function validatePublication(
  actor: AuthenticatedUser,
  policy: PublicationPolicyRecord,
  envelope: PublicationEnvelope,
  scanner: PublicationScanner,
  context: { registeredProcessActionKeys?: ReadonlySet<string> } = {},
): Promise<{ content: Uint8Array; result: PublicationValidationResult }> {
  const { metadata } = envelope;
  assertMetadata(actor, policy, metadata, scanner);

  // Type and declared size are checked before calling the loader. A streaming adapter can
  // therefore refuse an oversize body without buffering it.
  const allowedType = resolveAllowedType(policy, metadata);
  const maxBytes = Math.min(allowedType.maxBytes, MAX_PUBLICATION_CONTENT_BYTES);
  if (metadata.declaredByteSize > maxBytes) fail("oversize");

  const content = await envelope.loadContent(maxBytes);
  if (content.byteLength !== metadata.declaredByteSize) {
    fail("content_size_mismatch");
  }
  if (content.byteLength > maxBytes) fail("oversize");

  const detectedMimeType = detectContentMime(metadata, content);
  if (
    metadata.declaredMimeType !== detectedMimeType ||
    !allowedType.mimeTypes.includes(detectedMimeType)
  ) {
    fail("mime_mismatch");
  }

  assertProcessShape(metadata, content, context.registeredProcessActionKeys);

  const malware = await scanner.scanMalware(content, metadata);
  if (malware.code === "scanner_unavailable") fail("scanner_unavailable", 409);
  if (malware.code !== "clean") fail("malware_detected");

  const sensitivity = await scanner.scanSensitivity(content, metadata);
  if (sensitivity.code === "scanner_unavailable") fail("scanner_unavailable", 409);
  if (sensitivity.code !== "clean") fail("sensitivity_violation");

  const detectedSensitivity = sensitivity.sensitivity ?? "Low";
  if (sensitivityRank(detectedSensitivity) > sensitivityRank(policy.sensitivityCeiling)) {
    fail("sensitivity_violation");
  }

  return {
    content,
    result: {
      contentHash: createHash("sha256").update(content).digest("hex"),
      detectedMimeType,
      sensitivity: detectedSensitivity,
    },
  };
}

function assertMetadata(
  actor: AuthenticatedUser,
  policy: PublicationPolicyRecord,
  metadata: PublicationMetadata,
  scanner: PublicationScanner,
) {
  if (!can(actor.role, "edit") || !canAccessSpaceId(actor, metadata.spaceId)) {
    fail("actor_not_authorized", 403);
  }
  if (!policy.enabled) fail("policy_disabled", 409);
  if (policy.connectorId !== metadata.connectorId || policy.rootId !== metadata.rootId) {
    fail("root_mismatch", 403);
  }
  if (!policy.allowedSpaces.includes(metadata.spaceId)) fail("space_not_allowed", 403);
  if (policy.scannerKey !== scanner.key) fail("scanner_mismatch", 409);
  if (!isSafeRelativePath(metadata.path)) fail("path_outside_root", 403);
  if (!Number.isSafeInteger(metadata.declaredByteSize) || metadata.declaredByteSize < 0) {
    fail("oversize");
  }
  if (!metadata.sourceState || !metadata.citationLabel?.trim()) {
    fail("source_metadata_invalid");
  }
}

function resolveAllowedType(
  policy: PublicationPolicyRecord,
  metadata: PublicationMetadata,
) {
  if (metadata.resourceType === "process_definition") {
    if (metadata.declaredMimeType !== "application/json") {
      fail("mime_mismatch");
    }
    return {
      extension: ".json",
      maxBytes: 2 * 1024 * 1024,
      mimeTypes: ["application/json"],
    };
  }

  const extension = extensionOf(metadata.fileName);
  const allowed = policy.allowedTypes.find((item) => item.extension === extension);
  if (!allowed) fail("type_denied");
  if (!allowed.mimeTypes.includes(metadata.declaredMimeType)) fail("mime_mismatch");
  return allowed;
}

function detectContentMime(metadata: PublicationMetadata, content: Uint8Array): string {
  if (metadata.resourceType === "process_definition") return "application/json";
  if (startsWith(content, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(content, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(content, [0x52, 0x49, 0x46, 0x46]) &&
    new TextDecoder().decode(content.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    startsWith(content, [0x50, 0x4b, 0x03, 0x04]) &&
    extensionOf(metadata.fileName) === ".docx"
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (content.includes(0)) return "application/octet-stream";

  const extension = extensionOf(metadata.fileName);
  if (extension === ".md") return "text/markdown";
  if (extension === ".csv") return "text/csv";
  if (extension === ".txt") return "text/plain";
  return metadata.detectedMimeType ?? "application/octet-stream";
}

function startsWith(content: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => content[index] === byte);
}

function assertProcessShape(
  metadata: PublicationMetadata,
  content: Uint8Array,
  registeredProcessActionKeys: ReadonlySet<string> | undefined,
) {
  if (metadata.resourceType !== "process_definition") return;
  const stepIds = metadata.processStepIds ?? [];
  if (stepIds.length === 0 || new Set(stepIds).size !== stepIds.length) {
    fail("process_graph_invalid");
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(content));
    if (!isPublicationReadyProcess(parsed)) fail("process_graph_invalid");
    assertAuthorityFieldsAreInert(parsed);
    assertRegisteredProcessActions(metadata.processActionKeys ?? []);
    if (
      (metadata.processActionKeys ?? []).some(
        (key) => !registeredProcessActionKeys?.has(key),
      )
    ) {
      fail("process_action_unknown");
    }
  } catch (error) {
    if (error instanceof PublicationAuthorityError) {
      throw new PublicationValidationError(error.code);
    }
    fail("process_graph_invalid");
  }
}

function isPublicationReadyProcess(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.source_links) &&
    record.source_links.length > 0 &&
    Array.isArray(record.steps) &&
    record.steps.length > 0 &&
    typeof record.success_condition === "string" &&
    record.success_condition.trim().length > 0
  );
}

function extensionOf(fileName: string) {
  const match = /(?:^|\/)([^/]+?)(\.[^.\/]+)$/.exec(fileName.toLowerCase());
  return match?.[2] ?? "";
}

function isSafeRelativePath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[a-z]:/i.test(normalized) &&
    !normalized.includes("\0") &&
    normalized.split("/").every((segment) => segment !== ".." && segment !== "")
  );
}

function sensitivityRank(value: PublicationSensitivity) {
  return { High: 3, Low: 1, Medium: 2 }[value];
}

function fail(code: PublicationFailureCode, status: 400 | 403 | 404 | 409 = 400): never {
  throw new PublicationValidationError(code, status);
}
