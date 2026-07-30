import { readFileSync } from "node:fs";

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  createLiveVendorPreparedAttemptSnapshot,
  FirestoreLiveVendorLifecycleStore,
  LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS,
  LIVE_VENDOR_LIFECYCLE_COLLECTIONS,
  type LiveVendorDisableCompletionClaim,
} from "@/lib/firestore/vendor-lifecycle-executions";
import {
  LIVE_VENDOR_DISABLE_INITIAL_SOURCE,
  canonicalLiveAssignmentRefs,
  hashLiveVendorDisablePayload,
  liveVendorDisableActionValues,
  liveVendorLifecycleExecutionId,
  liveVendorS20ExecutionId,
  sha256,
  type LiveVendorDisableInput,
  type LiveVendorLifecycleExecutionRecord,
} from "@/lib/vendor/live-lifecycle-contract";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

const projectId = "pmi-kc-kb-vendor-lifecycle-store-test";
const actorUid = "admin-live-firestore";
const vendorRef = "vendor-live-firestore";
const vendorUid = "vendor_live_firestore";
const company = "Emulator Plumbing";
const email = "dispatch@emulator-plumbing.example";
const sourceGeneration = "2026-07-30T09:00:00.000Z";
const disableTime = "2026-07-30T12:00:00.000Z";
const tokenSecretRef =
  "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
const preparedActions = new Map<
  string,
  {
    action: ExternalActionPreparationInput;
    variant: "standard" | "disable_completion_recovery";
  }
