// Server-issued S98 lease-workspace context. The browser carries only this short-lived, actor-bound
// token; it cannot choose a different lease id in an operating-Sheet proposal. The existing S82
// Secret Manager key is reused with a distinct HMAC domain so no additional runtime secret exists.

import { createHmac, timingSafeEqual } from "node:crypto";

import { readPartyFilterKeyConfig } from "@/lib/lease-renewal/party-filter-key";

export const SHEET_WORKSPACE_CONTEXT_VERSION = "operating-sheet-workspace/v1";
export const SHEET_WORKSPACE_CONTEXT_TTL_MS = 30 * 60 * 1_000;
export const SHEET_REVERSAL_PREVIEW_VERSION = "operating-sheet-reversal-preview/v2";

const TOKEN_PATTERN = /^swc1_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;
const LEASE_ID_PATTERN = /^[1-9]\d*$/;

export class SheetWorkspaceContextError extends Error {
  constructor(public readonly code: "unavailable" | "invalid" | "expired") {
    super(`Operating-Sheet workspace context refused (${code}).`);
    this.name = "SheetWorkspaceContextError";
  }
}

interface ContextPayload {
  v: typeof SHEET_WORKSPACE_CONTEXT_VERSION;
  lease_id: string;
  actor_uid: string;
  expires_at_ms: number;
}

export interface SheetReversalPreviewBinding {
  readonly proposalPreviewHash: string;
  readonly effectHash: string;
  readonly forwardExecutionId: string;
  readonly forwardReceiptHash: string;
  readonly reversalExecutionId: string;
  readonly kind: "delete_appended_row" | "restore_field";
  readonly currentRowNumber?: number;
  readonly expiresAtIso: string;
}

function signature(key: Buffer, encodedPayload: string): Buffer {
  return createHmac("sha256", key)
    .update(`${SHEET_WORKSPACE_CONTEXT_VERSION}:${encodedPayload}`, "utf8")
    .digest();
}

function equalSignature(expected: Buffer, received: string): boolean {
  let actual: Buffer;
  try {
    actual = Buffer.from(received, "base64url");
  } catch {
    return false;
  }
  return actual.byteLength === expected.byteLength && timingSafeEqual(expected, actual);
}

function reversalSignature(key: Buffer, binding: SheetReversalPreviewBinding): Buffer {
  return createHmac("sha256", key)
    .update(
      JSON.stringify({
        v: SHEET_REVERSAL_PREVIEW_VERSION,
        proposal_preview_hash: binding.proposalPreviewHash,
        effect_hash: binding.effectHash,
        forward_execution_id: binding.forwardExecutionId,
        forward_receipt_hash: binding.forwardReceiptHash,
        reversal_execution_id: binding.reversalExecutionId,
        kind: binding.kind,
        current_row_number: binding.currentRowNumber ?? null,
        expires_at_iso: binding.expiresAtIso,
      }),
      "utf8",
    )
    .digest();
}

function equalHexSignature(expected: Buffer, received: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const actual = Buffer.from(received, "hex");
  return actual.byteLength === expected.byteLength && timingSafeEqual(expected, actual);
}

/** Mint one opaque MAC proving that the server issued these exact reversal-preview terms. */
export function mintSheetReversalPreviewHash(
  binding: SheetReversalPreviewBinding,
): string | null {
  const config = readPartyFilterKeyConfig();
  if (config.status !== "ready") return null;
  return reversalSignature(config.activeKey, binding).toString("hex");
}

/** Verify exact preview terms against the active or immediately previous server key. */
export function verifySheetReversalPreviewHash(
  binding: SheetReversalPreviewBinding,
  previewHash: string,
): boolean {
  const config = readPartyFilterKeyConfig();
  if (config.status !== "ready") return false;
  return (
    equalHexSignature(reversalSignature(config.activeKey, binding), previewHash) ||
    (config.previousKey !== null &&
      equalHexSignature(reversalSignature(config.previousKey, binding), previewHash))
  );
}

/** Mint one context for the exact authenticated workspace. Null means the key is unavailable. */
export function mintSheetWorkspaceContext(
  actorUid: string,
  leaseId: string,
  nowMs = Date.now(),
): string | null {
  const config = readPartyFilterKeyConfig();
  if (
    config.status !== "ready" ||
    !actorUid.trim() ||
    !LEASE_ID_PATTERN.test(leaseId) ||
    !Number.isSafeInteger(nowMs)
  ) {
    return null;
  }
  const payload: ContextPayload = {
    v: SHEET_WORKSPACE_CONTEXT_VERSION,
    lease_id: leaseId,
    actor_uid: actorUid,
    expires_at_ms: nowMs + SHEET_WORKSPACE_CONTEXT_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `swc1_${encoded}.${signature(config.activeKey, encoded).toString("base64url")}`;
}

/** Verify signature, actor, shape, and expiry; return only the server-authenticated lease id. */
export function verifySheetWorkspaceContext(
  token: string,
  actorUid: string,
  nowMs = Date.now(),
): { leaseId: string; expiresAtMs: number } {
  const config = readPartyFilterKeyConfig();
  if (config.status !== "ready") throw new SheetWorkspaceContextError("unavailable");
  const match = TOKEN_PATTERN.exec(token);
  if (!match || !actorUid.trim() || !Number.isSafeInteger(nowMs)) {
    throw new SheetWorkspaceContextError("invalid");
  }
  const [, encoded, receivedSignature] = match;
  const signatureValid =
    equalSignature(signature(config.activeKey, encoded), receivedSignature) ||
    (config.previousKey !== null &&
      equalSignature(signature(config.previousKey, encoded), receivedSignature));
  if (!signatureValid) throw new SheetWorkspaceContextError("invalid");

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new SheetWorkspaceContextError("invalid");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).sort().join(",") !==
      ["actor_uid", "expires_at_ms", "lease_id", "v"].sort().join(",")
  ) {
    throw new SheetWorkspaceContextError("invalid");
  }
  const parsed = payload as Partial<ContextPayload>;
  if (
    parsed.v !== SHEET_WORKSPACE_CONTEXT_VERSION ||
    parsed.actor_uid !== actorUid ||
    typeof parsed.lease_id !== "string" ||
    !LEASE_ID_PATTERN.test(parsed.lease_id) ||
    typeof parsed.expires_at_ms !== "number" ||
    !Number.isSafeInteger(parsed.expires_at_ms)
  ) {
    throw new SheetWorkspaceContextError("invalid");
  }
  if (nowMs >= parsed.expires_at_ms) throw new SheetWorkspaceContextError("expired");
  return { leaseId: parsed.lease_id, expiresAtMs: parsed.expires_at_ms };
}
