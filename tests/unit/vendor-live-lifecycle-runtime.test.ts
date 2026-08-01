import fs from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ExecutionTechnicalGates } from "@/lib/execution/risk-policy";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
} from "@/lib/external-execution/identity";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import type { LiveVendorPreparedAttemptSnapshot } from "@/lib/firestore/vendor-lifecycle-executions";
import type { VendorLifecycleProvider } from "@/lib/maintenance/execution/providers";
import {
  hashLiveVendorAssignmentPayload,
  hashLiveVendorContact,
  hashLiveVendorDisablePayload,
  hashLiveVendorInvitePayload,
  liveVendorInviteDerivedRefs,
  liveVendorLifecycleExecutionId,
  liveVendorS20ExecutionId,
  sha256,
  type LiveVendorLifecycleBindings,
  type LiveVendorLifecycleExecutionRecord,
} from "@/lib/vendor/live-lifecycle-contract";
import {
  buildLiveVendorLifecycleServiceDeps,
  resolveLiveVendorLifecycleTechnicalGates,
  type LiveVendorLifecycleSourceReader,
  type LiveVendorRuntimeAssignment,
  type LiveVendorRuntimeDisableCompletionClaim,
  type LiveVendorRuntimeIdentityClaim,
  type LiveVendorRuntimeMailbox,
  type LiveVendorRuntimeTicket,
  type LiveVendorRuntimeVendor,
} from "@/lib/vendor/live-lifecycle-runtime";
import type {
  LiveVendorLifecycleIntent,
  LiveVendorLifecycleSourceSelection,
} from "@/lib/vendor/live-lifecycle-service";

const ACTOR: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-runtime",
};

const READY: ExecutionTechnicalGates = {
  connectionReady: true,
  documentedEvidence: true,
  endpointDocumented: true,
  permissionGranted: true,
  productionAllowed: true,
  requiredValuesPresent: true,
  roleScopeAuthorized: true,
  sourceValidated: true,
};

