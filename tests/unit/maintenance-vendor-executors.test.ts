import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF,
  VENDOR_TICKET_REPLY_TEMPLATE_REF,
  VendorLifecycleExecutor,
  VendorMailboxExecutor,
  type VendorLifecycleProvider,
  type VendorMailboxExecutionProvider,
} from "@/lib/maintenance/execution/providers";
import { VENDOR_OAUTH_SCOPES } from "@/lib/vendor/model";

const common = {
  workflowId: "ticket-synthetic",
  sourceRefs: ["source:synthetic"],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function lifecycleProvider(): VendorLifecycleProvider {
  return {
    invite: vi.fn().mockResolvedValue({
      providerRef: "vendor-synthetic",
      state: "pending_setup",
      vendorEmail: "vendor-synthetic@example.invalid",
      ticketRef: "ticket-synthetic",
    }),
    disable: vi.fn().mockResolvedValue({
      providerRef: "vendor-synthetic",
      state: "disabled",
      vendorRef: "vendor-synthetic",
      vendorUid: "vendor-uid-synthetic",
    }),
    changeAssignment: vi.fn(async ({ vendorRef, ticketRef, operation }) => ({
      providerRef: "assignment-synthetic",
      state: operation === "assign" ? ("assigned" as const) : ("removed" as const),
      vendorRef,
      ticketRef,
      operation,
    })),
    reconcile: vi.fn(),
  };
}

function mailboxProvider(): VendorMailboxExecutionProvider {
  return {
    connect: vi.fn(async ({ vendorRef, mailbox, oauthScopes }) => ({
      providerRef: "connection-synthetic",
      vendorRef,
      mailbox,
      status: "connected" as const,
      scopes: oauthScopes,
    })),
    revoke: vi.fn(async ({ vendorRef, mailbox }) => ({
      providerRef: "connection-synthetic",
      vendorRef,
      mailbox,
      status: "revoked" as const,
    })),
    health: vi.fn(async ({ vendorRef, mailbox }) => ({
      providerRef: "connection-synthetic",
      vendorRef,
      mailbox,
      status: "connected" as const,
    })),
    readThread: vi.fn(async ({ vendorRef, mailbox, ticketRef, threadRef }) => ({
      providerRef: threadRef,
      vendorRef,
      mailbox,
      ticketRef,
      threadRef,
    })),
    createDraft: vi.fn(
      async ({ vendorRef, mailbox, ticketRef, threadRef, payloadHash }) => ({
        providerRef: "draft-synthetic",
        vendorRef,
        mailbox,
        ticketRef,
        threadRef,
        payloadHash,
      }),
    ),
    sendReply: vi.fn(
      async ({ vendorRef, mailbox, ticketRef, threadRef, payloadHash, messageId }) => ({
        providerRef: "message-synthetic",
        vendorRef,
        mailbox,
        ticketRef,
        threadRef,
        payloadHash,
        messageId,
      }),
    ),
    applyLabel: vi.fn(async ({ vendorRef, mailbox, ticketRef, threadRef, label }) => ({
      providerRef: threadRef,
      vendorRef,
      mailbox,
      ticketRef,
      threadRef,
      label,
    })),
    reconcile: vi.fn(),
  };
}

describe("Maintenance Vendor lifecycle executors", () => {
  it("binds invite, assignment, and disable to separate typed provider operations", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const invite = {
      ...common,
      actionId: "invite-1",
      actionKey: "vendor.account.invite",
      values: {
        vendor_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-synthetic",
        artifact_ref: "vendor-invite:v1.0",
        reason: "Synthetic onboarding acceptance",
      },
    } satisfies ExternalActionInput;
    const assignment = {
      ...common,
      actionId: "assignment-1",
      actionKey: "vendor.assignment.change",
      values: {
        vendor_ref: "vendor-synthetic",
        ticket_ref: "ticket-synthetic",
        assignment_operation: "assign",
        reason: "Synthetic ticket assignment",
      },
    } satisfies ExternalActionInput;
    const disable = {
      ...common,
      actionId: "disable-1",
      actionKey: "vendor.account.disable",
      values: {
        vendor_ref: "vendor-synthetic",
        vendor_uid: "vendor-uid-synthetic",
        reason: "Synthetic lifecycle closeout",
      },
    } satisfies ExternalActionInput;

    await expect(executor.execute(invite)).resolves.toMatchObject({
      providerRef: "vendor-synthetic",
    });
    await expect(executor.execute(assignment)).resolves.toMatchObject({
      providerRef: "assignment-synthetic",
    });
    await expect(executor.execute(disable)).resolves.toMatchObject({
      providerRef: "vendor-synthetic",
    });
    expect(provider.invite).toHaveBeenCalledTimes(1);
    expect(provider.changeAssignment).toHaveBeenCalledTimes(1);
    expect(provider.disable).toHaveBeenCalledTimes(1);
  });

  it("blocks invalid lifecycle input before provider", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const input = {
      ...common,
      actionId: "invite-1",
      actionKey: "vendor.account.invite",
      values: {
        vendor_email: "not-an-email",
        ticket_ref: "ticket-synthetic",
        artifact_ref: "vendor-invite:v1.0",
        reason: "Synthetic invite",
      },
    } satisfies ExternalActionInput;
    expect(executor.validate(input)).toContain("valid Vendor email");
    await expect(executor.execute(input)).rejects.toBeDefined();
    expect(provider.invite).not.toHaveBeenCalled();
  });

  it("binds lifecycle actions to the current ticket and exact provider readback", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const crossTicket = {
      ...common,
      actionId: "invite-cross-ticket",
      actionKey: "vendor.account.invite",
      values: {
        vendor_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-other",
        artifact_ref: "vendor-invite:v1.0",
        reason: "Synthetic cross-ticket invite",
      },
    } satisfies ExternalActionInput;
    await expect(executor.execute(crossTicket)).rejects.toMatchObject({
      code: "blocked",
    });
    expect(provider.invite).not.toHaveBeenCalled();

    provider.invite = vi.fn().mockResolvedValue({
      providerRef: "vendor-other",
      state: "pending_setup",
      vendorEmail: "vendor-other@example.invalid",
      ticketRef: "ticket-synthetic",
    });
    await expect(
      executor.execute({
        ...crossTicket,
        actionId: "invite-readback-drift",
        values: { ...crossTicket.values, ticket_ref: "ticket-synthetic" },
      }),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("uses action-key-inclusive canonical idempotency keys", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const invite = {
      ...common,
      actionId: "shared-action-id",
      actionKey: "vendor.account.invite",
      values: {
        vendor_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-synthetic",
        artifact_ref: "vendor-invite:v1.0",
        reason: "Synthetic onboarding acceptance",
      },
    } satisfies ExternalActionInput;
    const assignment = {
      ...common,
      actionId: "shared-action-id",
      actionKey: "vendor.assignment.change",
      values: {
        vendor_ref: "vendor-synthetic",
        ticket_ref: "ticket-synthetic",
        assignment_operation: "assign",
        reason: "Synthetic ticket assignment",
      },
    } satisfies ExternalActionInput;

    await executor.execute(invite);
    await executor.execute(assignment);

    const inviteKey = vi.mocked(provider.invite).mock.calls[0]![0].idempotencyKey;
    const assignmentKey = vi.mocked(provider.changeAssignment).mock.calls[0]![0]
      .idempotencyKey;
    expect(inviteKey).toMatch(/^[a-f0-9]{64}$/);
    expect(assignmentKey).toMatch(/^[a-f0-9]{64}$/);
    expect(inviteKey).not.toBe(assignmentKey);
  });

  it("marks a matching lifecycle reconciliation receipt", async () => {
    const provider = lifecycleProvider();
    provider.reconcile = vi.fn().mockResolvedValue({
      providerRef: "vendor-synthetic",
      state: "pending_setup",
      vendorEmail: "vendor-synthetic@example.invalid",
      ticketRef: "ticket-synthetic",
    });
    const input = {
      ...common,
      actionId: "invite-reconcile",
      actionKey: "vendor.account.invite",
      values: {
        vendor_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-synthetic",
        artifact_ref: "vendor-invite:v1.0",
        reason: "Synthetic reconciliation",
      },
    } satisfies ExternalActionInput;

    await expect(
      new VendorLifecycleExecutor(provider).reconcile(input),
    ).resolves.toMatchObject({
      providerRef: "vendor-synthetic",
      reconciled: true,
    });
  });
});

