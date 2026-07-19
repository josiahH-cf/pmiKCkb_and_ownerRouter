import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import { type RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  buildRenewalNoticeDraftAction,
  executeRenewalNoticeDraft,
  RENEWAL_NOTICE_DRAFT_ACTION_KEY,
} from "@/lib/lease-renewal/execution/renewal-draft-request";

const MAILBOX = "workflow@pmikcmetro.com";

function fakeClient() {
  const createDraft = vi.fn(async () => ({ draftId: "draft-assembled-1" }));
  const client: RenewalDraftGmailClient = { subject: MAILBOX, createDraft };
  return { client, createDraft };
}

const tenantInput = {
  workflowId: "renewal-run-live-1",
  actionId: "draft-1",
  channel: "tenant" as const,
  templateRef: "tenant-renewal:v1.0" as const,
  recipient: {
    to: "resident@example.com",
    sourceRef: "rentvine:lease:42:tenants[0].email",
  },
  mailbox: { email: MAILBOX, sourceRef: "session:mailbox" },
  subject: "Your lease renewal",
  body: "An owner-approved renewal offer.",
  workflowContext: "renewal:lease-42",
  sourceRefs: ["source:live-renewal-run"],
};

describe("buildRenewalNoticeDraftAction", () => {
  it("assembles the exact governed draft action and applies the banner", () => {
    const action = buildRenewalNoticeDraftAction(tenantInput);
    expect(action.actionKey).toBe(RENEWAL_NOTICE_DRAFT_ACTION_KEY);
    expect(action.dataMode).toBe("live");
    expect(action.values).toEqual({
      workflow_context: "renewal:lease-42",
      template_ref: "tenant-renewal:v1.0",
      from: MAILBOX,
      to: "resident@example.com",
      subject: "Your lease renewal",
      body: `${DRAFT_BANNER}\n\nAn owner-approved renewal offer.`,
      recipient_source_ref: "rentvine:lease:42:tenants[0].email",
      mailbox_source_ref: "session:mailbox",
      draft_banner_present: true,
    });
    expect(action.sourceRefs).toEqual(["source:live-renewal-run"]);
  });

  it("does not double-apply the banner when the body already carries it", () => {
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      body: `${DRAFT_BANNER}\n\nAlready bannered.`,
    });
    expect(action.values.body).toBe(`${DRAFT_BANNER}\n\nAlready bannered.`);
  });

  it("maps the owner channel to the owner template", () => {
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      channel: "owner",
      templateRef: "owner-renewal:v1.0",
    });
    expect(action.values.template_ref).toBe("owner-renewal:v1.0");
  });

  it("rejects a channel/template mismatch", () => {
    expect(() =>
      buildRenewalNoticeDraftAction({ ...tenantInput, channel: "owner" }),
    ).toThrow(/owner channel requires template owner-renewal/i);
  });
});

describe("executeRenewalNoticeDraft", () => {
  it("creates a real unsent draft for the authorized draft action", async () => {
    const { client, createDraft } = fakeClient();
    const action = buildRenewalNoticeDraftAction(tenantInput);

    const receipt = await executeRenewalNoticeDraft(client, action);

    expect(createDraft).toHaveBeenCalledWith({
      to: "resident@example.com",
      subject: "Your lease renewal",
      body: `${DRAFT_BANNER}\n\nAn owner-approved renewal offer.`,
    });
    expect(receipt.providerRef).toBe("draft-assembled-1");
    expect(receipt.outcome).toBe("succeeded");
  });

  it("refuses to draft for an action that is not production-allowed (e.g. a .send action)", async () => {
    const { client, createDraft } = fakeClient();
    const sendAction: ExternalActionInput = {
      ...buildRenewalNoticeDraftAction(tenantInput),
      actionKey: "gmail.renewal_notice.send",
    };

    await expect(executeRenewalNoticeDraft(client, sendAction)).rejects.toBeInstanceOf(
      ActionNotExecutableError,
    );
    expect(createDraft).not.toHaveBeenCalled();
  });
});