const COMPANY = "Exact Plumbing LLC";
const EMAIL = "dispatch@exactplumbing.co";
const VENDOR_ID = "vendor-live-101";
const VENDOR_UID = "vendor_live_101";
const PREVIOUS_VENDOR_ID = "vendor-live-previous";
const TICKET_ID = "ticket-101";
const REASON = "Approved Vendor lifecycle correction";
const TICKET_GENERATION = "2026-07-30T10:00:00.000Z";
const VENDOR_GENERATION = "2026-07-30T09:00:00.000Z";
const DISABLE_ACCESS_CUTOFF = "2026-07-30T11:58:00.000Z";
const DISABLE_COMPLETION_LEASE = "2026-07-30T12:02:00.000Z";
const NOW = new Date("2026-07-30T12:00:00.000Z");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Live Vendor lifecycle runtime source projections", () => {
  it("rejects an invite company beyond the delivery bound before source reads", async () => {
    const reader = new FakeSourceReader();

    await expect(
      resolve(reader, {
        actionKey: "vendor.account.invite",
        company: "x".repeat(161),
        email: EMAIL,
        reason: REASON,
        ticketId: TICKET_ID,
      }),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_value_invalid",
    });
    expect(reader.getTicket).not.toHaveBeenCalled();
    expect(reader.getInviteReservation).not.toHaveBeenCalled();
    expect(reader.findVendorsByEmail).not.toHaveBeenCalled();
  });

  it("builds an exact initial invite with only hashed contact identity refs", async () => {
    const reader = new FakeSourceReader();
    reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));

    const selected = await resolve(reader, {
      actionKey: "vendor.account.invite",
      company: COMPANY,
      email: EMAIL,
      reason: REASON,
      ticketId: TICKET_ID,
    });

    expect(selected.action.values).toEqual({
      artifact_ref: "vendor-invite:v1.0",
      invite_mode: "initial",
      invite_version: "0",
      reason: REASON,
      ticket_ref: TICKET_ID,
      ticket_updated_at: TICKET_GENERATION,
      vendor_company: COMPANY,
      vendor_email: EMAIL,
      vendor_ref: "vendor:new",
      vendor_status: "none",
      vendor_uid: "identity:new",
      vendor_updated_at: "generation:new",
    });
    expect(selected.action).toMatchObject({
      actionKey: "vendor.account.invite",
      dataMode: "live",
      workflowId: TICKET_ID,
    });
    expect(selected.dependencyExecutionIds).toBeUndefined();
    expect(selected.variant).toBe("standard");
    const identitySurface = JSON.stringify({
      actionId: selected.action.actionId,
      sourceRefs: selected.action.sourceRefs,
    });
    expect(identitySurface).not.toContain(EMAIL);
    expect(identitySurface).not.toContain(COMPANY);
    expect(identitySurface).toContain(sha256(EMAIL));
    expect(selected.trustedContext.externalReferences.sourceRefs).toEqual(
      selected.action.sourceRefs,
    );
  });

  it("builds assignment and removal from exact current Live joins without an invite dependency", async () => {
    const assignReader = assignedReader({ assigned: false });
    const assign = await resolve(assignReader, {
      actionKey: "vendor.assignment.change",
      assignmentOperation: "assign",
      reason: REASON,
      ticketId: TICKET_ID,
      vendorId: VENDOR_ID,
    });

    expect(assign.action.values).toMatchObject({
      assignment_operation: "assign",
      current_vendor_ref: "vendor:none",
      target_vendor_ref: VENDOR_ID,
      ticket_ref: TICKET_ID,
      ticket_updated_at: TICKET_GENERATION,
      vendor_ref: VENDOR_ID,
      vendor_updated_at: VENDOR_GENERATION,
    });
    expect(assign.dependencyExecutionIds).toBeUndefined();
    expect(assignReader.getVendor).toHaveBeenCalledTimes(1);
    expect(assignReader.getVendor).toHaveBeenCalledWith(VENDOR_ID);

    const removeReader = assignedReader({ assigned: true });
    const remove = await resolve(removeReader, {
      actionKey: "vendor.assignment.change",
      assignmentOperation: "remove",
      reason: REASON,
      ticketId: TICKET_ID,
      vendorId: VENDOR_ID,
    });

    expect(remove.action.values).toMatchObject({
      assignment_operation: "remove",
      current_vendor_ref: VENDOR_ID,
      target_vendor_ref: "vendor:none",
    });
    expect(remove.dependencyExecutionIds).toBeUndefined();
    expect(removeReader.getVendor).toHaveBeenCalledTimes(1);
    expect(removeReader.getVendor).toHaveBeenCalledWith(VENDOR_ID);
  });

  it("loads and fences the currently assigned Vendor before previewing a replacement", async () => {
    const idleReader = replacementReader({ setupEffectInFlight: false });
    await expect(resolve(idleReader, assignmentIntent("assign"))).resolves.toMatchObject({
      action: {
        values: {
          current_vendor_ref: PREVIOUS_VENDOR_ID,
          target_vendor_ref: VENDOR_ID,
        },
      },
    });
    expect(idleReader.getVendor.mock.calls).toEqual([[VENDOR_ID], [PREVIOUS_VENDOR_ID]]);

    const fencedReader = replacementReader({ setupEffectInFlight: true });
    await expect(resolve(fencedReader, assignmentIntent("assign"))).rejects.toMatchObject(
      {
        code: "vendor_lifecycle_setup_effect_in_flight",
        status: 409,
      },
    );
    expect(fencedReader.getVendor.mock.calls).toEqual([
      [VENDOR_ID],
      [PREVIOUS_VENDOR_ID],
    ]);
  });

  it("refuses assignment while setup effects own the Vendor generation before dependent reads", async () => {
    const reader = new FakeSourceReader();
    reader.vendors.set(VENDOR_ID, liveVendor({ setupEffectInFlight: true }));

    await expect(resolve(reader, assignmentIntent("assign"))).rejects.toMatchObject({
      code: "vendor_lifecycle_setup_effect_in_flight",
      status: 409,
    });
    expect(reader.getTicket).not.toHaveBeenCalled();
    expect(reader.getAssignment).not.toHaveBeenCalled();
  });

  it("canonicalizes the exact active assignment set and mailbox state for disable", async () => {
    const reader = new FakeSourceReader();
    reader.vendors.set(VENDOR_ID, liveVendor());
    reader.assignments.set("ticket-b", liveAssignment("ticket-b", VENDOR_ID, true));
    reader.assignments.set("ticket-a", liveAssignment("ticket-a", VENDOR_ID, true));
    reader.assignments.set("ticket-z", liveAssignment("ticket-z", VENDOR_ID, false));
    reader.tickets.set("ticket-a", liveTicket("ticket-a", VENDOR_ID));
    reader.tickets.set("ticket-b", liveTicket("ticket-b", VENDOR_ID));
    reader.mailboxes.set(VENDOR_ID, {
      dataMode: "live",
      status: "connected",
      tokenSecretRef:
        "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest",
      vendorId: VENDOR_ID,
    });

    const selected = await resolve(reader, {
      actionKey: "vendor.account.disable",
      reason: REASON,
      vendorId: VENDOR_ID,
    });

    expect(selected.action.values).toMatchObject({
      access_disabled_at: "cutoff:new",
      active_assignment_refs: '["ticket-a","ticket-b"]',
      completion_generation: "0",
      completion_lease_expires_at: "lease:new",
      completion_owner_execution_ref: "owner:new",
      completion_owner_s20_execution_ref: "owner-s20:new",
      disable_mode: "initial",
      mailbox_state: "connected",
      mailbox_token_ref_hash: sha256(
        "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest",
      ),
      root_execution_ref: "execution:new",
      root_s20_execution_ref: "s20:new",
      vendor_ref: VENDOR_ID,
      vendor_status: "active",
      vendor_updated_at: VENDOR_GENERATION,
    });
    expect(selected.variant).toBe("standard");
  });

  it("keeps disable available as the off switch while setup effects own the Vendor", async () => {
    const reader = new FakeSourceReader();
    reader.vendors.set(VENDOR_ID, liveVendor({ setupEffectInFlight: true }));

    await expect(resolve(reader, disableIntent())).resolves.toMatchObject({
      action: {
        values: {
          vendor_ref: VENDOR_ID,
          vendor_status: "active",
        },
      },
      variant: "standard",
    });
    expect(reader.listAssignmentsForVendor).toHaveBeenCalledWith(VENDOR_ID);
    expect(reader.listTicketsForVendor).toHaveBeenCalledWith(VENDOR_ID);
    expect(reader.getMailbox).toHaveBeenCalledWith(VENDOR_ID);
  });

  it("refuses a disable preview that cannot fit in one Firestore transaction", async () => {
    const reader = new FakeSourceReader();
    reader.vendors.set(VENDOR_ID, liveVendor());
    for (let index = 0; index < 166; index += 1) {
      const ticketId = `ticket-${String(index).padStart(3, "0")}`;
      reader.assignments.set(ticketId, liveAssignment(ticketId, VENDOR_ID, true));
    }

    await expect(
      resolve(reader, {
        actionKey: "vendor.account.disable",
        reason: REASON,
        vendorId: VENDOR_ID,
      }),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_active_assignment_set_too_large",
    });
    expect(reader.getTicket).not.toHaveBeenCalled();
  });

  it("never accepts the no-Vendor sentinel as a real stored Vendor reference", async () => {
    const fakeVendorReader = new FakeSourceReader();
    fakeVendorReader.vendors.set("vendor:none", liveVendor({ id: "vendor:none" }));
    fakeVendorReader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));

    await expect(
      resolve(fakeVendorReader, {
        actionKey: "vendor.assignment.change",
        assignmentOperation: "assign",
        reason: REASON,
        ticketId: TICKET_ID,
        vendorId: "vendor:none",
      }),
    ).rejects.toMatchObject({ code: "vendor_lifecycle_vendor_invalid" });

    const fakeCurrentReader = assignedReader({ assigned: false });
    fakeCurrentReader.tickets.set(TICKET_ID, liveTicket(TICKET_ID, "vendor:none"));
    await expect(
      resolve(fakeCurrentReader, assignmentIntent("assign")),
    ).rejects.toMatchObject({ code: "vendor_lifecycle_ticket_invalid" });
  });

  it.each([
    {
      arrange(reader: FakeSourceReader) {
        reader.tickets.set(TICKET_ID, {
          id: TICKET_ID,
          updatedAt: TICKET_GENERATION,
        });
      },
      expectedCode: "vendor_lifecycle_ticket_invalid",
      intent: {
        actionKey: "vendor.account.invite",
        company: COMPANY,
        email: EMAIL,
        reason: REASON,
        ticketId: TICKET_ID,
      } satisfies LiveVendorLifecycleIntent,
      label: "a missing-mode ticket",
    },
    {
      arrange(reader: FakeSourceReader) {
        reader.vendors.set(VENDOR_ID, { ...liveVendor(), dataMode: "test" });
        reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));
      },
      expectedCode: "vendor_lifecycle_vendor_invalid",
      intent: {
        actionKey: "vendor.assignment.change",
        assignmentOperation: "assign",
        reason: REASON,
        ticketId: TICKET_ID,
        vendorId: VENDOR_ID,
      } satisfies LiveVendorLifecycleIntent,
      label: "a Test Vendor",
    },
    {
      arrange(reader: FakeSourceReader) {
        reader.vendors.set(VENDOR_ID, liveVendor());
        reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID, VENDOR_ID));
        reader.assignments.set(TICKET_ID, {
          active: true,
          ticketId: TICKET_ID,
          vendorId: VENDOR_ID,
        });
      },
      expectedCode: "vendor_lifecycle_assignment_invalid",
      intent: {
        actionKey: "vendor.assignment.change",
        assignmentOperation: "remove",
        reason: REASON,
        ticketId: TICKET_ID,
        vendorId: VENDOR_ID,
      } satisfies LiveVendorLifecycleIntent,
      label: "a legacy assignment",
    },
    {
      arrange(reader: FakeSourceReader) {
        reader.vendors.set(VENDOR_ID, liveVendor());
        reader.mailboxes.set(VENDOR_ID, {
          dataMode: "test",
          status: "connected",
          vendorId: VENDOR_ID,
        });
      },
      expectedCode: "vendor_lifecycle_mailbox_invalid",
      intent: {
        actionKey: "vendor.account.disable",
        reason: REASON,
        vendorId: VENDOR_ID,
      } satisfies LiveVendorLifecycleIntent,
      label: "a Test mailbox",
    },
  ])(
    "refuses $label instead of inferring Live",
    async ({ arrange, expectedCode, intent }) => {
      const reader = new FakeSourceReader();
      arrange(reader);
      await expect(resolve(reader, intent)).rejects.toMatchObject({
        code: expectedCode,
      });
    },
  );
});

