import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  FirestoreLiveVendorLifecycleStore,
  LIVE_VENDOR_LIFECYCLE_COLLECTIONS,
} from "@/lib/firestore/vendor-lifecycle-executions";
import { VendorLifecycleExecutor } from "@/lib/maintenance/execution/providers";
import { FirestoreLiveVendorLifecycleSourceReader } from "@/lib/vendor/live-lifecycle-runtime";
import {
  liveVendorLifecycleExecutionId,
  liveVendorLifecycleReceiptId,
  liveVendorS20ExecutionId,
  parseLiveVendorLifecycleReceipt,
  parseOptionalLiveVendorLifecycleReceipt,
  sha256,
  type LiveVendorAssignmentBindings,
  type LiveVendorDisableBindings,
  type LiveVendorInviteBindings,
  type LiveVendorLifecycleExecutionRecord,
  type LiveVendorLifecycleReceipt,
  type LiveVendorLifecycleStore,
} from "@/lib/vendor/live-lifecycle-contract";
import { LiveVendorLifecycleProvider } from "@/lib/vendor/live-lifecycle-provider";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const CREATED_AT = "2026-07-30T12:00:00.000Z";
const TERMINAL_AT = "2026-07-30T12:01:00.000Z";
const VENDOR_REF = "vendor-live-receipt";
const VENDOR_UID = "vendor_live_receipt";
const TICKET_REF = "ticket-live-receipt";
const DELIVERY_REF_HASH = "d".repeat(64);

