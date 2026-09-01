import { describe, expect, it } from "vitest";

import {
  AccessRequestPreviewSchema,
  AccessRequestReceiptSchema,
  buildAccessRequestPreview,
  canonicalizeAccessIntent,
  computeAccessIntentIdentity,
  deriveAdditiveAccessPlan,
  normalizeAccessReason,
  type NormalizedAccess,
} from "@/lib/access/contracts";

describe("S83 access intent and additive plan contracts", () => {
  it("freezes the exact non-secret idempotency vector", () => {
    const intent = canonicalizeAccessIntent({
      schema_version: "access-intent-v1",
      intent_kind: "capability",
      catalog_version: "catalog-v1",
      catalog_key: "edit",
      scope: {
        kind: "named_spaces",
        space_ids: ["operations", "lease-renewals"],
      },
    });

    expect(computeAccessIntentIdentity("user-123", intent)).toBe(
      "access-intent-v1:Jd64GN67KBSCO6J0w60XQpWf1-MQ7G8e4eAyqY4dMbA",
    );
  });

  it("normalizes duplicate named Spaces before comparison and hashing", () => {
    expect(
      canonicalizeAccessIntent({
        schema_version: "access-intent-v1",
        intent_kind: "spaces",
        catalog_version: "catalog-v1",
        catalog_key: "named_spaces",
        scope: {
          kind: "named_spaces",
          space_ids: ["maintenance", "renewals", "maintenance"],
        },
      }).scope,
    ).toEqual({ kind: "named_spaces", space_ids: ["maintenance", "renewals"] });
  });

  it("rejects illegal kind/key/scope pairings before hashing", () => {
    expect(() =>
      canonicalizeAccessIntent({
        schema_version: "access-intent-v1",
        intent_kind: "role",
        catalog_version: "catalog-v1",
        catalog_key: "Admin",
        scope: { kind: "all_spaces", space_ids: [] },
      }),
    ).toThrow("Role requests must use global scope");

    expect(() =>
      canonicalizeAccessIntent({
        schema_version: "access-intent-v1",
        intent_kind: "spaces",
        catalog_version: "catalog-v1",
        catalog_key: "all_spaces",
        scope: { kind: "all_spaces", space_ids: ["renewals"] },
      }),
    ).toThrow("All-spaces scope cannot contain Space ids");
  });

  it("normalizes plain-English reasons and rejects unsafe or too-short text", () => {
    expect(normalizeAccessReason("  Need   to approve renewal work.  ")).toBe(
      "Need to approve renewal work.",
    );
    expect(() => normalizeAccessReason("too short")).toThrow("between 10 and 500");
    expect(() =>
      normalizeAccessReason("Please use https://example.test for access"),
    ).toThrow("URLs are not allowed");
    expect(() => normalizeAccessReason("Need this <script>alert(1)</script>")).toThrow(
      "Markup is not allowed",
    );
  });

  it("derives one additive combined role and named-Space plan", () => {
    const baseline: NormalizedAccess = {
      role: "Editor",
      scope: { kind: "named_spaces", space_ids: ["maintenance"] },
    };
    const intent = canonicalizeAccessIntent({
      schema_version: "access-intent-v1",
      intent_kind: "capability",
      catalog_version: "catalog-v1",
      catalog_key: "approve",
      scope: { kind: "named_spaces", space_ids: ["renewals"] },
    });

    expect(deriveAdditiveAccessPlan(baseline, intent)).toEqual({
      baseline_access: baseline,
      target_access: {
        role: "Approver",
        scope: { kind: "named_spaces", space_ids: ["maintenance", "renewals"] },
      },
      added_capability_keys: ["approve", "resolvePlaceholder"],
      added_space_ids: ["renewals"],
      all_spaces_added: false,
    });
  });

  it("makes All spaces explicit and never removes existing access", () => {
    const baseline: NormalizedAccess = {
      role: "Approver",
      scope: { kind: "named_spaces", space_ids: ["renewals"] },
    };
    const intent = canonicalizeAccessIntent({
      schema_version: "access-intent-v1",
      intent_kind: "spaces",
      catalog_version: "catalog-v1",
      catalog_key: "all_spaces",
      scope: { kind: "all_spaces", space_ids: [] },
    });

    expect(deriveAdditiveAccessPlan(baseline, intent)).toMatchObject({
      target_access: { role: "Approver", scope: { kind: "all_spaces", space_ids: [] } },
      added_capability_keys: [],
      added_space_ids: [],
      all_spaces_added: true,
    });
  });

  it("refuses no-op and lower-role self-service plans", () => {
    const baseline: NormalizedAccess = {
      role: "Approver",
      scope: { kind: "all_spaces", space_ids: [] },
    };

    expect(() =>
      deriveAdditiveAccessPlan(
        baseline,
        canonicalizeAccessIntent({
          schema_version: "access-intent-v1",
          intent_kind: "role",
          catalog_version: "catalog-v1",
          catalog_key: "Editor",
          scope: { kind: "global", space_ids: [] },
        }),
      ),
    ).toThrow("does not add access");
  });

  it("strictly binds preview deltas and receipt summaries to their server-authored state", () => {
    const preview = buildAccessRequestPreview({
      requesterUid: "requester-1",
      requesterLabel: "Requesting Editor",
      intent: canonicalizeAccessIntent({
        schema_version: "access-intent-v1",
        intent_kind: "capability",
        catalog_version: "catalog-v1",
        catalog_key: "approve",
        scope: { kind: "named_spaces", space_ids: ["renewals"] },
      }),
      reason: "Approve renewal work assigned to my staff role.",
      baseline: {
        role: "Editor",
        scope: { kind: "named_spaces", space_ids: ["maintenance"] },
      },
    });
    expect(AccessRequestPreviewSchema.safeParse(preview).success).toBe(true);
    expect(
      AccessRequestPreviewSchema.safeParse({
        ...preview,
        added_capability_keys: ["manageAdmin"],
      }).success,
    ).toBe(false);

    const receipt = {
      schema_version: "access-request-receipt-v1",
      request_ref: "request_0001",
      request_version: 1,
      intent_kind: "capability",
      intent_label: "Approve eligible app work",
      state: "pending",
      outcome_summary: "An Admin has not reviewed this request yet.",
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    };
    expect(AccessRequestReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      AccessRequestReceiptSchema.safeParse({
        ...receipt,
        outcome_summary: "Access granted without readback.",
      }).success,
    ).toBe(false);
  });
});