describe("Live Vendor disable completion recovery source", () => {
  it("waits for the running completion owner's lease, then derives exact Firebase-only lineage", async () => {
    const { intent, reader, root } = await disableCompletionFixture("running");

    await expect(
      resolve(reader, intent, "prepare", undefined, NOW),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_disable_recovery_not_yet_eligible",
    });

    const selected = await resolve(
      reader,
      intent,
      "prepare",
      undefined,
      new Date(DISABLE_COMPLETION_LEASE),
    );

    expect(selected.variant).toBe("disable_completion_recovery");
    expect(selected.action.values).toEqual({
      access_disabled_at: DISABLE_ACCESS_CUTOFF,
      active_assignment_refs: "[]",
      completion_generation: "0",
      completion_lease_expires_at: DISABLE_COMPLETION_LEASE,
      completion_owner_execution_ref: root.id,
      completion_owner_s20_execution_ref: root.s20ExecutionId,
      disable_mode: "firebase_completion_recovery",
      mailbox_state: "none",
      mailbox_token_ref_hash: "none",
      reason: REASON,
      root_execution_ref: root.id,
      root_s20_execution_ref: root.s20ExecutionId,
      vendor_company: COMPANY,
      vendor_email: EMAIL,
      vendor_ref: VENDOR_ID,
      vendor_status: "disabled",
      vendor_uid: VENDOR_UID,
      vendor_updated_at: DISABLE_ACCESS_CUTOFF,
    });
    expect(selected.action.sourceRefs).toEqual(
      expect.arrayContaining([
        `vendor-disable-root:${root.id}`,
        `vendor-disable-root-s20:${root.s20ExecutionId}`,
        `vendor-disable-access-cutoff:${DISABLE_ACCESS_CUTOFF}`,
        "vendor-disable-completion-generation:0",
        `vendor-disable-completion-owner:${root.id}`,
        `vendor-disable-completion-owner-s20:${root.s20ExecutionId}`,
        `vendor-disable-completion-lease:${DISABLE_COMPLETION_LEASE}`,
      ]),
    );
    expect(
      liveVendorS20ExecutionId(
        "vendor.account.disable",
        externalActionIdempotencyKey(selected.action),
      ),
    ).not.toBe(root.s20ExecutionId);
    expect(reader.listAssignmentsForVendor).not.toHaveBeenCalled();
    expect(reader.listTicketsForVendor).not.toHaveBeenCalled();
    expect(reader.getMailbox).not.toHaveBeenCalled();
  });

  it("allows an ambiguous completion owner to be superseded before its lease expires", async () => {
    const { intent, reader, root } = await disableCompletionFixture("ambiguous");

    const selected = await resolve(reader, intent, "prepare", undefined, NOW);

    expect(selected.variant).toBe("disable_completion_recovery");
    expect(selected.action.values).toMatchObject({
      completion_generation: "0",
      completion_owner_execution_ref: root.id,
      completion_owner_s20_execution_ref: root.s20ExecutionId,
      disable_mode: "firebase_completion_recovery",
      root_execution_ref: root.id,
      root_s20_execution_ref: root.s20ExecutionId,
    });
  });

  it("refuses a completion claim whose owner is absent from its immutable lineage", async () => {
    const { intent, reader } = await disableCompletionFixture("running");
    const claim = reader.disableCompletionClaims.get(VENDOR_ID)!;
    reader.disableCompletionClaims.set(VENDOR_ID, {
      ...claim,
      ownerS20ExecutionId: `exec_${"9".repeat(40)}`,
    });

    await expect(
      resolve(reader, intent, "prepare", undefined, new Date(DISABLE_COMPLETION_LEASE)),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_disable_completion_invalid",
    });
  });
});

describe("Live Vendor invitation reservation and recovery", () => {
  it("refuses an unindexed email or malformed completed reservation before S20", async () => {
    const unindexed = new FakeSourceReader();
    unindexed.tickets.set(TICKET_ID, liveTicket(TICKET_ID));
    unindexed.vendors.set(VENDOR_ID, liveVendor());

    await expect(resolve(unindexed, inviteIntent())).rejects.toMatchObject({
      code: "vendor_lifecycle_email_already_claimed",
    });

    const completed = recoveryReader(
      inviteReservation({ state: "succeeded", phase: "succeeded" }),
    );
    await expect(resolve(completed, inviteIntent())).rejects.toMatchObject({
      code: "vendor_lifecycle_account_reset_required",
    });
  });

  it("derives an exact setup-link reissue only for a successful pending-setup generation", async () => {
    const prior = inviteReservation();
    const completed = {
      ...prior,
      phase: "succeeded" as const,
      receipt: {
        schemaVersion: 1 as const,
        id: sha256(`${prior.id}\u0000receipt`),
        executionId: prior.id,
        actionKey: "vendor.account.invite" as const,
        providerRef: prior.bindings.vendorRef,
        resultHash: "e".repeat(64),
        vendorRef: prior.bindings.vendorRef,
        state: "pending_setup" as const,
        ticketRef: TICKET_ID,
        deliveryRefHash: "f".repeat(64),
        reconciled: false,
        createdAt: "2026-07-30T08:01:00.000Z",
      },
      state: "succeeded" as const,
    };
    const reader = recoveryReader(completed);

    const selected = await resolve(reader, inviteIntent());

    expect(selected.variant).toBe("setup_link_reissue");
    expect(selected.action.values).toMatchObject({
      invite_mode: "setup_link_reissue",
      invite_version: "1",
      vendor_ref: VENDOR_ID,
      vendor_status: "pending_setup",
      vendor_uid: VENDOR_UID,
      vendor_updated_at: VENDOR_GENERATION,
    });
    expect(selected.action.sourceRefs).toEqual(
      expect.arrayContaining([
        `vendor-invite-version:1`,
        `superseded-vendor-execution:${prior.id}`,
      ]),
    );
  });

  it("refuses setup-link reissue while that Vendor generation owns setup effects", async () => {
    const prior = inviteReservation();
    const completed = {
      ...prior,
      phase: "succeeded" as const,
      receipt: {
        schemaVersion: 1 as const,
        id: sha256(`${prior.id}\u0000receipt`),
        executionId: prior.id,
        actionKey: "vendor.account.invite" as const,
        providerRef: prior.bindings.vendorRef,
        resultHash: "e".repeat(64),
        vendorRef: prior.bindings.vendorRef,
        state: "pending_setup" as const,
        ticketRef: TICKET_ID,
        deliveryRefHash: "f".repeat(64),
        reconciled: false,
        createdAt: "2026-07-30T08:01:00.000Z",
      },
      state: "succeeded" as const,
    };
    const reader = recoveryReader(completed);
    reader.vendors.set(
      VENDOR_ID,
      liveVendor({ status: "pending_setup", setupEffectInFlight: true }),
    );

    await expect(resolve(reader, inviteIntent())).rejects.toMatchObject({
      code: "vendor_lifecycle_setup_effect_in_flight",
      status: 409,
    });
  });

  it("derives a stable, server-only corrective re-invite generation", async () => {
    const prior = inviteReservation();
    const reader = recoveryReader(prior);

    const first = await resolve(reader, inviteIntent());
    const second = await resolve(reader, inviteIntent());

    expect(first.variant).toBe("invite_correction");
    expect(first.action.actionId).toBe(second.action.actionId);
    expect(first.action.sourceRefs).toEqual(second.action.sourceRefs);
    expect(first.action.sourceRefs).toEqual(
      expect.arrayContaining([
        `superseded-vendor-execution:${prior.id}`,
        `superseded-s20-execution:${prior.s20ExecutionId}`,
        `vendor-invite-supersession:${sha256(
          `${prior.id}\u0000${prior.s20ExecutionId}`,
        )}`,
      ]),
    );
    expect(
      liveVendorS20ExecutionId(
        "vendor.account.invite",
        externalActionIdempotencyKey(first.action),
      ),
    ).not.toBe(prior.s20ExecutionId);
    expect(JSON.stringify(first.action.values)).not.toContain(prior.id);
  });

  it("refuses a delivery-claimed correction until its 24-hour challenge expires", async () => {
    const claimedAt = "2026-07-30T10:00:00.000Z";
    const reader = recoveryReader(
      inviteReservation({
        deliveryClaimedAt: claimedAt,
        phase: "delivery_claimed",
      }),
    );

    await expect(
      resolve(
        reader,
        inviteIntent(),
        "prepare",
        undefined,
        new Date("2026-07-31T09:59:59.999Z"),
      ),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_invite_recovery_not_yet_eligible",
    });

    const eligible = await resolve(
      reader,
      inviteIntent(),
      "prepare",
      undefined,
      new Date("2026-07-31T10:00:00.000Z"),
    );
    expect(eligible.variant).toBe("invite_correction");

    const correctiveExecutionId = liveVendorS20ExecutionId(
      "vendor.account.invite",
      externalActionIdempotencyKey(eligible.action),
    );
    await expect(
      resolve(
        reader,
        inviteIntent(),
        "execute",
        correctiveExecutionId,
        new Date("2026-07-31T09:59:59.999Z"),
      ),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_invite_recovery_not_yet_eligible",
    });
  });

  it.each(["running", "ambiguous"] as const)(
    "refuses a %s recovery-readback reservation before creating a third correction",
    async (state) => {
      const reader = recoveryReader(
        inviteReservation({ phase: "recovery_readback", state }),
      );

      await expect(resolve(reader, inviteIntent())).rejects.toMatchObject({
        code: "vendor_lifecycle_invite_recovery_in_progress",
      });
    },
  );

  it("reloads the supersession source on execute and refuses reservation drift", async () => {
    const reader = recoveryReader(inviteReservation());
    const prepared = await resolve(reader, inviteIntent());
    const executionId = liveVendorS20ExecutionId(
      "vendor.account.invite",
      externalActionIdempotencyKey(prepared.action),
    );
    const replacementPrior = inviteReservation({
      id: "e".repeat(64),
      s20ExecutionId: `exec_${"f".repeat(40)}`,
    });
    reader.inviteReservations.set(EMAIL, replacementPrior);
    reader.vendors.set(
      VENDOR_ID,
      liveVendor({
        id: replacementPrior.bindings.vendorRef,
        status: "pending_setup",
        uid: replacementPrior.bindings.vendorUid,
      }),
    );

    await expect(
      resolve(reader, inviteIntent(), "execute", executionId),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_s20_execution_mismatch",
    });
  });
});