describe("Live Vendor lifecycle terminal receipt coherence", () => {
  it.each([
    ["pending_setup", inviteRecord("pending_setup")],
    ["delivery_invalidated", inviteRecord("delivery_invalidated")],
    ["assignment", assignmentRecord()],
    ["disable", disableRecord()],
  ] as const)("accepts one exact %s receipt", (_label, record) => {
    expect(parseLiveVendorLifecycleReceipt(record)).toEqual(record.receipt);
    expect(parseOptionalLiveVendorLifecycleReceipt(record)).toEqual(record.receipt);
  });

  it("rejects receipt identity, provider, result, timestamp, and privileged-field drift", () => {
    const exact = inviteRecord("pending_setup");
    const mutations: readonly LiveVendorLifecycleExecutionRecord[] = [
      withReceipt(exact, { id: "0".repeat(64) }),
      withReceipt(exact, { providerRef: "vendor-live-other" }),
      withReceipt(exact, { resultHash: "0".repeat(64) }),
      withReceipt(exact, { createdAt: "2026-07-30 12:01:00Z" }),
      {
        ...exact,
        receipt: {
          ...exact.receipt!,
          actorRole: "Admin",
        } as LiveVendorLifecycleReceipt,
      },
    ];

    for (const mutation of mutations) {
      expect(() => parseLiveVendorLifecycleReceipt(mutation)).toThrow(
        /receipt does not match|timestamp is invalid/i,
      );
    }
  });

  it("rejects source-binding and execution/S20 drift for every terminal state", () => {
    const pending = inviteRecord("pending_setup");
    const invalidated = inviteRecord("delivery_invalidated");
    const assignment = assignmentRecord();
    const disable = disableRecord();
    const mutations: readonly LiveVendorLifecycleExecutionRecord[] = [
      {
        ...pending,
        bindings: {
          ...pending.bindings,
          ticketRef: "ticket-live-privileged-drift",
        } as LiveVendorInviteBindings,
      },
      {
        ...invalidated,
        s20ExecutionId: `exec_${"a".repeat(40)}`,
      },
      {
        ...assignment,
        bindings: {
          ...assignment.bindings,
          currentVendorRef: "vendor-live-privileged-drift",
        } as LiveVendorAssignmentBindings,
      },
      {
        ...disable,
        bindings: {
          ...disable.bindings,
          rootS20ExecutionId: `exec_${"b".repeat(40)}`,
        } as LiveVendorDisableBindings,
      },
    ];

    for (const mutation of mutations) {
      expect(() => parseLiveVendorLifecycleReceipt(mutation)).toThrow(
        /receipt does not match/i,
      );
    }
  });

  it("rejects a terminal marker without one coherent succeeded receipt", () => {
    const terminal = assignmentRecord();
    expect(() =>
      parseOptionalLiveVendorLifecycleReceipt({
        ...terminal,
        receipt: undefined,
      }),
    ).toThrow(/receipt does not match/i);
    expect(
      parseOptionalLiveVendorLifecycleReceipt({
        ...terminal,
        state: "running",
        phase: "identity_reserved",
        receipt: undefined,
      }),
    ).toBeUndefined();
  });

  it("rejects corruption from both persisted Firestore execution readers", async () => {
    const exact = assignmentRecord("firestore-corrupt-assignment");
    const corrupted = withReceipt(exact, { resultHash: "0".repeat(64) });
    const fake = new FakeTransactionalFirestore();
    fake.seed(
      `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions}/${corrupted.id}`,
      corrupted,
    );
    const store = new FirestoreLiveVendorLifecycleStore(fake as unknown as Firestore);
    const reader = new FirestoreLiveVendorLifecycleSourceReader(
      fake as unknown as Firestore,
    );

    await expect(
      store.getExecution("vendor.assignment.change", "firestore-corrupt-assignment"),
    ).rejects.toThrow(/receipt does not match/i);
    await expect(reader.getLifecycleExecution(corrupted.id)).rejects.toThrow(
      /receipt does not match/i,
    );
  });

  it("blocks corrupt persisted success before either S20 execute or reconcile can mint a receipt", async () => {
    const input = assignmentExternalInput();
    const idempotencyKey = externalActionIdempotencyKey(input);
    const corrupted = {
      ...assignmentRecord(idempotencyKey),
      receipt: {
        ...assignmentRecord(idempotencyKey).receipt!,
        delegatedRole: "Admin",
      } as LiveVendorLifecycleReceipt,
    };
    const getVendor = vi.fn();
    const store = {
      persistence: "firestore",
      commitAssignment: async () => corrupted,
      getExecution: async () => corrupted,
      getVendor,
    } as unknown as LiveVendorLifecycleStore;
    const provider = new LiveVendorLifecycleProvider({
      auth: {} as never,
      context: { dataMode: "live", environment: "production" },
      delivery: {} as never,
      store,
    });
    const executor = new VendorLifecycleExecutor(provider);

    await expect(executor.execute(input)).rejects.toThrow(/receipt does not match/i);
    await expect(executor.reconcile(input)).rejects.toThrow(/receipt does not match/i);
    expect(getVendor).not.toHaveBeenCalled();
  });
});

function inviteRecord(
  state: "pending_setup" | "delivery_invalidated",
  idempotencyKey = `receipt-${state}`,
): LiveVendorLifecycleExecutionRecord {
  const id = liveVendorLifecycleExecutionId("vendor.account.invite", idempotencyKey);
  const bindings: LiveVendorInviteBindings = {
    artifactRef: "vendor-invite:v1.0",
    companyHash: sha256("Summit Plumbing"),
    emailHash: sha256("dispatch@summitplumbing.co"),
    inviteMode: "initial",
    inviteVersion: 0,
    issuedInviteVersion: 1,
    kind: "invite",
    rfcMessageId: `<vendor-invite-${id}@pmikcmetro.com>`,
    ticketRef: TICKET_REF,
    ticketUpdatedAt: CREATED_AT,
    vendorRef: VENDOR_REF,
    vendorUid: VENDOR_UID,
    vendorUpdatedAt: "generation:new",
  };
  const record = baseRecord("vendor.account.invite", idempotencyKey, bindings);
  const providerRef =
    state === "pending_setup" ? VENDOR_REF : `vendor-invite-delivery-invalidated:${id}`;
  const resultHash =
    state === "pending_setup"
      ? sha256(
          JSON.stringify({
            actionKey: record.actionKey,
            deliveryRefHash: DELIVERY_REF_HASH,
            inviteMode: bindings.inviteMode,
            inviteVersion: bindings.issuedInviteVersion,
            state,
            ticketRef: bindings.ticketRef,
            vendorRef: bindings.vendorRef,
          }),
        )
      : sha256(
          JSON.stringify({
            actionKey: record.actionKey,
            deliveryRefHash: DELIVERY_REF_HASH,
            executionId: record.id,
            idempotencyKeyHash: record.idempotencyKeyHash,
            reasonCode: "disabled_during_invite_delivery",
            s20ExecutionId: record.s20ExecutionId,
            state,
            ticketRef: bindings.ticketRef,
            vendorRef: bindings.vendorRef,
          }),
        );
  return terminalRecord(
    {
      ...record,
      ...(state === "delivery_invalidated"
        ? {
            invalidatedDeliveryRefHash: DELIVERY_REF_HASH,
            lastErrorCode: "disabled_during_invite_delivery",
          }
        : {}),
    },
    {
      ...baseReceipt(record, providerRef, state, resultHash),
      deliveryRefHash: DELIVERY_REF_HASH,
      ticketRef: TICKET_REF,
    },
  );
}