describe("Maintenance Vendor mailbox executor", () => {
  it("covers connect, health, assigned-thread read/draft/reply/label, and revoke", async () => {
    const provider = mailboxProvider();
    const executor = new VendorMailboxExecutor(provider);
    const mailbox = "vendor-synthetic@example.invalid";
    const actions: ExternalActionInput[] = [
      {
        ...common,
        actionId: "connect-1",
        actionKey: "vendor.gmail.connect",
        values: {
          vendor_ref: "vendor-synthetic",
          mailbox_email: mailbox,
          oauth_scopes: VENDOR_OAUTH_SCOPES.join(" "),
          redirect_uri: "https://app.example.invalid/api/vendor/oauth/callback",
        },
      },
      {
        ...common,
        actionId: "health-1",
        actionKey: "vendor.gmail.health",
        values: { vendor_ref: "vendor-synthetic", mailbox_email: mailbox },
      },
      {
        ...common,
        actionId: "read-1",
        actionKey: "vendor.gmail.thread.read",
        values: {
          vendor_ref: "vendor-synthetic",
          mailbox_email: mailbox,
          ticket_ref: "ticket-synthetic",
          thread_ref: "thread-synthetic",
        },
      },
      {
        ...common,
        actionId: "draft-1",
        actionKey: "vendor.gmail.draft.create",
        values: {
          vendor_ref: "vendor-synthetic",
          mailbox_email: mailbox,
          ticket_ref: "ticket-synthetic",
          thread_ref: "thread-synthetic",
          recipient: "coordinator@pmikcmetro.com",
          template_ref: VENDOR_TICKET_REPLY_TEMPLATE_REF,
          body: "Synthetic assigned-ticket draft",
        },
      },
      {
        ...common,
        actionId: "reply-1",
        actionKey: "vendor.gmail.thread.reply",
        values: {
          vendor_ref: "vendor-synthetic",
          mailbox_email: mailbox,
          ticket_ref: "ticket-synthetic",
          thread_ref: "thread-synthetic",
          recipient: "coordinator@pmikcmetro.com",
          template_ref: VENDOR_TICKET_REPLY_TEMPLATE_REF,
          body: "Synthetic exact-confirmed reply",
          rfc_message_id: "<vendor-synthetic@pmikc.invalid>",
        },
      },
      {
        ...common,
        actionId: "label-1",
        actionKey: "vendor.gmail.label.apply",
        values: {
          vendor_ref: "vendor-synthetic",
          mailbox_email: mailbox,
          ticket_ref: "ticket-synthetic",
          thread_ref: "thread-synthetic",
          suggested_label: "PMI/Vendor/Waiting",
          rule_ref: VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF,
          reason: "Synthetic waiting state",
        },
      },
      {
        ...common,
        actionId: "revoke-1",
        actionKey: "vendor.gmail.revoke",
        values: {
          vendor_ref: "vendor-synthetic",
          mailbox_email: mailbox,
          reason: "Synthetic mailbox closeout",
        },
      },
    ];

    for (const input of actions) {
      await expect(executor.execute(input)).resolves.toMatchObject({
        actionKey: input.actionKey,
      });
    }
    expect(provider.connect).toHaveBeenCalledTimes(1);
    expect(provider.readThread).toHaveBeenCalledTimes(1);
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
    expect(provider.sendReply).toHaveBeenCalledTimes(1);
    expect(provider.applyLabel).toHaveBeenCalledTimes(1);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ticket_ref: "ticket-other" },
    { thread_ref: "" },
    { suggested_label: "UNAPPROVED" },
    { rule_ref: "vendor-label-rule:v1.0" },
  ])("blocks cross-ticket or ungoverned mailbox input before provider", async (patch) => {
    const provider = mailboxProvider();
    const executor = new VendorMailboxExecutor(provider);
    const input = {
      ...common,
      actionId: "label-1",
      actionKey: "vendor.gmail.label.apply",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-synthetic",
        thread_ref: "thread-synthetic",
        suggested_label: "PMI/Vendor/Waiting",
        rule_ref: VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF,
        reason: "Synthetic waiting state",
        ...patch,
      },
    } satisfies ExternalActionInput;
    expect(executor.validate(input)).toBeTruthy();
    await expect(executor.execute(input)).rejects.toBeDefined();
    expect(provider.applyLabel).not.toHaveBeenCalled();
  });

  it("blocks extra OAuth scope and redirect drift before provider", async () => {
    const provider = mailboxProvider();
    const executor = new VendorMailboxExecutor(provider);
    const connect = {
      ...common,
      actionId: "connect-invalid",
      actionKey: "vendor.gmail.connect",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        oauth_scopes: `${VENDOR_OAUTH_SCOPES.join(" ")} extra.scope`,
        redirect_uri: "javascript:alert(1)",
      },
    } satisfies ExternalActionInput;
    expect(executor.validate(connect)).toContain("four-scope");
    await expect(executor.execute(connect)).rejects.toMatchObject({ code: "blocked" });
    expect(provider.connect).not.toHaveBeenCalled();
  });

  it("requires the exact configured OAuth callback in production", () => {
    const provider = mailboxProvider();
    const syntheticRedirect = "https://app.example.invalid/api/vendor/oauth/callback";
    const expectedRedirect = "https://vendor.pmikcmetro.com/api/vendor/oauth/callback";
    const connect = {
      ...common,
      actionId: "connect-redirect",
      actionKey: "vendor.gmail.connect",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        oauth_scopes: VENDOR_OAUTH_SCOPES.join(" "),
        redirect_uri: syntheticRedirect,
      },
    } satisfies ExternalActionInput;

    expect(new VendorMailboxExecutor(provider).validate(connect)).toBeNull();

    vi.stubEnv("NODE_ENV", "production");
    expect(new VendorMailboxExecutor(provider).validate(connect)).toContain(
      "exactly match",
    );
    const configured = new VendorMailboxExecutor(provider, {
      expectedRedirectUri: expectedRedirect,
    });
    expect(
      configured.validate({
        ...connect,
        values: { ...connect.values, redirect_uri: expectedRedirect },
      }),
    ).toBeNull();
    expect(
      configured.validate({
        ...connect,
        values: { ...connect.values, redirect_uri: `${expectedRedirect}?drift=1` },
      }),
    ).toContain("exactly match");
  });

  it("blocks a non-canonical Vendor reply template before provider", async () => {
    const provider = mailboxProvider();
    const input = {
      ...common,
      actionId: "draft-template-drift",
      actionKey: "vendor.gmail.draft.create",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-synthetic",
        thread_ref: "thread-synthetic",
        recipient: "coordinator@pmikcmetro.com",
        template_ref: "workflow-reply:v1.0",
        body: "Synthetic assigned-ticket draft",
      },
    } satisfies ExternalActionInput;
    const executor = new VendorMailboxExecutor(provider);

    expect(executor.validate(input)).toContain(VENDOR_TICKET_REPLY_TEMPLATE_REF);
    await expect(executor.execute(input)).rejects.toMatchObject({ code: "blocked" });
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("marks a matching mailbox reconciliation receipt", async () => {
    const provider = mailboxProvider();
    provider.reconcile = vi.fn().mockResolvedValue({
      providerRef: "connection-synthetic",
      vendorRef: "vendor-synthetic",
      mailbox: "vendor-synthetic@example.invalid",
      status: "connected",
    });
    const input = {
      ...common,
      actionId: "health-reconcile",
      actionKey: "vendor.gmail.health",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
      },
    } satisfies ExternalActionInput;

    await expect(
      new VendorMailboxExecutor(provider).reconcile(input),
    ).resolves.toMatchObject({
      providerRef: "connection-synthetic",
      reconciled: true,
    });
  });

  it("rejects Vendor identity drift in provider readback", async () => {
    const provider = mailboxProvider();
    provider.readThread = vi.fn(async ({ mailbox, ticketRef, threadRef }) => ({
      providerRef: threadRef,
      vendorRef: "vendor-other",
      mailbox,
      ticketRef,
      threadRef,
    }));
    const input = {
      ...common,
      actionId: "read-drift",
      actionKey: "vendor.gmail.thread.read",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        ticket_ref: "ticket-synthetic",
        thread_ref: "thread-synthetic",
      },
    } satisfies ExternalActionInput;
    await expect(
      new VendorMailboxExecutor(provider).execute(input),
    ).rejects.toMatchObject({
      code: "ambiguous",
    });
  });
});
