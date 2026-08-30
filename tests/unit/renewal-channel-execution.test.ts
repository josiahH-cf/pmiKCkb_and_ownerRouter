import { describe, expect, it } from "vitest";

import {
  createRenewalChannelEvidenceRule,
  currentRenewalChannelEvidenceRule,
  projectRenewalChannelTruth,
  renewalOutreachStatus,
  type RenewalChannelEvent,
} from "@/lib/lease-renewal/execution/channel-status";

function approvedEmailRule() {
  return createRenewalChannelEvidenceRule({
    channel: "email",
    ref: "email-renewal-evidence:v1.0",
    version: "v1.0",
    providerMessageRefPrefix: "gmail:message:",
    providerThreadRefPrefix: "gmail:thread:",
    publication: {
      status: "approved",
      approvedAtIso: "2026-08-30T00:00:00.000Z",
      evidenceRef: "client-approval:unit-email-evidence",
    },
  });
}

describe("S74 renewal channel truth", () => {
  it("keeps every current channel evidence rule immutable and review-only", () => {
    for (const channel of ["email", "portal", "sms"] as const) {
      const rule = currentRenewalChannelEvidenceRule(channel);
      expect(rule).toMatchObject({ channel, publication: { status: "review_only" } });
      expect(Object.isFrozen(rule)).toBe(true);
      expect(Object.isFrozen(rule.publication)).toBe(true);
    }
    expect(currentRenewalChannelEvidenceRule("portal")).not.toHaveProperty(
      "providerMessageRefPrefix",
    );
    expect(currentRenewalChannelEvidenceRule("sms")).not.toHaveProperty(
      "providerMessageRefPrefix",
    );
  });

  it("rejects an approval without exact dated client evidence or a provider shape", () => {
    expect(() =>
      createRenewalChannelEvidenceRule({
        channel: "email",
        ref: "email-renewal-evidence:v1.0",
        version: "v1.0",
        providerMessageRefPrefix: "gmail:message:",
        publication: {
          status: "approved",
          approvedAtIso: "not-a-date",
          evidenceRef: "browser:claim" as `client-approval:${string}`,
        },
      }),
    ).toThrow(/dated client approval/i);
  });

  it("never promotes legacy raw receipt strings into delivery evidence", () => {
    expect(
      renewalOutreachStatus({
        email: "gmail-message-1",
        portal: "portal-1",
        sms: "sms-1",
      }),
    ).toMatchObject({
      complete: false,
      emailVerified: false,
      portalVerified: false,
      smsVerified: false,
      rawReceiptsPresent: true,
    });
  });

  it("does not infer contact from intent, preview, unsent draft, or a human report", () => {
    const events: RenewalChannelEvent[] = [
      event("intent_recorded", "intent-1"),
      {
        ...event("preview_prepared", "preview-1"),
        previewHash: "a".repeat(64),
      },
      {
        ...event("unsent_draft_created", "draft-1"),
        draftId: "gmail-draft-1",
        executionId: `exec_${"b".repeat(40)}`,
      },
      {
        ...event("human_external_action_reported", "human-1"),
        actorRef: "managed-user:editor-1",
      },
    ];
    const result = projectRenewalChannelTruth({
      workflowId: "renewal:lease-1",
      channel: "email",
      events,
    });

    expect(result).toMatchObject({
      phase: "human_action_reported",
      unsentDraftCreated: true,
      humanExternalActionReported: true,
      contactVerified: false,
      replyVerified: false,
      evidenceRuleStatus: "review_only",
    });
    expect(result.claim).toMatch(/provider contact is not verified/i);
  });

  it("refuses provider claims under the current unpublished evidence rule", () => {
    expect(() =>
      projectRenewalChannelTruth({
        workflowId: "renewal:lease-1",
        channel: "email",
        events: [
          {
            ...event("provider_delivery_verified", "gmail:message:delivery-1"),
            providerMessageRef: "gmail:message:delivery-1",
          },
        ],
      }),
    ).toThrow(/client-approved evidence rule/i);
  });

  it("claims contact and reply only from exact evidence under an approved fixture rule", () => {
    const delivery: RenewalChannelEvent = {
      ...event("provider_delivery_verified", "gmail:message:delivery-1"),
      providerMessageRef: "gmail:message:delivery-1",
    };
    const reply: RenewalChannelEvent = {
      ...event("provider_reply_verified", "gmail:message:reply-1"),
      providerMessageRef: "gmail:message:reply-1",
      providerThreadRef: "gmail:thread:thread-1",
    };

    expect(
      projectRenewalChannelTruth({
        workflowId: "renewal:lease-1",
        channel: "email",
        events: [delivery],
        evidenceRule: approvedEmailRule(),
      }),
    ).toMatchObject({
      phase: "contact_verified",
      contactVerified: true,
      evidenceRuleRef: "email-renewal-evidence:v1.0",
      evidenceRuleStatus: "approved",
    });
    expect(
      projectRenewalChannelTruth({
        workflowId: "renewal:lease-1",
        channel: "email",
        events: [reply],
        evidenceRule: approvedEmailRule(),
      }),
    ).toMatchObject({
      phase: "reply_verified",
      contactVerified: true,
      replyVerified: true,
    });
  });

  it("refuses forged provider refs and cross-workflow/channel evidence", () => {
    expect(() =>
      projectRenewalChannelTruth({
        workflowId: "renewal:lease-1",
        channel: "email",
        evidenceRule: approvedEmailRule(),
        events: [
          {
            ...event("provider_delivery_verified", "browser:claim-1"),
            providerMessageRef: "gmail:message:delivery-1",
          },
        ],
      }),
    ).toThrow(/does not match/i);
    expect(() =>
      projectRenewalChannelTruth({
        workflowId: "renewal:lease-1",
        channel: "email",
        evidenceRule: approvedEmailRule(),
        events: [
          {
            ...event("provider_delivery_verified", "gmail:message:delivery-1"),
            channel: "portal",
            providerMessageRef: "gmail:message:delivery-1",
          },
        ],
      }),
    ).toThrow(/cannot cross workflow or channel/i);
  });
});

function event<T extends RenewalChannelEvent["type"]>(type: T, evidenceRef: string) {
  return {
    type,
    workflowId: "renewal:lease-1",
    channel: "email" as const,
    occurredAtIso: "2026-08-30T00:00:00.000Z",
    evidenceRef,
  };
}