function assignmentRecord(
  idempotencyKey = "receipt-assignment",
): LiveVendorLifecycleExecutionRecord {
  const bindings: LiveVendorAssignmentBindings = {
    companyHash: sha256("Summit Plumbing"),
    currentVendorRef: "vendor:none",
    emailHash: sha256("dispatch@summitplumbing.co"),
    kind: "assignment",
    operation: "assign",
    targetVendorRef: VENDOR_REF,
    ticketRef: TICKET_REF,
    ticketUpdatedAt: CREATED_AT,
    vendorRef: VENDOR_REF,
    vendorUid: VENDOR_UID,
    vendorUpdatedAt: CREATED_AT,
  };
  const record = baseRecord("vendor.assignment.change", idempotencyKey, bindings);
  const providerRef = `vendor-assignment-${record.id}`;
  const resultHash = sha256(
    JSON.stringify({
      actionKey: record.actionKey,
      currentVendorRef: bindings.currentVendorRef,
      operation: bindings.operation,
      providerRef,
      state: "assigned",
      targetVendorRef: bindings.targetVendorRef,
      ticketRef: bindings.ticketRef,
      vendorRef: bindings.vendorRef,
    }),
  );
  return terminalRecord(record, {
    ...baseReceipt(record, providerRef, "assigned", resultHash),
    currentVendorRef: bindings.currentVendorRef,
    operation: bindings.operation,
    targetVendorRef: bindings.targetVendorRef,
    ticketRef: bindings.ticketRef,
  });
}

function disableRecord(
  idempotencyKey = "receipt-disable",
): LiveVendorLifecycleExecutionRecord {
  const id = liveVendorLifecycleExecutionId("vendor.account.disable", idempotencyKey);
  const s20ExecutionId = liveVendorS20ExecutionId(
    "vendor.account.disable",
    idempotencyKey,
  );
  const bindings: LiveVendorDisableBindings = {
    accessDisabledAt: CREATED_AT,
    activeAssignmentRefs: JSON.stringify([TICKET_REF]),
    companyHash: sha256("Summit Plumbing"),
    completionGeneration: 0,
    completionLeaseExpiresAt: "2026-07-30T12:15:00.000Z",
    completionOwnerExecutionId: id,
    completionOwnerS20ExecutionId: s20ExecutionId,
    currentStatus: "active",
    disableMode: "initial",
    emailHash: sha256("dispatch@summitplumbing.co"),
    issuedCompletionGeneration: 0,
    issuedCompletionLeaseExpiresAt: "2026-07-30T12:15:00.000Z",
    kind: "disable",
    mailboxState: "none",
    mailboxTokenRefHash: "none",
    rootExecutionId: id,
    rootS20ExecutionId: s20ExecutionId,
    vendorRef: VENDOR_REF,
    vendorUid: VENDOR_UID,
    vendorUpdatedAt: CREATED_AT,
  };
  const record = {
    ...baseRecord("vendor.account.disable", idempotencyKey, bindings),
    accessDisabledAt: CREATED_AT,
  };
  const resultHash = sha256(
    JSON.stringify({
      accessDisabledAt: bindings.accessDisabledAt,
      actionKey: record.actionKey,
      clearedAssignmentRefs: bindings.activeAssignmentRefs,
      disableMode: bindings.disableMode,
      mailboxState: bindings.mailboxState,
      mailboxTokenRefHash: bindings.mailboxTokenRefHash,
      rootExecutionId: bindings.rootExecutionId,
      rootS20ExecutionId: bindings.rootS20ExecutionId,
      state: "disabled",
      vendorRef: bindings.vendorRef,
    }),
  );
  return terminalRecord(record, {
    ...baseReceipt(record, VENDOR_REF, "disabled", resultHash),
    clearedAssignmentRefs: bindings.activeAssignmentRefs,
    mailboxState: bindings.mailboxState,
  });
}

