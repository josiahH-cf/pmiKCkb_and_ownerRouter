import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
} from "@/lib/external-execution/identity";
import type {
  ExternalActionPreparationInput,
  TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import {
  FirestoreLiveVendorLifecycleStore,
  LIVE_VENDOR_LIFECYCLE_COLLECTIONS,
} from "@/lib/firestore/vendor-lifecycle-executions";
import {
  hashLiveVendorAssignmentPayload,
  liveVendorAssignmentActionValues,
  liveVendorAssignmentProviderRef,
  liveVendorLifecycleExecutionId,
  liveVendorS20ExecutionId,
} from "@/lib/vendor/live-lifecycle-contract";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const PREPARED_AT = "2026-07-30T12:00:00.000Z";
const EFFECT_AT = "2026-07-30T12:01:00.000Z";
const REASON = "Assign this exact approved Vendor.";
const ACTOR: AuthenticatedUser = {
  email: "admin-a@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-a",
};
const RECOVERY_ADMIN: AuthenticatedUser = {
  ...ACTOR,
  email: "admin-b@pmikcmetro.com",
  uid: "admin-b",
};

describe("Live Vendor prepared-attempt fence", () => {
  it("refuses an out-of-band provider start before the one S20 claim", async () => {
    const fixture = await attemptFixture("unclaimed", false);

    await expect(fixture.store.commitAssignment(fixture.commitInput)).rejects.toThrow(
      /provider ledger may start only from the exact claimed S20/i,
    );
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(0);
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
  });

  it("lets provider start win without an extra provider-start write", async () => {
    const fixture = await attemptFixture("provider-wins");

    const providerRecord = await fixture.store.commitAssignment(fixture.commitInput);
    const fence = await fixture.store.fencePreparedAttempt(
      RECOVERY_ADMIN,
      fixture.snapshotInput,
    );

    expect(providerRecord.state).toBe("succeeded");
    expect(fence).toEqual({ status: "provider_started" });
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(1);
    expect(
      fixture.fake.read(`action_executions/${fixture.s20ExecutionId}`),
    ).toMatchObject({ attempt_count: 1, state: "Executing" });
    expect(
      fixture.fake.read(
        `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.preparedAttempts}/${fixture.s20ExecutionId}`,
      ),
    ).toMatchObject({ state: "prepared" });
  });

  it("binds provider start to the S20 claimant rather than the preparing Admin", async () => {
    const fixture = await attemptFixture("claimant-binding");
    const spoofedCommand = {
      ...fixture.commitInput.command,
      actorUid: "admin-c",
    };

    await expect(
      fixture.store.commitAssignment({
        ...fixture.commitInput,
        command: spoofedCommand,
        payloadHash: hashLiveVendorAssignmentPayload(spoofedCommand),
      }),
    ).rejects.toThrow(/exact claimed S20/i);
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(0);
  });

  it.each([
    {
      label: "command projection",
      mutate: (fixture: Awaited<ReturnType<typeof attemptFixture>>) => {
        const command = {
          ...fixture.commitInput.command,
          company: "Different Vendor",
        };
        return {
          ...fixture.commitInput,
          command,
          payloadHash: hashLiveVendorAssignmentPayload(command),
        };
      },
    },
    {
      label: "payload hash",
      mutate: (fixture: Awaited<ReturnType<typeof attemptFixture>>) => ({
        ...fixture.commitInput,
        payloadHash: "f".repeat(64),
      }),
    },
    {
      label: "provider reference",
      mutate: (fixture: Awaited<ReturnType<typeof attemptFixture>>) => ({
        ...fixture.commitInput,
        providerRef: `vendor-assignment:${"f".repeat(64)}`,
      }),
    },
  ])("rejects a spoofed $label before any provider write", async ({ mutate }) => {
    const fixture = await attemptFixture("spoofed-envelope");

    await expect(fixture.store.commitAssignment(mutate(fixture))).rejects.toBeInstanceOf(
      Error,
    );
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(0);
  });

  it("lets the atomic fence win, closes S20 deterministically, and prevents provider start", async () => {
    const fixture = await attemptFixture("fence-wins");
    fixture.fake.armNextCommitBarrier(2);

    const [fenceOutcome, providerOutcome] = await Promise.allSettled([
      fixture.store.fencePreparedAttempt(RECOVERY_ADMIN, fixture.snapshotInput),
      fixture.store.commitAssignment(fixture.commitInput),
    ]);

    expect(fenceOutcome.status).toBe("fulfilled");
    if (fenceOutcome.status !== "fulfilled") throw fenceOutcome.reason;
    expect(fenceOutcome.value).toMatchObject({
      duplicate: false,
      receipt: {
        actionKey: "vendor.assignment.change",
        attemptFenced: true,
        createdAt: PREPARED_AT,
        outcome: "not_applicable",
        reconciled: true,
      },
      status: "fenced",
    });
    expect(providerOutcome.status).toBe("rejected");
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(0);
    expect(
      fixture.fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(
      fixture.fake.read(`action_executions/${fixture.s20ExecutionId}`),
    ).toMatchObject({
      attempt_count: 1,
      result_code: expect.stringMatching(
        /^external_receipt:not_applicable:[a-f0-9]{64}$/,
      ),
      state: "Succeeded",
    });

    const duplicate = await fixture.store.fencePreparedAttempt(
      RECOVERY_ADMIN,
      fixture.snapshotInput,
    );
    expect(duplicate).toEqual({
      ...fenceOutcome.value,
      duplicate: true,
    });
    const storedSnapshot = fixture.fake.read(
      `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.preparedAttempts}/${fixture.s20ExecutionId}`,
    );
    expect(storedSnapshot).toMatchObject({ state: "fenced" });
    expect(JSON.stringify(storedSnapshot)).not.toContain(REASON);
  });
});

async function attemptFixture(label: string, claimed = true) {
  const fake = new FakeTransactionalFirestore();
  const store = new FirestoreLiveVendorLifecycleStore(fake as unknown as Firestore);
  const action = assignmentAction(label);
  const idempotencyKey = externalActionIdempotencyKey(action);
  const s20ExecutionId = liveVendorS20ExecutionId(
    "vendor.assignment.change",
    idempotencyKey,
  );
  const previewHash = hashExecutionPreview({ ...action.values });
  const contextHash = externalActionContextHash(action);
  const trustedContext = trusted(action);
  fake.seed(`action_executions/${s20ExecutionId}`, {
    id: s20ExecutionId,
    action_key: "vendor.assignment.change",
    action_kind: "vendor_assignment",
    actor_role: "Admin",
    actor_uid: ACTOR.uid,
    attempt_count: 0,
    context_hash: contextHash,
    created_at: PREPARED_AT,
    idempotency_hash: "a".repeat(64),
    preview_hash: previewHash,
    requires_action_registry: true,
    risk: "High",
    state: "Awaiting Admin",
    updated_at: PREPARED_AT,
  });
  const selection = {
    action,
    trustedContext,
    variant: "standard" as const,
  };
  await store.persistPreparedAttempt(ACTOR, {
    contextHash,
    createdAt: PREPARED_AT,
    executionId: s20ExecutionId,
    previewHash,
    selection,
  });
  const s20 = fake.read(`action_executions/${s20ExecutionId}`);
  if (!s20) throw new Error("Expected the S20 fixture.");
  if (claimed) {
    fake.seed(`action_executions/${s20ExecutionId}`, {
      ...s20,
      attempt_count: 1,
      claim_actor_uid: RECOVERY_ADMIN.uid,
      state: "Executing",
    });
  }
  fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/vendor-101`, {
    id: "vendor-101",
    uid: "vendor_uid_101",
    email: "dispatch@example-vendor.test",
    displayName: "Example Vendor",
    status: "active",
    inviteVersion: 1,
    data_mode: "live",
    createdAt: PREPARED_AT,
    updatedAt: PREPARED_AT,
  });
  fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/ticket-101`, {
    id: "ticket-101",
    data_mode: "live",
    updated_at: PREPARED_AT,
  });
  const command = {
    actorUid: RECOVERY_ADMIN.uid,
    vendorRef: "vendor-101",
    vendorUid: "vendor_uid_101",
    company: "Example Vendor",
    email: "dispatch@example-vendor.test",
    vendorUpdatedAt: PREPARED_AT,
    ticketRef: "ticket-101",
    ticketUpdatedAt: PREPARED_AT,
    currentVendorRef: "vendor:none",
    targetVendorRef: "vendor-101",
    operation: "assign" as const,
    reason: REASON,
    idempotencyKey,
  };
  return {
    fake,
    store,
    s20ExecutionId,
    snapshotInput: {
      contextHash,
      executionId: s20ExecutionId,
      previewHash,
      selection,
    },
    commitInput: {
      command,
      executionId: liveVendorLifecycleExecutionId(
        "vendor.assignment.change",
        idempotencyKey,
      ),
      nowIso: EFFECT_AT,
      payloadHash: hashLiveVendorAssignmentPayload(command),
      providerRef: liveVendorAssignmentProviderRef(idempotencyKey),
    },
  };
}

function assignmentAction(label: string): ExternalActionPreparationInput {
  return {
    actionId: `assignment-${label}`,
    actionKey: "vendor.assignment.change",
    connectionRef: "firestore-vendor-assignment:production",
    contractRef: "vendor-lifecycle-contract:v1",
    dataMode: "live",
    mappingRef: "vendor-lifecycle-firestore-map:v1",
    sourceRefs: [
      "maintenance-ticket:ticket-101:2026-07-30T12:00:00.000Z",
      "vendor:vendor-101:2026-07-30T12:00:00.000Z",
    ],
    values: liveVendorAssignmentActionValues({
      vendorRef: "vendor-101",
      vendorUid: "vendor_uid_101",
      company: "Example Vendor",
      email: "dispatch@example-vendor.test",
      vendorUpdatedAt: PREPARED_AT,
      ticketRef: "ticket-101",
      ticketUpdatedAt: PREPARED_AT,
      currentVendorRef: "vendor:none",
      targetVendorRef: "vendor-101",
      operation: "assign",
      reason: REASON,
    }),
    workflowId: "maintenance-ticket-101",
  };
}

function trusted(
  action: ExternalActionPreparationInput,
): TrustedExternalExecutionContext {
  const technical = {
    connectionReady: true,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: true,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
  };
  return {
    ...technical,
    externalReferences: {
      connectionRef: action.connectionRef!,
      contractRef: action.contractRef!,
      mappingRef: action.mappingRef!,
      sourceRefs: action.sourceRefs,
    },
    technical,
  };
}
