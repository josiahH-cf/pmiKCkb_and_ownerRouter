import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";
import { EXECUTION_ACTION_POLICIES } from "@/lib/execution/risk-policy";
import { buildRenewalNoticeDraftAction } from "@/lib/lease-renewal/execution/renewal-draft-request";
import { buildMaintenanceOwnerNoticeDraftAction } from "@/lib/maintenance/execution/owner-notice-draft-request";
import {
  MAINTENANCE_EXECUTION_ACTIONS,
  MAINTENANCE_EXECUTION_DEFINITION_MAP,
  MAINTENANCE_EXECUTION_ORDER,
} from "@/lib/maintenance/execution/matrix";
import { TEST_RENEWAL_ATTACHMENT_IDENTITY } from "@/tests/helpers/renewal-draft-attachment";

const COPY = {
  templateContentHash: "a".repeat(64),
  envelopeFingerprint: "b".repeat(64),
};

/**
 * The draft pair's preview contracts must accept exactly what their builders emit.
 *
 * Nothing validated this before: the draft executors call `LeaseGmailExecutor.execute` directly,
 * which never consults the Action Registry preview schema. The mismatch was therefore latent and
 * would have surfaced only once these actions ran through the S20 preview check — as a hard block.
 */

function previewSchemaFor(actionKey: string) {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === actionKey);
  const schema = entry?.preview_payload_schema;
  if (!schema) throw new Error(`No preview schema for ${actionKey}.`);
  return schema.map((field) => ({ ...field, required: field.required ?? false }));
}

describe("draft-pair preview schema alignment", () => {
  it("accepts the exact single-tenant renewal draft values", () => {
    const action = buildRenewalNoticeDraftAction({
      workflowId: "renewal-live:lease-1",
      actionId: "renewal-notice-draft:tenant:lease-1",
      channel: "tenant",
      templateRef: "tenant-renewal:v1.0",
      copy: COPY,
      recipient: {
        channel: "tenant",
        to: "resident@residentdomain.test",
        sourceRef: "rentvine:lease:lease-1:tenant:0",
      },
      mailbox: { email: "josiah@pmikcmetro.com", sourceRef: "app:session:user-1" },
      subject: "Your renewal offer",
      body: "Synthetic renewal body.",
      workflowContext: "renewal:lease-1",
      sourceRefs: ["rentvine:lease:lease-1"],
    });

    expect(
      validatePreviewPayload(
        previewSchemaFor("gmail.renewal_notice.draft_create"),
        action.values,
      ),
    ).toEqual({ ok: true, errors: [] });
  });

  it("accepts a co-tenant renewal draft carrying the F-LEASE-6 Cc fields", () => {
    const action = buildRenewalNoticeDraftAction({
      workflowId: "renewal-live:lease-2",
      actionId: "renewal-notice-draft:tenant:lease-2",
      channel: "tenant",
      templateRef: "tenant-renewal:v1.0",
      copy: COPY,
      recipient: {
        channel: "tenant",
        to: "resident-a@residentdomain.test",
        sourceRef: "rentvine:lease:lease-2:tenant:0",
      },
      cc: {
        emails: ["resident-b@residentdomain.test"],
        sourceRefs: ["rentvine:lease:lease-2:tenant:1"],
      },
      mailbox: { email: "josiah@pmikcmetro.com", sourceRef: "app:session:user-1" },
      subject: "Your renewal offer",
      body: "Synthetic renewal body.",
      workflowContext: "renewal:lease-2",
      sourceRefs: ["rentvine:lease:lease-2"],
    });

    expect(action.values.cc).toBe("resident-b@residentdomain.test");
    expect(
      validatePreviewPayload(
        previewSchemaFor("gmail.renewal_notice.draft_create"),
        action.values,
      ),
    ).toEqual({ ok: true, errors: [] });
  });

  it("accepts the exact owner receipt identity while keeping every attachment field optional for tenant text-only drafts", () => {
    const action = buildRenewalNoticeDraftAction({
      workflowId: "renewal-live:lease-owner",
      actionId: "renewal-notice-draft:owner:lease-owner",
      channel: "owner",
      templateRef: "owner-renewal:v1.0",
      copy: COPY,
      recipient: {
        channel: "owner",
        to: "owner@ownerdomain.test",
        sourceRef: "rentvine:lease:lease-owner:owner:0",
      },
      mailbox: { email: "josiah@pmikcmetro.com", sourceRef: "app:session:user-1" },
      subject: "Owner renewal review",
      body: "Synthetic owner body.",
      workflowContext: "renewal:lease-owner",
      sourceRefs: ["rentvine:lease:lease-owner"],
      attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY,
    });

    expect(
      validatePreviewPayload(
        previewSchemaFor("gmail.renewal_notice.draft_create"),
        action.values,
      ),
    ).toEqual({ ok: true, errors: [] });
  });

  it("accepts the exact maintenance owner-notice draft values", () => {
    const action = buildMaintenanceOwnerNoticeDraftAction({
      ticketRef: "ticket-1",
      unitTag: "unit-7",
      recipient: { to: "owner@ownerdomain.test", sourceRef: "rentvine:contact:9" },
      mailbox: { email: "josiah@pmikcmetro.com", sourceRef: "app:session:user-1" },
      subject: "Maintenance update",
      body: `${DRAFT_BANNER}\n\nSynthetic maintenance body.`,
    });

    expect(
      validatePreviewPayload(
        previewSchemaFor("gmail.maintenance_owner_notice.draft_create"),
        action.values,
      ),
    ).toEqual({ ok: true, errors: [] });
  });
});

describe("maintenance owner-notice draft workflow definition", () => {
  const key = "gmail.maintenance_owner_notice.draft_create";

  it("is resolvable in the canonical maintenance matrix", () => {
    // Without this the S20 bridge rejects the action as `action_unknown`, so the draft could never
    // run through the canonical execution contract at all.
    expect(MAINTENANCE_EXECUTION_ACTIONS).toContain(key);
    expect(MAINTENANCE_EXECUTION_ORDER).toContain(key);
    expect(MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)).toBeDefined();
  });

  it("carries no dependency it could never satisfy", () => {
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key);

    expect(definition?.dependsOn).toEqual([]);
    // The paired send depends on rentvine.work_order.create, which is Needs Connection. Inheriting
    // that dependency would make the draft permanently unsatisfiable.
    expect(definition?.dependsOn).not.toContain("rentvine.work_order.create");
    expect(definition?.correction).toBe("Delete the unsent draft.");
  });

  it("declares the risk the server policy assigns, which the S20 bridge cross-checks", () => {
    expect(MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)?.risk).toBe(
      EXECUTION_ACTION_POLICIES[key].defaultRisk,
    );
  });

  it("keeps every pre-existing definition bound to its own action key", () => {
    // The definitions bind by array index, so appending must not rebind any earlier entry.
    for (const [index, actionKey] of MAINTENANCE_EXECUTION_ACTIONS.entries()) {
      expect(MAINTENANCE_EXECUTION_DEFINITION_MAP.get(actionKey)?.key).toBe(actionKey);
      expect(MAINTENANCE_EXECUTION_ACTIONS[index]).toBe(actionKey);
    }
    expect(MAINTENANCE_EXECUTION_DEFINITION_MAP.size).toBe(
      MAINTENANCE_EXECUTION_ACTIONS.length,
    );
  });

  it("leaves the paired direct-send key disabled", () => {
    const send = ACTION_REGISTRY_SEED.find(
      (entry) => entry.key === "gmail.maintenance_owner_notice.send",
    );
    expect(send?.production_allowed).toBe(false);
  });
});