describe("Live Vendor lifecycle immutable reconciliation", () => {
  it("reconstructs a pre-provider crashed S20 claim after current source generations drift", async () => {
    const reader = new FakeSourceReader();
    reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));
    const intent = inviteIntent();
    const prepared = await resolve(reader, intent);
    const executionId = liveVendorS20ExecutionId(
      "vendor.account.invite",
      externalActionIdempotencyKey(prepared.action),
    );
    reader.preparedAttempts.set(
      executionId,
      preparedAttemptSnapshot(prepared, intent.reason, executionId),
    );

    const reconciled = await resolve(reader, intent, "reconcile", executionId);

    expect(reconciled.action).toEqual(prepared.action);
    expect(reader.getExecutionByS20ExecutionId).toHaveBeenCalledWith(executionId);

    reader.tickets.set(
      TICKET_ID,
      liveTicket(TICKET_ID, undefined, "2026-07-30T13:00:00.000Z"),
    );
    reader.getTicket.mockClear();
    await expect(resolve(reader, intent, "reconcile", executionId)).resolves.toEqual(
      prepared,
    );
    expect(reader.getTicket).not.toHaveBeenCalled();
  });

  it("refuses a missing snapshot or a reconcile reason that does not match its hash", async () => {
    const reader = new FakeSourceReader();
    reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));
    const intent = inviteIntent();
    const prepared = await resolve(reader, intent);
    const executionId = liveVendorS20ExecutionId(
      "vendor.account.invite",
      externalActionIdempotencyKey(prepared.action),
    );

    await expect(resolve(reader, intent, "reconcile", executionId)).rejects.toMatchObject(
      { code: "vendor_lifecycle_prepared_attempt_missing" },
    );
    reader.preparedAttempts.set(
      executionId,
      preparedAttemptSnapshot(prepared, intent.reason, executionId),
    );
    await expect(
      resolve(
        reader,
        { ...intent, reason: "A different exact reason" },
        "reconcile",
        executionId,
      ),
    ).rejects.toMatchObject({ code: "vendor_lifecycle_reconcile_intent_mismatch" });
  });

  it("rebuilds a corrective invitation from its immutable supersession binding", async () => {
    const prior = inviteReservation();
    const reader = recoveryReader(prior);
    const intent = inviteIntent();
    const prepared = await resolve(reader, intent);
    const record = inviteCorrectionRecord(prepared, intent.reason, prior);
    reader.s20Executions.set(record.s20ExecutionId, record);
    reader.inviteReservations.set(EMAIL, record);

    const reconciled = await resolve(reader, intent, "reconcile", record.s20ExecutionId);

    expect(reconciled.action).toEqual(prepared.action);
    expect(reconciled.variant).toBe("invite_correction");
  });

  it("rebuilds the original assignment projection after the current ticket changes", async () => {
    const reader = assignedReader({ assigned: false });
    const intent = assignmentIntent("assign");
    const prepared = await resolve(reader, intent);
    const record = assignmentRecord(prepared, intent.reason);
    reader.s20Executions.set(record.s20ExecutionId, record);

    reader.tickets.set(
      TICKET_ID,
      liveTicket(TICKET_ID, VENDOR_ID, "2026-07-30T13:00:00.000Z"),
    );
    reader.assignments.set(TICKET_ID, liveAssignment(TICKET_ID, VENDOR_ID, true));
    reader.vendors.set(VENDOR_ID, liveVendor({ updatedAt: "2026-07-30T13:00:00.000Z" }));
    reader.getTicket.mockClear();
    reader.getAssignment.mockClear();

    const reconciled = await resolve(reader, intent, "reconcile", record.s20ExecutionId);

    expect(reconciled.action).toEqual(prepared.action);
    expect(reader.getTicket).not.toHaveBeenCalled();
    expect(reader.getAssignment).not.toHaveBeenCalled();
  });

  it("rebuilds the original disable projection after assignments and status mutate", async () => {
    const reader = new FakeSourceReader();
    reader.vendors.set(VENDOR_ID, liveVendor());
    reader.assignments.set(TICKET_ID, liveAssignment(TICKET_ID, VENDOR_ID, true));
    reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID, VENDOR_ID));
    reader.mailboxes.set(VENDOR_ID, {
      dataMode: "live",
      status: "connected",
      tokenSecretRef:
        "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest",
      vendorId: VENDOR_ID,
    });
    const intent: LiveVendorLifecycleIntent = {
      actionKey: "vendor.account.disable",
      reason: REASON,
      vendorId: VENDOR_ID,
    };
    const prepared = await resolve(reader, intent);
    const record = disableRecord(prepared, intent.reason);
    reader.s20Executions.set(record.s20ExecutionId, record);

    reader.vendors.set(
      VENDOR_ID,
      liveVendor({
        status: "disabled",
        updatedAt: "2026-07-30T14:00:00.000Z",
      }),
    );
    reader.assignments.clear();
    reader.mailboxes.set(VENDOR_ID, {
      dataMode: "live",
      status: "revoked",
      tokenSecretRef:
        "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest",
      vendorId: VENDOR_ID,
    });
    reader.listAssignmentsForVendor.mockClear();
    reader.getMailbox.mockClear();

    const reconciled = await resolve(reader, intent, "reconcile", record.s20ExecutionId);

    expect(reconciled.action).toEqual(prepared.action);
    expect(reader.listAssignmentsForVendor).not.toHaveBeenCalled();
    expect(reader.getMailbox).not.toHaveBeenCalled();
  });

  it("refuses a bad S20 index, action intent, reason, or current Vendor binding", async () => {
    const reader = assignedReader({ assigned: false });
    const intent = assignmentIntent("assign");
    const prepared = await resolve(reader, intent);
    const record = assignmentRecord(prepared, intent.reason);

    reader.s20Executions.set(record.s20ExecutionId, {
      ...record,
      s20ExecutionId: `exec_${"9".repeat(40)}`,
    });
    await expect(
      resolve(reader, intent, "reconcile", record.s20ExecutionId),
    ).rejects.toMatchObject({ code: "vendor_lifecycle_s20_index_mismatch" });

    reader.s20Executions.set(record.s20ExecutionId, record);
    await expect(
      resolve(
        reader,
        {
          actionKey: "vendor.account.disable",
          reason: REASON,
          vendorId: VENDOR_ID,
        },
        "reconcile",
        record.s20ExecutionId,
      ),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_reconcile_action_mismatch",
    });

    await expect(
      resolve(
        reader,
        { ...intent, reason: "A different exact reason" },
        "reconcile",
        record.s20ExecutionId,
      ),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_reconcile_identity_mismatch",
    });

    reader.vendors.set(VENDOR_ID, liveVendor({ company: "A different company" }));
    await expect(
      resolve(reader, intent, "reconcile", record.s20ExecutionId),
    ).rejects.toMatchObject({
      code: "vendor_lifecycle_reconcile_vendor_mismatch",
    });
  });
});