function baseRecord(
  actionKey: LiveVendorLifecycleExecutionRecord["actionKey"],
  idempotencyKey: string,
  bindings: LiveVendorLifecycleExecutionRecord["bindings"],
): LiveVendorLifecycleExecutionRecord {
  return {
    actionKey,
    actorUid: "admin-live-receipt",
    attemptCount: 1,
    bindings,
    createdAt: CREATED_AT,
    dataMode: "live",
    environment: "production",
    id: liveVendorLifecycleExecutionId(actionKey, idempotencyKey),
    idempotencyKeyHash: sha256(idempotencyKey),
    payloadHash: "c".repeat(64),
    phase: "succeeded",
    s20ExecutionId: liveVendorS20ExecutionId(actionKey, idempotencyKey),
    schemaVersion: 1,
    state: "succeeded",
    updatedAt: TERMINAL_AT,
  };
}

function baseReceipt(
  record: LiveVendorLifecycleExecutionRecord,
  providerRef: string,
  state: LiveVendorLifecycleReceipt["state"],
  resultHash: string,
): LiveVendorLifecycleReceipt {
  return {
    actionKey: record.actionKey,
    createdAt: TERMINAL_AT,
    executionId: record.id,
    id: liveVendorLifecycleReceiptId(record.id),
    providerRef,
    reconciled: false,
    resultHash,
    schemaVersion: 1,
    state,
    vendorRef: record.bindings.vendorRef,
  };
}

function terminalRecord(
  record: LiveVendorLifecycleExecutionRecord,
  receipt: LiveVendorLifecycleReceipt,
): LiveVendorLifecycleExecutionRecord {
  return { ...record, receipt };
}

function withReceipt(
  record: LiveVendorLifecycleExecutionRecord,
  mutation: Partial<LiveVendorLifecycleReceipt>,
) {
  return {
    ...record,
    receipt: {
      ...record.receipt!,
      ...mutation,
    },
  };
}

function assignmentExternalInput(): ExternalActionInput {
  return {
    actionId: "assign-live-receipt",
    actionKey: "vendor.assignment.change",
    authority: {
      actor: { role: "Admin", uid: "admin-live-receipt" },
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
    dataMode: "live",
    sourceRefs: ["vendor:receipt", `maintenance-ticket:${TICKET_REF}`],
    values: {
      assignment_operation: "assign",
      current_vendor_ref: "vendor:none",
      reason: "Assign the exact Vendor after approval.",
      target_vendor_ref: VENDOR_REF,
      ticket_ref: TICKET_REF,
      ticket_updated_at: CREATED_AT,
      vendor_company: "Summit Plumbing",
      vendor_email: "dispatch@summitplumbing.co",
      vendor_ref: VENDOR_REF,
      vendor_uid: VENDOR_UID,
      vendor_updated_at: CREATED_AT,
    },
    workflowId: TICKET_REF,
  };
}
