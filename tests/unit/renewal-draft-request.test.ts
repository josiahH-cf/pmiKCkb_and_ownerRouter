import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import {
  ExternalExecutionError,
  type ExternalActionInput,
} from "@/lib/external-execution/types";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import { type RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  assertAuthoritativeRenewalRecipient,
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
    channel: "tenant" as const,
    to: "resident@northend-apts.com",
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
      to: "resident@northend-apts.com",
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

  it("maps the owner channel to the owner template with a matching owner recipient", () => {
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      channel: "owner",
      templateRef: "owner-renewal:v1.0",
      recipient: {
        channel: "owner",
        to: "owner@northend-holdings.com",
        sourceRef: "rentvine:lease:42:owner.email",
      },
    });
    expect(action.values.template_ref).toBe("owner-renewal:v1.0");
    expect(action.values.to).toBe("owner@northend-holdings.com");
  });

  it("rejects a channel/template mismatch", () => {
    expect(() =>
      buildRenewalNoticeDraftAction({ ...tenantInput, channel: "owner" }),
    ).toThrow(/owner channel requires template owner-renewal/i);
  });

  it("refuses an owner recipient on a tenant notice (anti-misattribution)", () => {
    expect(() =>
      buildRenewalNoticeDraftAction({
        ...tenantInput,
        recipient: {
          channel: "owner",
          to: "owner@northend-holdings.com",
          sourceRef: "rentvine:lease:42:owner.email",
        },
      }),
    ).toThrow(/owner recipient cannot be used on a tenant/i);
  });
});

describe("assertAuthoritativeRenewalRecipient", () => {
  it("passes an authoritatively-sourced, routable recipient", () => {
    expect(() =>
      assertAuthoritativeRenewalRecipient(buildRenewalNoticeDraftAction(tenantInput)),
    ).not.toThrow();
  });

  it.each([
    "resident@example.com",
    "resident@example.net",
    "resident@example.org",
    "someone@thing.invalid",
    "user@host.test",
    "resident@acme.example",
    "x@localhost",
    "user@host.localhost",
  ])("refuses a non-routable recipient %s", (to) => {
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      recipient: { ...tenantInput.recipient, to },
    });
    expect(() => assertAuthoritativeRenewalRecipient(action)).toThrow(/non-routable/i);
  });

  it.each([
    "smoke:x",
    "sample:x",
    "fixture:x",
    "test:x",
    "dry:x",
    "synthetic:x",
    "browser:x",
    "",
  ])("refuses a non-authoritative recipient source %s", (sourceRef) => {
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      recipient: { ...tenantInput.recipient, sourceRef: sourceRef || "smoke:x" },
    });
    const patched: ExternalActionInput = {
      ...action,
      values: { ...action.values, recipient_source_ref: sourceRef },
    };
    expect(() => assertAuthoritativeRenewalRecipient(patched)).toThrow(
      /authoritative recipient source/i,
    );
  });
});

describe("executeRenewalNoticeDraft", () => {
  it("creates a real unsent draft for an authorized, authoritatively-sourced recipient", async () => {
    const { client, createDraft } = fakeClient();
    const action = buildRenewalNoticeDraftAction(tenantInput);

    const receipt = await executeRenewalNoticeDraft(client, action);

    expect(createDraft).toHaveBeenCalledWith({
      to: "resident@northend-apts.com",
      subject: "Your lease renewal",
      body: `${DRAFT_BANNER}\n\nAn owner-approved renewal offer.`,
    });
    expect(receipt.providerRef).toBe("draft-assembled-1");
    expect(receipt.outcome).toBe("succeeded");
  });

  it("refuses a non-authoritative recipient by default, and never touches Gmail", async () => {
    const { client, createDraft } = fakeClient();
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      recipient: {
        channel: "tenant",
        to: "dry-run@example.invalid",
        sourceRef: "smoke:self-addressed-diagnostic",
      },
    });

    await expect(executeRenewalNoticeDraft(client, action)).rejects.toBeInstanceOf(
      ExternalExecutionError,
    );
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("allows an explicit diagnostic opt-out (self-addressed smoke draft)", async () => {
    const { client, createDraft } = fakeClient();
    const action = buildRenewalNoticeDraftAction({
      ...tenantInput,
      recipient: {
        channel: "tenant",
        to: MAILBOX,
        sourceRef: "smoke:self-addressed-diagnostic",
      },
    });

    await executeRenewalNoticeDraft(client, action, {
      allowNonAuthoritativeRecipient: true,
    });
    expect(createDraft).toHaveBeenCalledTimes(1);
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