describe("Live Vendor lifecycle runtime assembly", () => {
  it("constructs no provider for source resolution or validation and only constructs inside execute", async () => {
    const reader = new FakeSourceReader();
    reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));
    let providerConstructions = 0;
    const provider = fakeProvider();
    const deps = buildLiveVendorLifecycleServiceDeps({
      createProvider: () => {
        providerConstructions += 1;
        return provider;
      },
      createSourceReader: () => reader,
      now: () => NOW,
      resolveTechnicalGates: () => READY,
    });
    const selected = await deps.source.resolve({
      actor: ACTOR,
      intent: inviteIntent(),
      operation: "prepare",
    });
    const executable = withAuthority(selected);

    const validate = deps.resolveValidator("vendor.account.invite", selected);
    expect(validate(executable)).toBeNull();
    const lazy = await deps.resolveLazyExecutor("vendor.account.invite", selected);
    expect(providerConstructions).toBe(0);

    await lazy.execute(executable);

    expect(providerConstructions).toBe(1);
    expect(provider.invite).toHaveBeenCalledTimes(1);
  });

  it("fails Firestore-backed actions closed when no project is configured", () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("GCP_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
    vi.stubEnv("GCLOUD_PROJECT", "");

    expect(
      resolveLiveVendorLifecycleTechnicalGates("vendor.assignment.change"),
    ).toMatchObject({
      connectionReady: false,
      permissionGranted: false,
    });
    expect(
      resolveLiveVendorLifecycleTechnicalGates("vendor.account.disable"),
    ).toMatchObject({
      connectionReady: false,
      permissionGranted: false,
    });
  });

  it("requires a normalized managed sender and exact production DWD service account", () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    vi.stubEnv("FIREBASE_PROJECT_ID", "pmi-kc-kb-prod");
    vi.stubEnv("GCP_PROJECT_ID", "pmi-kc-kb-prod");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "pmi-kc-kb-prod");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "pmi-kc-kb-prod.firebaseapp.com");
    vi.stubEnv("APP_BASE_URL", "https://kb.pmikcmetro.com");
    vi.stubEnv("KB_APPROVAL_SENDER", "bad@@pmikcmetro.com");
    vi.stubEnv("GMAIL_DWD_SA", "vendor-invite@pmi-kc-kb-prod.iam.gserviceaccount.com");

    expect(
      resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
    ).toMatchObject({ connectionReady: false, permissionGranted: false });

    vi.stubEnv("KB_APPROVAL_SENDER", "operations@pmikcmetro.com");
    vi.stubEnv("GMAIL_DWD_SA", "bad@@pmi-kc-kb-prod.iam.gserviceaccount.com");
    expect(
      resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
    ).toMatchObject({ connectionReady: false, permissionGranted: false });

    vi.stubEnv("GMAIL_DWD_SA", "");
    vi.stubEnv(
      "SHEETS_IMPERSONATE_SA",
      "sheets-fallback@pmi-kc-kb-prod.iam.gserviceaccount.com",
    );
    expect(
      resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
    ).toMatchObject({ connectionReady: false, permissionGranted: false });

    vi.stubEnv("GMAIL_DWD_SA", "vendor-invite@pmi-kc-kb-prod.iam.gserviceaccount.com");
    expect(
      resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
    ).toMatchObject({ connectionReady: true, permissionGranted: true });
  });

  it("wires the route to the Live runtime and exposes no browser dependency field", () => {
    const route = fs.readFileSync("app/api/admin/vendors/live/actions/route.ts", "utf8");
    const runtime = fs.readFileSync("lib/vendor/live-lifecycle-runtime.ts", "utf8");

    expect(route).toContain("buildServiceDeps: buildLiveVendorLifecycleServiceDeps");
    expect(route).not.toContain("buildUnwiredLiveVendorLifecycleServiceDeps");
    expect(route).not.toMatch(/dependencyExecutionIds|dependency_execution_ids/);
    expect(runtime).not.toMatch(/@\/lib\/firestore\/(?:maintenance-tickets|vendors)/);
    expect(runtime).toMatch(
      /\.where\("vendor_id", "==", vendorId\)\s*\.where\("active", "==", true\)\s*\.limit\(LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS \+ 1\)/,
    );
    expect(runtime).not.toContain("MAX_VENDOR_ASSIGNMENTS");
  });
});

class FakeSourceReader implements LiveVendorLifecycleSourceReader {
  readonly tickets = new Map<string, LiveVendorRuntimeTicket>();
  readonly vendors = new Map<string, LiveVendorRuntimeVendor>();
  readonly assignments = new Map<string, LiveVendorRuntimeAssignment>();
  readonly mailboxes = new Map<string, LiveVendorRuntimeMailbox>();
  readonly disableCompletionClaims = new Map<
    string,
    LiveVendorRuntimeDisableCompletionClaim
  >();
  readonly identityClaims = new Map<string, LiveVendorRuntimeIdentityClaim>();
  readonly lifecycleExecutions = new Map<string, LiveVendorLifecycleExecutionRecord>();
  readonly preparedAttempts = new Map<string, LiveVendorPreparedAttemptSnapshot>();
  readonly inviteReservations = new Map<string, LiveVendorLifecycleExecutionRecord>();
  readonly s20Executions = new Map<string, LiveVendorLifecycleExecutionRecord>();
  approvalQueueItemIds: readonly string[] = [];

  findApprovalQueueItemIds = vi.fn(async () => this.approvalQueueItemIds);

  findVendorsByEmail = vi.fn(async (email: string) =>
    [...this.vendors.values()].filter(
      (vendor) =>
        typeof vendor.email === "string" &&
        vendor.email.trim().toLowerCase() === email.trim().toLowerCase(),
    ),
  );

  getAssignment = vi.fn(async (ticketId: string) => {
    return this.assignments.get(ticketId) ?? null;
  });

  getExecutionByS20ExecutionId = vi.fn(async (executionId: string) => {
    return this.s20Executions.get(executionId) ?? null;
  });

  getDisableCompletionClaim = vi.fn(async (vendorId: string) => {
    return this.disableCompletionClaims.get(vendorId) ?? null;
  });

