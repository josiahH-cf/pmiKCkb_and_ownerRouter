import { describe, expect, it } from "vitest";

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  TENANT_RENEWAL_NOTICE_ACTION_KEYS,
  TENANT_RENEWAL_NOTICE_STEP_TITLES,
  buildTenantRenewalNoticeProcessTemplate,
} from "@/lib/lease-renewal/tenant-renewal-notice/process-template";

// Tenant Renewal Notice template: a valid Draft whose steps wrap the existing composers and expose
// the complete channel/document subset of S25 without granting workflow-instance execution.

const EXPECTED_TITLES = [
  "Gather facts",
  "Compose tenant offer draft",
  "Compose Dotloop follow-up draft",
  "Exact-confirmed execution",
];

describe("buildTenantRenewalNoticeProcessTemplate", () => {
  const template = buildTenantRenewalNoticeProcessTemplate({
    ownerUid: "owner",
    approverUid: "approver",
  });

  it("builds a schema-valid process-definition input", () => {
    expect(() => CreateProcessDefinitionInputSchema.parse(template)).not.toThrow();
  });

  it("encodes the four-step draft sequence", () => {
    expect(template.steps.map((step) => step.title)).toEqual(EXPECTED_TITLES);
    expect([...TENANT_RENEWAL_NOTICE_STEP_TITLES]).toEqual(EXPECTED_TITLES);
  });

  it("references the complete tenant-channel and Dotloop S25 subset without instance promotion", () => {
    const refs = template.action_references ?? [];
    const keys = refs.map((ref) => ref.action_registry_key);
    expect(TENANT_RENEWAL_NOTICE_ACTION_KEYS).toEqual([
      "gmail.renewal_notice.draft_create",
      "gmail.renewal_notice.send",
      "gmail.thread.reply",
      "gmail.label.apply",
      "rentvine.renewal.portal_message.send",
      "sms.renewal_message.send",
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ]);
    expect(keys).toEqual(TENANT_RENEWAL_NOTICE_ACTION_KEYS);
    for (const ref of refs) {
      expect(ref.readiness).not.toBe("Approved for Execution");
    }
  });

  it("preserves exact human authority without stale manual-only or autonomous-send copy", () => {
    const copy = JSON.stringify(template);
    expect(copy).toContain("exact human confirmation");
    expect(copy).toContain("No autonomous, bulk, scheduled, or model-triggered send");
    expect(copy).not.toMatch(
      /human sends|sent by a human|app never sends|sends them by hand/i,
    );
  });

  it("names the composers it wraps in the step descriptions (surface, not execute)", () => {
    const offerStep = template.steps.find(
      (step) => step.title === "Compose tenant offer draft",
    );
    const dotloopStep = template.steps.find(
      (step) => step.title === "Compose Dotloop follow-up draft",
    );
    expect(offerStep?.description).toContain("buildTenantOfferDraft");
    expect(dotloopStep?.description).toContain("buildDotloopFollowUpDraft");
  });
});
