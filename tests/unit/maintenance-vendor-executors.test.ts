import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF,
  VENDOR_TICKET_REPLY_TEMPLATE_REF,
  VendorLifecycleExecutor,
  VendorMailboxExecutor,
  type VendorLifecycleProvider,
  type VendorMailboxExecutionProvider,
} from "@/lib/maintenance/execution/providers";
import { LIVE_VENDOR_DISABLE_INITIAL_SOURCE } from "@/lib/vendor/live-lifecycle-contract";
import { VENDOR_OAUTH_SCOPES } from "@/lib/vendor/model";

const common = {
  workflowId: "ticket-synthetic",
  // S40 AC-S40-1: an external action must declare its lane; there is no implicit Live default.
  dataMode: "live" as const,
  sourceRefs: ["source:synthetic"],
  authority: {
    actor: { role: "Admin" as const, uid: "admin-synthetic" },
    roleScopeAuthorized: true,
    technical: {
      connectionReady: true,
      documentedEvidence: true,
      endpointDocumented: true,
      permissionGranted: true,
      productionAllowed: true,
      requiredValuesPresent: true,
      roleScopeAuthorized: true,
      sourceValidated: true,
    },
  },
};

const vendorCompany = "Synthetic Vendor Company";
const vendorEmail = "vendor-synthetic@example.invalid";
const vendorRef = "vendor-synthetic";
const vendorUid = "vendor-uid-synthetic";
const vendorUpdatedAt = "2026-07-30T01:00:00.000Z";
const ticketUpdatedAt = "2026-07-30T02:00:00.000Z";

function inviteValues(
  overrides: Record<string, unknown> = {},
): ExternalActionInput["values"] {
  return {
    artifact_ref: "vendor-invite:v1.0",
    invite_mode: "initial",
    invite_version: "0",
    reason: "Synthetic onboarding acceptance",
    ticket_ref: "ticket-synthetic",
    ticket_updated_at: ticketUpdatedAt,
    vendor_company: vendorCompany,
    vendor_email: vendorEmail,
    vendor_ref: "vendor:new",
    vendor_status: "none",
    vendor_uid: "identity:new",
    vendor_updated_at: "generation:new",
    ...overrides,
  };
}

function initialDisableValues(
  overrides: Record<string, unknown> = {},
): ExternalActionInput["values"] {
  return {
    access_disabled_at: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.accessDisabledAt,
    active_assignment_refs: "ticket-synthetic",
    completion_generation: String(
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionGeneration,
    ),
    completion_lease_expires_at:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionLeaseExpiresAt,
    completion_owner_execution_ref:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerExecutionId,
    completion_owner_s20_execution_ref:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerS20ExecutionId,
    disable_mode: "initial",
    mailbox_state: "none",
    mailbox_token_ref_hash: "none",
    reason: "Synthetic lifecycle closeout",
    root_execution_ref: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootExecutionId,
    root_s20_execution_ref: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootS20ExecutionId,
    vendor_company: vendorCompany,
    vendor_email: vendorEmail,
    vendor_ref: vendorRef,
    vendor_status: "active",
    vendor_uid: vendorUid,
    vendor_updated_at: vendorUpdatedAt,
    ...overrides,
  };
}