  getIdentityClaim = vi.fn(async (emailHash: string) => {
    return this.identityClaims.get(emailHash) ?? null;
  });

  getInviteReservation = vi.fn(async (email: string) => {
    return this.inviteReservations.get(email.trim().toLowerCase()) ?? null;
  });

  getLifecycleExecution = vi.fn(async (executionId: string) => {
    return this.lifecycleExecutions.get(executionId) ?? null;
  });

  getPreparedAttempt = vi.fn(async (executionId: string) => {
    return this.preparedAttempts.get(executionId) ?? null;
  });

  getMailbox = vi.fn(async (vendorId: string) => {
    return this.mailboxes.get(vendorId) ?? null;
  });

  getTicket = vi.fn(async (ticketId: string) => {
    return this.tickets.get(ticketId) ?? null;
  });

  getVendor = vi.fn(async (vendorId: string) => {
    return this.vendors.get(vendorId) ?? null;
  });

  listAssignmentsForVendor = vi.fn(async (vendorId: string) =>
    [...this.assignments.values()].filter(
      (assignment) => assignment.vendorId === vendorId,
    ),
  );

  listTicketsForVendor = vi.fn(async (vendorId: string) =>
    [...this.tickets.values()].filter((ticket) => ticket.vendorId === vendorId),
  );
}

function preparedAttemptSnapshot(
  selection: LiveVendorLifecycleSourceSelection,
  reason: string,
  executionId: string,
): LiveVendorPreparedAttemptSnapshot {
  const values = Object.fromEntries(
    Object.entries(selection.action.values).filter(([name]) => name !== "reason"),
  );
  return {
    schemaVersion: 1,
    s20ExecutionId: executionId,
    actionKey: selection.action
      .actionKey as LiveVendorPreparedAttemptSnapshot["actionKey"],
    actorUid: ACTOR.uid,
    previewHash: hashExecutionPreview({ ...selection.action.values }),
    contextHash: externalActionContextHash(selection.action),
    action: {
      actionId: selection.action.actionId,
      actionKey: selection.action
        .actionKey as LiveVendorPreparedAttemptSnapshot["actionKey"],
      connectionRef: selection.action.connectionRef!,
      contractRef: selection.action.contractRef!,
      dataMode: "live",
      mappingRef: selection.action.mappingRef!,
      sourceRefs: [...selection.action.sourceRefs],
      values,
      workflowId: selection.action.workflowId,
    },
    ...(selection.dependencyExecutionIds
      ? { dependencyExecutionIds: { ...selection.dependencyExecutionIds } }
      : {}),
    trustedContext: selection.trustedContext,
    variant: selection.variant ?? "standard",
    reasonHash: sha256(reason),
    snapshotHash: "f".repeat(64),
    state: "prepared",
    createdAt: NOW.toISOString(),
  };
}

function runtime(reader: FakeSourceReader, now = NOW) {
  return buildLiveVendorLifecycleServiceDeps({
    createProvider: () => fakeProvider(),
    createSourceReader: () => reader,
    now: () => now,
    resolveTechnicalGates: () => READY,
  });
}

async function resolve(
  reader: FakeSourceReader,
  intent: LiveVendorLifecycleIntent,
  operation: "prepare" | "execute" | "reconcile" = "prepare",
  executionId?: string,
  now = NOW,
) {
  return runtime(reader, now).source.resolve({
    actor: ACTOR,
    ...(executionId ? { executionId } : {}),
    intent,
    operation,
  });
}

function liveTicket(
  id: string,
  vendorId?: string,
  updatedAt = TICKET_GENERATION,
): LiveVendorRuntimeTicket {
  return {
    dataMode: "live",
    id,
    updatedAt,
    ...(vendorId ? { vendorId } : {}),
  };
}

function liveVendor(
  overrides: Partial<LiveVendorRuntimeVendor> = {},
): LiveVendorRuntimeVendor {
  return {
    company: COMPANY,
    dataMode: "live",
    email: EMAIL,
    id: VENDOR_ID,
    inviteVersion: 1,
    status: "active",
    uid: VENDOR_UID,
    updatedAt: VENDOR_GENERATION,
    ...overrides,
  };
}

function liveAssignment(
  ticketId: string,
  vendorId: string,
  active: boolean,
): LiveVendorRuntimeAssignment {
  return {
    active,
    dataMode: "live",
    ticketId,
    updatedAt: TICKET_GENERATION,
    vendorId,
  };
}

function assignedReader(input: { assigned: boolean }) {
  const reader = new FakeSourceReader();
  reader.vendors.set(VENDOR_ID, liveVendor());
  reader.tickets.set(
    TICKET_ID,
    liveTicket(TICKET_ID, input.assigned ? VENDOR_ID : undefined),
  );
  if (input.assigned) {
    reader.assignments.set(TICKET_ID, liveAssignment(TICKET_ID, VENDOR_ID, true));
  }
  return reader;
}

function replacementReader(input: { setupEffectInFlight: boolean }) {
  const reader = assignedReader({ assigned: false });
  reader.vendors.set(
    PREVIOUS_VENDOR_ID,
    liveVendor({
      company: "Previous Vendor LLC",
      email: "dispatch@previousvendor.co",
      id: PREVIOUS_VENDOR_ID,
      setupEffectInFlight: input.setupEffectInFlight,
      uid: "vendor_live_previous",
      updatedAt: "2026-07-30T08:00:00.000Z",
    }),
  );
  reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID, PREVIOUS_VENDOR_ID));
  reader.assignments.set(TICKET_ID, liveAssignment(TICKET_ID, PREVIOUS_VENDOR_ID, true));
  return reader;
}

function inviteIntent(): LiveVendorLifecycleIntent {
  return {
    actionKey: "vendor.account.invite",
    company: COMPANY,
    email: EMAIL,
    reason: REASON,
    ticketId: TICKET_ID,
  };
}

function assignmentIntent(
  assignmentOperation: "assign" | "remove",
): LiveVendorLifecycleIntent {
  return {
    actionKey: "vendor.assignment.change",
    assignmentOperation,
    reason: REASON,
    ticketId: TICKET_ID,
    vendorId: VENDOR_ID,
  };
}

function disableIntent(): LiveVendorLifecycleIntent {
  return {
    actionKey: "vendor.account.disable",
    reason: REASON,
    vendorId: VENDOR_ID,
  };
}

async function disableCompletionFixture(ownerState: "running" | "ambiguous") {
  const reader = new FakeSourceReader();
  reader.vendors.set(VENDOR_ID, liveVendor());
  const intent = disableIntent();
  const initial = await resolve(reader, intent);
  const initialRecord = disableRecord(initial, intent.reason);
  const root: LiveVendorLifecycleExecutionRecord = {
    ...initialRecord,
    accessDisabledAt: DISABLE_ACCESS_CUTOFF,
    createdAt: DISABLE_ACCESS_CUTOFF,
    phase: "access_disabled",
    state: ownerState,
    updatedAt: DISABLE_ACCESS_CUTOFF,
  };
  reader.vendors.set(
    VENDOR_ID,
    liveVendor({
      status: "disabled",
      updatedAt: DISABLE_ACCESS_CUTOFF,
    }),
  );
  reader.s20Executions.set(root.s20ExecutionId, root);
  reader.disableCompletionClaims.set(VENDOR_ID, {
    accessDisabledAt: DISABLE_ACCESS_CUTOFF,
    completionGeneration: 0,
    createdAt: DISABLE_ACCESS_CUTOFF,
    dataMode: "live",
    ownerExecutionId: root.id,
    ownerLeaseExpiresAt: DISABLE_COMPLETION_LEASE,
    ownerS20ExecutionId: root.s20ExecutionId,
    rootExecutionId: root.id,
    rootS20ExecutionId: root.s20ExecutionId,
    schemaVersion: 1,
    updatedAt: DISABLE_ACCESS_CUTOFF,
    vendorRef: VENDOR_ID,
    vendorUid: VENDOR_UID,
  });
  reader.listAssignmentsForVendor.mockClear();
  reader.listTicketsForVendor.mockClear();
  reader.getMailbox.mockClear();
  return { intent, reader, root };
}