>();
const actor: AuthenticatedUser = {
  email: "admin-live-firestore@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: actorUid,
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId,
  });
  app = initializeApp({ projectId }, `vendor-lifecycle-store-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => {
  preparedActions.clear();
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("Live Vendor lifecycle Firestore disable boundary", () => {
  it("atomically commits the connected-mailbox disable at exactly 164 assignments and 500 writes", async () => {
    const ticketRefs = await seedActiveVendor(LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS);
    const store = new FirestoreLiveVendorLifecycleStore(db);
    const command = disableCommand(ticketRefs, "disable-emulator-164");
    await seedPreparedAttempt(command);
    const executionId = liveVendorLifecycleExecutionId(
      "vendor.account.disable",
      command.idempotencyKey,
    );

    const record = await store.disableAccess({
      command,
      executionId,
      payloadHash: hashLiveVendorDisablePayload(command),
      nowIso: disableTime,
    });

    expect(ticketRefs).toHaveLength(164);
    // 164 assignment triples plus execution/index/claim/vendor/mailbox/revocation/two audits.
    expect(ticketRefs.length * 3 + 8).toBe(500);
    expect(record).toMatchObject({
      id: executionId,
      s20ExecutionId: liveVendorS20ExecutionId(
        "vendor.account.disable",
        command.idempotencyKey,
      ),
      actionKey: "vendor.account.disable",
      phase: "access_disabled",
      state: "running",
      accessDisabledAt: disableTime,
      bindings: {
        activeAssignmentRefs: canonicalLiveAssignmentRefs(ticketRefs),
        mailboxState: "connected",
        mailboxTokenRefHash: sha256(tokenSecretRef),
      },
    });

    const [
      vendor,
      mailbox,
      revocation,
      completionClaim,
      assignments,
      tickets,
      activity,
      executionAudit,
      vendorAudit,
    ] = await Promise.all([
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors).doc(vendorRef).get(),
      db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections)
        .doc(vendorRef)
        .get(),
      db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tokenRevocations)
        .doc(vendorRef)
        .get(),
      db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
        .doc(vendorRef)
        .get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments).get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets).get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity).get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit).get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit).get(),
    ]);

    expect(vendor.data()).toMatchObject({
      id: vendorRef,
      status: "disabled",
      disabledAt: disableTime,
      updatedAt: disableTime,
    });
    expect(mailbox.data()).toMatchObject({
      vendorId: vendorRef,
      status: "revocation_pending",
      updatedAt: disableTime,
    });
    expect(revocation.data()).toMatchObject({
      vendorId: vendorRef,
      tokenSecretRef,
      status: "pending",
      createdAt: disableTime,
    });
    expect(completionClaim.data()).toMatchObject({
      vendorRef,
      vendorUid,
      rootExecutionId: executionId,
      dataMode: "live",
      accessDisabledAt: disableTime,
    });
    expect(assignments.docs).toHaveLength(164);
    expect(
      assignments.docs.every(
        (snapshot) =>
          snapshot.data().active === false && snapshot.data().updated_at === disableTime,
      ),
    ).toBe(true);
    expect(tickets.docs).toHaveLength(164);
    expect(
      tickets.docs.every(
        (snapshot) =>
          snapshot.data().vendor_id === undefined &&
          snapshot.data().updated_at === disableTime,
      ),
    ).toBe(true);
    expect(activity.docs).toHaveLength(164);
    expect(
      activity.docs.every(
        (snapshot) =>
          snapshot.data().action === "vendor-assign" &&
          snapshot.data().text === "unassigned",
      ),
    ).toBe(true);
    expect(executionAudit.docs).toHaveLength(1);
    expect(executionAudit.docs[0]?.data()).toMatchObject({
      action_key: "vendor.account.disable",
      event: "access_disabled",
    });
    expect(vendorAudit.docs).toHaveLength(1);
    expect(vendorAudit.docs[0]?.data()).toMatchObject({
      action: "live_vendor_access_disabled",
      vendorId: vendorRef,
    });
  }, 60_000);

  it("rejects 165 active assignments from emulator query results without committing any partial write", async () => {
    const ticketRefs = await seedActiveVendor(
      LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 1,
    );
    const store = new FirestoreLiveVendorLifecycleStore(db);
    const command = disableCommand(ticketRefs, "disable-emulator-165");
    await seedPreparedAttempt(command);

    await expect(
      store.disableAccess({
        command,
        executionId: liveVendorLifecycleExecutionId(
          "vendor.account.disable",
          command.idempotencyKey,
        ),
        payloadHash: hashLiveVendorDisablePayload(command),
        nowIso: disableTime,
      }),
    ).rejects.toThrow(
      `Vendor disable is limited to ${LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS} active assignments per exact action.`,
    );

    const [vendor, mailbox, assignments, tickets] = await Promise.all([
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors).doc(vendorRef).get(),
      db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections)
        .doc(vendorRef)
        .get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments).get(),
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets).get(),
    ]);
    expect(vendor.data()).toMatchObject({
      status: "active",
      updatedAt: sourceGeneration,
    });
    expect(mailbox.data()).toMatchObject({
      status: "connected",
      updatedAt: sourceGeneration,
    });
    expect(assignments.docs).toHaveLength(165);
    expect(assignments.docs.every((snapshot) => snapshot.data().active === true)).toBe(
      true,
    );
    expect(tickets.docs).toHaveLength(165);
    expect(
      tickets.docs.every((snapshot) => snapshot.data().vendor_id === vendorRef),
    ).toBe(true);

    await expectNoDisableEffects();
  }, 60_000);

  it("fences an expired owner after takeover and lets only the new generation complete", async () => {
    await seedActiveVendor(0);
    const store = new FirestoreLiveVendorLifecycleStore(db);
    const ownerACommand = disableCommand([], "disable-owner-a");
    await seedPreparedAttempt(ownerACommand);
    const ownerA = await store.disableAccess({
      command: ownerACommand,
      executionId: liveVendorLifecycleExecutionId(
        "vendor.account.disable",
        ownerACommand.idempotencyKey,
      ),
      payloadHash: hashLiveVendorDisablePayload(ownerACommand),
      nowIso: disableTime,
    });
    const ownerAWorkerToken = "owner-a-worker-token-0000000000000001";
    await store.claimDisableCompletionWorker({
      executionId: ownerA.id,
      payloadHash: ownerA.payloadHash,
      workerToken: ownerAWorkerToken,
      nowIso: disableTime,
    });
    const ownerAClaim = await readCompletionClaim();
    const takeoverTime = new Date(
      Date.parse(ownerAClaim.ownerLeaseExpiresAt) + 1,
    ).toISOString();
    const ownerBCommand = disableRecoveryCommand(ownerA, ownerAClaim, "disable-owner-b");
    await seedPreparedAttempt(ownerBCommand);
    const ownerB = await store.claimDisableCompletionRecovery({
      command: ownerBCommand,
      executionId: liveVendorLifecycleExecutionId(
        "vendor.account.disable",
        ownerBCommand.idempotencyKey,
      ),
      payloadHash: hashLiveVendorDisablePayload(ownerBCommand),
      nowIso: takeoverTime,
    });
    const ownerBWorkerToken = "owner-b-worker-token-0000000000000002";
    await store.claimDisableCompletionWorker({
      executionId: ownerB.id,
      payloadHash: ownerB.payloadHash,
      workerToken: ownerBWorkerToken,
      nowIso: takeoverTime,
    });

    const claimAfterTakeover = await readCompletionClaim();
    expect(claimAfterTakeover).toMatchObject({
      completionGeneration: 1,
      ownerExecutionId: ownerB.id,
      ownerS20ExecutionId: ownerB.s20ExecutionId,
    });
    const beforeStaleCompletion = await readCompletionState(ownerA.id, ownerB.id);

    await expect(
      store.completeDisable({
        executionId: ownerA.id,
        payloadHash: ownerA.payloadHash,
        workerToken: ownerAWorkerToken,
        reconciled: false,
        nowIso: new Date(Date.parse(takeoverTime) + 1_000).toISOString(),
      }),
    ).rejects.toThrow("The Vendor disable completion owner changed.");

    expect(await readCompletionState(ownerA.id, ownerB.id)).toEqual(
      beforeStaleCompletion,
    );
    const [ownerAAfterStaleCompletion, ownerBAfterStaleCompletion] = await Promise.all([
      store.getExecution("vendor.account.disable", ownerACommand.idempotencyKey),
      store.getExecution("vendor.account.disable", ownerBCommand.idempotencyKey),
    ]);
    expect(ownerAAfterStaleCompletion).toMatchObject({ state: "running" });
    expect(ownerAAfterStaleCompletion?.receipt).toBeUndefined();
    expect(ownerBAfterStaleCompletion).toMatchObject({ state: "running" });
    expect(ownerBAfterStaleCompletion?.receipt).toBeUndefined();

    const completedByB = await store.completeDisable({
      executionId: ownerB.id,
      payloadHash: ownerB.payloadHash,
      workerToken: ownerBWorkerToken,
      reconciled: false,
      nowIso: new Date(Date.parse(takeoverTime) + 2_000).toISOString(),
    });

    expect(completedByB).toMatchObject({
      state: "succeeded",
      receipt: {
        reconciled: true,
        state: "disabled",
        vendorRef,
      },
    });
    await expect(
      store.getExecution("vendor.account.disable", ownerACommand.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: { reconciled: true, state: "disabled", vendorRef },
    });
    await expect(readCompletionClaim()).resolves.toMatchObject({
      completionGeneration: 1,
      ownerExecutionId: ownerB.id,
      completedAt: new Date(Date.parse(takeoverTime) + 2_000).toISOString(),
    });
  }, 30_000);
});

async function seedActiveVendor(assignmentCount: number): Promise<string[]> {
  const ticketRefs = Array.from(
    { length: assignmentCount },
    (_, index) => `ticket-live-${String(index).padStart(3, "0")}`,
  );
  const batch = db.batch();
  batch.set(db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors).doc(vendorRef), {
    id: vendorRef,
    uid: vendorUid,
    email,
    displayName: company,
    status: "active",
    inviteVersion: 1,
    data_mode: "live",
    identityState: {
      emailVerified: true,
      totpRequired: true,
      totpVerified: true,
    },
    createdAt: sourceGeneration,
    updatedAt: sourceGeneration,
  });
  batch.set(
    db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections).doc(vendorRef),
    {
      vendorId: vendorRef,
      mailboxEmail: email,
      provider: "google",
      status: "connected",
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
      tokenSecretRef,
      dataMode: "live",
      connectedAt: sourceGeneration,
      updatedAt: sourceGeneration,
    },
  );
  for (const ticketRef of ticketRefs) {
    batch.set(db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets).doc(ticketRef), {
      id: ticketRef,
      data_mode: "live",
      vendor_id: vendorRef,
      updated_at: sourceGeneration,
    });
    batch.set(
      db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments).doc(ticketRef),
      {
        ticket_id: ticketRef,
        vendor_id: vendorRef,
        active: true,
        data_mode: "live",
        updated_at: sourceGeneration,
      },
    );
  }
  await batch.commit();
  return ticketRefs;
}

function disableCommand(
  ticketRefs: readonly string[],
  identityLabel: string,
): LiveVendorDisableInput {
  const idempotencyKey = emulatorPreparedIdempotency(identityLabel);
  const command: LiveVendorDisableInput = {
    actorUid,
    disableMode: "initial",
    vendorRef,
    vendorUid,
    company,
    email,
    currentStatus: "active",
    vendorUpdatedAt: sourceGeneration,
    activeAssignmentRefs: canonicalLiveAssignmentRefs(ticketRefs),
    mailboxState: "connected",
    mailboxTokenRefHash: sha256(tokenSecretRef),
    rootExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootExecutionId,
    rootS20ExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootS20ExecutionId,
    accessDisabledAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.accessDisabledAt,
    completionGeneration: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionGeneration,
    completionOwnerExecutionId:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerExecutionId,
    completionOwnerS20ExecutionId:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerS20ExecutionId,
    completionLeaseExpiresAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionLeaseExpiresAt,
    reason: "Disable the exact Vendor and revoke its access.",
    idempotencyKey,
  };
  preparedActions.set(idempotencyKey, {
    action: emulatorPreparedAction(identityLabel, disablePreparedValues(command)),
    variant: "standard",
  });
  return command;
}

async function seedPreparedAttempt(command: LiveVendorDisableInput) {
  const actionKey = "vendor.account.disable" as const;
  const s20ExecutionId = liveVendorS20ExecutionId(actionKey, command.idempotencyKey);
  const prepared = preparedActions.get(command.idempotencyKey);
  if (!prepared) throw new Error("Expected a complete prepared action fixture.");
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
  const trustedContext: TrustedExternalExecutionContext = {
    ...technical,
    externalReferences: {
      connectionRef: prepared.action.connectionRef!,
      contractRef: prepared.action.contractRef!,
      mappingRef: prepared.action.mappingRef!,
      sourceRefs: prepared.action.sourceRefs,
    },
    technical,
  };
  const snapshot = createLiveVendorPreparedAttemptSnapshot(actor, {
    contextHash: externalActionContextHash(prepared.action),
    createdAt: sourceGeneration,
    executionId: s20ExecutionId,
    previewHash: hashExecutionPreview({ ...prepared.action.values }),
    selection: {
      action: prepared.action,
      trustedContext,
      variant: prepared.variant,
    },
  });
  await Promise.all([
    db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.preparedAttempts)
      .doc(s20ExecutionId)
      .set(snapshot),
    db
      .collection("action_executions")
      .doc(s20ExecutionId)
      .set({
        id: s20ExecutionId,
        action_key: actionKey,
        action_kind: "identity_write",
        actor_role: "Admin",
        actor_uid: actor.uid,
        attempt_count: 1,
        claim_actor_uid: command.actorUid,
        context_hash: snapshot.contextHash,
        created_at: sourceGeneration,
        idempotency_hash: sha256(`emulator:${s20ExecutionId}`),
        preview_hash: snapshot.previewHash,
        requires_action_registry: true,
        risk: "High",
        state: "Executing",
        updated_at: sourceGeneration,
      }),
  ]);
}

function disableRecoveryCommand(
  root: LiveVendorLifecycleExecutionRecord,
  claim: LiveVendorDisableCompletionClaim,
  identityLabel: string,
): LiveVendorDisableInput {
  if (
    root.actionKey !== "vendor.account.disable" ||
    root.bindings.kind !== "disable" ||
    !root.accessDisabledAt
  ) {
    throw new Error("Expected an access-disabled Vendor root execution.");
  }
  const idempotencyKey = emulatorPreparedIdempotency(identityLabel);
  const command: LiveVendorDisableInput = {
    actorUid,
    disableMode: "firebase_completion_recovery",
    vendorRef,
    vendorUid,
    company,
    email,
    currentStatus: "disabled",
    vendorUpdatedAt: root.accessDisabledAt,
    activeAssignmentRefs: root.bindings.activeAssignmentRefs,
    mailboxState: root.bindings.mailboxState,
    mailboxTokenRefHash: root.bindings.mailboxTokenRefHash,
    rootExecutionId: claim.rootExecutionId,
    rootS20ExecutionId: claim.rootS20ExecutionId,
    accessDisabledAt: claim.accessDisabledAt,
    completionGeneration: claim.completionGeneration,
    completionOwnerExecutionId: claim.ownerExecutionId,
    completionOwnerS20ExecutionId: claim.ownerS20ExecutionId,
    completionLeaseExpiresAt: claim.ownerLeaseExpiresAt,
    reason: "Take over the expired Firebase completion lease.",
    idempotencyKey,
  };
  preparedActions.set(idempotencyKey, {
    action: emulatorPreparedAction(identityLabel, disablePreparedValues(command)),
    variant: "disable_completion_recovery",
  });
  return command;
}

function emulatorPreparedIdempotency(identityLabel: string) {
  return externalActionIdempotencyKey(
    emulatorPreparedAction(identityLabel, { reason: "identity-only" }),
  );
}

function emulatorPreparedAction(
  identityLabel: string,
  values: Readonly<Record<string, string | number | boolean>>,
): ExternalActionPreparationInput {
  return {
    actionId: `emulator-disable-${identityLabel}`,
    actionKey: "vendor.account.disable",
    connectionRef: "firebase-firestore-vendor-lifecycle:production",
    contractRef: "vendor-lifecycle-contract:v1",
    dataMode: "live",
    mappingRef: "vendor-lifecycle-firestore-map:v1",
    sourceRefs: [`emulator-disable-source:${identityLabel}`],
    values,
    workflowId: `emulator-disable-workflow-${identityLabel}`,
  };
}

function disablePreparedValues(
  command: LiveVendorDisableInput,
): Readonly<Record<string, string | number | boolean>> {
  return liveVendorDisableActionValues(command);
}

async function readCompletionClaim(): Promise<LiveVendorDisableCompletionClaim> {
  const snapshot = await db
    .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
    .doc(vendorRef)
    .get();
  if (!snapshot.exists) throw new Error("Expected a disable completion claim.");
  return snapshot.data() as LiveVendorDisableCompletionClaim;
}

async function readCompletionState(ownerAId: string, ownerBId: string) {
  const [ownerA, ownerB, claim, executionAudit, vendorAudit] = await Promise.all([
    db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions).doc(ownerAId).get(),
    db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions).doc(ownerBId).get(),
    db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
      .doc(vendorRef)
      .get(),
    db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit).get(),
    db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit).get(),
  ]);
  return {
    ownerA: ownerA.data(),
    ownerB: ownerB.data(),
    claim: claim.data(),
    executionAudit: executionAudit.docs.map((snapshot) => snapshot.data()),
    vendorAudit: vendorAudit.docs.map((snapshot) => snapshot.data()),
  };
}

async function expectNoDisableEffects(): Promise<void> {
  const effectCollections = [
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions,
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit,
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index,
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity,
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit,
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tokenRevocations,
    LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims,
  ];
  const snapshots = await Promise.all(
    effectCollections.map((collection) => db.collection(collection).limit(1).get()),
  );
  expect(snapshots.every((snapshot) => snapshot.empty)).toBe(true);
}