function recoveryDisableValues(
  overrides: Record<string, unknown> = {},
): ExternalActionInput["values"] {
  return {
    access_disabled_at: "2026-07-30T03:00:00.000Z",
    active_assignment_refs: "[]",
    completion_generation: "2",
    completion_lease_expires_at: "2026-07-30T03:02:00.000Z",
    completion_owner_execution_ref: "c".repeat(64),
    completion_owner_s20_execution_ref: `exec_${"d".repeat(40)}`,
    disable_mode: "firebase_completion_recovery",
    mailbox_state: "revocation_pending",
    mailbox_token_ref_hash: "e".repeat(64),
    reason: "Complete the reviewed Firebase access cutoff",
    root_execution_ref: "a".repeat(64),
    root_s20_execution_ref: `exec_${"b".repeat(40)}`,
    vendor_company: vendorCompany,
    vendor_email: vendorEmail,
    vendor_ref: vendorRef,
    vendor_status: "disabled",
    vendor_uid: vendorUid,
    vendor_updated_at: vendorUpdatedAt,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function lifecycleProvider(): VendorLifecycleProvider {
  return {
    invite: vi.fn(async ({ company, email, ticketRef }) => ({
      providerRef: "vendor-synthetic",
      state: "pending_setup" as const,
      vendorCompany: company,
      vendorEmail: email,
      ticketRef,
    })),
    disable: vi.fn(
      async ({
        vendorRef: inputVendorRef,
        vendorUid: inputVendorUid,
        company,
        email,
        activeAssignmentRefs,
        mailboxState,
      }) => ({
        providerRef: inputVendorRef,
        state: "disabled" as const,
        vendorRef: inputVendorRef,
        vendorUid: inputVendorUid,
        vendorCompany: company,
        vendorEmail: email,
        clearedAssignmentRefs: activeAssignmentRefs,
        mailboxState,
      }),
    ),
    changeAssignment: vi.fn(
      async ({
        vendorRef: inputVendorRef,
        company,
        email,
        ticketRef,
        currentVendorRef,
        targetVendorRef,
        operation,
      }) => ({
        providerRef: "assignment-synthetic",
        state: operation === "assign" ? ("assigned" as const) : ("removed" as const),
        vendorRef: inputVendorRef,
        vendorCompany: company,
        vendorEmail: email,
        ticketRef,
        currentVendorRef,
        targetVendorRef,
        operation,
      }),
    ),
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
      values: inviteValues(),
    } satisfies ExternalActionInput;
    const assignment = {
      ...common,
      actionId: "assignment-1",
      actionKey: "vendor.assignment.change",
      values: {
        vendor_ref: vendorRef,
        vendor_uid: vendorUid,
        vendor_company: vendorCompany,
        vendor_email: vendorEmail,
        vendor_updated_at: vendorUpdatedAt,
        ticket_ref: "ticket-synthetic",
        ticket_updated_at: ticketUpdatedAt,
        current_vendor_ref: "vendor:none",
        target_vendor_ref: vendorRef,
        assignment_operation: "assign",
        reason: "Synthetic ticket assignment",
      },
    } satisfies ExternalActionInput;
    const disable = {
      ...common,
      actionId: "disable-1",
      actionKey: "vendor.account.disable",
      values: initialDisableValues(),
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
    expect(provider.invite).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteMode: "initial",
        inviteVersion: 0,
        vendorRef: "vendor:new",
        vendorStatus: "none",
        vendorUid: "identity:new",
        vendorUpdatedAt: "generation:new",
      }),
    );
    expect(provider.changeAssignment).toHaveBeenCalledTimes(1);
    expect(provider.disable).toHaveBeenCalledTimes(1);
    expect(provider.disable).toHaveBeenCalledWith(
      expect.objectContaining({
        accessDisabledAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.accessDisabledAt,
        completionGeneration: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionGeneration,
        completionLeaseExpiresAt:
          LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionLeaseExpiresAt,
        completionOwnerExecutionId:
          LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerExecutionId,
        completionOwnerS20ExecutionId:
          LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerS20ExecutionId,
        disableMode: "initial",
        mailboxTokenRefHash: "none",
        rootExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootExecutionId,
        rootS20ExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootS20ExecutionId,
      }),
    );
  });

  it.each(["delivery_recovery", "setup_link_reissue"] as const)(
    "validates and executes the exact %s invite generation",
    async (inviteMode) => {
      const provider = lifecycleProvider();
      const executor = new VendorLifecycleExecutor(provider);
      const input = {
        ...common,
        actionId: `invite-${inviteMode}`,
        actionKey: "vendor.account.invite",
        values: inviteValues({
          invite_mode: inviteMode,
          invite_version: "3",
          reason: `Reviewed ${inviteMode} action`,
          vendor_ref: vendorRef,
          vendor_status: "pending_setup",
          vendor_uid: vendorUid,
          vendor_updated_at: vendorUpdatedAt,
        }),
      } satisfies ExternalActionInput;

      expect(executor.validate(input)).toBeNull();
      await expect(executor.execute(input)).resolves.toMatchObject({
        providerRef: "vendor-synthetic",
      });
      expect(provider.invite).toHaveBeenCalledWith(
        expect.objectContaining({
          inviteMode,
          inviteVersion: 3,
          vendorRef,
          vendorStatus: "pending_setup",
          vendorUid,
          vendorUpdatedAt,
        }),
      );
    },
  );

  it("validates and executes an exact Firebase disable-completion recovery generation", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const input = {
      ...common,
      actionId: "disable-completion-recovery",
      actionKey: "vendor.account.disable",
      values: recoveryDisableValues(),
    } satisfies ExternalActionInput;

    expect(executor.validate(input)).toBeNull();
    await expect(executor.execute(input)).resolves.toMatchObject({
      providerRef: vendorRef,
    });
    expect(provider.disable).toHaveBeenCalledWith(
      expect.objectContaining({
        accessDisabledAt: "2026-07-30T03:00:00.000Z",
        completionGeneration: 2,
        completionLeaseExpiresAt: "2026-07-30T03:02:00.000Z",
        completionOwnerExecutionId: "c".repeat(64),
        completionOwnerS20ExecutionId: `exec_${"d".repeat(40)}`,
        disableMode: "firebase_completion_recovery",
        mailboxTokenRefHash: "e".repeat(64),
        rootExecutionId: "a".repeat(64),
        rootS20ExecutionId: `exec_${"b".repeat(40)}`,
      }),
    );
  });

  it("rejects mixed initial and recovery generations before the provider", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const badInvite = {
      ...common,
      actionId: "invite-mixed-generation",
      actionKey: "vendor.account.invite",
      values: inviteValues({ vendor_ref: vendorRef }),
    } satisfies ExternalActionInput;
    const badDisable = {
      ...common,
      actionId: "disable-mixed-generation",
      actionKey: "vendor.account.disable",
      values: initialDisableValues({ root_execution_ref: "a".repeat(64) }),
    } satisfies ExternalActionInput;

    expect(executor.validate(badInvite)).toBe(
      "Vendor invite generation does not match its mode.",
    );
    expect(executor.validate(badDisable)).toBe(
      "Initial Vendor disable generation is invalid.",
    );
    await expect(executor.execute(badInvite)).rejects.toMatchObject({
      code: "blocked",
    });
    await expect(executor.execute(badDisable)).rejects.toMatchObject({
      code: "blocked",
    });
    expect(provider.invite).not.toHaveBeenCalled();
    expect(provider.disable).not.toHaveBeenCalled();
  });

  it("blocks invalid lifecycle input before provider", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const input = {
      ...common,
      actionId: "invite-1",
      actionKey: "vendor.account.invite",
      values: inviteValues({
        reason: "Synthetic invite",
        vendor_email: "not-an-email",
      }),
    } satisfies ExternalActionInput;
    expect(executor.validate(input)).toContain("valid Vendor email");
    await expect(executor.execute(input)).rejects.toBeDefined();
    expect(provider.invite).not.toHaveBeenCalled();
  });

  it("requires server-verified actor authority before every lifecycle provider call", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const input = {
      ...common,
      authority: undefined,
      actionId: "invite-without-authority",
      actionKey: "vendor.account.invite",
      values: inviteValues({
        reason: "Synthetic invite without trusted authority",
      }),
    } satisfies ExternalActionInput;

    expect(executor.validate(input)).toContain("Server-verified");
    await expect(executor.execute(input)).rejects.toMatchObject({ code: "blocked" });
    await expect(executor.reconcile(input)).rejects.toMatchObject({
      code: "blocked",
    });
    expect(provider.invite).not.toHaveBeenCalled();
    expect(provider.reconcile).not.toHaveBeenCalled();
  });

  it("binds lifecycle actions to the current ticket and exact provider readback", async () => {
    const provider = lifecycleProvider();
    const executor = new VendorLifecycleExecutor(provider);
    const crossTicket = {
      ...common,
      actionId: "invite-cross-ticket",
      actionKey: "vendor.account.invite",
      values: inviteValues({
        reason: "Synthetic cross-ticket invite",
        ticket_ref: "ticket-other",
      }),
    } satisfies ExternalActionInput;
    await expect(executor.execute(crossTicket)).rejects.toMatchObject({
      code: "blocked",
    });
    expect(provider.invite).not.toHaveBeenCalled();

    provider.invite = vi.fn().mockResolvedValue({
      providerRef: "vendor-other",
      state: "pending_setup",
      vendorCompany,
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
      values: inviteValues(),
    } satisfies ExternalActionInput;
    const assignment = {
      ...common,
      actionId: "shared-action-id",
      actionKey: "vendor.assignment.change",
      values: {
        vendor_ref: vendorRef,
        vendor_uid: vendorUid,
        vendor_company: vendorCompany,
        vendor_email: vendorEmail,
        vendor_updated_at: vendorUpdatedAt,
        ticket_ref: "ticket-synthetic",
        ticket_updated_at: ticketUpdatedAt,
        current_vendor_ref: "vendor:none",
        target_vendor_ref: vendorRef,
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
      vendorCompany,
      vendorEmail,
      ticketRef: "ticket-synthetic",
    });
    const input = {
      ...common,
      actionId: "invite-reconcile",
      actionKey: "vendor.account.invite",
      values: inviteValues({ reason: "Synthetic reconciliation" }),
    } satisfies ExternalActionInput;

    await expect(
      new VendorLifecycleExecutor(provider).reconcile(input),
    ).resolves.toMatchObject({
      providerRef: "vendor-synthetic",
      reconciled: true,
    });
  });

  it("closes an exact corrective invite reconciliation as bodyless not-applicable", async () => {
    const supersededExecutionId = "b".repeat(64);
    const supersededS20ExecutionId = `exec_${"c".repeat(40)}`;
    const supersessionHash = createHash("sha256")
      .update(`${supersededExecutionId}\0${supersededS20ExecutionId}`)
      .digest("hex");
    const input = {
      ...common,
      actionId: "invite-corrective-reconcile",
      actionKey: "vendor.account.invite",
      sourceRefs: [
        "source:synthetic",
        `superseded-vendor-execution:${supersededExecutionId}`,
        `superseded-s20-execution:${supersededS20ExecutionId}`,
        `vendor-invite-supersession:${supersessionHash}`,
      ],
      values: inviteValues({
        invite_mode: "delivery_recovery",
        invite_version: "1",
        reason: "Synthetic corrective reconciliation",
        vendor_ref: vendorRef,
        vendor_status: "pending_setup",
        vendor_uid: vendorUid,
        vendor_updated_at: vendorUpdatedAt,
      }),
    } satisfies ExternalActionInput;
    const key = externalActionIdempotencyKey(input);
    const correctiveExecutionId = createHash("sha256")
      .update(`vendor.account.invite\0${key}`)
      .digest("hex");
    const correctiveS20ExecutionId = `exec_${createHash("sha256")
      .update(`external-action:v1\0vendor.account.invite\0${key}`)
      .digest("hex")
      .slice(0, 40)}`;
    const provider = lifecycleProvider();
    const result = (
      reasonCode:
        | "prior_invite_already_delivered"
        | "prior_invite_absent_recovery_activated",
    ) => ({
      providerRef: `vendor-invite-not-applicable:${correctiveExecutionId}`,
      state: "not_applicable" as const,
      outcome: "not_applicable" as const,
      attemptFenced: true as const,
      reasonCode,
      correctiveExecutionId,
      correctiveS20ExecutionId,
      idempotencyKeyHash: createHash("sha256").update(key).digest("hex"),
      supersededExecutionId,
      supersededS20ExecutionId,
      supersessionHash,
    });
    provider.reconcile = vi
      .fn()
      .mockResolvedValue(result("prior_invite_already_delivered"));
    const executor = new VendorLifecycleExecutor(provider);

    const delivered = await executor.reconcile(input);
    expect(delivered).toMatchObject({
      actionKey: "vendor.account.invite",
      providerRef: `vendor-invite-not-applicable:${correctiveExecutionId}`,
      reconciled: true,
      outcome: "not_applicable",
    });
    expect(JSON.stringify(delivered)).not.toContain(vendorEmail);
    expect(JSON.stringify(delivered)).not.toContain(input.values.reason);

    provider.reconcile = vi
      .fn()
      .mockResolvedValue(result("prior_invite_absent_recovery_activated"));
    const absent = await executor.reconcile(input);
    expect(absent).toMatchObject({
      reconciled: true,
      outcome: "not_applicable",
    });
    expect(absent?.resultHash).not.toBe(delivered?.resultHash);

    provider.reconcile = vi.fn().mockResolvedValue({
      ...result("prior_invite_already_delivered"),
      correctiveS20ExecutionId: `exec_${"d".repeat(40)}`,
    });
    await expect(executor.reconcile(input)).resolves.toBeNull();
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

  // S40 AC-S40-1/AC-S40-2: the OAuth callback fence keys off the server-owned environment
  // descriptor. NODE_ENV alone cannot describe the environment once Demo and Production are
  // separately provisioned, and an unreadable environment must not relax the fence.
  it("requires the exact callback whenever the descriptor says Production, regardless of NODE_ENV", () => {
    const provider = mailboxProvider();
    const connect = {
      ...common,
      actionId: "connect-descriptor",
      actionKey: "vendor.gmail.connect",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        oauth_scopes: VENDOR_OAUTH_SCOPES.join(" "),
        redirect_uri: "https://app.example.invalid/api/vendor/oauth/callback",
      },
    } satisfies ExternalActionInput;

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    expect(new VendorMailboxExecutor(provider).validate(connect)).toContain(
      "exactly match",
    );
  });

  it("keeps the callback fence closed when the environment is unreadable", () => {
    const provider = mailboxProvider();
    const connect = {
      ...common,
      actionId: "connect-unreadable",
      actionKey: "vendor.gmail.connect",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        oauth_scopes: VENDOR_OAUTH_SCOPES.join(" "),
        redirect_uri: "https://app.example.invalid/api/vendor/oauth/callback",
      },
    } satisfies ExternalActionInput;

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENVIRONMENT_KIND", "staging");
    vi.stubEnv("DATA_CONTEXT", "live");
    expect(new VendorMailboxExecutor(provider).validate(connect)).toContain(
      "exactly match",
    );
  });

  it("still allows a loopback callback in the Demo environment harness", () => {
    const provider = mailboxProvider();
    const connect = {
      ...common,
      actionId: "connect-demo-loopback",
      actionKey: "vendor.gmail.connect",
      values: {
        vendor_ref: "vendor-synthetic",
        mailbox_email: "vendor-synthetic@example.invalid",
        oauth_scopes: VENDOR_OAUTH_SCOPES.join(" "),
        redirect_uri: "http://localhost:3000/api/vendor/oauth/callback",
      },
    } satisfies ExternalActionInput;

    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "demo");
    expect(new VendorMailboxExecutor(provider).validate(connect)).toBeNull();
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