function inviteReservation(
  overrides: Partial<LiveVendorLifecycleExecutionRecord> = {},
): LiveVendorLifecycleExecutionRecord {
  const id = overrides.id ?? "a".repeat(64);
  const s20ExecutionId = overrides.s20ExecutionId ?? `exec_${"b".repeat(40)}`;
  return {
    schemaVersion: 1,
    actionKey: "vendor.account.invite",
    actorUid: ACTOR.uid,
    attemptCount: 1,
    bindings: {
      artifactRef: "vendor-invite:v1.0",
      companyHash: hashLiveVendorContact(COMPANY),
      emailHash: sha256(EMAIL),
      inviteMode: "initial",
      inviteVersion: 0,
      issuedInviteVersion: 1,
      kind: "invite",
      rfcMessageId: `<vendor-invite-${id}@pmikcmetro.com>`,
      ticketRef: TICKET_ID,
      ticketUpdatedAt: TICKET_GENERATION,
      vendorUpdatedAt: "generation:new",
      vendorRef: VENDOR_ID,
      vendorUid: VENDOR_UID,
    },
    createdAt: "2026-07-30T08:00:00.000Z",
    dataMode: "live",
    environment: "production",
    id,
    idempotencyKeyHash: "c".repeat(64),
    payloadHash: "d".repeat(64),
    phase: "identity_reserved",
    s20ExecutionId,
    state: "running",
    updatedAt: "2026-07-30T08:00:00.000Z",
    ...overrides,
  };
}

function recoveryReader(record: LiveVendorLifecycleExecutionRecord) {
  const reader = new FakeSourceReader();
  reader.tickets.set(TICKET_ID, liveTicket(TICKET_ID));
  reader.vendors.set(
    record.bindings.vendorRef,
    liveVendor({
      id: record.bindings.vendorRef,
      status: "pending_setup",
      uid: record.bindings.vendorUid,
    }),
  );
  reader.inviteReservations.set(EMAIL, record);
  return reader;
}

function recordFor(
  selected: LiveVendorLifecycleSourceSelection,
  bindings: LiveVendorLifecycleBindings,
  payloadHash: string,
): LiveVendorLifecycleExecutionRecord {
  const actionKey = selected.action.actionKey as
    | "vendor.account.invite"
    | "vendor.account.disable"
    | "vendor.assignment.change";
  const idempotencyKey = externalActionIdempotencyKey(selected.action);
  return {
    schemaVersion: 1,
    actionKey,
    actorUid: ACTOR.uid,
    attemptCount: 1,
    bindings,
    createdAt: "2026-07-30T12:01:00.000Z",
    dataMode: "live",
    environment: "production",
    id: liveVendorLifecycleExecutionId(actionKey, idempotencyKey),
    idempotencyKeyHash: sha256(idempotencyKey),
    payloadHash,
    phase: "succeeded",
    s20ExecutionId: liveVendorS20ExecutionId(actionKey, idempotencyKey),
    state: "succeeded",
    updatedAt: "2026-07-30T12:01:00.000Z",
  };
}

function inviteCorrectionRecord(
  selected: LiveVendorLifecycleSourceSelection,
  reason: string,
  prior: LiveVendorLifecycleExecutionRecord,
) {
  const values = selected.action.values;
  const idempotencyKey = externalActionIdempotencyKey(selected.action);
  const derived = liveVendorInviteDerivedRefs(idempotencyKey);
  const bindings: LiveVendorLifecycleBindings = {
    artifactRef: "vendor-invite:v1.0",
    companyHash: hashLiveVendorContact(String(values.vendor_company)),
    emailHash: sha256(String(values.vendor_email)),
    inviteMode: values.invite_mode as "delivery_recovery" | "setup_link_reissue",
    inviteVersion: Number(values.invite_version),
    issuedInviteVersion:
      values.invite_mode === "setup_link_reissue"
        ? Number(values.invite_version) + 1
        : Number(values.invite_version),
    kind: "invite",
    rfcMessageId: derived.rfcMessageId,
    supersededExecutionId: prior.id,
    supersededS20ExecutionId: prior.s20ExecutionId,
    supersessionHash: sha256(`${prior.id}\u0000${prior.s20ExecutionId}`),
    ticketRef: String(values.ticket_ref),
    ticketUpdatedAt: String(values.ticket_updated_at),
    vendorUpdatedAt: String(values.vendor_updated_at),
    vendorRef: prior.bindings.vendorRef,
    vendorUid: prior.bindings.vendorUid,
  };
  return recordFor(
    selected,
    bindings,
    hashLiveVendorInvitePayload({
      actorUid: ACTOR.uid,
      artifactRef: "vendor-invite:v1.0",
      company: String(values.vendor_company),
      email: String(values.vendor_email),
      idempotencyKey,
      inviteMode: values.invite_mode as "delivery_recovery" | "setup_link_reissue",
      inviteVersion: Number(values.invite_version),
      reason,
      ticketRef: String(values.ticket_ref),
      ticketUpdatedAt: String(values.ticket_updated_at),
      vendorRef: String(values.vendor_ref),
      vendorStatus: "pending_setup",
      vendorUid: String(values.vendor_uid),
      vendorUpdatedAt: String(values.vendor_updated_at),
    }),
  );
}

function assignmentRecord(selected: LiveVendorLifecycleSourceSelection, reason: string) {
  const values = selected.action.values;
  const idempotencyKey = externalActionIdempotencyKey(selected.action);
  const bindings: LiveVendorLifecycleBindings = {
    companyHash: hashLiveVendorContact(String(values.vendor_company)),
    currentVendorRef: String(values.current_vendor_ref),
    emailHash: sha256(String(values.vendor_email)),
    kind: "assignment",
    operation: values.assignment_operation as "assign" | "remove",
    targetVendorRef: String(values.target_vendor_ref),
    ticketRef: String(values.ticket_ref),
    ticketUpdatedAt: String(values.ticket_updated_at),
    vendorRef: String(values.vendor_ref),
    vendorUid: String(values.vendor_uid),
    vendorUpdatedAt: String(values.vendor_updated_at),
  };
  return recordFor(
    selected,
    bindings,
    hashLiveVendorAssignmentPayload({
      actorUid: ACTOR.uid,
      company: String(values.vendor_company),
      currentVendorRef: String(values.current_vendor_ref),
      email: String(values.vendor_email),
      idempotencyKey,
      operation: values.assignment_operation as "assign" | "remove",
      reason,
      targetVendorRef: String(values.target_vendor_ref),
      ticketRef: String(values.ticket_ref),
      ticketUpdatedAt: String(values.ticket_updated_at),
      vendorRef: String(values.vendor_ref),
      vendorUid: String(values.vendor_uid),
      vendorUpdatedAt: String(values.vendor_updated_at),
    }),
  );
}

