import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildAccessRequestPreview,
  computeAccessIntentIdentity,
  computeAccessPreviewHash,
} from "@/lib/access/contracts";
import {
  parseAccessActiveIntentPointer,
  parseAccessApplyPreviewRecord,
  parseAccessPreviewIntentPointer,
  parseAccessPreviewAttemptRecord,
  parseAccessRequestAttemptIndex,
  parseAccessRequestRecord,
} from "@/lib/access/request-records";

const intent = {
  schema_version: "access-intent-v1" as const,
  intent_kind: "capability" as const,
  catalog_version: "catalog-v1" as const,
  catalog_key: "approve",
  scope: { kind: "named_spaces" as const, space_ids: ["renewals"] },
};
const preview = buildAccessRequestPreview({
  requesterUid: "requester-1",
  requesterLabel: "Requesting Editor",
  intent,
  reason: "Approve renewal work assigned to my staff role.",
  baseline: {
    role: "Editor",
    scope: { kind: "named_spaces", space_ids: ["maintenance"] },
  },
});
const attempt = {
  schema_version: "access-request-preview-attempt-v1" as const,
  attempt_id: "11111111-1111-4111-8111-111111111111",
  requester_uid: "requester-1",
  identity: computeAccessIntentIdentity("requester-1", intent),
  preview_hash: computeAccessPreviewHash(preview),
  preview,
  created_at: "2026-09-01T12:00:00.000Z",
  expires_at: "2026-09-01T12:15:00.000Z",
};
const request = {
  schema_version: "access-request-record-v1" as const,
  id: "request_0001",
  version: 1,
  requester_uid: "requester-1",
  requester_label: preview.requester_label,
  intent: preview.intent,
  intent_label_snapshot: "Approve eligible app work",
  baseline_access: preview.baseline_access,
  baseline_fingerprint: hashJson(preview.baseline_access),
  target_access: preview.target_access,
  added_capability_keys: preview.added_capability_keys,
  added_space_ids: preview.added_space_ids,
  all_spaces_added: preview.all_spaces_added,
  reason: preview.reason,
  state: "pending" as const,
  idempotency_identity: attempt.identity,
  creation_attempt_id: attempt.attempt_id,
  created_at: "2026-09-01T12:00:01.000Z",
  updated_at: "2026-09-01T12:00:01.000Z",
};

describe("S83 strict durable access records", () => {
  it("accepts internally consistent exact V1 records", () => {
    expect(parseAccessPreviewAttemptRecord(attempt)).toEqual(attempt);
    expect(parseAccessRequestRecord(request)).toEqual(request);
    expect(
      parseAccessRequestAttemptIndex({
        schema_version: "access-request-attempt-index-v1",
        attempt_id: attempt.attempt_id,
        requester_uid: request.requester_uid,
        identity: request.idempotency_identity,
        preview_hash: attempt.preview_hash,
        resolution_kind: "created",
        request_id: request.id,
        request_version: request.version,
        created_at: request.created_at,
      }),
    ).toMatchObject({ resolution_kind: "created", request_id: "request_0001" });
  });

  it("fails closed on unknown fields, altered hashes, and an inconsistent target bundle", () => {
    expect(() => parseAccessPreviewAttemptRecord({ ...attempt, extra: true })).toThrow();
    expect(() =>
      parseAccessPreviewAttemptRecord({ ...attempt, preview_hash: "f".repeat(64) }),
    ).toThrow();
    expect(() =>
      parseAccessRequestRecord({
        ...request,
        target_access: {
          role: "Admin",
          scope: { kind: "all_spaces", space_ids: [] },
        },
      }),
    ).toThrow();
  });

  it("strictly validates preview and active-intent pointers", () => {
    const previewPointer = {
      requester_uid: request.requester_uid,
      identity: request.idempotency_identity,
      preview_key: "a".repeat(43),
      updated_at: request.updated_at,
    };
    const activePointer = {
      requester_uid: request.requester_uid,
      identity: request.idempotency_identity,
      request_id: request.id,
      updated_at: request.updated_at,
    };

    expect(parseAccessPreviewIntentPointer(previewPointer)).toEqual(previewPointer);
    expect(parseAccessActiveIntentPointer(activePointer)).toEqual(activePointer);
    expect(() =>
      parseAccessPreviewIntentPointer({ ...previewPointer, extra: "unexpected" }),
    ).toThrow();
    expect(() =>
      parseAccessActiveIntentPointer({ ...activePointer, identity: "wrong" }),
    ).toThrow();
  });

  it("validates the complete apply preview and preserved unrelated-claim boundary", () => {
    const applyPreview = {
      schema_version: "access-request-apply-preview-v1" as const,
      request_ref: request.id,
      request_version: request.version,
      catalog_version: "catalog-v1" as const,
      reviewer_uid: "admin-1",
      requester_uid: request.requester_uid,
      current_claim_fingerprint: "a".repeat(64),
      target_access: request.target_access,
      unrelated_claim_fingerprint: "b".repeat(64),
      nonce: "22222222-2222-4222-8222-222222222222",
      expires_at: "2026-09-01T12:10:00.000Z",
    };
    const record = {
      schema_version: "access-request-apply-preview-record-v1" as const,
      preview: applyPreview,
      preview_hash: hashStable(applyPreview),
      preserved_unrelated_claims: { internal_flag: true },
      created_at: "2026-09-01T12:00:00.000Z",
    };

    expect(parseAccessApplyPreviewRecord(record)).toEqual(record);
    expect(() =>
      parseAccessApplyPreviewRecord({
        ...record,
        preserved_unrelated_claims: { role: "Admin" },
      }),
    ).toThrow();
  });
});

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function hashStable(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