function disableRecord(selected: LiveVendorLifecycleSourceSelection, reason: string) {
  const values = selected.action.values;
  const idempotencyKey = externalActionIdempotencyKey(selected.action);
  const executionId = liveVendorLifecycleExecutionId(
    "vendor.account.disable",
    idempotencyKey,
  );
  const s20ExecutionId = liveVendorS20ExecutionId(
    "vendor.account.disable",
    idempotencyKey,
  );
  const bindings: LiveVendorLifecycleBindings = {
    accessDisabledAt: DISABLE_ACCESS_CUTOFF,
    activeAssignmentRefs: String(values.active_assignment_refs),
    companyHash: hashLiveVendorContact(String(values.vendor_company)),
    completionGeneration: 0,
    completionLeaseExpiresAt: DISABLE_COMPLETION_LEASE,
    completionOwnerExecutionId: executionId,
    completionOwnerS20ExecutionId: s20ExecutionId,
    currentStatus: String(values.vendor_status),
    disableMode: "initial",
    emailHash: sha256(String(values.vendor_email)),
    issuedCompletionGeneration: 0,
    issuedCompletionLeaseExpiresAt: DISABLE_COMPLETION_LEASE,
    kind: "disable",
    mailboxState: String(values.mailbox_state),
    mailboxTokenRefHash: String(values.mailbox_token_ref_hash),
    rootExecutionId: executionId,
    rootS20ExecutionId: s20ExecutionId,
    vendorRef: String(values.vendor_ref),
    vendorUid: String(values.vendor_uid),
    vendorUpdatedAt: String(values.vendor_updated_at),
  };
  return recordFor(
    selected,
    bindings,
    hashLiveVendorDisablePayload({
      accessDisabledAt: String(values.access_disabled_at),
      activeAssignmentRefs: String(values.active_assignment_refs),
      actorUid: ACTOR.uid,
      company: String(values.vendor_company),
      completionGeneration: Number(values.completion_generation),
      completionLeaseExpiresAt: String(values.completion_lease_expires_at),
      completionOwnerExecutionId: String(values.completion_owner_execution_ref),
      completionOwnerS20ExecutionId: String(values.completion_owner_s20_execution_ref),
      currentStatus: String(values.vendor_status),
      disableMode: values.disable_mode as "initial" | "firebase_completion_recovery",
      email: String(values.vendor_email),
      idempotencyKey,
      mailboxState: String(values.mailbox_state),
      mailboxTokenRefHash: String(values.mailbox_token_ref_hash),
      reason,
      rootExecutionId: String(values.root_execution_ref),
      rootS20ExecutionId: String(values.root_s20_execution_ref),
      vendorRef: String(values.vendor_ref),
      vendorUid: String(values.vendor_uid),
      vendorUpdatedAt: String(values.vendor_updated_at),
    }),
  );
}

function withAuthority(
  selected: LiveVendorLifecycleSourceSelection,
): ExternalActionInput {
  return {
    ...selected.action,
    authority: {
      actor: ACTOR,
      roleScopeAuthorized: true,
      technical: READY,
    },
  };
}

function fakeProvider() {
  return {
    changeAssignment: vi.fn(async (input) => ({
      currentVendorRef: input.currentVendorRef,
      operation: input.operation,
      providerRef: "provider-assignment",
      state: input.operation === "assign" ? ("assigned" as const) : ("removed" as const),
      targetVendorRef: input.targetVendorRef,
      ticketRef: input.ticketRef,
      vendorCompany: input.company,
      vendorEmail: input.email,
      vendorRef: input.vendorRef,
    })),
    disable: vi.fn(async (input) => ({
      clearedAssignmentRefs: input.activeAssignmentRefs,
      mailboxState: input.mailboxState,
      providerRef: "provider-disable",
      state: "disabled" as const,
      vendorCompany: input.company,
      vendorEmail: input.email,
      vendorRef: input.vendorRef,
      vendorUid: input.vendorUid,
    })),
    invite: vi.fn(async (input) => ({
      providerRef: "provider-invite",
      state: "pending_setup" as const,
      ticketRef: input.ticketRef,
      vendorCompany: input.company,
      vendorEmail: input.email,
    })),
    reconcile: vi.fn(async () => null),
  } satisfies VendorLifecycleProvider;
}

/**
 * S55 AC-S55-1 / AC-S55-2. The rename hazard is not that something breaks loudly — it is that
 * `CURRENT_PRODUCTION_APP_HOST` pinned one exact host, so renaming the service would have made
 * `APP_BASE_URL` stop matching and failed every Vendor lifecycle action CLOSED. Failing closed looks
 * identical to working until someone tries to invite a vendor.
 */
describe("S55 production app host allowlist spans the rename", () => {
  const OUTGOING_HOSTS = [
    "pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app",
    "pmi-kc-kb-demo-558870356522.us-central1.run.app",
  ];
  const INCOMING_HOSTS = [
    "pmi-kc-app-kq6wuvpiva-uc.a.run.app",
    "pmi-kc-app-558870356522.us-central1.run.app",
  ];

  function stubProductionEnv(appBaseUrl: string) {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    vi.stubEnv("FIREBASE_PROJECT_ID", "pmi-kc-kb-prod");
    vi.stubEnv("GCP_PROJECT_ID", "pmi-kc-kb-prod");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "pmi-kc-kb-prod");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "pmi-kc-kb-prod.firebaseapp.com");
    vi.stubEnv("KB_APPROVAL_SENDER", "operations@pmikcmetro.com");
    vi.stubEnv("GMAIL_DWD_SA", "vendor-invite@pmi-kc-kb-prod.iam.gserviceaccount.com");
    vi.stubEnv("APP_BASE_URL", appBaseUrl);
  }

  it("accepts the outgoing and incoming service on both Cloud Run URL forms", () => {
    // Cloud Run serves one service at both a modern <service>-<project-number>.<region> host and a
    // legacy <service>-<hash>-uc host, so a rename moves four exact hosts, not one.
    for (const host of [...OUTGOING_HOSTS, ...INCOMING_HOSTS]) {
      stubProductionEnv(`https://${host}`);

      expect(
        resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
        `expected ${host} to be an authorized production origin`,
      ).toMatchObject({ connectionReady: true, permissionGranted: true });
    }
  });

  it("keeps all three Vendor actions executable on the renamed service", () => {
    stubProductionEnv("https://pmi-kc-app-558870356522.us-central1.run.app");

    for (const actionKey of [
      "vendor.account.invite",
      "vendor.account.disable",
      "vendor.assignment.change",
    ] as const) {
      expect(
        resolveLiveVendorLifecycleTechnicalGates(actionKey),
        `expected ${actionKey} to stay executable after the rename`,
      ).toMatchObject({ connectionReady: true, permissionGranted: true });
    }
  });

  it("still refuses an unrelated run.app host, so widening did not become any-run-app", () => {
    // The whole point of an exact set: every Cloud Run service anywhere resolves under run.app, so a
    // suffix match would let an unrelated service present itself as this application.
    for (const host of [
      "attacker-558870356522.us-central1.run.app",
      "pmi-kc-app-evil.us-central1.run.app",
      "pmi-kc-app-558870356522.us-central1.run.app.example.com",
      "notpmi-kc-app-kq6wuvpiva-uc.a.run.app",
    ]) {
      stubProductionEnv(`https://${host}`);

      expect(
        resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
        `expected ${host} to be refused`,
      ).toMatchObject({ connectionReady: false, permissionGranted: false });
    }
  });

  it("refuses a non-https or decorated URL even on an allowlisted host", () => {
    for (const url of [
      "http://pmi-kc-app-558870356522.us-central1.run.app",
      "https://pmi-kc-app-558870356522.us-central1.run.app:8443",
      "https://user:pw@pmi-kc-app-558870356522.us-central1.run.app",
      "https://pmi-kc-app-558870356522.us-central1.run.app?next=/admin",
    ]) {
      stubProductionEnv(url);

      expect(
        resolveLiveVendorLifecycleTechnicalGates("vendor.account.invite"),
        `expected ${url} to be refused`,
      ).toMatchObject({ connectionReady: false, permissionGranted: false });
    }
  });
});
